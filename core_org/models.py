from django.db import models
from django.conf import settings

# ૧. કંપની માસ્ટર (તમારી ૩-૪ અલગ કંપનીઓ માટે)
class Company(models.Model):
    name = models.CharField(max_length=200, unique=True)
    company_code = models.CharField(max_length=20, unique=True)
    
    # Global Multi-Country & Currency Fields
    country = models.CharField(max_length=100, default='India')          # e.g. Canada, United States, India
    country_code = models.CharField(max_length=10, default='IN')         # ISO Code: CA, US, IN
    currency = models.CharField(max_length=10, default='INR')            # CAD, USD, INR, GBP, EUR
    currency_symbol = models.CharField(max_length=5, default='₹')        # $, ₹, £, €
    
    # Address & Regional Details
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)      # Province / State
    state_code = models.CharField(max_length=10, blank=True, null=True)
    pincode = models.CharField(max_length=20, blank=True, null=True)     # Postal Code / ZIP Code
    
    # Regional Tax ID (GSTIN in India, BN/HST in Canada, EIN in US, VAT in UK)
    tax_id = models.CharField(max_length=50, blank=True, null=True)      # Global Tax ID
    gstin = models.CharField(max_length=20, blank=True, null=True)       # Backward compatible
    pan = models.CharField(max_length=20, blank=True, null=True)
    
    # Contact & Banking
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    bank_branch = models.CharField(max_length=100, blank=True, null=True)
    bank_account_no = models.CharField(max_length=50, blank=True, null=True)
    bank_ifsc = models.CharField(max_length=30, blank=True, null=True)   # IFSC / Routing / SWIFT
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.currency})"


# ૨. ઓર્ગેનાઇઝેશન યુઝર પ્રોફાઇલ (નામ બદલ્યું જેથી accounts સાથે ક્લેશ ન થાય)
class OrgUserProfile(models.Model):
    GENDER_CHOICES = (
        ('MALE', 'Male'),
        ('FEMALE', 'Female'),
        ('OTHER', 'Other'),
    )
    
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_profile')
    phone = models.CharField(max_length=15, blank=True, null=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # નવો યુઝર સાઇનઅપ કરે ત્યારે આ False રહેશે, એડમિન અપ્રૂવ કરે પછી જ True થાય
    is_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='org_approved_users')
    approved_at = models.DateTimeField(null=True, blank=True)
    
    # યુઝર હાલ કઈ કંપનીમાં સક્રિય છે (Active Company Session)
    active_company = models.ForeignKey(Company, on_delete=models.SET_NULL, null=True, blank=True, related_name='active_org_users')

    def __str__(self):
        return f"{self.user.username} - {'Approved' if self.is_approved else 'Pending'}"


# ૩. કંપની અને યુઝર મેપિંગ (રોલ અને મોડ્યુલ પરમિશન)
class UserCompanyAccess(models.Model):
    ROLE_CHOICES = (
        ('SUPER_ADMIN', 'Super Admin (All Companies Access)'),
        ('COMPANY_ADMIN', 'Company Admin'),
        ('MANAGER', 'Manager'),
        ('SALES_USER', 'Sales User (Invoices & Customers)'),
        ('PURCHASE_USER', 'Purchase User (Bills & Suppliers)'),
        ('ACCOUNTS_USER', 'Accounts User (Payments & Vouchers)'),
        ('VIEWER', 'View Only (Reports)'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='org_company_accesses')
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='org_user_accesses')
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='SALES_USER')
    
    # ડિટેઇલ મોડ્યુલ પરમિશન (Custom Flags)
    can_create_invoice = models.BooleanField(default=True)
    can_approve_invoice = models.BooleanField(default=False)
    can_delete_records = models.BooleanField(default=False)
    can_view_reports = models.BooleanField(default=True)

    class Meta:
        unique_together = ('user', 'company')

    def __str__(self):
        return f"{self.user.username} -> {self.company.name} ({self.role})"