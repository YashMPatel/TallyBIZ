from django.db import models

class BillOfMaterial(models.Model):
    company = models.ForeignKey('accounts.Company', on_delete=models.CASCADE, related_name='boms')
    bom_code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    finished_item = models.ForeignKey('stock.Item', on_delete=models.CASCADE, related_name='finished_boms')
    output_qty = models.DecimalField(max_digits=12, decimal_places=2, default=1.00)
    alt_output_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0.000)
    labor_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    overhead_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('company', 'bom_code')
        ordering = ['-id']

    def __str__(self):
        return f'{self.bom_code} - {self.name}'

class BOMComponent(models.Model):
    bom = models.ForeignKey(BillOfMaterial, on_delete=models.CASCADE, related_name='components')
    raw_item = models.ForeignKey('stock.Item', on_delete=models.CASCADE, related_name='used_in_boms')
    qty_required = models.DecimalField(max_digits=12, decimal_places=3)
    wastage_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)

class ProductionOrder(models.Model):
    STATUS_CHOICES = [('DRAFT', 'Draft'), ('PENDING', 'Pending Approval'), ('APPROVED', 'Approved'), ('CANCELLED', 'Cancelled')]
    ORDER_TYPE_CHOICES = [('OWN', 'Own Production'), ('JOB_WORK', 'Job Work (Party Material)')]
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='OWN')
    party_name = models.CharField(max_length=150, blank=True, default='')
    party_challan_no = models.CharField(max_length=80, blank=True, default='')
    company = models.ForeignKey('accounts.Company', on_delete=models.CASCADE, related_name='production_orders')
    unit = models.ForeignKey('accounts.BusinessUnit', on_delete=models.SET_NULL, null=True, blank=True, related_name='production_orders')
    voucher_no = models.CharField(max_length=50)
    posting_date = models.DateField()
    bom = models.ForeignKey(BillOfMaterial, on_delete=models.PROTECT, related_name='production_orders')
    finished_item = models.ForeignKey('stock.Item', on_delete=models.PROTECT, related_name='produced_orders')
    planned_qty = models.DecimalField(max_digits=12, decimal_places=2)
    actual_qty = models.DecimalField(max_digits=12, decimal_places=2)
    scrap_item = models.ForeignKey('stock.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='scrap_orders')
    scrap_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    scrap_value = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    labor_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    overhead_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_raw_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    net_production_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    remarks = models.TextField(blank=True, default='')
    created_by = models.CharField(max_length=150, blank=True, default='')
    approved_by = models.CharField(max_length=150, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('company', 'voucher_no')
        ordering = ['-posting_date', '-id']

class ProductionConsumption(models.Model):
    production_order = models.ForeignKey(ProductionOrder, on_delete=models.CASCADE, related_name='consumptions')
    raw_item = models.ForeignKey('stock.Item', on_delete=models.PROTECT)
    planned_qty = models.DecimalField(max_digits=12, decimal_places=3)
    actual_qty = models.DecimalField(max_digits=12, decimal_places=3)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)


class ProductionSalesRequest(models.Model):
    STATUS_CHOICES = (
        ('PENDING_MFG', 'Pending Manufacturing Acceptance'),
        ('ACCEPTED_SPLIT', 'Accepted & MRP Planned'),
        ('IN_PRODUCTION', 'In Production'),
        ('COMPLETED', 'Completed & Dispatched'),
        ('REJECTED', 'Rejected'),
    )
    company = models.ForeignKey('accounts.Company', on_delete=models.CASCADE, related_name='prod_sales_requests')
    from_unit = models.ForeignKey('accounts.BusinessUnit', on_delete=models.SET_NULL, null=True, blank=True, related_name='sent_prod_requests')
    mfg_unit = models.ForeignKey('accounts.BusinessUnit', on_delete=models.CASCADE, related_name='received_prod_requests')
    request_no = models.CharField(max_length=50)
    posting_date = models.DateField()
    customer_name = models.CharField(max_length=150, blank=True, default='')
    sales_ref = models.CharField(max_length=80, blank=True, default='')
    finished_item = models.ForeignKey('stock.Item', on_delete=models.PROTECT, related_name='sales_prod_requests')
    bom = models.ForeignKey(BillOfMaterial, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales_prod_requests')
    requested_qty = models.DecimalField(max_digits=12, decimal_places=2)
    inhouse_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    outsource_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    producible_now_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    shortfall_fg_qty = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    mrp_snapshot = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING_MFG')
    notes = models.TextField(blank=True, default='')
    created_by = models.CharField(max_length=150, blank=True, default='')
    accepted_by = models.CharField(max_length=150, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return f"{self.request_no} - {self.finished_item.item_name} ({self.requested_qty})"
