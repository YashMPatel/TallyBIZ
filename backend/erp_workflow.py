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


def _create_sl_entry(StockLedgerEntry, item_obj, comp, p_date, v_type, v_no, in_qty, out_qty, actual_qty, new_bal, rate_val, unit_obj=None):
    return _safe_create(
        StockLedgerEntry,
        item=item_obj,
        company=comp or getattr(item_obj, 'company', None),
        unit=unit_obj,
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

    is_job_work = (str(getattr(invoice, 'invoice_type', 'SALES')).upper() == 'JOB_WORK')
    lines = _get_lines(invoice)
    if not is_job_work:
        validate_sales_invoice_stock(lines, getattr(invoice, 'company_id', None))

    existing_gl = _scope_qs(GLEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), GLEntry, invoice)
    if existing_gl.exists():
        invoice.status = 'Approved'
        invoice.save(update_fields=['status'])
        return

    comp = getattr(invoice, 'company', None)
    p_date = invoice.posting_date

    from django.db.models import Sum
    BusinessUnit = apps.get_model('accounts', 'BusinessUnit')
    target_unit = getattr(invoice, 'unit', None)
    if not target_unit and comp:
        target_unit = (
            BusinessUnit.objects.filter(company=comp, unit_type='TRADING', is_active=True).first()
            or BusinessUnit.objects.filter(company=comp, is_active=True).first()
        )
        if target_unit and _has_field(invoice.__class__, 'unit'):
            invoice.unit = target_unit
            invoice.save(update_fields=['unit'])

    inter_div_supply_total = Decimal('0.00')
    mfg_donor_unit = None

    for line_idx, line in enumerate(lines if not is_job_work else [], start=1):
        item_obj = Item.objects.select_for_update().get(id=line.item_id)
        qty = Decimal(str(line.quantity or 0))
        curr_total = Decimal(str(item_obj.current_stock or 0))
        new_total = curr_total - qty
        rate_val = Decimal(str(getattr(line, 'rate', 0) or item_obj.standard_rate or 0)).quantize(Decimal('0.01'))
        cost_rate = Decimal(str(item_obj.standard_rate or rate_val or 0)).quantize(Decimal('0.01'))

        # Check stock specifically in selling division (target_unit)
        unit_avail = (
            StockLedgerEntry.objects.filter(company=comp, unit=target_unit, item=item_obj).aggregate(q=Sum('actual_qty'))['q']
            or Decimal('0.00')
        )

        # Auto-Transfer from Manufacturing Unit (or other division) if selling division lacks stock
        if comp and target_unit and unit_avail < qty:
            other_units = list(BusinessUnit.objects.filter(company=comp, is_active=True).exclude(id=target_unit.id).order_by('id'))
            other_units.sort(key=lambda u: 0 if u.unit_type == 'MANUFACTURING' else 1)
            shortfall = qty - max(Decimal('0.00'), unit_avail)
            for donor_u in other_units:
                if shortfall <= 0:
                    break
                donor_avail = (
                    StockLedgerEntry.objects.filter(company=comp, unit=donor_u, item=item_obj).aggregate(q=Sum('actual_qty'))['q']
                    or Decimal('0.00')
                )
                if donor_avail <= 0:
                    continue
                move_qty = min(shortfall, donor_avail)
                trf_vno = f"AUTO-TRF-{invoice.invoice_number}-{line_idx}"
                donor_after = donor_avail - move_qty
                unit_avail = unit_avail + move_qty

                _create_sl_entry(
                    StockLedgerEntry, item_obj, comp, p_date,
                    'Stock Transfer', trf_vno,
                    Decimal('0.00'), move_qty, -move_qty, donor_after, cost_rate, donor_u
                )
                _create_sl_entry(
                    StockLedgerEntry, item_obj, comp, p_date,
                    'Stock Transfer', trf_vno,
                    move_qty, Decimal('0.00'), move_qty, unit_avail, cost_rate, target_unit
                )
                if donor_u.unit_type == 'MANUFACTURING':
                    mfg_donor_unit = donor_u
                    inter_div_supply_total += (move_qty * cost_rate).quantize(Decimal('0.01'))
                shortfall -= move_qty

        if new_total < 0 or (target_unit and unit_avail < qty):
            raise ValidationError({
                'error': f'Insufficient Stock for {item_obj.item_name}: Available {unit_avail}, Requested {qty}.'
            })

        unit_bal_after = unit_avail - qty
        item_obj.current_stock = new_total
        item_obj.save(update_fields=['current_stock'])

        _create_sl_entry(
            StockLedgerEntry, item_obj, comp, p_date,
            'Sales Invoice', invoice.invoice_number,
            Decimal('0.00'), qty, -qty, unit_bal_after, rate_val, target_unit
        )

    net_total = Decimal(str(invoice.net_total or 0))
    tax_amount = Decimal(str(invoice.tax_amount or 0))
    grand_total = Decimal(str(invoice.grand_total or 0))
    adjustment = Decimal(str(getattr(invoice, 'adjustment', 0) or 0))
    party_name = invoice.customer_name or ''
    rem = f'Sales Invoice #{invoice.invoice_number} - {party_name}'

    if grand_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Debtors', against='Sales Income, Output GST', party_type='Customer', party=party_name, debit=grand_total, credit=Decimal('0.00'), remarks=rem, company=comp, unit=getattr(invoice, 'unit', None))
    if net_total > 0:
        inc_acc = 'Job Work Income' if is_job_work else 'Sales Income'
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account=inc_acc, against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=Decimal('0.00'), credit=net_total, remarks=rem, company=comp, unit=getattr(invoice, 'unit', None))
    if tax_amount > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Output GST', against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=Decimal('0.00'), credit=tax_amount, remarks=rem, company=comp, unit=getattr(invoice, 'unit', None))
    if adjustment != 0:
        adj_debit = abs(adjustment) if adjustment < 0 else Decimal('0.00')
        adj_credit = adjustment if adjustment > 0 else Decimal('0.00')
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Freight & Adjustments', against=party_name or 'Debtors', party_type='Customer', party=party_name, debit=adj_debit, credit=adj_credit, remarks=rem, company=comp, unit=getattr(invoice, 'unit', None))

    if inter_div_supply_total > 0 and mfg_donor_unit and target_unit:
        rem_trf = f'Inter-Division Stock Supply for #{invoice.invoice_number} ({mfg_donor_unit.name} -> {target_unit.name})'
        # Manufacturing Unit books Inter-Division Supply Income & Inter-Division Receivable
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Inter-Division Receivable', against='Inter-Division Supply Income', party_type='Division', party=target_unit.name, debit=inter_div_supply_total, credit=Decimal('0.00'), remarks=rem_trf, company=comp, unit=mfg_donor_unit)
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Inter-Division Supply Income', against='Inter-Division Receivable', party_type='Division', party=target_unit.name, debit=Decimal('0.00'), credit=inter_div_supply_total, remarks=rem_trf, company=comp, unit=mfg_donor_unit)
        # Selling Division books Inter-Division Stock Cost & Inter-Division Payable (Eliminated in Consolidated!)
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Inter-Division Stock Cost', against='Inter-Division Payable', party_type='Division', party=mfg_donor_unit.name, debit=inter_div_supply_total, credit=Decimal('0.00'), remarks=rem_trf, company=comp, unit=target_unit)
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Sales Invoice', voucher_no=invoice.invoice_number, account='Inter-Division Payable', against='Inter-Division Stock Cost', party_type='Division', party=mfg_donor_unit.name, debit=Decimal('0.00'), credit=inter_div_supply_total, remarks=rem_trf, company=comp, unit=target_unit)

    invoice.status = 'Approved'
    invoice.save(update_fields=['status'])


