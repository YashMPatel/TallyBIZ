from django.contrib import admin
from .models import (
    Company,
    UserProfile,
    PaymentEntry,
    JournalEntry,
    JournalEntryLine,
    GLEntry,
    PaymentInvoiceAllocation,
    AuthorizationRule,
)


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'default_currency', 'currency_symbol', 'country')
    search_fields = ('name',)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'role', 'company', 'is_approved')
    list_filter = ('role', 'is_approved', 'company')
    search_fields = ('user__username', 'user__email')


@admin.register(PaymentEntry)
class PaymentEntryAdmin(admin.ModelAdmin):
    list_display = ('voucher_no', 'company', 'posting_date', 'party_name', 'paid_amount', 'payment_type')
    list_filter = ('payment_type', 'mode_of_payment', 'company')


@admin.register(GLEntry)
class GLEntryAdmin(admin.ModelAdmin):
    list_display = ('posting_date', 'company', 'account', 'party', 'debit', 'credit', 'voucher_no')
    list_filter = ('account', 'company')


admin.site.register(JournalEntry)
admin.site.register(JournalEntryLine)
admin.site.register(PaymentInvoiceAllocation)
admin.site.register(AuthorizationRule)