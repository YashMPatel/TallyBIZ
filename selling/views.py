from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from backend.erp_workflow import (
    validate_sales_invoice_stock,
    approve_and_post_sales_invoice,
    reverse_sales_invoice_on_delete,
)
from decimal import Decimal
from datetime import datetime
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Customer, SalesInvoice, SalesInvoiceItem, CreditNote, CreditNoteItem
from .serializers import CustomerSerializer, SalesInvoiceSerializer, CreditNoteSerializer
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
        request.GET.get('company_id')
        or request.headers.get('X-Company-Id')
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


def sync_sales_to_inventory_and_gl(invoice, items_data, comp):
    # Strictly scope deletion by company
    GLEntry.objects.filter(company=comp, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number).delete()
    StockLedgerEntry.objects.filter(company=comp, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number).delete()
    invoice.items.all().delete()

    affected_items = set()

    # 2. Re-create line items and stock deduction
    for it in items_data:
        it_val = it.get('item') or it.get('item_id')
        item_obj = None
        if it_val:
            try:
                item_obj = Item.objects.filter(id=int(it_val)).first()
            except (ValueError, TypeError):
                clean_code = str(it_val).split('(')[-1].replace(')', '').strip()
                item_obj = Item.objects.filter(
                    Q(item_code__iexact=clean_code) |
                    Q(item_code__iexact=str(it_val)) |
                    Q(item_name__iexact=str(it_val)),
                    company=comp
                ).first()

        if not item_obj:
            item_obj = Item.objects.filter(company=comp).first() or Item.objects.first()

        qty = Decimal(str(it.get('quantity') or it.get('qty', 1) or 1))
        rate = Decimal(str(it.get('rate') or it.get('standard_rate', 0) or 0))
        amount = Decimal(str(it.get('amount') or (qty * rate) or 0))
        disc_pct = Decimal(str(it.get('discount_percentage') or it.get('disc_percentage', 0) or 0))
        disc_amt = Decimal(str(it.get('discount_amount', 0) or 0))
        is_foc = bool(it.get('is_foc', False))

        if item_obj:
            SalesInvoiceItem.objects.create(
                invoice=invoice,
                item=item_obj,
                description=it.get('description') or item_obj.item_name,
                quantity=qty,
                rate=rate,
                amount=amount,
                discount_percentage=disc_pct,
                discount_amount=disc_amt,
                is_foc=is_foc
            )

            if str(getattr(invoice, 'status', '')).strip().lower() == 'approved':
                StockLedgerEntry.objects.create(
                    company=comp,
                    posting_date=invoice.posting_date,
                    item=item_obj,
                    voucher_type='Sales Invoice',
                    voucher_no=invoice.invoice_number,
                    actual_qty=-qty,
                    qty_after_transaction=0,
                    valuation_rate=rate
                )
                affected_items.add(item_obj)

    if str(getattr(invoice, 'status', '')).strip().lower() != 'approved':
        return

    # 3. Recalculate true stock balance from all ledger entries
    for itm in affected_items:
        tot = StockLedgerEntry.objects.filter(item=itm).aggregate(s=Sum('actual_qty'))['s'] or Decimal('0.00')
        itm.current_stock = tot
        itm.company = comp
        itm.save()

    # 4. Financial General Ledger Entries
    GLEntry.objects.create(
        company=comp,
        posting_date=invoice.posting_date,
        account='Debtors',
        party_type='Customer',
        party=invoice.customer_name,
        voucher_type='Sales Invoice',
        voucher_no=invoice.invoice_number,
        against='Sales Income',
        debit=invoice.grand_total,
        credit=Decimal('0.00'),
        remarks=f"Receivable for #{invoice.invoice_number}"
    )
    GLEntry.objects.create(
        company=comp,
        posting_date=invoice.posting_date,
        account='Sales Income',
        party_type='Customer',
        party=invoice.customer_name,
        voucher_type='Sales Invoice',
        voucher_no=invoice.invoice_number,
        against='Debtors',
        debit=Decimal('0.00'),
        credit=invoice.net_total,
        remarks=f"Sales Income #{invoice.invoice_number}"
    )
    if invoice.tax_amount > Decimal('0.00'):
        GLEntry.objects.create(
            company=comp,
            posting_date=invoice.posting_date,
            account='Output GST',
            party_type='Customer',
            party=invoice.customer_name,
            voucher_type='Sales Invoice',
            voucher_no=invoice.invoice_number,
            against='Debtors',
            debit=Decimal('0.00'),
            credit=invoice.tax_amount,
            remarks=f"Tax on #{invoice.invoice_number}"
        )


class CustomerListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = Customer.objects.all().order_by('-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def perform_create(self, serializer):
        comp = get_request_company(self.request)
        if comp:
            serializer.save(company=comp)
        else:
            serializer.save()


class CustomerRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer


class CreditNoteListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = CreditNoteSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = CreditNote.objects.all().order_by('-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def perform_create(self, serializer):
        comp = get_request_company(self.request)
        serializer.save(company=comp)


class CreditNoteRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer


class SalesInvoiceListCreateAPIView(generics.ListCreateAPIView):

    def perform_create(self, serializer):
        validate_sales_invoice_stock(self.request.data.get('items', []), self.request.data.get('company'))
        serializer.save(status='Draft')

    serializer_class = SalesInvoiceSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = SalesInvoice.objects.all().order_by('-posting_date', '-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        return qs

    def create(self, request, *args, **kwargs):
        comp = get_request_company(request)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        inv_no = data.get('invoice_number') or f"INV-{SalesInvoice.objects.filter(company=comp).count() + 1:04d}"
        if SalesInvoice.objects.filter(company=comp, invoice_number=inv_no).exists():
            count = SalesInvoice.objects.filter(company=comp).count() + 1
            inv_no = f"INV-{count:04d}"

        cust_val = data.get('customer') or data.get('customer_id')
        cust_obj = None
        if cust_val:
            try:
                cust_obj = Customer.objects.filter(id=int(cust_val)).first()
            except (ValueError, TypeError):
                cust_obj = Customer.objects.filter(customer_name__iexact=str(cust_val), company=comp).first()
        if not cust_obj and data.get('customer_name'):
            cust_obj = Customer.objects.filter(customer_name__iexact=str(data.get('customer_name')), company=comp).first()

        customer_name = data.get('customer_name') or (cust_obj.customer_name if cust_obj else 'Customer')

        posting_date = parse_date_safe(data.get('posting_date'))
        due_date = parse_date_safe(data.get('due_date'))
        net_total = Decimal(str(data.get('net_total', 0) or 0))
        tax_rate = Decimal(str(data.get('tax_rate', 18) or 18))
        tax_amount = Decimal(str(data.get('tax_amount', 0) or 0))
        grand_total = Decimal(str(data.get('grand_total', 0) or 0))
        if grand_total == 0 and net_total > 0:
            grand_total = net_total + tax_amount

        user = request.user if request.user.is_authenticated else None

        validate_sales_invoice_stock(data.get('items', []), comp.id if comp else None)

        with transaction.atomic():
            invoice = SalesInvoice.objects.create(
                company=comp,
                customer=cust_obj,
                customer_name=customer_name,
                invoice_number=inv_no,
                posting_date=posting_date,
                due_date=due_date,
                tax_rate=tax_rate,
                net_total=net_total,
                tax_amount=tax_amount,
                grand_total=grand_total,
                status='Draft',
                created_by=user,
                approved_by=None
            )

            items_data = data.get('items', [])
            sync_sales_to_inventory_and_gl(invoice, items_data, comp)

        serializer = self.get_serializer(invoice)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        for item in response.data:
            inv_id = item.get('id')
            grand_total = Decimal(str(item.get('grand_total', 0) or 0))

            try:
                allocated = PaymentInvoiceAllocation.objects.filter(
                    invoice_type='Sales Invoice',
                    invoice_id=inv_id
                ).aggregate(s=Sum('allocated_amount'))['s'] or Decimal('0.00')
            except Exception:
                allocated = Decimal('0.00')

            outstanding = max(Decimal('0.00'), grand_total - allocated)
            item['allocated_amount'] = float(allocated)
            item['outstanding_amount'] = float(outstanding)

            if outstanding <= Decimal('0.00') and grand_total > Decimal('0.00'):
                item['payment_status'] = 'Paid'
            elif allocated > Decimal('0.00'):
                item['payment_status'] = 'Partly Paid'
            else:
                item['payment_status'] = 'Unpaid'

        return response


class SalesInvoiceRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):

    def perform_update(self, serializer):
        old_status = str(getattr(serializer.instance, 'status', '')).strip().lower()
        invoice = serializer.save()
        new_status = str(getattr(invoice, 'status', '')).strip().lower()
        if old_status != 'approved' and new_status == 'approved':
            approve_and_post_sales_invoice(invoice)

    def perform_destroy(self, instance):
        reverse_sales_invoice_on_delete(instance)
        instance.delete()

    queryset = SalesInvoice.objects.all()
    serializer_class = SalesInvoiceSerializer

    def update(self, request, *args, **kwargs):
        comp = get_request_company(request)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        with transaction.atomic():
            instance.posting_date = parse_date_safe(data.get('posting_date', instance.posting_date))
            instance.due_date = parse_date_safe(data.get('due_date', instance.due_date))
            if 'net_total' in data:
                instance.net_total = Decimal(str(data['net_total']))
            if 'tax_rate' in data:
                instance.tax_rate = Decimal(str(data['tax_rate']))
            if 'tax_amount' in data:
                instance.tax_amount = Decimal(str(data['tax_amount']))
            if 'grand_total' in data:
                instance.grand_total = Decimal(str(data['grand_total']))
            instance.save()

            items_data = data.get('items', [])
            if items_data:
                sync_sales_to_inventory_and_gl(instance, items_data, comp)

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SalesInvoiceApproveAPIView(APIView):
    def post(self, request, pk):
        from selling.models import SalesInvoice
        invoice = get_object_or_404(SalesInvoice, pk=pk)
        approve_and_post_sales_invoice(invoice)
        return Response({'status': 'Approved', 'id': invoice.id})
