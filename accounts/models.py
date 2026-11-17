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
    BUSINESS_TYPE_CHOICES = (
        ('HYBRID', 'Hybrid (Head Office + Trading + Manufacturing)'),
        ('TRADING', 'Trading Only (Buying & Selling)'),
        ('MANUFACTURING', 'Manufacturing Only'),
    )
    currency_symbol = models.CharField(max_length=10, default='₹')
    business_type = models.CharField(max_length=20, choices=BUSINESS_TYPE_CHOICES, default='HYBRID')
    parent_company = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_divisions')
    tagline = models.CharField(max_length=255, blank=True, default='')
    contact_person = models.CharField(max_length=120, blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    email = models.CharField(max_length=120, blank=True, default='')
    pan = models.CharField(max_length=30, blank=True, default='')
    upi_id = models.CharField(max_length=100, blank=True, default='')
    bank_name = models.CharField(max_length=120, blank=True, default='')
    bank_branch = models.CharField(max_length=200, blank=True, default='')
    bank_account_name = models.CharField(max_length=150, blank=True, default='')
    bank_account_no = models.CharField(max_length=60, blank=True, default='')
    bank_ifsc = models.CharField(max_length=30, blank=True, default='')
    logo_data_url = models.TextField(blank=True, default='')
    invoice_terms = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name



class BusinessUnit(models.Model):
    UNIT_TYPE_CHOICES = (
        ('HO', 'Head Office'),
        ('TRADING', 'Trading Division'),
        ('MANUFACTURING', 'Manufacturing Unit'),
        ('CUSTOM', 'Custom Branch / Unit'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='business_units')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=120)
    unit_type = models.CharField(max_length=20, choices=UNIT_TYPE_CHOICES, default='CUSTOM')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('company', 'code')
        ordering = ['id']

    def __str__(self):
        return f"{self.company.name} - {self.name}"


def ensure_default_units(company):
    defaults = [
        ('HO', 'Head Office', 'HO'),
        ('TRADING', 'Trading Division', 'TRADING'),
        ('MFG', 'Manufacturing Unit', 'MANUFACTURING'),
    ]
    created_map = {}
    for code, name, utype in defaults:
        obj, _ = BusinessUnit.objects.get_or_create(
            company=company,
            code=code,
            defaults={'name': name, 'unit_type': utype, 'is_active': True}
        )
        created_map[utype] = obj
    return created_map


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
    assigned_unit = models.ForeignKey(BusinessUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_users')

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class PaymentEntry(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, null=True, blank=True, related_name='payments')
    unit = models.ForeignKey(BusinessUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    voucher_no = models.CharField(max_length=50)
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
    voucher_no = models.CharField(max_length=50)
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
    unit = models.ForeignKey(BusinessUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='gl_entries')
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


@receiver(post_save, sender=Company)
def auto_create_company_units(sender, instance, created, **kwargs):
    if created:
        ensure_default_units(instance)


class UnitPettyCashTransaction(models.Model):
    TXN_TYPES = (
        ('HO_ALLOCATION', 'Head Office Credit Allocation (+)'),
        ('COUNTER_EXPENSE', 'Counter Receipt / Daily Expense (-)'),
        ('SCRAP_INCOME', 'Scrap / Waste Cash Received (+)'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='petty_cash_txns')
    unit = models.ForeignKey(BusinessUnit, on_delete=models.CASCADE, related_name='petty_cash_txns')
    voucher_no = models.CharField(max_length=50)
    posting_date = models.DateField()
    txn_type = models.CharField(max_length=30, choices=TXN_TYPES)
    party_or_payee = models.CharField(max_length=150, blank=True, default='')
    expense_head = models.CharField(max_length=100, default='Daily Unit Expense')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True, default='')
    created_by = models.CharField(max_length=150, blank=True, default='')
    sent_to_ho = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-posting_date', '-id']

    def __str__(self):
        return f"{self.voucher_no} ({self.unit.name}) - {self.amount}"


class DepartmentRequest(models.Model):
    REQ_TYPES = (
        ('SALARY', 'Worker Salary Payout Request'),
        ('EXPENSE', 'Unit Expense / Maintenance Request'),
        ('PETTY_TOPUP', 'Petty Cash Credit Top-Up Request'),
        ('MATERIAL_PURCHASE', 'Raw Material / Outsource Purchase Request'),
    )
    STATUS_CHOICES = (
        ('OPEN', 'Open / Pending Approval'),
        ('APPROVED', 'Approved / In Progress'),
        ('CLOSED', 'Solved & Closed'),
        ('REJECTED', 'Rejected'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='dept_requests')
    from_unit = models.ForeignKey(BusinessUnit, on_delete=models.CASCADE, related_name='outgoing_requests')
    to_unit = models.ForeignKey(BusinessUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_requests')
    request_no = models.CharField(max_length=50)
    posting_date = models.DateField()
    request_type = models.CharField(max_length=30, choices=REQ_TYPES)
    title = models.CharField(max_length=200)
    details = models.TextField(blank=True, default='')
    line_items = models.JSONField(default=list, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    requested_by = models.CharField(max_length=150, blank=True, default='')
    resolved_by = models.CharField(max_length=150, blank=True, default='')
    resolution_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return f"{self.request_no} - {self.title} ({self.status})"


class CompanyBankAccount(models.Model):
    PURPOSE_CHOICES = (
        ('GENERAL', 'Head Office / General Account'),
        ('PARTNER_LOAN', 'Partner Capital & Loan Account'),
        ('SALES_PURCHASE', 'Sales & Purchase Account'),
        ('FACTORY', 'Factory / Manufacturing Unit Account'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='bank_accounts')
    unit = models.ForeignKey(BusinessUnit, on_delete=models.SET_NULL, null=True, blank=True, related_name='bank_accounts')
    account_name = models.CharField(max_length=120)
    bank_name = models.CharField(max_length=120, blank=True, default='')
    account_number = models.CharField(max_length=60, blank=True, default='')
    ifsc_code = models.CharField(max_length=30, blank=True, default='')
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES, default='GENERAL')
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    @property
    def ledger_name(self):
        return f"Bank - {self.account_name}"

    def __str__(self):
        return f"{self.account_name} ({self.get_purpose_display()})"


class CompanyPartner(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='partners')
    partner_name = models.CharField(max_length=150)
    share_percentage = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    capital_cash_bank = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    asset_contribution = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    asset_description = models.CharField(max_length=255, blank=True, default='')
    drawings_withdrawn = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    phone = models.CharField(max_length=40, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.partner_name} ({self.share_percentage}%)"


class CompanyLoan(models.Model):
    LOAN_TYPES = (
        ('BANK_LOAN', 'Bank Loan / Term Loan / CC'),
        ('PARTNER_LOAN', 'Partner Unsecured Loan'),
        ('PRIVATE_UDHARI', 'Private Lender / Udhari Fund'),
    )
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='loans')
    bank_account = models.ForeignKey(CompanyBankAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='loans')
    loan_code = models.CharField(max_length=50)
    lender_name = models.CharField(max_length=150)
    loan_type = models.CharField(max_length=30, choices=LOAN_TYPES, default='PRIVATE_UDHARI')
    start_date = models.DateField()
    principal_amount = models.DecimalField(max_digits=14, decimal_places=2)
    interest_rate = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    repaid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    notes = models.TextField(blank=True, default='')
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date', '-id']

    def __str__(self):
        return f"{self.loan_code} - {self.lender_name}"
