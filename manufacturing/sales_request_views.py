from decimal import Decimal
import uuid
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from accounts.models import BusinessUnit, ensure_default_units, DepartmentRequest
from accounts.views import get_active_company, resolve_active_unit
from stock.models import Item, StockLedgerEntry
from selling.models import Customer, SalesInvoice, SalesInvoiceItem
from .models import BillOfMaterial, BOMComponent, ProductionSalesRequest


def _unit_item_stock(comp, unit_obj, item_id):
    if unit_obj:
        val = StockLedgerEntry.objects.filter(company=comp, unit=unit_obj, item_id=item_id).aggregate(q=Sum('actual_qty'))['q']
        if val is not None:
            return Decimal(str(val))
    it = Item.objects.filter(id=item_id).first()
    return Decimal(str(it.current_stock if it else 0))


def _get_or_create_item(comp, item_id=None, item_name='', category='General', unit='Nos', hsn_code='', gst_rate=18, cost_rate=0, sell_rate=0):
    obj = None
    if item_id:
        obj = Item.objects.filter(company=comp, id=item_id).first()
    if not obj and item_name:
        obj = Item.objects.filter(company=comp, item_name__iexact=item_name.strip()).first()
    if obj:
        changed = []
        if unit and obj.unit != unit:
            obj.unit = unit
            changed.append('unit')
        if hsn_code and obj.hsn_code != hsn_code:
            obj.hsn_code = hsn_code
            changed.append('hsn_code')
        if Decimal(str(cost_rate or 0)) > 0:
            obj.standard_rate = Decimal(str(cost_rate))
            changed.append('standard_rate')
        if Decimal(str(sell_rate or 0)) > 0:
            obj.selling_rate = Decimal(str(sell_rate))
            changed.append('selling_rate')
        if changed:
            obj.save(update_fields=changed)
        return obj

    if not item_name:
        return None
    cnt = Item.objects.filter(company=comp).count() + 1
    code = f"ITM-{cnt:04d}"
    while Item.objects.filter(company=comp, item_code=code).exists():
        cnt += 1
        code = f"ITM-{cnt:04d}"
    return Item.objects.create(
        company=comp,
        item_code=code,
        item_name=item_name.strip(),
        category=category or 'General',
        unit=(unit or 'Nos').strip(),
        hsn_code=(hsn_code or '').strip(),
        gst_rate=Decimal(str(gst_rate if gst_rate not in (None, '') else 18)),
        standard_rate=Decimal(str(cost_rate or 0)),
        selling_rate=Decimal(str(sell_rate or 0)),
        current_stock=Decimal('0.00'),
    )


class ProductionSalesRequestListCreateAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response([])
        u = resolve_active_unit(request, comp)
        qs = ProductionSalesRequest.objects.filter(company=comp).select_related('from_unit', 'mfg_unit', 'finished_item', 'bom')
        if u and u.unit_type == 'MANUFACTURING':
            qs = qs.filter(mfg_unit=u)
        elif u and u.unit_type == 'TRADING':
            qs = qs.filter(from_unit=u)

        data = []
        for r in qs:
            snap = r.mrp_snapshot or {}
            schedule = snap.get('delivery_schedule') or []
            dispatched_qty = sum(float(b.get('qty') or 0) for b in schedule if b.get('status') == 'DISPATCHED')
            invoiced_qty = sum(float(b.get('qty') or 0) for b in schedule if b.get('invoiced'))
            raw_info = snap.get('raw_material') or {}
            if not raw_info and r.bom:
                comp_row = BOMComponent.objects.filter(bom=r.bom).select_related('raw_item').first()
                if comp_row:
                    raw_info = {
                        'raw_item_id': comp_row.raw_item_id,
                        'raw_item_name': comp_row.raw_item.item_name,
                        'raw_unit': comp_row.raw_item.unit,
                        'raw_hsn': comp_row.raw_item.hsn_code,
                        'raw_qty': float(comp_row.qty_required),
                        'raw_purchase_rate': float(comp_row.raw_item.standard_rate or 0),
                        'raw_wastage': float(comp_row.wastage_percent or 0),
                    }
            data.append({
                'id': r.id,
                'request_no': r.request_no,
                'posting_date': str(r.posting_date),
                'from_unit_name': r.from_unit.name if r.from_unit else 'Trading Division',
                'mfg_unit_id': r.mfg_unit_id,
                'mfg_unit_name': r.mfg_unit.name if r.mfg_unit else '',
                'customer_name': r.customer_name,
                'sales_ref': r.sales_ref,
                'order_type': snap.get('order_type', 'OWN'),
                'party_challan_no': snap.get('party_challan_no', ''),
                'existing_invoice_id': snap.get('existing_invoice_id'),
                'existing_invoice_no': snap.get('existing_invoice_no', ''),
                'line_items_summary': snap.get('line_items_summary', []),
                'finished_item_id': r.finished_item_id,
                'finished_item_name': r.finished_item.item_name if r.finished_item else '',
                'finished_item_code': r.finished_item.item_code if r.finished_item else '',
                'finished_unit': r.finished_item.unit if r.finished_item else 'Nos',
                'finished_hsn': r.finished_item.hsn_code if r.finished_item else '',
                'finished_gst': float(r.finished_item.gst_rate or 18) if r.finished_item else 18.0,
                'selling_rate': float(snap.get('selling_rate') or (r.finished_item.selling_rate if r.finished_item else 0) or 0),
                'cost_rate': float(snap.get('cost_rate') or (r.finished_item.standard_rate if r.finished_item else 0) or 0),
                'raw_material': raw_info,
                'bom_id': r.bom_id,
                'bom_code': r.bom.bom_code if r.bom else '',
                'requested_qty': float(r.requested_qty),
                'dispatched_qty': dispatched_qty,
                'invoiced_qty': invoiced_qty,
                'inhouse_qty': float(r.inhouse_qty),
                'outsource_qty': float(r.outsource_qty),
                'producible_now_qty': float(r.producible_now_qty),
                'shortfall_fg_qty': float(r.shortfall_fg_qty),
                'delivery_schedule': schedule,
                'mrp_snapshot': snap,
                'status': r.status,
                'notes': r.notes,
                'created_by': r.created_by,
                'accepted_by': r.accepted_by,
            })
        return Response(data)

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)

        data = request.data
        req_qty = Decimal(str(data.get('requested_qty') or 0)).quantize(Decimal('0.01'))
        if req_qty <= 0:
            return Response({'error': 'Order quantity must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

        cust_name = (data.get('customer_name') or '').strip()
        if cust_name and not Customer.objects.filter(company=comp, customer_name__iexact=cust_name).exists():
            Customer.objects.create(company=comp, customer_name=cust_name)

        fin_unit = (data.get('finished_unit') or 'Nos').strip()
        fin_hsn = (data.get('finished_hsn') or '').strip()
        fin_gst = data.get('finished_gst') if data.get('finished_gst') not in (None, '') else 18
        sell_rate = Decimal(str(data.get('selling_rate') or 0))
        cost_rate = Decimal(str(data.get('cost_rate') or 0))

        item_obj = _get_or_create_item(
            comp,
            item_id=data.get('finished_item_id'),
            item_name=data.get('finished_item_name') or '',
            category='Finished Goods',
            unit=fin_unit,
            hsn_code=fin_hsn,
            gst_rate=fin_gst,
            cost_rate=cost_rate,
            sell_rate=sell_rate,
        )
        if not item_obj:
            return Response({'error': 'Please select or enter a Finished Product name.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_qty = Decimal(str(data.get('raw_qty') or 0))
        bom = None
        raw_snapshot = {}
        if (data.get('raw_item_id') or (data.get('raw_item_name') or '').strip()) and raw_qty > 0:
            raw_unit = (data.get('raw_unit') or fin_unit or 'Nos').strip()
            raw_hsn = (data.get('raw_hsn') or '').strip()
            raw_purchase_rate = Decimal(str(data.get('raw_purchase_rate') or 0))
            raw_wastage = min(Decimal('100.00'), max(Decimal('0.00'), Decimal(str(data.get('raw_wastage') or 0))))

            raw_item_obj = _get_or_create_item(
                comp,
                item_id=data.get('raw_item_id'),
                item_name=data.get('raw_item_name') or '',
                category='Raw Material',
                unit=raw_unit,
                hsn_code=raw_hsn,
                gst_rate=fin_gst,
                cost_rate=raw_purchase_rate,
                sell_rate=0,
            )
            if raw_item_obj:
                bcnt = BillOfMaterial.objects.filter(company=comp).count() + 1
                bcode = f"BOM-{bcnt:03d}"
                while BillOfMaterial.objects.filter(company=comp, bom_code=bcode).exists():
                    bcnt += 1
                    bcode = f"BOM-{bcnt:03d}"
                bom = BillOfMaterial.objects.create(
                    company=comp,
                    bom_code=bcode,
                    name=f"{item_obj.item_name} Recipe ({req_qty} {item_obj.unit})",
                    finished_item=item_obj,
                    output_qty=req_qty,
                    labor_cost=Decimal(str(data.get('labor_cost') or 0)),
                    overhead_cost=Decimal(str(data.get('overhead_cost') or 0)),
                    is_active=True,
                )
                BOMComponent.objects.create(
                    bom=bom,
                    raw_item=raw_item_obj,
                    qty_required=raw_qty,
                    wastage_percent=raw_wastage,
                )
                raw_snapshot = {
                    'raw_item_id': raw_item_obj.id,
                    'raw_item_name': raw_item_obj.item_name,
                    'raw_item_code': raw_item_obj.item_code,
                    'raw_unit': raw_item_obj.unit,
                    'raw_hsn': raw_item_obj.hsn_code,
                    'raw_qty': float(raw_qty),
                    'raw_purchase_rate': float(raw_purchase_rate or raw_item_obj.standard_rate or 0),
                    'raw_wastage': float(raw_wastage),
                }

        if not bom:
            bom = BillOfMaterial.objects.filter(company=comp, finished_item=item_obj, is_active=True).first()

        mfg_unit_id = data.get('mfg_unit_id')
        mfg_u = BusinessUnit.objects.filter(company=comp, id=mfg_unit_id).first() if mfg_unit_id else BusinessUnit.objects.filter(company=comp, unit_type='MANUFACTURING').first()
        from_u = resolve_active_unit(request, comp, default_unit_type='TRADING')

        sales_ref = (data.get('sales_ref') or '').strip()
        if not sales_ref:
            yr = timezone.now().year
            scnt = ProductionSalesRequest.objects.filter(company=comp).count() + 1
            sales_ref = f"SO-{yr}-{scnt:02d}"

        cnt = ProductionSalesRequest.objects.filter(company=comp).count() + 1
        req_no = f"MREQ-{cnt:04d}"

        obj = ProductionSalesRequest.objects.create(
            company=comp,
            from_unit=from_u,
            mfg_unit=mfg_u,
            request_no=req_no,
            posting_date=data.get('posting_date') or timezone.now().date(),
            customer_name=cust_name,
            sales_ref=sales_ref,
            finished_item=item_obj,
            bom=bom,
            requested_qty=req_qty,
            inhouse_qty=req_qty,
            status='PENDING_MFG',
            mrp_snapshot={
                'order_type': str(data.get('order_type') or 'OWN').upper(),
                'party_challan_no': (data.get('party_challan_no') or '').strip(),
                'existing_invoice_id': data.get('existing_invoice_id'),
                'existing_invoice_no': (data.get('existing_invoice_no') or '').strip(),
                'proforma_invoice_id': data.get('proforma_invoice_id'),
                'proforma_invoice_no': (data.get('proforma_invoice_no') or '').strip(),
                'line_items_summary': data.get('line_items_summary') or [],
                'selling_rate': float(sell_rate or item_obj.selling_rate or 0),
                'cost_rate': float(cost_rate or item_obj.standard_rate or 0),
                'raw_material': raw_snapshot,
                'delivery_schedule': [],
            },
            notes=(data.get('notes') or '').strip(),
            created_by=(data.get('created_by') or request.headers.get('X-Username') or 'Sales Team').strip(),
        )
        return Response({
            'id': obj.id,
            'request_no': obj.request_no,
            'sales_ref': obj.sales_ref,
            'status': obj.status,
        }, status=status.HTTP_201_CREATED)


class ProductionSalesRequestScheduleAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        req_obj = ProductionSalesRequest.objects.filter(company=comp, id=pk).select_related('finished_item', 'mfg_unit', 'from_unit', 'bom').first()
        if not req_obj:
            return Response({'error': 'Order request not found.'}, status=status.HTTP_404_NOT_FOUND)

        rows = request.data.get('schedule') or []
        if not rows:
            return Response({'error': 'Please add at least one delivery date and quantity.'}, status=status.HTTP_400_BAD_REQUEST)

        snap = dict(req_obj.mrp_snapshot or {})
        existing = {str(x.get('id')): x for x in (snap.get('delivery_schedule') or [])}

        cleaned = []
        total_sched = Decimal('0.00')
        for idx, r in enumerate(rows):
            d_str = str(r.get('date') or '').strip()
            q_val = Decimal(str(r.get('qty') or 0)).quantize(Decimal('0.01'))
            if not d_str or q_val <= 0:
                continue
            bid = str(r.get('id') or f"B-{idx+1}-{uuid.uuid4().hex[:5]}")
            prev = existing.get(bid, {})
            cleaned.append({
                'id': bid,
                'date': d_str,
                'qty': float(q_val),
                'challan_no': (r.get('challan_no') or prev.get('challan_no') or '').strip(),
                'vehicle_no': (r.get('vehicle_no') or prev.get('vehicle_no') or '').strip().upper(),
                'dispatch_notes': (r.get('dispatch_notes') or prev.get('dispatch_notes') or '').strip(),
                'status': prev.get('status') or 'SCHEDULED',
                'dispatch_no': prev.get('dispatch_no') or '',
                'dispatched_at': prev.get('dispatched_at') or '',
                'invoiced': bool(prev.get('invoiced')),
                'invoice_no': prev.get('invoice_no') or '',
            })
            total_sched += q_val

        if not cleaned:
            return Response({'error': 'Valid date and quantity > 0 are required.'}, status=status.HTTP_400_BAD_REQUEST)

        rm_req_no = snap.get('rm_purchase_req_no')
        if request.data.get('request_rm_purchase') and not rm_req_no:
            raw_info = snap.get('raw_material') or {}
            if raw_info.get('raw_item_id') and float(raw_info.get('raw_qty') or 0) > 0:
                r_qty = (Decimal(str(raw_info['raw_qty'])) * (Decimal('1') + Decimal(str(raw_info.get('raw_wastage') or 0)) / Decimal('100'))).quantize(Decimal('0.01'))
                avail_rm = _unit_item_stock(comp, req_obj.mfg_unit, raw_info['raw_item_id'])
                short_rm = max(Decimal('0.00'), r_qty - avail_rm).quantize(Decimal('0.01'))
                if short_rm > 0:
                    r_rate = Decimal(str(raw_info.get('raw_purchase_rate') or 0))
                    dcnt = DepartmentRequest.objects.filter(company=comp).count() + 1
                    rm_req_no = f"REQ-{dcnt:04d}"
                    trading_u = BusinessUnit.objects.filter(company=comp, unit_type='TRADING').first() or req_obj.from_unit
                    DepartmentRequest.objects.create(
                        company=comp,
                        from_unit=req_obj.mfg_unit,
                        to_unit=trading_u,
                        request_no=rm_req_no,
                        posting_date=timezone.now().date(),
                        request_type='MATERIAL_PURCHASE',
                        title=f"Raw Material Shortfall for {req_obj.sales_ref or req_obj.request_no}: {raw_info.get('raw_item_name')} ({short_rm} {raw_info.get('raw_unit', '')})",
                        details=f"Customer: {req_obj.customer_name or '-'} | Needed: {r_qty}, Available in Mfg: {avail_rm}, Shortfall: {short_rm}",
                        line_items=[{
                            'item_id': raw_info['raw_item_id'],
                            'item_code': raw_info.get('raw_item_code', ''),
                            'item_name': raw_info.get('raw_item_name', ''),
                            'qty': float(short_rm),
                            'unit': raw_info.get('raw_unit', 'Nos'),
                            'rate': float(r_rate),
                            'amount': float((short_rm * r_rate).quantize(Decimal('0.01'))),
                        }],
                        amount=(short_rm * r_rate).quantize(Decimal('0.01')),
                        status='OPEN',
                        requested_by=request.headers.get('X-Username') or 'Manufacturing Manager',
                    )
                    snap['rm_purchase_req_no'] = rm_req_no

        snap['delivery_schedule'] = cleaned
        req_obj.mrp_snapshot = snap
        req_obj.inhouse_qty = total_sched
        if req_obj.status == 'PENDING_MFG':
            req_obj.status = 'IN_PRODUCTION'
        req_obj.accepted_by = request.headers.get('X-Username') or req_obj.accepted_by or 'Manufacturing Manager'
        req_obj.save()

        return Response({
            'id': req_obj.id,
            'request_no': req_obj.request_no,
            'status': req_obj.status,
            'delivery_schedule': cleaned,
            'rm_purchase_req_no': rm_req_no,
        })


class ProductionSalesRequestDispatchAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        req_obj = ProductionSalesRequest.objects.filter(company=comp, id=pk).select_related('finished_item', 'mfg_unit', 'from_unit', 'bom').first()
        if not req_obj:
            return Response({'error': 'Order request not found.'}, status=status.HTTP_404_NOT_FOUND)

        batch_id = str(request.data.get('batch_id') or '').strip()
        snap = dict(req_obj.mrp_snapshot or {})
        schedule = list(snap.get('delivery_schedule') or [])

        target_batch = None
        for b in schedule:
            if str(b.get('id')) == batch_id:
                target_batch = b
                break

        if not target_batch:
            return Response({'error': 'Scheduled batch not found.'}, status=status.HTTP_404_NOT_FOUND)
        if target_batch.get('status') == 'DISPATCHED':
            return Response({'error': 'This batch is already dispatched.'}, status=status.HTTP_400_BAD_REQUEST)

        disp_qty = Decimal(str(target_batch.get('qty') or 0)).quantize(Decimal('0.01'))
        disp_date = timezone.now().date()
        trading_u = BusinessUnit.objects.filter(company=comp, unit_type='TRADING').first() or req_obj.from_unit

        import re
        used = set(StockLedgerEntry.objects.filter(company=comp, voucher_type='Stock Transfer').values_list('voucher_no', flat=True))
        for psr in ProductionSalesRequest.objects.filter(company=comp):
            used.update(str(b.get('dispatch_no') or '') for b in ((psr.mrp_snapshot or {}).get('delivery_schedule') or []))
        max_dsp = max([int(m.group(1)) for v in used if (m := re.match(r'^DSP-(\d+)$', v))] or [0])
        custom_challan = (request.data.get('challan_no') or target_batch.get('challan_no') or '').strip()[:40]
        if custom_challan and custom_challan.upper() in {u.upper() for u in used}:
            return Response({'error': f'Challan No {custom_challan} is already used. Enter a different number or leave blank for auto.'}, status=status.HTTP_400_BAD_REQUEST)
        disp_vno = custom_challan or f"DSP-{max_dsp + 1:04d}"

        is_job_work = str(snap.get('order_type') or 'OWN').upper() == 'JOB_WORK'
        raw_info = snap.get('raw_material') or {}
        if not is_job_work and req_obj.mfg_unit and raw_info.get('raw_item_id') and float(raw_info.get('raw_qty') or 0) > 0 and req_obj.requested_qty > 0:
            ratio = disp_qty / Decimal(str(req_obj.requested_qty))
            waste_m = Decimal('1') + (Decimal(str(raw_info.get('raw_wastage') or 0)) / Decimal('100'))
            rm_used = (Decimal(str(raw_info['raw_qty'])) * ratio * waste_m).quantize(Decimal('0.01'))
            rm_item = Item.objects.filter(id=raw_info['raw_item_id']).first()
            if rm_item and rm_used > 0:
                rm_bal = _unit_item_stock(comp, req_obj.mfg_unit, rm_item.id)
                StockLedgerEntry.objects.create(
                    company=comp,
                    unit=req_obj.mfg_unit,
                    posting_date=disp_date,
                    item=rm_item,
                    voucher_type='Material Issue',
                    voucher_no=disp_vno,
                    actual_qty=-rm_used,
                    qty_after_transaction=rm_bal - rm_used,
                    valuation_rate=Decimal(str(raw_info.get('raw_purchase_rate') or rm_item.standard_rate or 0)),
                )
                rm_tot = StockLedgerEntry.objects.filter(company=comp, item=rm_item).aggregate(q=Sum('actual_qty'))['q'] or Decimal('0.00')
                rm_item.current_stock = rm_tot
                rm_item.save(update_fields=['current_stock'])

        unit_cost = Decimal(str(snap.get('cost_rate') or req_obj.finished_item.standard_rate or 0))
        if not is_job_work and req_obj.mfg_unit:
            mfg_bal = _unit_item_stock(comp, req_obj.mfg_unit, req_obj.finished_item_id)
            StockLedgerEntry.objects.create(
                company=comp,
                unit=req_obj.mfg_unit,
                posting_date=disp_date,
                item=req_obj.finished_item,
                voucher_type='Production Receipt',
                voucher_no=disp_vno,
                actual_qty=disp_qty,
                qty_after_transaction=mfg_bal + disp_qty,
                valuation_rate=unit_cost,
            )
            StockLedgerEntry.objects.create(
                company=comp,
                unit=req_obj.mfg_unit,
                posting_date=disp_date,
                item=req_obj.finished_item,
                voucher_type='Stock Transfer',
                voucher_no=disp_vno,
                actual_qty=-disp_qty,
                qty_after_transaction=mfg_bal,
                valuation_rate=unit_cost,
            )

        if not is_job_work:
            trd_bal = _unit_item_stock(comp, trading_u, req_obj.finished_item_id)
            StockLedgerEntry.objects.create(
                company=comp,
                unit=trading_u,
                posting_date=disp_date,
                item=req_obj.finished_item,
                voucher_type='Stock Transfer',
                voucher_no=disp_vno,
                actual_qty=disp_qty,
                qty_after_transaction=trd_bal + disp_qty,
                valuation_rate=unit_cost,
            )

            total_item_stock = StockLedgerEntry.objects.filter(company=comp, item=req_obj.finished_item).aggregate(q=Sum('actual_qty'))['q'] or Decimal('0.00')
            req_obj.finished_item.current_stock = total_item_stock
            req_obj.finished_item.save(update_fields=['current_stock'])

        vehicle_input = (request.data.get('vehicle_no') or target_batch.get('vehicle_no') or '').strip().upper()
        disp_note_input = (request.data.get('dispatch_notes') or target_batch.get('dispatch_notes') or '').strip()
        target_batch['status'] = 'DISPATCHED'
        target_batch['challan_no'] = disp_vno
        target_batch['dispatch_no'] = disp_vno
        target_batch['dispatched_at'] = str(disp_date)
        if vehicle_input:
            target_batch['vehicle_no'] = vehicle_input
        if disp_note_input:
            target_batch['dispatch_notes'] = disp_note_input

        existing_inv_no = (snap.get('existing_invoice_no') or '').strip()
        existing_inv_id = snap.get('existing_invoice_id')
        if existing_inv_no or existing_inv_id:
            target_batch['invoiced'] = True
            target_batch['invoice_no'] = existing_inv_no
            # Rule 55(5): each lot's challan references the invoice; the issued invoice itself is never edited.

        snap['delivery_schedule'] = schedule
        req_obj.mrp_snapshot = snap
        total_disp = sum(Decimal(str(x.get('qty') or 0)) for x in schedule if x.get('status') == 'DISPATCHED')
        req_obj.status = 'COMPLETED' if total_disp >= req_obj.requested_qty else 'IN_PRODUCTION'
        req_obj.save()

        return Response({
            'id': req_obj.id,
            'dispatch_no': disp_vno,
            'dispatched_qty': float(disp_qty),
            'status': req_obj.status,
            'delivery_schedule': schedule,
        })


class ProductionSalesRequestCreateInvoiceAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        req_obj = ProductionSalesRequest.objects.filter(company=comp, id=pk).select_related('finished_item', 'from_unit').first()
        if not req_obj:
            return Response({'error': 'Order request not found.'}, status=status.HTTP_404_NOT_FOUND)

        batch_id = str(request.data.get('batch_id') or '').strip()
        snap = dict(req_obj.mrp_snapshot or {})
        schedule = list(snap.get('delivery_schedule') or [])

        target_batch = None
        for b in schedule:
            if str(b.get('id')) == batch_id:
                target_batch = b
                break

        if not target_batch:
            return Response({'error': 'Dispatch batch not found.'}, status=status.HTTP_404_NOT_FOUND)
        if target_batch.get('status') != 'DISPATCHED':
            return Response({'error': 'Batch must be dispatched by Manufacturing before creating invoice.'}, status=status.HTTP_400_BAD_REQUEST)
        if target_batch.get('invoiced'):
            return Response({'error': f"Already invoiced under {target_batch.get('invoice_no')}."}, status=status.HTTP_400_BAD_REQUEST)

        qty = Decimal(str(target_batch.get('qty') or 0)).quantize(Decimal('0.01'))
        rate = Decimal(str(snap.get('selling_rate') or req_obj.finished_item.selling_rate or req_obj.finished_item.standard_rate or 0)).quantize(Decimal('0.01'))
        gst_rate = Decimal(str(req_obj.finished_item.gst_rate if req_obj.finished_item.gst_rate is not None else 18)).quantize(Decimal('0.01'))

        net_total = (qty * rate).quantize(Decimal('0.01'))
        tax_amount = ((net_total * gst_rate) / Decimal('100.00')).quantize(Decimal('0.01'))
        grand_total = (net_total + tax_amount).quantize(Decimal('0.01'))

        comp = req_obj.company or comp
        trading_u = BusinessUnit.objects.filter(company=comp, unit_type='TRADING').first() or req_obj.from_unit
        cust_obj = None
        if req_obj.customer_name:
            cust_obj, _ = Customer.objects.get_or_create(company=comp, customer_name=req_obj.customer_name)

        cnt = SalesInvoice.objects.filter(company=comp).exclude(invoice_number__istartswith='PI-').count() + 1
        inv_no = f"INV-{cnt:04d}"
        while SalesInvoice.objects.filter(company=comp, invoice_number=inv_no).exists():
            cnt += 1
            inv_no = f"INV-{cnt:04d}"

        p_date = timezone.now().date()
        due_date = p_date + timezone.timedelta(days=30)

        is_jw = str(snap.get('order_type') or 'OWN').upper() == 'JOB_WORK'
        inv = SalesInvoice.objects.create(
            company=comp,
            unit=trading_u,
            customer=cust_obj,
            customer_name=req_obj.customer_name or 'Customer',
            invoice_type='JOB_WORK' if is_jw else 'SALES',
            party_challan_no=(snap.get('party_challan_no') or '').strip()[:80],
            invoice_number=inv_no,
            posting_date=p_date,
            due_date=due_date,
            tax_rate=gst_rate,
            net_total=net_total,
            tax_amount=tax_amount,
            adjustment=Decimal('0.00'),
            grand_total=grand_total,
            status='Draft',
        )
        SalesInvoiceItem.objects.create(
            invoice=inv,
            item=req_obj.finished_item,
            description=f"{req_obj.finished_item.item_name} (HSN: {req_obj.finished_item.hsn_code or '-'} | Order: {req_obj.sales_ref} | Challan: {target_batch.get('dispatch_no')})",
            quantity=qty,
            rate=rate,
            discount_percentage=Decimal('0.00'),
            discount_amount=Decimal('0.00'),
            is_foc=False,
            amount=net_total,
            hsn_code='9988' if is_jw else (req_obj.finished_item.hsn_code or ''),
        )

        target_batch['invoiced'] = True
        target_batch['invoice_no'] = inv_no
        snap['delivery_schedule'] = schedule
        req_obj.mrp_snapshot = snap
        req_obj.save(update_fields=['mrp_snapshot'])

        pi_id = snap.get('proforma_invoice_id')
        pi_no = (snap.get('proforma_invoice_no') or '').strip()
        if pi_id or pi_no:
            pi_obj = SalesInvoice.objects.filter(company=comp, id=pi_id).first() if pi_id else SalesInvoice.objects.filter(company=comp, invoice_number__iexact=pi_no).first()
            if pi_obj and str(pi_obj.invoice_number or '').upper().startswith('PI-'):
                pi_obj.status = 'Rejected'
                pi_obj.rejection_reason = f'Converted to Tax Invoice {inv_no}'
                pi_obj.save(update_fields=['status', 'rejection_reason'])

        inv_payload = {
            'id': inv.id,
            'invoice_number': inv.invoice_number,
            'customer': inv.customer_id,
            'customer_name': inv.customer_name,
            'posting_date': str(inv.posting_date),
            'due_date': str(inv.due_date) if inv.due_date else '',
            'tax_rate': str(inv.tax_rate),
            'net_total': str(inv.net_total),
            'tax_amount': str(inv.tax_amount),
            'adjustment': str(inv.adjustment),
            'grand_total': str(inv.grand_total),
            'status': inv.status,
            'created_by_name': 'Sales Team',
            'approved_by_name': '',
            'items': [
                {
                    'item': req_obj.finished_item_id,
                    'item_name': req_obj.finished_item.item_name,
                    'hsn_code': req_obj.finished_item.hsn_code,
                    'unit': req_obj.finished_item.unit,
                    'description': f"{req_obj.finished_item.item_name} (Order: {req_obj.sales_ref})",
                    'quantity': str(qty),
                    'rate': str(rate),
                    'discount_percentage': '0.00',
                    'discount_amount': '0.00',
                    'is_foc': False,
                    'amount': str(net_total),
                }
            ],
        }
        return Response({
            'invoice_id': inv.id,
            'invoice_number': inv.invoice_number,
            'grand_total': float(grand_total),
            'invoice': inv_payload,
            'delivery_schedule': schedule,
        }, status=status.HTTP_201_CREATED)


class ProductionSalesRequestAcceptPlanAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        req_obj = ProductionSalesRequest.objects.filter(company=comp, id=pk).first()
        if not req_obj:
            return Response({'error': 'Production request not found.'}, status=status.HTTP_404_NOT_FOUND)
        req_obj.status = 'ACCEPTED_SPLIT'
        req_obj.save(update_fields=['status'])
        return Response({'id': req_obj.id, 'request_no': req_obj.request_no, 'status': req_obj.status})
