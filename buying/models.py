from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from stock.models import Item
from accounts.models import Company


class Supplier(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='suppliers'
    )
    supplier_name = models.CharField(max_length=150)
    supplier_type = models.CharField(max_length=50, default='Company')
    gst_category = models.CharField(max_length=50, default='Registered Regular')
    gstin = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    mobile_no = models.CharField(max_length=20, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.supplier_name


class PurchaseInvoice(models.Model):
    STATUS_CHOICES = (
        ('Draft', 'Draft'),
        ('Submitted', 'Submitted'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='purchase_invoices')
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, null=True, blank=True, related_name='bills')
    bill_number = models.CharField(max_length=50)
    supplier_name = models.CharField(max_length=150)
    posting_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Approved')
    rejection_reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_purchase_bills')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_purchase_bills')
    approval_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.bill_number} - {self.supplier_name}"


class PurchaseInvoiceItem(models.Model):
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    description = models.CharField(max_length=255, blank=True, null=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_foc = models.BooleanField(default=False)
    amount = models.DecimalField(max_digits=12, decimal_places=2)


class DebitNote(models.Model):
    STATUS_CHOICES = (
        ('Draft', 'Draft'),
        ('Submitted', 'Submitted'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='debit_notes')
    debit_note_number = models.CharField(max_length=50)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, null=True, blank=True, related_name='debit_notes')
    supplier_name = models.CharField(max_length=150)
    purchase_invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='debit_notes')
    posting_date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Approved')
    rejection_reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_debit_notes')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_debit_notes')
    approval_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.debit_note_number} - {self.supplier_name}"


class DebitNoteItem(models.Model):
    debit_note = models.ForeignKey(DebitNote, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)