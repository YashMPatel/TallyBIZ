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
        from django.db.models import Sum
        cid = get_request_company_id(self.request)
        qs = Item.objects.filter(company_id=cid).order_by('item_name')
        uid = self.request.headers.get('X-Unit-Id') or self.request.GET.get('unit_id')
        if self.request.GET.get('in_unit_only') == '1' and uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
            try:
                unit_item_ids = (
                    StockLedgerEntry.objects.filter(company_id=cid, unit_id=int(uid))
                    .values('item_id')
                    .annotate(net_qty=Sum('actual_qty'))
                    .filter(net_qty__gt=0)
                    .values_list('item_id', flat=True)
                )
                qs = qs.filter(id__in=list(unit_item_ids))
            except (ValueError, TypeError):
                pass
        return qs

    def perform_create(self, serializer):
        from django.utils import timezone
        from decimal import Decimal
        from accounts.models import BusinessUnit, ensure_default_units
        cid = get_request_company_id(self.request)
        item = serializer.save(company_id=cid)
        qty = Decimal(str(item.current_stock or 0))
        if qty > 0 and item.company:
            units_map = ensure_default_units(item.company)
            uid = self.request.headers.get('X-Unit-Id') or self.request.GET.get('unit_id')
            target_u = None
            if uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
                target_u = BusinessUnit.objects.filter(company=item.company, id=int(uid)).first()
            if not target_u:
                target_u = units_map.get('TRADING')
            StockLedgerEntry.objects.create(
                company=item.company,
                unit=target_u,
                posting_date=timezone.now().date(),
                item=item,
                voucher_type='Opening Stock',
                voucher_no=f"OPN-{item.id}",
                actual_qty=qty,
                qty_after_transaction=qty,
                valuation_rate=Decimal(str(item.standard_rate or 0)),
            )


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
        uid = self.request.headers.get('X-Unit-Id') or self.request.GET.get('unit_id')
        if uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
            qs = qs.filter(unit_id=int(uid))
        return qs

StockLedgerEntryListAPIView = StockLedgerAPIView

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from decimal import Decimal
from django.db.models import Sum

