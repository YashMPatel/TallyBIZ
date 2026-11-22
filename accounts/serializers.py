from rest_framework import serializers
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from .models import PaymentEntry, JournalEntry, JournalEntryLine, GLEntry, BusinessUnit, PaymentInvoiceAllocation
from selling.models import SalesInvoice
from buying.models import PurchaseInvoice
from stock.models import StockLedgerEntry
from backend.erp_workflow import auto_trf_regex


def _find_matching_invoices(comp, payment):
    ref = (payment.reference_no or '').strip().lstrip('#').strip()
    if ref:
        inv = SalesInvoice.objects.filter(company=comp, invoice_number__iexact=ref).first()
        if inv:
            return [(inv, Decimal(str(payment.paid_amount)))]

    # Fallback: match approved invoices for this customer (exact grand_total match first, else FIFO)
    party = (payment.party_name or '').strip()
    if not party:
        return []
    cand_qs = SalesInvoice.objects.filter(
        company=comp, customer_name__iexact=party, status='Approved'
    ).order_by('posting_date', 'id')

    amt = Decimal(str(payment.paid_amount))

    def due_of(inv):
        prior = PaymentInvoiceAllocation.objects.filter(
            invoice_type='Sales Invoice', invoice_id=inv.id
        ).exclude(payment=payment).aggregate(s=Sum('allocated_amount'))['s'] or Decimal('0.00')
        return Decimal(str(inv.grand_total or 0)) - prior

    exact = next((i for i in cand_qs.filter(grand_total=amt).order_by('-id') if due_of(i) >= amt), None)
    if exact:
        return [(exact, amt)]

    allocated = []
    rem = amt
    for inv in cand_qs:
        if rem <= 0:
            break
        due = due_of(inv)
        if due > 0:
            take = min(rem, due)
            allocated.append((inv, take))
            rem -= take
    return allocated


def _find_matching_purchase_bills(comp, payment):
    ref = (payment.reference_no or '').strip().lstrip('#').strip()
    if ref:
        bill = PurchaseInvoice.objects.filter(company=comp, bill_number__iexact=ref).first()
        if bill:
            return [(bill, Decimal(str(payment.paid_amount)))]

    party = (payment.party_name or '').strip()
    if not party:
        return []
    cand_qs = PurchaseInvoice.objects.filter(
        company=comp, supplier_name__iexact=party, status='Approved'
    ).order_by('posting_date', 'id')

    amt = Decimal(str(payment.paid_amount))
    exact = cand_qs.filter(grand_total=amt).order_by('-id').first()
    if exact:
        return [(exact, amt)]

    allocated = []
    rem = amt
    for bill in cand_qs:
        if rem <= 0:
            break
        prior_paid = (
            PaymentInvoiceAllocation.objects.filter(
                invoice_type='Purchase Invoice', invoice_id=bill.id
            ).exclude(payment=payment).aggregate(s=Sum('allocated_amount'))['s']
            or Decimal('0.00')
        )
        due = Decimal(str(bill.grand_total or 0)) - prior_paid
        if due > 0:
            take = min(rem, due)
            allocated.append((bill, take))
            rem -= take
    return allocated


