from decimal import Decimal
from django.db import transaction, models
from django.apps import apps
from rest_framework.exceptions import ValidationError


def _has_field(model, field_name):
    return any(f.name == field_name for f in model._meta.get_fields())


def _safe_create(model, **kwargs):
    valid_names = {f.name for f in model._meta.fields}
    clean_kwargs = {k: v for k, v in kwargs.items() if k in valid_names}
    for f in model._meta.fields:
        if f.name in clean_kwargs or f.primary_key:
            continue
        if getattr(f, 'auto_now', False) or getattr(f, 'auto_now_add', False):
            continue
        if not f.null and (f.default is models.NOT_PROVIDED or f.default is None):
            if isinstance(f, (models.CharField, models.TextField)):
                clean_kwargs[f.name] = ''
            elif isinstance(f, (models.DecimalField, models.FloatField, models.IntegerField)):
                clean_kwargs[f.name] = Decimal('0.00') if isinstance(f, models.DecimalField) else 0
            elif isinstance(f, models.BooleanField):
                clean_kwargs[f.name] = False
    return model.objects.create(**clean_kwargs)


def _get_lines(doc):
    for attr in ['items', 'lines', 'bill_items', 'invoice_items']:
        if hasattr(doc, attr):
            mgr = getattr(doc, attr)
            if hasattr(mgr, 'all'):
                return list(mgr.all())
    for rel in doc._meta.related_objects:
        accessor = rel.get_accessor_name()
        if hasattr(doc, accessor):
            mgr = getattr(doc, accessor)
            if hasattr(mgr, 'all'):
                rows = list(mgr.all())
                if rows and hasattr(rows[0], 'item_id'):
                    return rows
    return []


def _scope_qs(qs, model, doc):
    comp_id = getattr(doc, 'company_id', None)
    if comp_id and _has_field(model, 'company'):
        return qs.filter(company_id=comp_id)
    return qs


def _create_sl_entry(StockLedgerEntry, item_obj, comp, p_date, v_type, v_no, in_qty, out_qty, actual_qty, new_bal, rate_val):
    return _safe_create(
        StockLedgerEntry,
        item=item_obj,
        company=comp or getattr(item_obj, 'company', None),
        posting_date=p_date,
        voucher_type=v_type,
        voucher_no=v_no,
        actual_qty=actual_qty,
        qty_change=actual_qty,
        inward_qty=in_qty,
        outward_qty=out_qty,
        qty_after_transaction=new_bal,
        balance_qty=new_bal,
        valuation_rate=rate_val,
        stock_value=(new_bal * rate_val).quantize(Decimal('0.01')),
    )


def validate_sales_invoice_stock(items_data, company_id=None):
    Item = apps.get_model('stock', 'Item')
    for row in items_data:
        item_id = row.get('item') if isinstance(row, dict) else getattr(row, 'item_id', None) or getattr(getattr(row, 'item', None), 'id', None)
        qty = Decimal(str(row.get('quantity') if isinstance(row, dict) else getattr(row, 'quantity', 0) or 0))
        if not item_id or qty <= 0:
            continue

        item_obj = Item.objects.filter(id=item_id).first()
        if not item_obj:
            raise ValidationError({'error': f'Item #{item_id} not found.'})

        avail = Decimal(str(getattr(item_obj, 'current_stock', 0) or 0))
        if avail < qty:
            raise ValidationError({
                'error': f'Insufficient Stock for {item_obj.item_name} ({item_obj.item_code}): Available {avail}, Requested {qty}. Negative stock is not allowed.'
            })


@transaction.atomic
def approve_and_post_sales_invoice(invoice):
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')

    lines = _get_lines(invoice)
    validate_sales_invoice_stock(lines, getattr(invoice, 'company_id', None))

    existing_gl = _scope_qs(GLEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), GLEntry, invoice)
    if existing_gl.exists():
        invoice.status = 'Approved'
        invoice.save(update_fields=['status'])
        return

    comp = getattr(invoice, 'company', None)
    p_date = invoice.posting_date

    for line in lines:
        item_obj = Item.objects.select_for_update().get(id=line.item_id)
        qty = Decimal(str(line.quantity or 0))
        curr = Decimal(str(item_obj.current_stock or 0))
        new_bal = curr - qty
        if new_bal < 0:
            raise ValidationError({
                'error': f'Insufficient Stock for {item_obj.item_name}: Available {curr}, Requested {qty}.'
            })
        item_obj.current_stock = new_bal
        item_obj.save(update_fields=['current_stock'])

        rate_val = Decimal(str(getattr(line, 'rate', 0) or item_obj.standard_rate or 0)).quantize(Decimal('0.01'))
        _create_sl_entry(
            StockLedgerEntry, item_obj, comp, p_date,
            'Sales Invoice', invoice.invoice_number,
            Decimal('0.00'), qty, -qty, new_bal, rate_val
        )

    net_total = Decimal(str(invoice.net_total or 0))
    tax_amount = Decimal(str(invoice.tax_amount or 0))
    grand_total = Decimal(str(invoice.grand_total or 0))
    adjustment = Decimal(str(getattr(invoice, 'adjustment', 0) or 0))
    party_name = invoice.customer_name or ''
    rem = f'Sales Invoice #{invoice.invoice_number} - {party_name}'

    if grand_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Debtors', against='Sales Income, Output GST', party_type='Customer', party=party_name, debit=grand_total, credit=Decimal('0.00'), remarks=rem, company=comp)
    if net_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Sales Income', against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=Decimal('0.00'), credit=net_total, remarks=rem, company=comp)
    if tax_amount > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Output GST', against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=Decimal('0.00'), credit=tax_amount, remarks=rem, company=comp)
    if adjustment != 0:
        adj_debit = abs(adjustment) if adjustment < 0 else Decimal('0.00')
        adj_credit = adjustment if adjustment > 0 else Decimal('0.00')
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Freight & Adjustments', against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=adj_debit, credit=adj_credit, remarks=rem, company=comp)

    invoice.status = 'Approved'
    invoice.save(update_fields=['status'])


