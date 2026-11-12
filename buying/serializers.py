from rest_framework import serializers
from .models import Supplier, PurchaseInvoice, PurchaseInvoiceItem, DebitNote, DebitNoteItem


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class PurchaseInvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseInvoiceItem
        fields = '__all__'
        extra_kwargs = {
            'invoice': {'required': False, 'read_only': True}
        }


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    items = PurchaseInvoiceItemSerializer(many=True, required=False)

    class Meta:
        model = PurchaseInvoice
        fields = '__all__'

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        invoice = PurchaseInvoice.objects.create(**validated_data)
        for item_data in items_data:
            PurchaseInvoiceItem.objects.create(invoice=invoice, **item_data)
        return invoice

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                PurchaseInvoiceItem.objects.create(invoice=instance, **item_data)
        return instance


class DebitNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebitNoteItem
        fields = '__all__'
        extra_kwargs = {
            'debit_note': {'required': False, 'read_only': True}
        }


class DebitNoteSerializer(serializers.ModelSerializer):
    items = DebitNoteItemSerializer(many=True, required=False)

    class Meta:
        model = DebitNote
        fields = '__all__'

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        debit_note = DebitNote.objects.create(**validated_data)
        for item_data in items_data:
            DebitNoteItem.objects.create(debit_note=debit_note, **item_data)
        return debit_note

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item_data in items_data:
                DebitNoteItem.objects.create(debit_note=instance, **item_data)
        return instance