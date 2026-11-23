from rest_framework import serializers
from .models import Item, StockLedgerEntry, StockBatch

class ItemSerializer(serializers.ModelSerializer):
    # Frontend compatibility aliases (so Code & Item Name never show blank)
    code = serializers.CharField(source='item_code', read_only=True)
    name = serializers.CharField(source='item_name', read_only=True)
    unit_stock = serializers.SerializerMethodField()

    def get_unit_stock(self, obj):
        req = self.context.get('request')
        uid = (req.headers.get('X-Unit-Id') or req.GET.get('unit_id')) if req else None
        if uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
            from accounts.models import BusinessUnit
            u_obj = BusinessUnit.objects.filter(id=int(uid)).first()
            if u_obj and u_obj.unit_type != 'HO':
                from django.db.models import Sum
                val = StockLedgerEntry.objects.filter(item=obj, unit_id=int(uid)).aggregate(q=Sum('actual_qty'))['q']
                return float(val or 0)
        return float(obj.current_stock or 0)

    bom_stock_groups = serializers.SerializerMethodField()

    def get_bom_stock_groups(self, obj):
        from decimal import Decimal
        from django.db.models import Sum
        from manufacturing.models import ProductionOrder

        req = self.context.get('request')
        uid = (req.headers.get('X-Unit-Id') or req.GET.get('unit_id')) if req else None
        unit_obj = None
        if uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
            from accounts.models import BusinessUnit
            unit_obj = BusinessUnit.objects.filter(id=int(uid)).first()

        if unit_obj and unit_obj.unit_type != 'HO':
            scope_stock = Decimal(str(
                StockLedgerEntry.objects.filter(item=obj, unit=unit_obj).aggregate(q=Sum('actual_qty'))['q'] or 0
            ))
        else:
            scope_stock = Decimal(str(obj.current_stock or 0))

        orders_qs = ProductionOrder.objects.filter(
            company=obj.company,
            finished_item=obj,
            status='APPROVED'
        ).exclude(order_type='JOB_WORK').select_related('bom').order_by('posting_date', 'id')

        if not orders_qs.exists():
            return []

        groups = {}
        total_produced = Decimal('0.00')
        for o in orders_qs:
            bom_name = (o.bom.name if o.bom else 'Standard Production').strip()
            bom_code = (o.bom.bom_code if o.bom else '').strip()
            key = (obj.id, bom_name.lower())
            qty = Decimal(str(o.actual_qty or 0))
            cost = Decimal(str(o.net_production_cost or (qty * Decimal(str(o.unit_cost or 0)))))
            total_produced += qty

            if key not in groups:
                conv = Decimal(str(obj.conversion_factor or 1))
                if o.bom:
                    b_out_kg = Decimal(str(getattr(o.bom, 'output_qty', 0) or 0))
                    b_out_nos = Decimal(str(
                        getattr(o.bom, 'output_nos', 0)
                        or getattr(o.bom, 'alt_output_qty', 0)
                        or 0
                    ))
                    if b_out_kg > 0 and b_out_nos > 0:
                        conv = (b_out_nos / b_out_kg).quantize(Decimal('0.0001'))
                groups[key] = {
                    'group_key': f"{obj.id}:{bom_name.lower()}",
                    'bom_code': bom_code,
                    'bom_name': bom_name,
                    'produced_qty': Decimal('0.00'),
                    'total_cost': Decimal('0.00'),
                    'conversion_factor': float(conv),
                }
            groups[key]['produced_qty'] += qty
            groups[key]['total_cost'] += cost

        if total_produced <= 0:
            return []

        result = []
        ratio = (scope_stock / total_produced) if scope_stock > 0 else Decimal('0.00')
        for g in groups.values():
            p_qty = g['produced_qty']
            unit_rate = (g['total_cost'] / p_qty).quantize(Decimal('0.01')) if p_qty > 0 else Decimal(str(obj.standard_rate or 0))
            avail_qty = (p_qty * ratio).quantize(Decimal('0.01')) if scope_stock > 0 else Decimal('0.00')
            result.append({
                'group_key': g['group_key'],
                'bom_code': g['bom_code'],
                'bom_name': g['bom_name'],
                'produced_qty': float(p_qty),
                'stock_qty': float(avail_qty),
                'unit_rate': float(unit_rate),
                'stock_value': float((avail_qty * unit_rate).quantize(Decimal('0.01'))),
                'conversion_factor': g['conversion_factor'],
            })
        return result

    class Meta:
        model = Item
        fields = '__all__'

class StockLedgerEntrySerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    unit_name = serializers.CharField(source='unit.name', read_only=True, default='Unassigned')

    class Meta:
        model = StockLedgerEntry
        fields = '__all__'

class StockBatchSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)
    item_code = serializers.CharField(source='item.item_code', read_only=True)
    item_unit = serializers.CharField(source='item.unit', read_only=True)
    unit_name = serializers.CharField(source='unit.name', read_only=True, default='All Divisions')
    outward_qty = serializers.SerializerMethodField()

    def get_outward_qty(self, obj):
        return float(max(0, (obj.initial_qty or 0) - (obj.remaining_qty or 0)))

    class Meta:
        model = StockBatch
        fields = '__all__'