@transaction.atomic
def reverse_sales_invoice_on_delete(invoice):
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')

    sl_qs = _scope_qs(StockLedgerEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), StockLedgerEntry, invoice)
    gl_qs = _scope_qs(GLEntry.objects.filter(voucher_type='Sales Invoice', voucher_no=invoice.invoice_number), GLEntry, invoice)

    if sl_qs.exists() or gl_qs.exists():
        # Restore exactly what the ledger deducted (job work invoices deduct nothing).
        for sle in sl_qs:
            item_obj = Item.objects.select_for_update().filter(id=sle.item_id).first()
            if item_obj:
                item_obj.current_stock = Decimal(str(item_obj.current_stock or 0)) - Decimal(str(sle.actual_qty or 0))
                item_obj.save(update_fields=['current_stock'])
            if sle.batch_id and sle.actual_qty < 0:
                StockBatch = apps.get_model('stock', 'StockBatch')
                StockBatch.objects.filter(id=sle.batch_id).update(remaining_qty=models.F('remaining_qty') - sle.actual_qty)

        StockLedgerEntry.objects.filter(
            company=getattr(invoice, 'company', None),
            voucher_type='Stock Transfer',
            voucher_no__startswith=f'AUTO-TRF-{invoice.invoice_number}'
        ).delete()
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
            qty, Decimal('0.00'), qty, new_bal, eff_rate, getattr(bill, 'unit', None)
        )

    net_total = Decimal(str(bill.net_total or 0))
    tax_amount = Decimal(str(bill.tax_amount or 0))
    grand_total = Decimal(str(bill.grand_total or 0))
    party_name = bill.supplier_name or ''
    rem = f'Purchase Bill #{bill.bill_number} - {party_name}'

    if net_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Purchases', against=party_name or 'Creditors', party_type='Supplier', party=party_name, debit=net_total, credit=Decimal('0.00'), remarks=rem, company=comp, unit=getattr(bill, 'unit', None))
    if tax_amount > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Input GST', against=party_name or 'Creditors', party_type='Supplier', party=party_name, debit=tax_amount, credit=Decimal('0.00'), remarks=rem, company=comp, unit=getattr(bill, 'unit', None))
    if grand_total > 0:
        _safe_create(GLEntry, posting_date=p_date, voucher_type='Purchase Invoice', voucher_no=bill.bill_number, account='Creditors', against='Purchases, Input GST', party_type='Supplier', party=party_name, debit=Decimal('0.00'), credit=grand_total, remarks=rem, company=comp, unit=getattr(bill, 'unit', None))


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