@transaction.atomic
def reverse_sales_invoice_on_delete(invoice):
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')

    sl_qs = _scope_qs(StockLedgerEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), StockLedgerEntry, invoice)
    gl_qs = _scope_qs(GLEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), GLEntry, invoice)

    was_approved = str(getattr(invoice, 'status', '')).strip().lower() == 'approved'
    if was_approved or sl_qs.exists() or gl_qs.exists():
        for line in _get_lines(invoice):
            item_obj = Item.objects.select_for_update().filter(id=line.item_id).first()
            if item_obj:
                qty = Decimal(str(line.quantity or 0))
                item_obj.current_stock = Decimal(str(item_obj.current_stock or 0)) + qty
                item_obj.save(update_fields=['current_stock'])

        sl_qs.delete()
        gl_qs.delete()


@transaction.atomic
def sync_purchase_invoice(bill):
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')

    sl_qs = _scope_qs(StockLedgerEntry.objects.filter(voucher_type='Purchase Invoice', voucher_no=bill.bill_number), StockLedgerEntry, bill)
    gl_qs = _scope_qs(GLEntry.objects.filter(voucher_type='Purchase Invoice', voucher_no=bill.bill_number), GLEntry, bill)

    for old in list(sl_qs):
        item_obj = Item.objects.select_for_update().filter(id=old.item_id).first()
        if item_obj:
            old_in = Decimal(str(getattr(old, 'inward_qty', 0) or getattr(old, 'actual_qty', 0) or 0))
            item_obj.current_stock = max(Decimal('0.00'), Decimal(str(item_obj.current_stock or 0)) - old_in)
            item_obj.save(update_fields=['current_stock'])

    sl_qs.delete()
    gl_qs.delete()

    if str(getattr(bill, 'status', '')).strip().lower() != 'approved':
        return

    comp = getattr(bill, 'company', None)
    p_date = bill.posting_date

    for line in _get_lines(bill):
        item_obj = Item.objects.select_for_update().get(id=line.item_id)
        qty = Decimal(str(line.quantity or 0))
        if qty <= 0:
            continue

        curr = Decimal(str(item_obj.current_stock or 0))
        new_bal = curr + qty
        item_obj.current_stock = new_bal

        line_amt = Decimal(str(getattr(line, 'amount', 0) or 0))
        eff_rate = ((line_amt / qty) if (qty > 0 and line_amt > 0) else Decimal(str(getattr(line, 'rate', 0) or item_obj.standard_rate or 0))).quantize(Decimal('0.01'))
        if eff_rate > 0:
            item_obj.standard_rate = eff_rate
        item_obj.save(update_fields=['current_stock', 'standard_rate'])

        _create_sl_entry(
            StockLedgerEntry, item_obj, comp, p_date,
            'Purchase Invoice', bill.bill_number,
            qty, Decimal('0.00'), qty, new_bal, eff_rate
        )

    net_total = Decimal(str(bill.net_total or 0))
    tax_amount = Decimal(str(bill.tax_amount or 0))
    grand_total = Decimal(str(bill.grand_total or 0))
    party_name = bill.supplier_name or ''
    rem = f'Purchase Bill #{bill.bill_number} - {party_name}'

    if net_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Purchases', against=party_name or 'Creditors', party_type='Supplier', party=party_name, debit=net_total, credit=Decimal('0.00'), remarks=rem, company=comp)
    if tax_amount > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Input GST', against=party_name or 'Creditors', party_type='Supplier', party=party_name, debit=tax_amount, credit=Decimal('0.00'), remarks=rem, company=comp)
    if grand_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Creditors', against='Purchases, Input GST', party_type='Supplier', party=party_name, debit=Decimal('0.00'), credit=grand_total, remarks=rem, company=comp)


@transaction.atomic
def reverse_purchase_invoice_on_delete(bill):
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')

    sl_qs = _scope_qs(StockLedgerEntry.objects.filter(voucher_type='Purchase Invoice', voucher_no=bill.bill_number), StockLedgerEntry, bill)
    gl_qs = _scope_qs(GLEntry.objects.filter(voucher_type='Purchase Invoice', voucher_no=bill.bill_number), GLEntry, bill)

    was_approved = str(getattr(bill, 'status', '')).strip().lower() == 'approved'
    if was_approved or sl_qs.exists() or gl_qs.exists():
        for line in _get_lines(bill):
            item_obj = Item.objects.select_for_update().filter(id=line.item_id).first()
            if item_obj:
                qty = Decimal(str(line.quantity or 0))
                curr = Decimal(str(item_obj.current_stock or 0))
                if curr < qty:
                    raise ValidationError({
                        'error': f'Cannot delete {bill.bill_number}: {item_obj.item_name} stock ({curr}) is less than bill quantity ({qty}). Delete linked sales first.'
                    })
                item_obj.current_stock = curr - qty
                item_obj.save(update_fields=['current_stock'])

        sl_qs.delete()
        gl_qs.delete()
