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
