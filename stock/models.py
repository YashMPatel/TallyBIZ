from django.db import models
from accounts.models import Company


class Item(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='stock_items'
    )
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=150)
    category = models.CharField(max_length=100, default='General')
    unit = models.CharField(max_length=50, default='Nos')
    hsn_code = models.CharField(max_length=20, blank=True, default='')
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    standard_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    selling_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    current_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.item_name} ({self.item_code})"


class StockLedgerEntry(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='stock_ledger_entries'
    )
    unit = models.ForeignKey('accounts.BusinessUnit', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_ledger_entries')
    posting_date = models.DateField()
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='ledger_entries')
    voucher_type = models.CharField(max_length=50)
    voucher_no = models.CharField(max_length=50)
    actual_qty = models.DecimalField(max_digits=12, decimal_places=2)
    qty_after_transaction = models.DecimalField(max_digits=12, decimal_places=2)
    valuation_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    batch = models.ForeignKey('StockBatch', on_delete=models.SET_NULL, null=True, blank=True, related_name='ledger_entries')
    batch_no = models.CharField(max_length=80, blank=True, default='')

    def __str__(self):
        return f"{self.item.item_code} | {self.voucher_type} #{self.voucher_no} | {self.actual_qty}"

class StockBatch(models.Model):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='stock_batches'
    )
    unit = models.ForeignKey('accounts.BusinessUnit', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_batches')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='batches')
    batch_no = models.CharField(max_length=80)
    source_type = models.CharField(max_length=50, default='Purchase Invoice')
    source_voucher = models.CharField(max_length=60, blank=True, default='')
    party_name = models.CharField(max_length=150, blank=True, default='')
    received_date = models.DateField()
    initial_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    remaining_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    purchase_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"{self.batch_no} | {self.item.item_name} ({self.remaining_qty}/{self.initial_qty})"
