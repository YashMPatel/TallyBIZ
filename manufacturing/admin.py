from django.contrib import admin
from .models import BillOfMaterial, BOMComponent, ProductionOrder, ProductionConsumption
admin.site.register(BillOfMaterial)
admin.site.register(BOMComponent)
admin.site.register(ProductionOrder)
admin.site.register(ProductionConsumption)
