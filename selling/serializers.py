from rest_framework import serializers
from .models import Customer, SalesInvoice, SalesInvoiceItem, CreditNote, CreditNoteItem


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'


class SalesInvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesInvoiceItem
        fields = '__all__'
        extra_kwargs = {
            'invoice': {'required': False, 'read_only': True}
        }


class SalesInvoiceSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    def _format_user_name(self, user_obj):
        if not user_obj:
            return None
        full = f"{getattr(user_obj, 'first_name', '')} {getattr(user_obj, 'last_name', '')}".strip()
        return full or getattr(user_obj, 'username', None)

    def get_created_by_name(self, obj):
        return self._format_user_name(getattr(obj, 'created_by', None))

    def get_approved_by_name(self, obj):
        return self._format_user_name(getattr(obj, 'approved_by', None))


    def create(self, validated_data):
        from selling.models import SalesInvoice, SalesInvoiceItem
        items_data = validated_data.pop('items', [])
        validated_data['status'] = 'Draft'
        invoice = SalesInvoice.objects.create(**validated_data)

        fk_name = 'invoice'
        for f in SalesInvoiceItem._meta.fields:
            if getattr(f, 'related_model', None) == SalesInvoice:
                fk_name = f.name
                break

        valid_fields = {f.name for f in SalesInvoiceItem._meta.fields}
        for row in items_data:
            clean_row = {k: v for k, v in row.items() if k in valid_fields and k != 'id'}
            clean_row[fk_name] = invoice
            SalesInvoiceItem.objects.create(**clean_row)

        return invoice

    items = SalesInvoiceItemSerializer(many=True, required=False)

    class Meta:
        model = SalesInvoice
        fields = '__all__'
        extra_kwargs = {
            'invoice_number': {'validators': []}
        }

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class CreditNoteItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditNoteItem
        fields = '__all__'
        extra_kwargs = {
            'credit_note': {'required': False, 'read_only': True}
        }


class CreditNoteSerializer(serializers.ModelSerializer):
    items = CreditNoteItemSerializer(many=True, required=False)

    class Meta:
        model = CreditNote
        fields = '__all__'
        extra_kwargs = {
            'credit_note_number': {'validators': []}
        }