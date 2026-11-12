from rest_framework import generics
from django.db.models import Q
from .models import Item, StockLedgerEntry
from .serializers import ItemSerializer, StockLedgerEntrySerializer
from accounts.models import Company


def get_request_company_id(request):
    comp_id = (
        request.headers.get('X-Company-Id')
        or request.GET.get('company_id')
        or (getattr(request, 'data', None) and request.data.get('company_id'))
    )
    if comp_id and str(comp_id).isdigit():
        return int(comp_id)
    if hasattr(request.user, 'profile') and request.user.profile.company_id:
        return request.user.profile.company_id
    first_comp = Company.objects.first()
    return first_comp.id if first_comp else 1


class ItemListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = ItemSerializer

    def get_queryset(self):
        cid = get_request_company_id(self.request)
        return Item.objects.filter(company_id=cid).order_by('item_name')

    def perform_create(self, serializer):
        cid = get_request_company_id(self.request)
        serializer.save(company_id=cid)


class ItemRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer


class StockLedgerAPIView(generics.ListAPIView):
    serializer_class = StockLedgerEntrySerializer

    def get_queryset(self):
        cid = get_request_company_id(self.request)
        qs = StockLedgerEntry.objects.filter(company_id=cid).order_by('-posting_date', '-id')
        item_id = self.request.GET.get('item')
        if item_id and item_id != 'all':
            qs = qs.filter(item_id=item_id)
        return qs

StockLedgerEntryListAPIView = StockLedgerAPIView