# ---- Credit / Debit notes (GST Rule 53). Posted on save; reversal undoes exactly what was posted. ----
_NOTES = {
    'credit': dict(number='credit_note_number', invoice='sales_invoice', party='customer_name', party_type='Customer',
                   vtype='Credit Note', stock_sign=1, tax_acc='Output GST', party_acc='Debtors', income_side='dr'),
    'debit': dict(number='debit_note_number', invoice='purchase_invoice', party='supplier_name', party_type='Supplier',
                  vtype='Debit Note', stock_sign=-1, tax_acc='Input GST', party_acc='Creditors', income_side='cr'),
}


def _note_scope(model, note, cfg):
    return model.objects.filter(company=note.company, voucher_type=cfg['vtype'], voucher_no=getattr(note, cfg['number']))


@transaction.atomic
def reverse_return_note(note, kind):
    cfg = _NOTES[kind]
    Item = apps.get_model('stock', 'Item')
    sl = _note_scope(apps.get_model('stock', 'StockLedgerEntry'), note, cfg)
    for sle in sl:
        Item.objects.filter(id=sle.item_id).update(current_stock=models.F('current_stock') - sle.actual_qty)
    sl.delete()
    _note_scope(apps.get_model('accounts', 'GLEntry'), note, cfg).delete()


@transaction.atomic
def post_return_note(note, kind):
    cfg = _NOTES[kind]
    Item = apps.get_model('stock', 'Item')
    StockLedgerEntry = apps.get_model('stock', 'StockLedgerEntry')
    GLEntry = apps.get_model('accounts', 'GLEntry')
    inv = getattr(note, cfg['invoice'])
    job_work = str(getattr(inv, 'invoice_type', '')).upper() == 'JOB_WORK'
    unit = getattr(inv, 'unit', None)
    vno = getattr(note, cfg['number'])

    net = tax = Decimal('0.00')
    for line in note.items.select_related('item'):
        if line.item.company_id not in (None, note.company_id):
            raise ValidationError({'items': [f'{line.item.item_name} belongs to another company.']})
        line.amount = (Decimal(str(line.quantity)) * Decimal(str(line.rate))).quantize(Decimal('0.01'))
        line.save(update_fields=['amount'])
        # Tax follows the original invoice rate; unlinked notes fall back to the item's GST rate.
        rate = Decimal(str(inv.tax_rate if inv else (line.item.gst_rate or 0)))
        net += line.amount
        tax += (line.amount * rate / 100).quantize(Decimal('0.01'))
        if job_work:
            continue  # service credit: party material never entered own stock
        qty = Decimal(str(line.quantity)) * cfg['stock_sign']
        item_obj = Item.objects.select_for_update().get(id=line.item_id)
        if item_obj.current_stock + qty < 0:
            raise ValidationError({'error': f'Insufficient Stock for {item_obj.item_name}: Available {item_obj.current_stock}, Requested {abs(qty)}.'})
        item_obj.current_stock += qty
        item_obj.save(update_fields=['current_stock'])
        _create_sl_entry(StockLedgerEntry, item_obj, note.company, note.posting_date, cfg['vtype'], vno,
                         max(qty, 0), max(-qty, 0), qty, item_obj.current_stock, item_obj.standard_rate or 0, unit)

    note.net_total, note.tax_amount, note.grand_total = net, tax, net + tax
    note.status = 'Approved'
    note.save(update_fields=['net_total', 'tax_amount', 'grand_total', 'status'])

    income_acc = ('Job Work Income' if job_work else 'Sales Income') if kind == 'credit' else 'Purchases'
    party = getattr(note, cfg['party'])
    common = dict(company=note.company, unit=unit, posting_date=note.posting_date, voucher_type=cfg['vtype'],
                  voucher_no=vno, party_type=cfg['party_type'], party=party, remarks=f"{cfg['vtype']} {vno} - {note.reason or ''}"[:250])
    dr, cr = (lambda a: (a, Decimal('0.00'))), (lambda a: (Decimal('0.00'), a))
    side = dr if cfg['income_side'] == 'dr' else cr
    other = cr if side is dr else dr
    rows = [(income_acc, *side(net)), (cfg['tax_acc'], *side(tax)), (cfg['party_acc'], *other(net + tax))]
    for acc, d, c in rows:
        if d or c:
            _safe_create(GLEntry, account=acc, against=cfg['party_acc'] if acc != cfg['party_acc'] else income_acc, debit=d, credit=c, **common)


