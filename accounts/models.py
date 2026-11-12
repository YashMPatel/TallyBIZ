from django.db import models
from django.contrib.auth.models import User


class Company(models.Model):
    name = models.CharField(max_length=255)
    tax_id = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)

    gstin = models.CharField(max_length=50, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    bank_details = models.TextField(blank=True, null=True)
    country = models.CharField(max_length=100, default='India')
    default_currency = models.CharField(max_length=10, default='INR')
    currency_symbol = models.CharField(max_length=10, default='₹')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('ADMIN', 'Admin'),
        ('MANAGER', 'Manager'),
        ('SALES_USER', 'Sales User'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='SALES_USER')
    company = models.ForeignKey(Company, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    is_approved = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class PaymentEntry(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='payments')
    voucher_no = models.CharField(max_length=50, unique=True)
    posting_date = models.DateField()
    payment_type = models.CharField(max_length=20)
    party_type = models.CharField(max_length=20)
    party_name = models.CharField(max_length=150)
    mode_of_payment = models.CharField(max_length=50)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference_no = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.voucher_no} - {self.party_name}"


class JournalEntry(models.Model):
    voucher_no = models.CharField(max_length=50, unique=True)
    posting_date = models.DateField()
    voucher_type = models.CharField(max_length=50, default='Journal Entry')
    narration = models.TextField(blank=True, null=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.voucher_no} on {self.posting_date}"


class JournalEntryLine(models.Model):
    parent = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.CharField(max_length=100)
    party_type = models.CharField(max_length=50, null=True, blank=True)
    party_name = models.CharField(max_length=150, null=True, blank=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)


class GLEntry(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='gl_entries')
    posting_date = models.DateField()
    account = models.CharField(max_length=100)
    party_type = models.CharField(max_length=50, null=True, blank=True)
    party = models.CharField(max_length=150, null=True, blank=True)
    voucher_type = models.CharField(max_length=50)
    voucher_no = models.CharField(max_length=50)
    against = models.CharField(max_length=100, null=True, blank=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    remarks = models.TextField(null=True, blank=True)
    is_cancelled = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.posting_date} | {self.account} | Dr: {self.debit} Cr: {self.credit}"


class PaymentInvoiceAllocation(models.Model):
    payment = models.ForeignKey(PaymentEntry, on_delete=models.CASCADE, related_name='allocations')
    invoice_type = models.CharField(max_length=50)
    invoice_id = models.IntegerField()
    invoice_number = models.CharField(max_length=50)
    allocated_amount = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.payment.voucher_no} -> {self.invoice_number} ({self.allocated_amount})"


class AuthorizationRule(models.Model):
    document_type = models.CharField(max_length=50)
    approver_role = models.CharField(max_length=20, default='MANAGER')
    min_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

# --- AUTO CREATE USER PROFILE ON SIGNUP / ADMIN CREATION ---
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def auto_create_user_profile(sender, instance, created, **kwargs):
    if created:
        is_admin = bool(instance.is_superuser or instance.is_staff)
        default_comp = Company.objects.first()
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={
                'role': 'Admin' if is_admin else 'Sales User',
                'company': default_comp,
                'is_approved': is_admin
            }
        )
