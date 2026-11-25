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
        raw_qty = Decimal(str(it.get('quantity') or it.get('qty', 1) or 1))
        raw_rate = Decimal('0.00') if is_foc else Decimal(str(it.get('rate') or 0))
        billed_unit = str(it.get('billed_unit') or item_obj.unit or '').strip()
        alt_unit = str(getattr(item_obj, 'alt_unit', '') or '').strip()
        conv = Decimal(str(getattr(item_obj, 'conversion_factor', 1) or 1))
        if alt_unit and alt_unit.lower() != str(item_obj.unit or '').strip().lower() and billed_unit.lower() == alt_unit.lower() and conv > 0:
            billed_qty = raw_qty
            qty = (raw_qty / conv).quantize(Decimal('0.01'))
            rate = (raw_rate * conv).quantize(Decimal('0.01'))
            gross_amt = (billed_qty * raw_rate).quantize(Decimal('0.01'))
        else:
            billed_unit = str(item_obj.unit or billed_unit)
            billed_qty = raw_qty
            qty = raw_qty
            rate = raw_rate
            gross_amt = (qty * rate).quantize(Decimal('0.01'))
        if qty <= 0:
            raise ValidationError({'error': f'{item_obj.item_name}: converted stock quantity must be above zero.'})
        disc_pct = Decimal('0.00') if is_foc else Decimal(str(it.get('discount_percentage') or 0))
        disc_amt = (gross_amt * disc_pct / 100).quantize(Decimal('0.01'))
        SalesInvoiceItem.objects.create(
            invoice=invoice,
            item=item_obj,
            hsn_code=(it.get('hsn_code') or ('9988' if is_job_work else item_obj.hsn_code) or '')[:20],
            description=it.get('description') or item_obj.item_name,
            quantity=qty,
            billed_unit=billed_unit,
            billed_qty=billed_qty,
            rate=rate,
            amount=gross_amt - disc_amt,
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
        is_proforma = inv_no.upper().startswith('PI-')
        # GST Rule 46: one serial series per GSTIN, so uniqueness is per company, not per division.
        if is_proforma:
            if SalesInvoice.objects.filter(company=comp, invoice_number__iexact=inv_no).exists():
                pi_count = SalesInvoice.objects.filter(company=comp, invoice_number__istartswith='PI-').count() + 1
                inv_no = f"PI-{pi_count:03d}"
                while SalesInvoice.objects.filter(company=comp, invoice_number__iexact=inv_no).exists():
                    pi_count += 1
                    inv_no = f"PI-{pi_count:03d}"
        elif not inv_no or SalesInvoice.objects.filter(company=comp, invoice_number=inv_no).exists():
            count = SalesInvoice.objects.filter(company=comp).exclude(invoice_number__istartswith='PI-').count() + 1
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

        if invoice_type != 'JOB_WORK' and not is_proforma:
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

        if str(getattr(instance, 'status', '')).strip().lower() == 'approved':
            user = _resolve_request_user(request)
            is_priv = bool(
                user and (
                    getattr(user, 'is_superuser', False)
                    or getattr(user, 'is_staff', False)
                    or (hasattr(user, 'profile') and str(getattr(user.profile, 'role', '')).upper() in ('ADMIN', 'MANAGER'))
                )
            )
            req_unit = resolve_active_unit(request, comp)
            if req_unit and getattr(req_unit, 'unit_type', '') == 'TRADING':
                raise ValidationError({'error': 'This invoice is Approved & Locked in Trading Division. Please get approval from HO or Admin.'})
            if not is_priv:
                raise ValidationError({'error': 'This invoice is Approved & Locked. Please get approval from HO or Admin.'})

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


class ConvertProformaToTaxInvoiceAPIView(APIView):
    @transaction.atomic
    def post(self, request, pk):
        from django.db.models import Sum
        from stock.models import StockLedgerEntry
        comp = get_request_company(request)
        pi = get_object_or_404(SalesInvoice, pk=pk)
        if comp and pi.company_id and pi.company_id != comp.id:
            return Response({'error': 'Proforma invoice does not belong to active company.'}, status=status.HTTP_403_FORBIDDEN)
        if not str(pi.invoice_number or '').upper().startswith('PI-'):
            return Response({'error': 'Only Proforma Invoices (PI-...) can be converted to Tax Invoice.'}, status=status.HTTP_400_BAD_REQUEST)

        use_comp = pi.company or comp
        is_jw = str(pi.invoice_type or 'SALES').upper() == 'JOB_WORK'
        proceed_partial = bool((request.data or {}).get('proceed_partial'))
        pi_lines = list(pi.items.select_related('item').all())
        if not pi_lines:
            return Response({'error': 'Proforma invoice has no line items.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check stock availability per line (using company-wide ready stock; auto-transfer handles unit move)
        ready_lines = []
        missing_items = []
        if is_jw:
            ready_lines = pi_lines
        else:
            avail_map = {}
            for ln in pi_lines:
                if ln.item_id not in avail_map:
                    total_avail = Decimal(str(ln.item.current_stock or 0))
                    if use_comp:
                        sle_tot = StockLedgerEntry.objects.filter(company=use_comp, item_id=ln.item_id).aggregate(q=Sum('actual_qty'))['q']
                        if sle_tot is not None:
                            total_avail = max(Decimal('0.00'), Decimal(str(sle_tot)))
                    avail_map[ln.item_id] = max(Decimal('0.00'), total_avail)

                need_q = Decimal(str(ln.quantity or 0))
                if avail_map[ln.item_id] >= need_q:
                    ready_lines.append(ln)
                    avail_map[ln.item_id] -= need_q
                else:
                    missing_items.append({
                        'line_id': ln.id,
                        'item_id': ln.item_id,
                        'item_code': ln.item.item_code,
                        'item_name': ln.item.item_name,
                        'required_qty': float(need_q),
                        'available_qty': float(avail_map[ln.item_id]),
                        'unit': ln.item.unit or 'Nos',
                        'rate': float(ln.rate or 0),
                    })

        if missing_items and not proceed_partial:
            return Response({
                'needs_confirmation': True,
                'proforma_number': pi.invoice_number,
                'ready_count': len(ready_lines),
                'missing_count': len(missing_items),
                'ready_items': [
                    {
                        'item_name': l.item.item_name,
                        'item_code': l.item.item_code,
                        'quantity': float(l.quantity),
                        'unit': l.item.unit or 'Nos',
                        'rate': float(l.rate or 0),
                    }
                    for l in ready_lines
                ],
                'missing_items': missing_items,
                'message': f"{len(missing_items)} item(s) missing or short in stock. Proceed with {len(ready_lines)} ready item(s) (Partial Tax Invoice) or wait until stock is ready?",
            }, status=status.HTTP_200_OK)

        lines_to_invoice = ready_lines if missing_items else pi_lines
        if not lines_to_invoice:
            return Response({
                'error': 'None of the Proforma items have sufficient ready stock. Please transfer/produce stock or send to Factory first.',
                'missing_items': missing_items,
            }, status=status.HTTP_400_BAD_REQUEST)

        count = SalesInvoice.objects.filter(company=use_comp).exclude(invoice_number__istartswith='PI-').count() + 1
        inv_no = f"INV-{count:04d}"
        while SalesInvoice.objects.filter(company=use_comp, invoice_number=inv_no).exists():
            count += 1
            inv_no = f"INV-{count:04d}"

        p_date = timezone.now().date()
        due_days = 30
        if pi.posting_date and pi.due_date:
            diff = (pi.due_date - pi.posting_date).days
            if diff > 0:
                due_days = diff
        due_date = p_date + timezone.timedelta(days=due_days)

        net_total = sum((Decimal(str(l.amount or 0)) for l in lines_to_invoice), Decimal('0.00')).quantize(Decimal('0.01'))
        tax_rate = Decimal(str(pi.tax_rate or 0))
        tax_amount = ((net_total * tax_rate) / Decimal('100.00')).quantize(Decimal('0.01'))
        adj = Decimal(str(pi.adjustment or 0)) if not missing_items else Decimal('0.00')
        grand_total = (net_total + tax_amount + adj).quantize(Decimal('0.01'))

        user = _resolve_request_user(request)
        tax_inv = SalesInvoice.objects.create(
            company=use_comp,
            unit=pi.unit,
            customer=pi.customer,
            customer_name=pi.customer_name,
            invoice_type=pi.invoice_type,
            party_challan_no=pi.party_challan_no,
            invoice_number=inv_no,
            posting_date=p_date,
            due_date=due_date,
            tax_rate=tax_rate,
            net_total=net_total,
            tax_amount=tax_amount,
            adjustment=adj,
            grand_total=grand_total,
            status='Pending Approval',
            created_by=user or pi.created_by,
        )
        for line in lines_to_invoice:
            SalesInvoiceItem.objects.create(
                invoice=tax_inv,
                item=line.item,
                hsn_code=line.hsn_code,
                description=line.description,
                quantity=line.quantity,
                billed_unit=line.billed_unit,
                billed_qty=line.billed_qty,
                rate=line.rate,
                discount_percentage=line.discount_percentage,
                discount_amount=line.discount_amount,
                is_foc=line.is_foc,
                amount=line.amount,
            )

        if not missing_items:
            pi.status = 'Rejected'
            pi.rejection_reason = f'Converted to Tax Invoice {inv_no}'
            pi.save(update_fields=['status', 'rejection_reason'])
        else:
            # Remove already-invoiced lines from Proforma so only remaining items stay pending
            invoiced_ids = [l.id for l in lines_to_invoice]
            pi.items.filter(id__in=invoiced_ids).delete()
            rem_net = sum((Decimal(str(l.amount or 0)) for l in pi.items.all()), Decimal('0.00')).quantize(Decimal('0.01'))
            rem_tax = ((rem_net * tax_rate) / Decimal('100.00')).quantize(Decimal('0.01'))
            pi.net_total = rem_net
            pi.tax_amount = rem_tax
            pi.grand_total = (rem_net + rem_tax).quantize(Decimal('0.01'))
            pi.rejection_reason = f'Partial Tax Invoice {inv_no} generated; {len(missing_items)} item(s) remaining'
            pi.save(update_fields=['net_total', 'tax_amount', 'grand_total', 'rejection_reason'])

        ser = SalesInvoiceSerializer(tax_inv)
        return Response({
            'message': f"Proforma {pi.invoice_number} converted to Tax Invoice {inv_no} and sent to HO / Admin for Approval!",
            'invoice_number': inv_no,
            'partial': bool(missing_items),
            'invoice': ser.data,
        }, status=status.HTTP_201_CREATED)