def validate_return_quantities(attrs, instance, kind):
    """A note may not return more of an item than the linked invoice still has unreturned."""
    cfg = _NOTES[kind]
    inv = attrs.get(cfg['invoice'], getattr(instance, cfg['invoice'], None) if instance else None)
    items = attrs.get('items')
    if items is None or inv is None:
        return
    note_model = instance.__class__ if instance else apps.get_model('selling', 'CreditNote') if kind == 'credit' else apps.get_model('buying', 'DebitNote')
    others = note_model.objects.filter(**{cfg['invoice']: inv}).exclude(pk=getattr(instance, 'pk', None))
    sold, done, want = {}, {}, {}
    for l in inv.items.all():
        sold[l.item_id] = sold.get(l.item_id, 0) + l.quantity
    for n in others:
        for l in n.items.all():
            done[l.item_id] = done.get(l.item_id, 0) + l.quantity
    for row in items:
        want[row['item'].id] = want.get(row['item'].id, 0) + row['quantity']
    errors = [f'Item {i}: return {q} exceeds remaining invoice quantity {sold.get(i, 0) - done.get(i, 0)}.'
              for i, q in want.items() if q > sold.get(i, 0) - done.get(i, 0)]
    if errors:
        raise ValidationError({'items': errors})


class ReturnNoteSerializerMixin:
    """Nested line save + posting for CreditNoteSerializer / DebitNoteSerializer. Set note_kind and line_fk."""
    note_kind = line_fk = None

    def validate(self, attrs):
        validate_return_quantities(attrs, self.instance, self.note_kind)
        return attrs

    def _save_lines(self, note, items):
        line_model = note.items.model
        for row in items:
            line_model.objects.create(**{self.line_fk: note}, item=row['item'], quantity=row['quantity'], rate=row['rate'], amount=0)

    def _check_number(self, data, pk=None):
        field = _NOTES[self.note_kind]['number']
        num = data.get(field, getattr(self.instance, field, None))
        company = data.get('company', getattr(self.instance, 'company', None))
        if self.Meta.model.objects.filter(company=company, **{field: num}).exclude(pk=pk).exists():
            raise ValidationError({field: [f'{num} is already used in this company.']})

    def create(self, validated_data):
        items = validated_data.pop('items', [])
        self._check_number(validated_data)
        with transaction.atomic():
            note = self.Meta.model.objects.create(**validated_data)
            self._save_lines(note, items)
            post_return_note(note, self.note_kind)
        return note

    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        self._check_number(validated_data, instance.pk)
        with transaction.atomic():
            reverse_return_note(instance, self.note_kind)
            for k, v in validated_data.items():
                setattr(instance, k, v)
            instance.save()
            if items is not None:
                instance.items.all().delete()
                self._save_lines(instance, items)
            post_return_note(instance, self.note_kind)
        return instance