def _post_payment_gl(payment):
    GLEntry.objects.filter(
        company=payment.company,
        voucher_type="Payment Entry",
        voucher_no=payment.voucher_no,
    ).delete()

    if getattr(payment, 'bank_account', None):
        bank_or_cash = payment.bank_account.ledger_name
    else:
        bank_or_cash = "Bank Account" if payment.mode_of_payment in ['Bank', 'Cheque'] else "Cash Account"
    comp = payment.company
    unit = payment.unit
    ref = (payment.reference_no or '').strip()

    if payment.payment_type == 'Receive':
        matched_invs = _find_matching_invoices(comp, payment) if comp else []
        PaymentInvoiceAllocation.objects.filter(payment=payment).delete()
        for inv_obj, alloc_amt in matched_invs:
            PaymentInvoiceAllocation.objects.create(
                payment=payment, invoice_type='Sales Invoice', invoice_id=inv_obj.id, allocated_amount=alloc_amt,
            )
        primary_inv = matched_invs[0][0] if matched_invs else None
        inv_unit = primary_inv.unit if (primary_inv and primary_inv.unit) else unit
        if inv_unit and payment.unit_id != inv_unit.id:
            payment.unit = inv_unit
            payment.save(update_fields=['unit'])
            unit = inv_unit

        GLEntry.objects.create(
            company=comp, unit=unit, posting_date=payment.posting_date,
            account=bank_or_cash, party_type=None, party=None,
            voucher_type="Payment Entry", voucher_no=payment.voucher_no,
            against=payment.party_name, debit=payment.paid_amount, credit=Decimal('0.00'),
            remarks=f"Received via {payment.mode_of_payment} (Ref: {ref or (primary_inv.invoice_number if primary_inv else '-')})"
        )
        GLEntry.objects.create(
            company=comp, unit=unit, posting_date=payment.posting_date,
            account="Debtors", party_type="Customer", party=payment.party_name,
            voucher_type="Payment Entry", voucher_no=payment.voucher_no,
            against=bank_or_cash, debit=Decimal('0.00'), credit=payment.paid_amount,
            remarks=f"Payment from {payment.party_name} (Ref: {ref or (primary_inv.invoice_number if primary_inv else '-')})"
        )

        # Inter-Division Auto-Settlement to Manufacturing Unit
        if matched_invs and comp and unit:
            mfg_unit = BusinessUnit.objects.filter(company=comp, unit_type='MANUFACTURING').first()
            if mfg_unit and mfg_unit.id != unit.id:
                total_settle = Decimal('0.00')
                settled_refs = []
                for inv, alloc_amt in matched_invs:
                    trf_qs = StockLedgerEntry.objects.filter(
                        company=comp,
                        unit=mfg_unit,
                        voucher_type='Stock Transfer',
                        voucher_no__regex=auto_trf_regex(inv.invoice_number),
                        actual_qty__lt=0,
                    )
                    mfg_supply_val = sum(
                        (abs(Decimal(str(e.actual_qty or 0))) * Decimal(str(e.valuation_rate or 0)))
                        for e in trf_qs
                    )
                    mfg_supply_val = Decimal(str(mfg_supply_val)).quantize(Decimal('0.01'))
                    if mfg_supply_val > 0 and Decimal(str(inv.grand_total or 0)) > 0:
                        ratio = min(Decimal('1.00'), alloc_amt / Decimal(str(inv.grand_total)))
                        part = (mfg_supply_val * ratio).quantize(Decimal('0.01'))
                        if part > 0:
                            total_settle += part
                            settled_refs.append(inv.invoice_number)

                if total_settle > 0:
                    inv_label = ", ".join(settled_refs)
                    rem_s = f"Inter-Division Settlement for {inv_label} ({unit.name} -> {mfg_unit.name})"
                    GLEntry.objects.create(
                        company=comp, unit=unit, posting_date=payment.posting_date,
                        account="Inter-Division Payable", party_type="Division", party=mfg_unit.name,
                        voucher_type="Payment Entry", voucher_no=payment.voucher_no,
                        against=bank_or_cash, debit=total_settle, credit=Decimal('0.00'),
                        remarks=rem_s
                    )
                    GLEntry.objects.create(
                        company=comp, unit=unit, posting_date=payment.posting_date,
                        account=bank_or_cash, party_type=None, party=None,
                        voucher_type="Payment Entry", voucher_no=payment.voucher_no,
                        against="Inter-Division Payable", debit=Decimal('0.00'), credit=total_settle,
                        remarks=rem_s
                    )
                    GLEntry.objects.create(
                        company=comp, unit=mfg_unit, posting_date=payment.posting_date,
                        account=bank_or_cash, party_type=None, party=None,
                        voucher_type="Payment Entry", voucher_no=payment.voucher_no,
                        against="Inter-Division Receivable", debit=total_settle, credit=Decimal('0.00'),
                        remarks=rem_s
                    )
                    GLEntry.objects.create(
                        company=comp, unit=mfg_unit, posting_date=payment.posting_date,
                        account="Inter-Division Receivable", party_type="Division", party=unit.name,
                        voucher_type="Payment Entry", voucher_no=payment.voucher_no,
                        against=bank_or_cash, debit=Decimal('0.00'), credit=total_settle,
                        remarks=rem_s
                    )
    else:
        PaymentInvoiceAllocation.objects.filter(payment=payment).delete()
        matched_bills = _find_matching_purchase_bills(comp, payment) if comp else []
        for b_obj, alloc_amt in matched_bills:
            PaymentInvoiceAllocation.objects.create(
                payment=payment,
                invoice_type='Purchase Invoice',
                invoice_id=b_obj.id,
                allocated_amount=alloc_amt,
            )
        ref_clean = ref.lstrip('#').strip()
        bill = matched_bills[0][0] if matched_bills else (
            PurchaseInvoice.objects.filter(company=comp, bill_number__iexact=ref_clean).first() if ref_clean else None
        )
        bill_unit = bill.unit if (bill and bill.unit) else unit
        if bill_unit and payment.unit_id != bill_unit.id:
            payment.unit = bill_unit
            payment.save(update_fields=['unit'])
            unit = bill_unit

        GLEntry.objects.create(
            company=comp, unit=unit, posting_date=payment.posting_date,
            account="Creditors", party_type="Supplier", party=payment.party_name,
            voucher_type="Payment Entry", voucher_no=payment.voucher_no,
            against=bank_or_cash, debit=payment.paid_amount, credit=Decimal('0.00'),
            remarks=f"Payment to {payment.party_name} (Ref: {ref or '-'})"
        )
        GLEntry.objects.create(
            company=comp, unit=unit, posting_date=payment.posting_date,
            account=bank_or_cash, party_type=None, party=None,
            voucher_type="Payment Entry", voucher_no=payment.voucher_no,
            against=payment.party_name, debit=Decimal('0.00'), credit=payment.paid_amount,
            remarks=f"Paid via {payment.mode_of_payment} (Ref: {ref or '-'})"
        )


class PaymentEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentEntry
        fields = '__all__'

    def validate_paid_amount(self, value):
        if value <= Decimal('0.00'):
            raise serializers.ValidationError("Paid amount must be strictly greater than zero.")
        return value

    def validate(self, data):
        paid_amount = Decimal(str(data.get('paid_amount', getattr(self.instance, 'paid_amount', Decimal('0.00')))))
        payment_type = data.get('payment_type', getattr(self.instance, 'payment_type', ''))
        reference_no = (data.get('reference_no', getattr(self.instance, 'reference_no', '')) or '').strip().lstrip('#').strip()

        # Invoice numbers repeat across companies, so every lookup is company-scoped.
        company = data.get('company') or getattr(self.instance, 'company', None)
        if company is None and self.context.get('request') is not None:
            from accounts.views import get_active_company
            company = get_active_company(self.context['request'])
        if reference_no:
            if payment_type == 'Receive':
                invoice = SalesInvoice.objects.filter(company=company, invoice_number__iexact=reference_no).first()
                if invoice:
                    if invoice.status != 'Approved':
                        raise serializers.ValidationError({
                            "reference_no": f"Sales Invoice {invoice.invoice_number} is '{invoice.status}'. Payment can only be accepted for 'Approved' invoices."
                        })
                    existing_payments = PaymentEntry.objects.filter(company=company, reference_no__iexact=invoice.invoice_number, payment_type='Receive')
                    if self.instance:
                        existing_payments = existing_payments.exclude(pk=self.instance.pk)
                    total_paid_so_far = sum(Decimal(str(p.paid_amount)) for p in existing_payments)
                    balance_due = Decimal(str(invoice.grand_total)) - total_paid_so_far
                    if paid_amount > balance_due:
                        raise serializers.ValidationError({
                            "paid_amount": f"Amount exceeds balance due! Maximum payable balance for {invoice.invoice_number} is ₹{balance_due:.2f} (Total: ₹{invoice.grand_total})."
                        })
            elif payment_type == 'Pay':
                bill = PurchaseInvoice.objects.filter(company=company, bill_number__iexact=reference_no).first()
                if bill:
                    if bill.status != 'Approved':
                        raise serializers.ValidationError({
                            "reference_no": f"Purchase Bill {bill.bill_number} is '{bill.status}'. Payment can only be made for 'Approved' bills."
                        })
                    existing_bill_payments = PaymentEntry.objects.filter(company=company, reference_no__iexact=bill.bill_number, payment_type='Pay')
                    if self.instance:
                        existing_bill_payments = existing_bill_payments.exclude(pk=self.instance.pk)
                    total_paid_so_far = sum(Decimal(str(p.paid_amount)) for p in existing_bill_payments)
                    balance_due = Decimal(str(bill.grand_total)) - total_paid_so_far
                    if paid_amount > balance_due:
                        raise serializers.ValidationError({
                            "paid_amount": f"Amount exceeds balance due! Maximum payable balance for {bill.bill_number} is ₹{balance_due:.2f} (Total: ₹{bill.grand_total})."
                        })
        return data

    @transaction.atomic
    def create(self, validated_data):
        payment = PaymentEntry.objects.create(**validated_data)
        _post_payment_gl(payment)
        return payment

    @transaction.atomic
    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        _post_payment_gl(instance)
        return instance


class JournalEntryLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalEntryLine
        fields = ['id', 'account', 'party_type', 'party_name', 'debit', 'credit']


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalEntryLineSerializer(many=True)

    class Meta:
        model = JournalEntry
        fields = ['id', 'voucher_no', 'posting_date', 'voucher_type', 'narration', 'total_amount', 'lines', 'created_at']
