from decimal import Decimal
from datetime import datetime
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Supplier, PurchaseInvoice, PurchaseInvoiceItem, DebitNote, DebitNoteItem
from .serializers import SupplierSerializer, PurchaseInvoiceSerializer, DebitNoteSerializer
from stock.models import Item, StockLedgerEntry
from accounts.models import GLEntry, PaymentInvoiceAllocation, Company


def parse_date_safe(val):
    if not val:
        return timezone.now().date()
    val_str = str(val).strip()
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            pass
    return timezone.now().date()


def get_request_company(request):
    comp_id = (
        request.headers.get('X-Company-Id')
        or request.GET.get('company_id')
        or (getattr(request, 'data', None) and request.data.get('company_id'))
        or (getattr(request, 'data', None) and request.data.get('company'))
    )
    if comp_id and str(comp_id) not in ['undefined', 'null', '']:
        try:
            comp = Company.objects.filter(id=int(comp_id)).first()
            if comp:
                return comp
        except (ValueError, TypeError):
            pass
    if hasattr(request.user, 'profile') and request.user.profile.company:
        return request.user.profile.company
    return Company.objects.first()


def sync_purchase_to_inventory_and_gl(invoice, items_data, comp):
    # Company scoped cleanup of previous entries for this bill
    GLEntry.objects.filter(company=comp, voucher_type='Purchase Invoice', voucher_no=invoice.bill_number).delete()
    StockLedgerEntry.objects.filter(company=comp, voucher_type='Purchase Invoice', voucher_no=invoice.bill_number).delete()
    invoice.items.all().delete()

    affected_items = set()

    for it in items_data:
        it_val = it.get('item') or it.get('item_id') or it.get('description') or 'Item'
        qty = Decimal(str(it.get('quantity') or it.get('qty', 1) or 1))
        rate = Decimal(str(it.get('rate') or it.get('standard_rate', 0) or 0))
        amount = Decimal(str(it.get('amount') or (qty * rate) or 0))
        disc_pct = Decimal(str(it.get('discount_percentage') or it.get('disc_percentage', 0) or 0))
        disc_amt = Decimal(str(it.get('discount_amount', 0) or 0))
        is_foc = bool(it.get('is_foc', False))
        raw_name = str(it.get('description') or it_val).strip()

        # 1. Look up existing item for THIS active company
        item_obj = None
        if isinstance(it_val, int) or (isinstance(it_val, str) and it_val.isdigit()):
            item_obj = Item.objects.filter(id=int(it_val), company=comp).first()

        if not item_obj:
            clean_code = raw_name.split('(')[-1].replace(')', '').strip()
            item_obj = Item.objects.filter(
                Q(item_code__iexact=clean_code) |
                Q(item_code__iexact=raw_name) |
                Q(item_name__iexact=raw_name),
                company=comp
            ).first()

        # 2. PROPER ARCHITECTURAL FIX: Auto-create item for this company if not exists!
        if not item_obj:
            code_gen = f"ITM-{comp.id}-{Item.objects.filter(company=comp).count() + 1:03d}"
            item_obj = Item.objects.create(
                company=comp,
                item_code=code_gen,
                item_name=raw_name if raw_name != 'Item' else f"Product {code_gen}",
                category='General',
                standard_rate=rate,
                current_stock=Decimal('0.00')
            )

        # 3. Save purchase item
        PurchaseInvoiceItem.objects.create(
            invoice=invoice,
            item=item_obj,
            description=raw_name or item_obj.item_name,
            quantity=qty,
            rate=rate,
            amount=amount,
            discount_percentage=disc_pct,
            discount_amount=disc_amt,
            is_foc=is_foc
        )

        # 4. Stock Ledger inward entry
        StockLedgerEntry.objects.create(
            company=comp,
            posting_date=invoice.posting_date,
            item=item_obj,
            voucher_type='Purchase Invoice',
            voucher_no=invoice.bill_number,
            actual_qty=qty,
            qty_after_transaction=0,
            valuation_rate=rate
        )
        affected_items.add(item_obj)

    # 5. Dynamic stock recalculation from actual ledger movements
    for itm in affected_items:
        tot = StockLedgerEntry.objects.filter(item=itm, company=comp).aggregate(s=Sum('actual_qty'))['s'] or Decimal('0.00')
        itm.current_stock = tot
        if rate > Decimal('0.00'):
            itm.standard_rate = rate
        itm.company = comp
        itm.save()

    # 6. Double-entry General Ledger
    GLEntry.objects.create(
        company=comp,
        posting_date=invoice.posting_date,
        account='Purchases',
        party_type='Supplier',
        party=invoice.supplier_name,
        voucher_type='Purchase Invoice',
        voucher_no=invoice.bill_number,
        against='Creditors',
        debit=invoice.net_total,
        credit=Decimal('0.00'),
        remarks=f"Purchases #{invoice.bill_number}"
    )
    if invoice.tax_amount > Decimal('0.00'):
        GLEntry.objects.create(
            company=comp,
            posting_date=invoice.posting_date,
            account='Input GST',
            party_type='Supplier',
            party=invoice.supplier_name,
            voucher_type='Purchase Invoice',
            voucher_no=invoice.bill_number,
            against='Creditors',
            debit=invoice.tax_amount,
            credit=Decimal('0.00'),
            remarks=f"Tax on #{invoice.bill_number}"
        )
    GLEntry.objects.create(
        company=comp,
        posting_date=invoice.posting_date,
        account='Creditors',
        party_type='Supplier',
        party=invoice.supplier_name,
        voucher_type='Purchase Invoice',
        voucher_no=invoice.bill_number,
        against='Purchases',
        debit=Decimal('0.00'),
        credit=invoice.grand_total,
        remarks=f"Payable for #{invoice.bill_number}"
    )


class SupplierListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = SupplierSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = Supplier.objects.all().order_by('-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def perform_create(self, serializer):
        comp = get_request_company(self.request)
        serializer.save(company=comp)


class SupplierRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer


class DebitNoteListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DebitNoteSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = DebitNote.objects.all().order_by('-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def perform_create(self, serializer):
        comp = get_request_company(self.request)
        serializer.save(company=comp)


class DebitNoteRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = DebitNote.objects.all()
    serializer_class = DebitNoteSerializer


class PurchaseInvoiceListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = PurchaseInvoiceSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = PurchaseInvoice.objects.all().order_by('-posting_date', '-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def create(self, request, *args, **kwargs):
        comp = get_request_company(request)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        bill_no = data.get('bill_number') or f"PUR-{PurchaseInvoice.objects.filter(company=comp).count() + 1:04d}"
        if PurchaseInvoice.objects.filter(company=comp, bill_number=bill_no).exists():
            bill_no = f"PUR-{PurchaseInvoice.objects.filter(company=comp).count() + 1:04d}"

        supplier_val = data.get('supplier') or data.get('supplier_id')
        supplier_obj = None
        if supplier_val:
            try:
                supplier_obj = Supplier.objects.filter(id=int(supplier_val), company=comp).first()
            except (ValueError, TypeError):
                supplier_obj = Supplier.objects.filter(supplier_name__iexact=str(supplier_val), company=comp).first()
        if not supplier_obj and data.get('supplier_name'):
            supplier_obj = Supplier.objects.filter(supplier_name__iexact=str(data.get('supplier_name')), company=comp).first()

        supplier_name = data.get('supplier_name') or (supplier_obj.supplier_name if supplier_obj else 'Supplier')
        posting_date = parse_date_safe(data.get('posting_date'))
        due_date = parse_date_safe(data.get('due_date'))
        net_total = Decimal(str(data.get('net_total', 0) or 0))
        tax_rate = Decimal(str(data.get('tax_rate', 18) or 18))
        tax_amount = Decimal(str(data.get('tax_amount', 0) or 0))
        grand_total = Decimal(str(data.get('grand_total', 0) or 0))
        if grand_total == 0 and net_total > 0:
            grand_total = net_total + tax_amount

        user = request.user if request.user.is_authenticated else None

        with transaction.atomic():
            invoice = PurchaseInvoice.objects.create(
                company=comp,
                supplier=supplier_obj,
                supplier_name=supplier_name,
                bill_number=bill_no,
                posting_date=posting_date,
                due_date=due_date,
                tax_rate=tax_rate,
                net_total=net_total,
                tax_amount=tax_amount,
                grand_total=grand_total,
                status='Approved',
                created_by=user,
                approved_by=user
            )
            items_data = data.get('items', [])
            sync_purchase_to_inventory_and_gl(invoice, items_data, comp)

        serializer = self.get_serializer(invoice)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        for item in response.data:
            bill_id = item.get('id')
            grand_total = Decimal(str(item.get('grand_total', 0) or 0))
            try:
                allocated = PaymentInvoiceAllocation.objects.filter(
                    invoice_type='Purchase Invoice',
                    invoice_id=bill_id
                ).aggregate(s=Sum('allocated_amount'))['s'] or Decimal('0.00')
            except Exception:
                allocated = Decimal('0.00')

            outstanding = max(Decimal('0.00'), grand_total - allocated)
            item['allocated_amount'] = float(allocated)
            item['outstanding_amount'] = float(outstanding)
            item['payment_status'] = 'Paid' if outstanding <= Decimal('0.00') and grand_total > 0 else ('Partly Paid' if allocated > 0 else 'Unpaid')
        return response


class PurchaseInvoiceRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PurchaseInvoice.objects.all()
    serializer_class = PurchaseInvoiceSerializer

    def update(self, request, *args, **kwargs):
        comp = get_request_company(request)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        with transaction.atomic():
            instance.posting_date = parse_date_safe(data.get('posting_date', instance.posting_date))
            instance.due_date = parse_date_safe(data.get('due_date', instance.due_date))
            if 'net_total' in data:
                instance.net_total = Decimal(str(data['net_total']))
            if 'tax_amount' in data:
                instance.tax_amount = Decimal(str(data['tax_amount']))
            if 'grand_total' in data:
                instance.grand_total = Decimal(str(data['grand_total']))
            instance.save()

            items_data = data.get('items', [])
            if items_data:
                sync_purchase_to_inventory_and_gl(instance, items_data, comp)

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)