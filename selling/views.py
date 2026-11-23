from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from backend.erp_workflow import (
    validate_sales_invoice_stock,
    approve_and_post_sales_invoice,
    reverse_sales_invoice_on_delete,
    reverse_return_note,
    guard_credit_notes,
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
from stock.models import Item, StockLedgerEntry, StockBatch
from accounts.models import GLEntry, PaymentInvoiceAllocation, Company
from accounts.views import resolve_active_unit


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


def _resolve_request_user(request):
    if getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user
    raw_req = getattr(request, '_request', None)
    if raw_req and getattr(raw_req, 'user', None) and raw_req.user.is_authenticated:
        return raw_req.user
    return None


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


def invoice_totals(items_data, tax_rate, adjustment):
    """Server-side totals, same rule as the invoice form: FOC lines are free, discount is per line."""
    net = Decimal('0.00')
    for it in items_data or []:
        if it.get('is_foc'):
            continue
        base = Decimal(str(it.get('quantity') or 0)) * Decimal(str(it.get('rate') or 0))
        disc = Decimal(str(it.get('discount_percentage') or 0))
        net += max(Decimal('0.00'), base - base * disc / 100)
    net = net.quantize(Decimal('0.01'))
    tax = (net * tax_rate / 100).quantize(Decimal('0.01'))
    return net, tax, net + tax + adjustment


def sync_sales_to_inventory_and_gl(invoice, items_data, comp):
    """Replace the invoice lines. Approved invoices are reversed and re-posted through the one approval path."""
    approved = str(getattr(invoice, 'status', '')).strip().lower() == 'approved'
    if approved:
        reverse_sales_invoice_on_delete(invoice)
    invoice.items.all().delete()

    is_job_work = str(getattr(invoice, 'invoice_type', 'SALES')).upper() == 'JOB_WORK'
    for it in items_data:
        it_val = it.get('item') or it.get('item_id')
        item_obj = None
        if it_val:
            try:
                item_obj = Item.objects.filter(id=int(it_val), company=comp).first()
            except (ValueError, TypeError):
                clean_code = str(it_val).split('(')[-1].replace(')', '').strip()
                item_obj = Item.objects.filter(
                    Q(item_code__iexact=clean_code) | Q(item_code__iexact=str(it_val)) | Q(item_name__iexact=str(it_val)),
                    company=comp
                ).first()
        if not item_obj:
            raise ValidationError({'error': f'Item not found in this company: {it_val}'})
        if Decimal(str(it.get('quantity') or it.get('qty') or 0)) <= 0 or Decimal(str(it.get('rate') or 0)) < 0:
            raise ValidationError({'error': f'{item_obj.item_name}: quantity must be above zero and rate not negative.'})

        is_foc = bool(it.get('is_foc', False))
        qty = Decimal(str(it.get('quantity') or it.get('qty', 1) or 1))
        rate = Decimal('0.00') if is_foc else Decimal(str(it.get('rate') or 0))
        disc_pct = Decimal('0.00') if is_foc else Decimal(str(it.get('discount_percentage') or 0))
        disc_amt = (qty * rate * disc_pct / 100).quantize(Decimal('0.01'))
        SalesInvoiceItem.objects.create(
            invoice=invoice,
            item=item_obj,
            hsn_code=(it.get('hsn_code') or ('9988' if is_job_work else item_obj.hsn_code) or '')[:20],
            description=it.get('description') or item_obj.item_name,
            quantity=qty,
            rate=rate,
            amount=qty * rate - disc_amt,
            discount_percentage=disc_pct,
            discount_amount=disc_amt,
            is_foc=is_foc
        )

    if approved:
        approve_and_post_sales_invoice(invoice)


class CustomerListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = Customer.objects.all().order_by('-id')
        if comp:
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
            qs = qs.filter(company=comp)
        return qs

    def perform_create(self, serializer):
        comp = get_request_company(self.request)
        serializer.save(company=comp)


class CreditNoteRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CreditNote.objects.all()
    serializer_class = CreditNoteSerializer

    def perform_destroy(self, instance):
        with transaction.atomic():
            reverse_return_note(instance, 'credit')
            instance.delete()


class SalesInvoiceListCreateAPIView(generics.ListCreateAPIView):

    def perform_create(self, serializer):
        if str(self.request.data.get('invoice_type', 'SALES')).upper() != 'JOB_WORK':
            validate_sales_invoice_stock(self.request.data.get('items', []), self.request.data.get('company'))
        serializer.save(status='Draft')

    serializer_class = SalesInvoiceSerializer

    def get_queryset(self):
        comp = get_request_company(self.request)
        qs = SalesInvoice.objects.all().order_by('-posting_date', '-id')
        if comp:
            qs = qs.filter(company=comp)
        u = resolve_active_unit(self.request, comp)
        if u and u.unit_type != 'HO':
            qs = qs.filter(unit=u)
        return qs

    def create(self, request, *args, **kwargs):
        comp = get_request_company(request)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        u_obj = resolve_active_unit(request, comp, default_unit_type='TRADING')
        inv_no = (data.get('invoice_number') or '').strip()
        # GST Rule 46: one serial series per GSTIN, so uniqueness is per company, not per division.
        # ponytail: single INV- series, add per-FY prefix (e.g. 2627/INV-) if the CA wants yearly reset
        if not inv_no or SalesInvoice.objects.filter(company=comp, invoice_number=inv_no).exists():
            count = SalesInvoice.objects.filter(company=comp).count() + 1
            inv_no = f"INV-{count:04d}"
            while SalesInvoice.objects.filter(company=comp, invoice_number=inv_no).exists():
                count += 1
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
        tax_rate = Decimal(str(data.get('tax_rate', 18) or 0))
        adjustment = Decimal(str(data.get('adjustment', 0) or 0))
        net_total, tax_amount, grand_total = invoice_totals(data.get('items', []), tax_rate, adjustment)
        invoice_type = 'JOB_WORK' if str(data.get('invoice_type', 'SALES')).upper() == 'JOB_WORK' else 'SALES'

        user = _resolve_request_user(request)

        if invoice_type != 'JOB_WORK':
            validate_sales_invoice_stock(data.get('items', []), comp.id if comp else None)

        with transaction.atomic():
            invoice = SalesInvoice.objects.create(
                company=comp,
                unit=u_obj,
                invoice_type=invoice_type,
                party_challan_no=str(data.get('party_challan_no') or '')[:80],
                customer=cust_obj,
                customer_name=customer_name,
                invoice_number=inv_no,
                posting_date=posting_date,
                due_date=due_date,
                tax_rate=tax_rate,
                net_total=net_total,
                tax_amount=tax_amount,
                adjustment=adjustment,
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
            from django.utils import timezone
            approver = _resolve_request_user(self.request)
            uf = []
            if hasattr(invoice, 'approved_by') and approver and not invoice.approved_by_id:
                invoice.approved_by = approver
                uf.append('approved_by')
            if hasattr(invoice, 'approval_date') and not invoice.approval_date:
                invoice.approval_date = timezone.now()
                uf.append('approval_date')
            if uf:
                invoice.save(update_fields=uf)

    def perform_destroy(self, instance):
        guard_credit_notes(instance)
        with transaction.atomic():
            reverse_sales_invoice_on_delete(instance)
            instance.delete()

    queryset = SalesInvoice.objects.all()
    serializer_class = SalesInvoiceSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        comp = instance.company or get_request_company(request)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

        with transaction.atomic():
            if 'customer' in data and data['customer']:
                cust = Customer.objects.filter(id=int(data['customer']), company=comp).first()
                if cust:
                    instance.customer = cust
                    instance.customer_name = cust.customer_name
            instance.posting_date = parse_date_safe(data.get('posting_date', instance.posting_date))
            instance.due_date = parse_date_safe(data.get('due_date', instance.due_date))
            if 'tax_rate' in data:
                instance.tax_rate = Decimal(str(data['tax_rate'] or 0))
            if 'adjustment' in data:
                instance.adjustment = Decimal(str(data['adjustment'] or 0))
            if 'invoice_type' in data:
                instance.invoice_type = 'JOB_WORK' if str(data['invoice_type']).upper() == 'JOB_WORK' else 'SALES'
            if 'party_challan_no' in data:
                instance.party_challan_no = str(data['party_challan_no'] or '')[:80]
            # Header-only edits still recompute and re-post, so totals and GL never drift from the lines.
            # Stock is checked by the approval path after the old deduction is reversed.
            items_data = data.get('items') or [
                {'item': l.item_id, 'quantity': l.quantity, 'rate': l.rate, 'discount_percentage': l.discount_percentage,
                 'is_foc': l.is_foc, 'hsn_code': l.hsn_code, 'description': l.description}
                for l in instance.items.all()
            ]
            guard_credit_notes(instance, items_data)
            instance.net_total, instance.tax_amount, instance.grand_total = invoice_totals(items_data, instance.tax_rate, instance.adjustment)
            instance.save()
            sync_sales_to_inventory_and_gl(instance, items_data, comp)

        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SalesInvoiceApproveAPIView(APIView):
    def post(self, request, pk):
        from django.utils import timezone
        from selling.models import SalesInvoice
        invoice = get_object_or_404(SalesInvoice, pk=pk)
        approve_and_post_sales_invoice(invoice)
        approver = _resolve_request_user(request)
        update_fields = []
        if hasattr(invoice, 'approved_by') and approver and not invoice.approved_by_id:
            invoice.approved_by = approver
            update_fields.append('approved_by')
        if hasattr(invoice, 'approval_date') and not invoice.approval_date:
            invoice.approval_date = timezone.now()
            update_fields.append('approval_date')
        if update_fields:
            invoice.save(update_fields=update_fields)
        return Response({'status': 'Approved', 'id': invoice.id})