class InterUnitStockTransferAPIView(APIView):
    def _get_linked_companies(self, comp):
        from django.db.models import Q
        if not comp:
            return []
        root = comp.parent_company or comp
        return list(Company.objects.filter(Q(id=root.id) | Q(parent_company=root)).order_by('id'))

    def get(self, request):
        from django.db.models import Q
        cid = get_request_company_id(request)
        comp = Company.objects.filter(id=cid).first()
        linked_comps = self._get_linked_companies(comp)
        comp_ids = [c.id for c in linked_comps] or ([cid] if cid else [])
        entries = (
            StockLedgerEntry.objects.filter(company_id__in=comp_ids, voucher_type='Stock Transfer')
            .select_related('item', 'company', 'unit')
            .order_by('-posting_date', '-id')
        )
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')
        search = (request.GET.get('search') or '').strip()
        if from_date:
            entries = entries.filter(posting_date__gte=from_date)
        if to_date:
            entries = entries.filter(posting_date__lte=to_date)
        if search:
            entries = entries.filter(
                Q(voucher_no__icontains=search)
                | Q(item__item_name__icontains=search)
                | Q(item__item_code__icontains=search)
                | Q(company__name__icontains=search)
            )
        grouped = {}
        order_keys = []
        for e in entries:
            vno = e.voucher_no
            if vno not in grouped:
                grouped[vno] = {
                    'voucher_no': vno,
                    'posting_date': str(e.posting_date),
                    'item_id': e.item_id,
                    'item_code': e.item.item_code if e.item else '',
                    'item_name': e.item.item_name if e.item else '',
                    'hsn_code': (getattr(e.item, 'hsn_code', '') or getattr(e.item, 'hsn_sac', '') or '') if e.item else '',
                    'selling_rate': float(getattr(e.item, 'selling_rate', 0) or (e.item.standard_rate if e.item else 0) or 0),
                    'unit': e.item.unit if e.item else 'Nos',
                    'from_unit': '-',
                    'to_unit': '-',
                    'qty': 0.0,
                    'rate': float(e.valuation_rate or 0),
                    'total_value': 0.0,
                }
                order_keys.append(vno)
            qty_val = float(e.actual_qty or 0)
            cname = e.company.name.split('—')[-1].strip() if e.company else 'Division'
            if qty_val < 0:
                grouped[vno]['from_unit'] = cname
                grouped[vno]['qty'] = abs(qty_val)
            elif qty_val > 0:
                grouped[vno]['to_unit'] = cname
                if grouped[vno]['qty'] == 0:
                    grouped[vno]['qty'] = qty_val
            grouped[vno]['total_value'] = round(grouped[vno]['qty'] * grouped[vno]['rate'], 2)
        return Response([grouped[k] for k in order_keys], status=status.HTTP_200_OK)

    def post(self, request):
        from decimal import Decimal
        from django.db import transaction
        from django.db.models import Sum
        from django.utils import timezone
        data = request.data or {}
        from accounts.models import BusinessUnit
        from_uid = data.get('from_unit_id')
        to_uid = data.get('to_unit_id')
        from_cid = data.get('from_company_id') or from_uid
        to_cid = data.get('to_company_id') or to_uid
        item_id = data.get('item_id')
        qty = Decimal(str(data.get('qty') or 0))
        if not from_cid or not to_cid or str(from_cid) == str(to_cid):
            return Response({'error': 'Please select two different divisions.'}, status=status.HTTP_400_BAD_REQUEST)
        if qty <= 0:
            return Response({'error': 'Transfer quantity must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if same-company BusinessUnit transfer first
        comp_id_hdr = request.GET.get('company_id') or request.headers.get('X-Company-Id')
        from_bu = BusinessUnit.objects.filter(id=int(from_uid or from_cid)).first()
        to_bu = BusinessUnit.objects.filter(id=int(to_uid or to_cid)).first()
        if from_bu and to_bu and from_bu.company_id == to_bu.company_id and (not comp_id_hdr or str(from_bu.company_id) == str(comp_id_hdr)):
            comp = from_bu.company
            src_item = Item.objects.filter(id=int(item_id), company=comp).first()
            if not src_item:
                return Response({'error': 'Selected item not found in source division.'}, status=status.HTTP_404_NOT_FOUND)
            avail = StockLedgerEntry.objects.filter(company=comp, unit=from_bu, item=src_item).aggregate(s=Sum('actual_qty'))['s']
            if avail is None:
                avail = Decimal(str(src_item.current_stock or 0))
            if avail < qty:
                return Response({'error': f'Insufficient stock in {from_bu.name}: Available {avail}, Requested {qty}.'}, status=status.HTTP_400_BAD_REQUEST)
            with transaction.atomic():
                cnt = StockLedgerEntry.objects.filter(company=comp, voucher_type='Stock Transfer').values('voucher_no').distinct().count() + 1
                vno = f"TRF-{cnt:04d}"
                pdate = timezone.now().date()
                rate = Decimal(str(src_item.standard_rate or 0))
                dst_avail = StockLedgerEntry.objects.filter(company=comp, unit=to_bu, item=src_item).aggregate(s=Sum('actual_qty'))['s'] or Decimal('0.00')
                StockLedgerEntry.objects.create(
                    company=comp, unit=from_bu, posting_date=pdate, item=src_item,
                    voucher_type='Stock Transfer', voucher_no=vno,
                    actual_qty=-qty,
                    qty_after_transaction=avail - qty, valuation_rate=rate
                )
                StockLedgerEntry.objects.create(
                    company=comp, unit=to_bu, posting_date=pdate, item=src_item,
                    voucher_type='Stock Transfer', voucher_no=vno,
                    actual_qty=qty,
                    qty_after_transaction=dst_avail + qty, valuation_rate=rate
                )
            return Response({'message': f'Transferred {qty} {src_item.unit} of {src_item.item_name} from {from_bu.name} to {to_bu.name} ({vno}).'}, status=status.HTTP_201_CREATED)

        from_comp = Company.objects.filter(id=int(from_cid)).first()
        to_comp = Company.objects.filter(id=int(to_cid)).first()
        src_item = Item.objects.filter(id=int(item_id), company=from_comp).first()
        if not from_comp or not to_comp or not src_item:
            return Response({'error': 'Selected item not found in source division.'}, status=status.HTTP_404_NOT_FOUND)

        avail = StockLedgerEntry.objects.filter(company=from_comp, item=src_item).aggregate(s=Sum('actual_qty'))['s'] or Decimal('0.00')
        if avail < qty:
            return Response({'error': f'Insufficient stock in {from_comp.name}: Available {avail}, Requested {qty}.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            dst_item = Item.objects.filter(company=to_comp, item_code=src_item.item_code).first() or Item.objects.filter(company=to_comp, item_name__iexact=src_item.item_name).first()
            if not dst_item:
                dst_item = Item.objects.create(
                    company=to_comp,
                    item_code=src_item.item_code,
                    item_name=src_item.item_name,
                    category=src_item.category,
                    unit=src_item.unit,
                    standard_rate=src_item.standard_rate,
                    selling_rate=getattr(src_item, 'selling_rate', src_item.standard_rate),
                    current_stock=Decimal('0.00'),
                )
            linked = self._get_linked_companies(from_comp)
            cids = [c.id for c in linked]
            cnt = StockLedgerEntry.objects.filter(company_id__in=cids, voucher_type='Stock Transfer').values('voucher_no').distinct().count() + 1
            vno = f"TRF-{cnt:04d}"
            pdate = timezone.now().date()
            rate = Decimal(str(src_item.standard_rate or 0))
            src_after = avail - qty
            dst_avail = StockLedgerEntry.objects.filter(company=to_comp, item=dst_item).aggregate(s=Sum('actual_qty'))['s'] or Decimal('0.00')
            dst_after = dst_avail + qty

            StockLedgerEntry.objects.create(
                company=from_comp, posting_date=pdate, item=src_item,
                voucher_type='Stock Transfer', voucher_no=vno,
                actual_qty=-qty,
                qty_after_transaction=src_after, valuation_rate=rate
            )
            StockLedgerEntry.objects.create(
                company=to_comp, posting_date=pdate, item=dst_item,
                voucher_type='Stock Transfer', voucher_no=vno,
                actual_qty=qty,
                qty_after_transaction=dst_after, valuation_rate=rate
            )
            src_item.current_stock = src_after
            src_item.save(update_fields=['current_stock'])
            dst_item.current_stock = dst_after
            dst_item.save(update_fields=['current_stock'])

        return Response({'message': f'Transferred {qty} {src_item.unit} via {vno}', 'voucher_no': vno}, status=status.HTTP_201_CREATED)
