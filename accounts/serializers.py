from rest_framework import serializers
from decimal import Decimal
from django.db import transaction
from .models import PaymentEntry, JournalEntry, JournalEntryLine
from .services import make_gl_entries
from selling.models import SalesInvoice
from buying.models import PurchaseInvoice


class PaymentEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentEntry
        fields = '__all__'

    def validate_paid_amount(self, value):
        # Defect #5 Fix: શૂન્ય કે નેગેટિવ રકમ સ્વીકારવી નહીં
        if value <= Decimal('0.00'):
            raise serializers.ValidationError("Paid amount must be strictly greater than zero.")
        return value

    def validate(self, data):
        # 1. ફોર્મ ડેટામાંથી વિગતો મેળવો (અથવા instance માંથી જો partial update હોય)
        paid_amount = data.get('paid_amount', getattr(self.instance, 'paid_amount', Decimal('0.00')))
        paid_amount = Decimal(str(paid_amount))
        
        party_name = data.get('party_name', getattr(self.instance, 'party_name', ''))
        payment_type = data.get('payment_type', getattr(self.instance, 'payment_type', ''))
        reference_no = data.get('reference_no', getattr(self.instance, 'reference_no', ''))

        # 2. જો reference_no માં Sales Invoice કે Purchase Bill નંબર લખ્યો હોય તો તેનું Validation કરો
        if reference_no:
            # A. જો ગ્રાહક પાસેથી પૈસા લેવાના હોય (Receive -> Sales Invoice)
            if payment_type == 'Receive':
                invoice = SalesInvoice.objects.filter(invoice_number=reference_no.strip()).first()
                if invoice:
                    # ફક્ત Approved ઇન્વોઇસ સામે જ પેમેન્ટ લઈ શકાય
                    if invoice.status != 'Approved':
                        raise serializers.ValidationError({
                            "reference_no": f"Sales Invoice {invoice.invoice_number} is '{invoice.status}'. Payment can only be accepted for 'Approved' invoices."
                        })

                    # આ ઇન્વોઇસ સામે થયેલા અગાઉના તમામ પેમેન્ટ્સનો સરવાળો કરો
                    existing_payments = PaymentEntry.objects.filter(
                        reference_no=invoice.invoice_number,
                        payment_type='Receive'
                    )
                    if self.instance:
                        existing_payments = existing_payments.exclude(pk=self.instance.pk)

                    total_paid_so_far = sum(Decimal(str(p.paid_amount)) for p in existing_payments)
                    balance_due = Decimal(str(invoice.grand_total)) - total_paid_so_far

                    if paid_amount > balance_due:
                        raise serializers.ValidationError({
                            "paid_amount": f"Amount exceeds balance due! Maximum payable balance for {invoice.invoice_number} is ₹{balance_due:.2f} (Total: ₹{invoice.grand_total})."
                        })

            # B. જો સપ્લાયરને ચુકવણી કરવાની હોય (Pay -> Purchase Bill)
            elif payment_type == 'Pay':
                bill = PurchaseInvoice.objects.filter(bill_number=reference_no.strip()).first()
                if bill:
                    # ફક્ત Approved બિલ સામે જ ચુકવણી થઈ શકે
                    if bill.status != 'Approved':
                        raise serializers.ValidationError({
                            "reference_no": f"Purchase Bill {bill.bill_number} is '{bill.status}'. Payment can only be made for 'Approved' bills."
                        })

                    existing_bill_payments = PaymentEntry.objects.filter(
                        reference_no=bill.bill_number,
                        payment_type='Pay'
                    )
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
        
        # Bank / Cash Account નક્કી કરો
        bank_or_cash = "Bank Account" if payment.mode_of_payment in ['Bank', 'Cheque'] else "Cash Account"

        if payment.payment_type == 'Receive':
            # ગ્રાહક પાસેથી પૈસા આવ્યા:
            # 1. Bank/Cash Debit (+ પૈસા વધ્યા)
            # 2. Debtors Credit (- લેણું ઘટ્યું)
            gl_map = [
                {
                    "posting_date": payment.posting_date,
                    "account": bank_or_cash,
                    "party_type": None,
                    "party": None,
                    "voucher_type": "Payment Entry",
                    "voucher_no": payment.voucher_no,
                    "against": payment.party_name,
                    "debit": payment.paid_amount,
                    "credit": Decimal('0.00'),
                    "remarks": f"Received via {payment.mode_of_payment} (Ref: {payment.reference_no or '-'})"
                },
                {
                    "posting_date": payment.posting_date,
                    "account": "Debtors",
                    "party_type": "Customer",
                    "party": payment.party_name,
                    "voucher_type": "Payment Entry",
                    "voucher_no": payment.voucher_no,
                    "against": bank_or_cash,
                    "debit": Decimal('0.00'),
                    "credit": payment.paid_amount,
                    "remarks": f"Payment from {payment.party_name}"
                }
            ]
        else:
            # સપ્લાયરને ચુકવણી (Pay):
            # 1. Creditors Debit (- દેવું ઘટ્યું)
            # 2. Bank/Cash Credit (- પૈસા ઘટ્યા)
            gl_map = [
                {
                    "posting_date": payment.posting_date,
                    "account": "Creditors",
                    "party_type": "Supplier",
                    "party": payment.party_name,
                    "voucher_type": "Payment Entry",
                    "voucher_no": payment.voucher_no,
                    "against": bank_or_cash,
                    "debit": payment.paid_amount,
                    "credit": Decimal('0.00'),
                    "remarks": f"Payment to {payment.party_name}"
                },
                {
                    "posting_date": payment.posting_date,
                    "account": bank_or_cash,
                    "party_type": None,
                    "party": None,
                    "voucher_type": "Payment Entry",
                    "voucher_no": payment.voucher_no,
                    "against": payment.party_name,
                    "debit": Decimal('0.00'),
                    "credit": payment.paid_amount,
                    "remarks": f"Paid via {payment.mode_of_payment}"
                }
            ]

        make_gl_entries(gl_map)
        return payment

    @transaction.atomic
    def update(self, instance, validated_data):
        from .models import GLEntry
        
        # 1. Juna payment ni existing GL Entries delete karo
        GLEntry.objects.filter(
            voucher_type="Payment Entry", 
            voucher_no=instance.voucher_no
        ).delete()

        # 2. Payment instance na fields update karo
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # 3. Nava mode ane nava amount mujab Bank/Cash nakki karo
        bank_or_cash = "Bank Account" if instance.mode_of_payment in ['Bank', 'Cheque'] else "Cash Account"

        # 4. Navi GL Entries re-post karo
        if instance.payment_type == 'Receive':
            gl_map = [
                {
                    "posting_date": instance.posting_date,
                    "account": bank_or_cash,
                    "party_type": None,
                    "party": None,
                    "voucher_type": "Payment Entry",
                    "voucher_no": instance.voucher_no,
                    "against": instance.party_name,
                    "debit": instance.paid_amount,
                    "credit": Decimal('0.00'),
                    "remarks": f"Received via {instance.mode_of_payment} (Ref: {instance.reference_no or '-'})"
                },
                {
                    "posting_date": instance.posting_date,
                    "account": "Debtors",
                    "party_type": "Customer",
                    "party": instance.party_name,
                    "voucher_type": "Payment Entry",
                    "voucher_no": instance.voucher_no,
                    "against": bank_or_cash,
                    "debit": Decimal('0.00'),
                    "credit": instance.paid_amount,
                    "remarks": f"Payment from {instance.party_name}"
                }
            ]
        else:
            gl_map = [
                {
                    "posting_date": instance.posting_date,
                    "account": "Creditors",
                    "party_type": "Supplier",
                    "party": instance.party_name,
                    "voucher_type": "Payment Entry",
                    "voucher_no": instance.voucher_no,
                    "against": bank_or_cash,
                    "debit": instance.paid_amount,
                    "credit": Decimal('0.00'),
                    "remarks": f"Payment to {instance.party_name}"
                },
                {
                    "posting_date": instance.posting_date,
                    "account": bank_or_cash,
                    "party_type": None,
                    "party": None,
                    "voucher_type": "Payment Entry",
                    "voucher_no": instance.voucher_no,
                    "against": instance.party_name,
                    "debit": Decimal('0.00'),
                    "credit": instance.paid_amount,
                    "remarks": f"Paid via {instance.mode_of_payment}"
                }
            ]

        make_gl_entries(gl_map)
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