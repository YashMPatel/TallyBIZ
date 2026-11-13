from decimal import Decimal
from django.db import models
from django.contrib.auth.models import User
from stock.models import Item
from accounts.models import Company


class Customer(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='customers'
    )
    customer_name = models.CharField(max_length=150)
    customer_type = models.CharField(max_length=50, default='Individual')
    gst_category = models.CharField(max_length=50, default='Unregistered')
    gstin = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    mobile_no = models.CharField(max_length=20, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.customer_name


class SalesInvoice(models.Model):
    STATUS_CHOICES = (
        ('Draft', 'Draft'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='sales_invoices')
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, null=True, blank=True, related_name='invoices')
    invoice_number = models.CharField(max_length=50)
    customer_name = models.CharField(max_length=150)
    posting_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    adjustment = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Draft')
    rejection_reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_sales_invoices')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_sales_invoices')
    approval_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.invoice_number} - {self.customer_name}"


class SalesInvoiceItem(models.Model):
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    description = models.CharField(max_length=255, blank=True, null=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_foc = models.BooleanField(default=False)
    amount = models.DecimalField(max_digits=12, decimal_places=2)


class CreditNote(models.Model):
    STATUS_CHOICES = (
        ('Draft', 'Draft'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='credit_notes')
    credit_note_number = models.CharField(max_length=50)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, null=True, blank=True, related_name='credit_notes')
    customer_name = models.CharField(max_length=150)
    sales_invoice = models.ForeignKey(SalesInvoice, on_delete=models.SET_NULL, null=True, blank=True, related_name='credit_notes')
    posting_date = models.DateField()
    reason = models.TextField(blank=True, null=True)
    net_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Draft')
    rejection_reason = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_credit_notes')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_credit_notes')
    approval_date = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.credit_note_number} - {self.customer_name}"


class CreditNoteItem(models.Model):
    credit_note = models.ForeignKey(CreditNote, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)