from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from django.db import transaction
from django.db.models import ProtectedError
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from accounts.models import Company, UserProfile, GLEntry
from stock.models import Item, StockLedgerEntry
from .models import BillOfMaterial, BOMComponent, ProductionOrder, ProductionConsumption

User = get_user_model()

def _to_dec(val, places='0.01'):
    try:
        return Decimal(str(val or 0)).quantize(Decimal(places), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal(places)

def _get_company(request):
    cid = request.headers.get('X-Company-ID') or request.GET.get('company_id')
    if not cid and isinstance(request.data, dict):
        cid = request.data.get('company_id') or request.data.get('company')
    if cid and str(cid).isdigit():
        c = Company.objects.filter(id=int(cid)).first()
        if c:
            return c
    return Company.objects.first()

def _get_actor(request):
    u = getattr(request, 'user', None) if getattr(request, 'user', None) and request.user.is_authenticated else None
    if not u:
        uid = request.headers.get('X-User-ID') or request.GET.get('user_id')
        uname = request.headers.get('X-Username') or request.GET.get('username')
        if uid and str(uid).isdigit():
            u = User.objects.filter(id=int(uid)).first()
        elif uname:
            u = User.objects.filter(username__iexact=uname).first()
    if not u:
        return ('Admin', 'ADMIN')
    prof = UserProfile.objects.filter(user=u).first()
    role = 'ADMIN' if (u.is_superuser or u.is_staff) else (prof.role.upper() if prof and prof.role else 'SALES_USER')
    return (u.username, role)

def _serialize_bom(bom):
    comps = []
    raw_cost = Decimal('0.00')
    max_batches = None
    for c in bom.components.select_related('raw_item').all():
        mult = Decimal('1.00') + (Decimal(c.wastage_percent) / Decimal('100'))
        eff_qty = (Decimal(c.qty_required) * mult).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
        rate = Decimal(c.raw_item.standard_rate or 0)
        line_cost = (eff_qty * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        raw_cost += line_cost
        avail = Decimal(c.raw_item.current_stock or 0)
        if eff_qty > 0:
            batches = int(avail // eff_qty)
            max_batches = batches if max_batches is None else min(max_batches, batches)
        comps.append({
            'id': c.id,
            'raw_item': c.raw_item.id,
            'raw_item_name': c.raw_item.item_name,
            'raw_item_code': c.raw_item.item_code,
            'unit': c.raw_item.unit,
            'available_stock': float(avail),
            'rate': float(rate),
            'qty_required': float(c.qty_required),
            'wastage_percent': float(c.wastage_percent),
            'effective_qty': float(eff_qty),
            'line_cost': float(line_cost),
        })
    total_batch_cost = raw_cost + Decimal(bom.labor_cost) + Decimal(bom.overhead_cost)
    out_qty = Decimal(bom.output_qty) if Decimal(bom.output_qty) > 0 else Decimal('1.00')
    unit_cost = (total_batch_cost / out_qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    max_qty = float(Decimal(max_batches or 0) * out_qty)
    return {
        'id': bom.id,
        'bom_code': bom.bom_code,
        'name': bom.name,
        'finished_item': bom.finished_item.id,
        'finished_item_name': bom.finished_item.item_name,
        'finished_item_code': bom.finished_item.item_code,
        'finished_item_unit': bom.finished_item.unit,
        'finished_item_stock': float(bom.finished_item.current_stock or 0),
        'output_qty': float(bom.output_qty),
        'labor_cost': float(bom.labor_cost),
        'overhead_cost': float(bom.overhead_cost),
        'raw_material_cost': float(raw_cost),
        'total_batch_cost': float(total_batch_cost),
        'unit_cost': float(unit_cost),
        'max_producible_qty': max_qty,
        'notes': bom.notes,
        'is_active': bom.is_active,
        'components': comps,
    }

def _serialize_order(order, include_vouchers=True):
    cons = []
    for c in order.consumptions.select_related('raw_item').all():
        cons.append({
            'id': c.id,
            'raw_item': c.raw_item.id,
            'raw_item_name': c.raw_item.item_name,
            'unit': c.raw_item.unit,
            'available_stock': float(c.raw_item.current_stock or 0),
            'planned_qty': float(c.planned_qty),
            'actual_qty': float(c.actual_qty),
            'rate': float(c.rate),
            'amount': float(c.amount),
        })
    stock_entries = []
    gl_entries = []
    if include_vouchers:
        for s in StockLedgerEntry.objects.filter(company=order.company, voucher_no=order.voucher_no).select_related('item').order_by('id'):
            stock_entries.append({
                'id': s.id,
                'posting_date': str(s.posting_date),
                'item_name': s.item.item_name,
                'unit': s.item.unit,
                'voucher_type': s.voucher_type,
                'actual_qty': float(s.actual_qty),
                'qty_after_transaction': float(s.qty_after_transaction),
                'valuation_rate': float(s.valuation_rate),
            })
        for g in GLEntry.objects.filter(company=order.company, voucher_no=order.voucher_no).order_by('id'):
            gl_entries.append({
                'id': g.id,
                'posting_date': str(g.posting_date),
                'account': g.account,
                'voucher_type': g.voucher_type,
                'against': g.against or '',
                'debit': float(g.debit),
                'credit': float(g.credit),
                'remarks': g.remarks or '',
            })
    return {
        'id': order.id,
        'voucher_no': order.voucher_no,
        'posting_date': str(order.posting_date),
        'bom': order.bom.id,
        'bom_code': order.bom.bom_code,
        'bom_name': order.bom.name,
        'finished_item': order.finished_item.id,
        'finished_item_name': order.finished_item.item_name,
        'finished_item_unit': order.finished_item.unit,
        'planned_qty': float(order.planned_qty),
        'actual_qty': float(order.actual_qty),
        'scrap_item': order.scrap_item.id if order.scrap_item else None,
        'scrap_item_name': order.scrap_item.item_name if order.scrap_item else '',
        'scrap_item_unit': order.scrap_item.unit if order.scrap_item else '',
        'scrap_qty': float(order.scrap_qty),
        'scrap_value': float(order.scrap_value),
        'labor_cost': float(order.labor_cost),
        'overhead_cost': float(order.overhead_cost),
        'total_raw_cost': float(order.total_raw_cost),
        'net_production_cost': float(order.net_production_cost),
        'unit_cost': float(order.unit_cost),
        'status': order.status,
        'remarks': order.remarks,
        'created_by': order.created_by,
        'approved_by': order.approved_by,
        'consumptions': cons,
        'stock_entries': stock_entries,
        'gl_entries': gl_entries,
    }

def _post_production(order, approver):
    if order.status == 'APPROVED':
        return
    lines = list(order.consumptions.select_related('raw_item').all())
    req_by_item = {}
    for line in lines:
        req_by_item[line.raw_item_id] = req_by_item.get(line.raw_item_id, Decimal('0.000')) + Decimal(line.actual_qty)
    for item_id, total_req in req_by_item.items():
        fresh_it = Item.objects.get(pk=item_id)
        avail = Decimal(fresh_it.current_stock or 0)
        if avail < total_req:
            raise ValueError(f'Insufficient stock for {fresh_it.item_name}: Available {avail} {fresh_it.unit}, Required {total_req} {fresh_it.unit}')
    for line in lines:
        it = Item.objects.get(pk=line.raw_item_id)
        it.current_stock = Decimal(it.current_stock or 0) - Decimal(line.actual_qty)
        it.save(update_fields=['current_stock'])
        StockLedgerEntry.objects.create(
            company=order.company,
            posting_date=order.posting_date,
            item=it,
            voucher_type='Manufacturing Consumption',
            voucher_no=order.voucher_no,
            actual_qty=-Decimal(line.actual_qty),
            qty_after_transaction=it.current_stock,
            valuation_rate=line.rate,
        )
    if order.scrap_item_id and Decimal(order.scrap_qty) > 0:
        sc = Item.objects.get(pk=order.scrap_item_id)
        sc_rate = (Decimal(order.scrap_value) / Decimal(order.scrap_qty)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        sc.current_stock = Decimal(sc.current_stock or 0) + Decimal(order.scrap_qty)
        sc.save(update_fields=['current_stock'])
        StockLedgerEntry.objects.create(
            company=order.company,
            posting_date=order.posting_date,
            item=sc,
            voucher_type='Manufacturing Scrap',
            voucher_no=order.voucher_no,
            actual_qty=Decimal(order.scrap_qty),
            qty_after_transaction=sc.current_stock,
            valuation_rate=sc_rate,
        )
    fg = Item.objects.get(pk=order.finished_item_id)
    old_stock = Decimal(fg.current_stock or 0)
    old_rate = Decimal(fg.standard_rate or 0)
    new_qty = old_stock + Decimal(order.actual_qty)
    if new_qty > 0 and Decimal(order.net_production_cost) > 0:
        old_val = max(Decimal('0.00'), old_stock) * old_rate
        fg.standard_rate = ((old_val + Decimal(order.net_production_cost)) / new_qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    fg.current_stock = new_qty
    fg.save(update_fields=['current_stock', 'standard_rate'])
    StockLedgerEntry.objects.create(
        company=order.company,
        posting_date=order.posting_date,
        item=fg,
        voucher_type='Manufacturing Output',
        voucher_no=order.voucher_no,
        actual_qty=Decimal(order.actual_qty),
        qty_after_transaction=fg.current_stock,
        valuation_rate=order.unit_cost,
    )
    raw_net = Decimal(order.total_raw_cost) - Decimal(order.scrap_value)
    if raw_net > 0:
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Finished Goods Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Raw Material Inventory', debit=raw_net, credit=Decimal('0.00'), remarks=f'Production {order.voucher_no} - {fg.item_name}')
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Raw Material Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Finished Goods Inventory', debit=Decimal('0.00'), credit=raw_net, remarks=f'Raw Material Consumed - {order.voucher_no}')
    if Decimal(order.scrap_value) > 0:
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Scrap Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Raw Material Inventory', debit=order.scrap_value, credit=Decimal('0.00'), remarks=f'Scrap Recovered - {order.voucher_no}')
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Raw Material Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Scrap Inventory', debit=Decimal('0.00'), credit=order.scrap_value, remarks=f'Scrap Credit - {order.voucher_no}')
    if Decimal(order.labor_cost) > 0:
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Finished Goods Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Direct Labour Payable', debit=order.labor_cost, credit=Decimal('0.00'), remarks=f'Direct Labour - {order.voucher_no}')
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Direct Labour Payable', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Finished Goods Inventory', debit=Decimal('0.00'), credit=order.labor_cost, remarks=f'Direct Labour - {order.voucher_no}')
    if Decimal(order.overhead_cost) > 0:
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Finished Goods Inventory', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Manufacturing Overheads', debit=order.overhead_cost, credit=Decimal('0.00'), remarks=f'Factory Overheads - {order.voucher_no}')
        GLEntry.objects.create(company=order.company, posting_date=order.posting_date, account='Manufacturing Overheads', voucher_type='Manufacturing', voucher_no=order.voucher_no, against='Finished Goods Inventory', debit=Decimal('0.00'), credit=order.overhead_cost, remarks=f'Factory Overheads - {order.voucher_no}')
    order.status = 'APPROVED'
    order.approved_by = approver
    order.save(update_fields=['status', 'approved_by'])

def _reverse_production(order):
    if order.status != 'APPROVED':
        return
    for line in order.consumptions.all():
        it = Item.objects.get(pk=line.raw_item_id)
        it.current_stock = Decimal(it.current_stock or 0) + Decimal(line.actual_qty)
        it.save(update_fields=['current_stock'])
    if order.scrap_item_id and Decimal(order.scrap_qty) > 0:
        sc = Item.objects.get(pk=order.scrap_item_id)
        sc.current_stock = max(Decimal('0.00'), Decimal(sc.current_stock or 0) - Decimal(order.scrap_qty))
        sc.save(update_fields=['current_stock'])
    fg = Item.objects.get(pk=order.finished_item_id)
    fg.current_stock = max(Decimal('0.00'), Decimal(fg.current_stock or 0) - Decimal(order.actual_qty))
    fg.save(update_fields=['current_stock'])
    StockLedgerEntry.objects.filter(company=order.company, voucher_no=order.voucher_no, voucher_type__startswith='Manufacturing').delete()
    GLEntry.objects.filter(company=order.company, voucher_no=order.voucher_no, voucher_type='Manufacturing').delete()
    order.status = 'PENDING'
    order.approved_by = ''
    order.save(update_fields=['status', 'approved_by'])

def _apply_order_lines(order, bom, data):
    actual_qty = Decimal(order.actual_qty)
    out_qty = Decimal(bom.output_qty) if Decimal(bom.output_qty) > 0 else Decimal('1.00')
    mult = actual_qty / out_qty
    order.consumptions.all().delete()
    custom_cons = data.get('consumptions')
    raw_total = Decimal('0.00')
    if isinstance(custom_cons, list) and len(custom_cons) > 0:
        for cl in custom_cons:
            rit = Item.objects.filter(id=cl.get('raw_item')).first()
            aq = _to_dec(cl.get('actual_qty') or 0, '0.001')
            pq = _to_dec(cl.get('planned_qty') or aq, '0.001')
            if rit and aq > 0:
                rt = Decimal(rit.standard_rate or 0)
                amt = (aq * rt).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                raw_total += amt
                ProductionConsumption.objects.create(production_order=order, raw_item=rit, planned_qty=pq, actual_qty=aq, rate=rt, amount=amt)
    else:
        for c in bom.components.all():
            w_mult = Decimal('1.00') + (Decimal(c.wastage_percent) / Decimal('100'))
            aq = (Decimal(c.qty_required) * w_mult * mult).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
            rt = Decimal(c.raw_item.standard_rate or 0)
            amt = (aq * rt).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            raw_total += amt
            ProductionConsumption.objects.create(production_order=order, raw_item=c.raw_item, planned_qty=aq, actual_qty=aq, rate=rt, amount=amt)
    net_cost = max(Decimal('0.00'), raw_total + Decimal(order.labor_cost) + Decimal(order.overhead_cost) - Decimal(order.scrap_value))
    u_cost = (net_cost / actual_qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    order.total_raw_cost = raw_total
    order.net_production_cost = net_cost
    order.unit_cost = u_cost
    order.save(update_fields=['total_raw_cost', 'net_production_cost', 'unit_cost'])

class BOMListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        company = _get_company(request)
        if not company:
            return Response({'boms': []})
        boms = BillOfMaterial.objects.filter(company=company, is_active=True).select_related('finished_item').prefetch_related('components__raw_item')
        return Response({'boms': [_serialize_bom(b) for b in boms]})

    def post(self, request):
        company = _get_company(request)
        if not company:
            return Response({'error': 'Company not found'}, status=400)
        data = request.data
        finished_id = data.get('finished_item')
        comps = data.get('components') or []
        if not finished_id or not comps:
            return Response({'error': 'Finished item and at least one raw material component are required.'}, status=400)
        fg = Item.objects.filter(id=finished_id).first()
        if not fg:
            return Response({'error': 'Invalid finished item.'}, status=400)
        code = (data.get('bom_code') or '').strip()
        if not code:
            cnt = BillOfMaterial.objects.filter(company=company).count() + 1
            code = f'BOM-{cnt:03d}'
        with transaction.atomic():
            bom = BillOfMaterial.objects.create(
                company=company,
                bom_code=code,
                name=(data.get('name') or f'{fg.item_name} Recipe').strip(),
                finished_item=fg,
                output_qty=_to_dec(data.get('output_qty') or 1, '0.01'),
                labor_cost=_to_dec(data.get('labor_cost') or 0, '0.01'),
                overhead_cost=_to_dec(data.get('overhead_cost') or 0, '0.01'),
                notes=(data.get('notes') or '').strip(),
            )
            for c in comps:
                raw_it = Item.objects.filter(id=c.get('raw_item')).first()
                qty_req = _to_dec(c.get('qty_required') or 0, '0.001')
                if raw_it and qty_req > 0:
                    BOMComponent.objects.create(
                        bom=bom,
                        raw_item=raw_it,
                        qty_required=qty_req,
                        wastage_percent=_to_dec(c.get('wastage_percent') or 0, '0.01'),
                    )
        return Response(_serialize_bom(bom), status=201)

class BOMDetailView(APIView):
    permission_classes = [AllowAny]

    def put(self, request, pk):
        bom = BillOfMaterial.objects.filter(id=pk).first()
        if not bom:
            return Response({'error': 'BOM not found'}, status=404)
        data = request.data
        with transaction.atomic():
            if data.get('finished_item'):
                fg = Item.objects.filter(id=data['finished_item']).first()
                if fg:
                    bom.finished_item = fg
            if data.get('bom_code'):
                bom.bom_code = data['bom_code'].strip()
            if data.get('name'):
                bom.name = data['name'].strip()
            if data.get('output_qty'):
                bom.output_qty = _to_dec(data['output_qty'], '0.01')
            if 'labor_cost' in data:
                bom.labor_cost = _to_dec(data['labor_cost'], '0.01')
            if 'overhead_cost' in data:
                bom.overhead_cost = _to_dec(data['overhead_cost'], '0.01')
            if 'notes' in data:
                bom.notes = (data['notes'] or '').strip()
            bom.save()
            if isinstance(data.get('components'), list) and len(data['components']) > 0:
                bom.components.all().delete()
                for c in data['components']:
                    raw_it = Item.objects.filter(id=c.get('raw_item')).first()
                    qty_req = _to_dec(c.get('qty_required') or 0, '0.001')
                    if raw_it and qty_req > 0:
                        BOMComponent.objects.create(
                            bom=bom,
                            raw_item=raw_it,
                            qty_required=qty_req,
                            wastage_percent=_to_dec(c.get('wastage_percent') or 0, '0.01'),
                        )
        return Response(_serialize_bom(bom))

    def delete(self, request, pk):
        bom = BillOfMaterial.objects.filter(id=pk).first()
        if not bom:
            return Response({'error': 'BOM not found'}, status=404)
        try:
            bom.delete()
        except ProtectedError:
            bom.is_active = False
            bom.save(update_fields=['is_active'])
        return Response({'deleted': True})

class MRPCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        bom_id = request.GET.get('bom_id')
        qty = _to_dec(request.GET.get('qty') or 1, '0.01')
        bom = BillOfMaterial.objects.filter(id=bom_id).select_related('finished_item').prefetch_related('components__raw_item').first()
        if not bom:
            return Response({'error': 'BOM not found'}, status=404)
        out_qty = Decimal(bom.output_qty) if Decimal(bom.output_qty) > 0 else Decimal('1.00')
        mult = qty / out_qty
        items = []
        raw_total = Decimal('0.00')
        can_produce = True
        for c in bom.components.all():
            w_mult = Decimal('1.00') + (Decimal(c.wastage_percent) / Decimal('100'))
            req = (Decimal(c.qty_required) * w_mult * mult).quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)
            avail = Decimal(c.raw_item.current_stock or 0)
            shortage = max(Decimal('0.000'), req - avail)
            if shortage > 0:
                can_produce = False
            rate = Decimal(c.raw_item.standard_rate or 0)
            cost = (req * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            raw_total += cost
            items.append({
                'raw_item': c.raw_item.id,
                'raw_item_name': c.raw_item.item_name,
                'unit': c.raw_item.unit,
                'required_qty': float(req),
                'available_stock': float(avail),
                'shortage_qty': float(shortage),
                'rate': float(rate),
                'estimated_cost': float(cost),
            })
        est_labor = (Decimal(bom.labor_cost) * mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        est_oh = (Decimal(bom.overhead_cost) * mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total_est = raw_total + est_labor + est_oh
        unit_est = (total_est / qty).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if qty > 0 else Decimal('0.00')
        return Response({
            'bom_id': bom.id,
            'target_qty': float(qty),
            'can_produce': can_produce,
            'estimated_raw_cost': float(raw_total),
            'estimated_labor_cost': float(est_labor),
            'estimated_overhead_cost': float(est_oh),
            'total_estimated_cost': float(total_est),
            'estimated_unit_cost': float(unit_est),
            'materials': items,
        })

class ProductionOrderListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        company = _get_company(request)
        if not company:
            return Response({'orders': [], 'summary': {}})
        qs = ProductionOrder.objects.filter(company=company).select_related('bom', 'finished_item', 'scrap_item').prefetch_related('consumptions__raw_item')
        orders = [_serialize_order(o, include_vouchers=True) for o in qs]
        approved = [o for o in orders if o['status'] == 'APPROVED']
        summary = {
            'total_orders': len(orders),
            'pending_orders': sum(1 for o in orders if o['status'] == 'PENDING'),
            'approved_orders': len(approved),
            'total_units_produced': round(sum(o['actual_qty'] for o in approved), 2),
            'total_production_value': round(sum(o['net_production_cost'] for o in approved), 2),
        }
        return Response({'orders': orders, 'summary': summary})

    def post(self, request):
        company = _get_company(request)
        if not company:
            return Response({'error': 'Company not found'}, status=400)
        username, role = _get_actor(request)
        data = request.data
        bom = BillOfMaterial.objects.filter(id=data.get('bom')).select_related('finished_item').prefetch_related('components__raw_item').first()
        if not bom:
            return Response({'error': 'Valid Bill of Material (BOM) is required.'}, status=400)
        planned_qty = _to_dec(data.get('planned_qty') or bom.output_qty, '0.01')
        actual_qty = _to_dec(data.get('actual_qty') or planned_qty, '0.01')
        if actual_qty <= 0:
            return Response({'error': 'Produced quantity must be greater than zero.'}, status=400)
        vno = (data.get('voucher_no') or '').strip()
        if not vno:
            cnt = ProductionOrder.objects.filter(company=company).count() + 1
            vno = f'MFG-{cnt:04d}'
        pdate = data.get('posting_date') or str(date.today())
        scrap_it = Item.objects.filter(id=data.get('scrap_item')).first() if data.get('scrap_item') else None
        scrap_qty = _to_dec(data.get('scrap_qty') or 0, '0.01') if scrap_it else Decimal('0.00')
        scrap_val = _to_dec(data.get('scrap_value') or 0, '0.01') if scrap_it else Decimal('0.00')
        out_qty = Decimal(bom.output_qty) if Decimal(bom.output_qty) > 0 else Decimal('1.00')
        mult = actual_qty / out_qty
        labor_cost = _to_dec(data.get('labor_cost'), '0.01') if 'labor_cost' in data else (Decimal(bom.labor_cost) * mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        overhead_cost = _to_dec(data.get('overhead_cost'), '0.01') if 'overhead_cost' in data else (Decimal(bom.overhead_cost) * mult).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        try:
            with transaction.atomic():
                order = ProductionOrder.objects.create(
                    company=company,
                    voucher_no=vno,
                    posting_date=pdate,
                    bom=bom,
                    finished_item=bom.finished_item,
                    planned_qty=planned_qty,
                    actual_qty=actual_qty,
                    scrap_item=scrap_it,
                    scrap_qty=scrap_qty,
                    scrap_value=scrap_val,
                    labor_cost=labor_cost,
                    overhead_cost=overhead_cost,
                    status='PENDING',
                    remarks=(data.get('remarks') or '').strip(),
                    created_by=username,
                )
                _apply_order_lines(order, bom, data)
                if role in ('ADMIN', 'MANAGER') and bool(data.get('auto_approve', False)):
                    _post_production(order, username)
        except ValueError as ve:
            return Response({'error': str(ve)}, status=400)
        return Response(_serialize_order(order, include_vouchers=True), status=201)

class ProductionOrderDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        order = ProductionOrder.objects.filter(id=pk).select_related('bom', 'finished_item', 'scrap_item').prefetch_related('consumptions__raw_item').first()
        if not order:
            return Response({'error': 'Production Order not found.'}, status=404)
        return Response(_serialize_order(order, include_vouchers=True))

    def put(self, request, pk):
        username, role = _get_actor(request)
        order = ProductionOrder.objects.filter(id=pk).select_related('bom', 'finished_item', 'scrap_item').first()
        if not order:
            return Response({'error': 'Production Order not found.'}, status=404)
        if order.status == 'APPROVED':
            return Response({'error': 'Reopen this approved order first before editing.'}, status=400)
        data = request.data
        bom = order.bom
        if data.get('bom'):
            new_bom = BillOfMaterial.objects.filter(id=data.get('bom')).select_related('finished_item').prefetch_related('components__raw_item').first()
            if new_bom:
                bom = new_bom
                order.bom = bom
                order.finished_item = bom.finished_item
        if data.get('posting_date'):
            order.posting_date = data['posting_date']
        if data.get('planned_qty'):
            order.planned_qty = _to_dec(data['planned_qty'], '0.01')
        if data.get('actual_qty'):
            order.actual_qty = _to_dec(data['actual_qty'], '0.01')
        if 'labor_cost' in data:
            order.labor_cost = _to_dec(data['labor_cost'], '0.01')
        if 'overhead_cost' in data:
            order.overhead_cost = _to_dec(data['overhead_cost'], '0.01')
        if 'scrap_item' in data:
            scrap_it = Item.objects.filter(id=data.get('scrap_item')).first() if data.get('scrap_item') else None
            order.scrap_item = scrap_it
            order.scrap_qty = _to_dec(data.get('scrap_qty') or 0, '0.01') if scrap_it else Decimal('0.00')
            order.scrap_value = _to_dec(data.get('scrap_value') or 0, '0.01') if scrap_it else Decimal('0.00')
        if 'remarks' in data:
            order.remarks = (data.get('remarks') or '').strip()
        order.status = 'PENDING'
        try:
            with transaction.atomic():
                order.save()
                _apply_order_lines(order, bom, data)
                if role in ('ADMIN', 'MANAGER') and bool(data.get('auto_approve', False)):
                    _post_production(order, username)
        except ValueError as ve:
            return Response({'error': str(ve)}, status=400)
        return Response(_serialize_order(order, include_vouchers=True))

class ProductionOrderApproveView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        username, role = _get_actor(request)
        if role not in ('ADMIN', 'MANAGER'):
            return Response({'error': 'Only Admin or Manager can approve Production Orders.'}, status=403)
        order = ProductionOrder.objects.filter(id=pk).first()
        if not order:
            return Response({'error': 'Production Order not found.'}, status=404)
        try:
            with transaction.atomic():
                _post_production(order, username)
        except ValueError as ve:
            return Response({'error': str(ve)}, status=400)
        return Response(_serialize_order(order, include_vouchers=True))

class ProductionOrderReopenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        username, role = _get_actor(request)
        if role not in ('ADMIN', 'MANAGER'):
            return Response({'error': 'Only Admin or Manager can reopen Production Orders.'}, status=403)
        order = ProductionOrder.objects.filter(id=pk).first()
        if not order:
            return Response({'error': 'Production Order not found.'}, status=404)
        with transaction.atomic():
            _reverse_production(order)
        return Response(_serialize_order(order, include_vouchers=True))

class ProductionOrderCancelView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        order = ProductionOrder.objects.filter(id=pk).first()
        if not order:
            return Response({'error': 'Production Order not found.'}, status=404)
        if order.status == 'APPROVED':
            return Response({'error': 'Approved production orders cannot be cancelled directly. Reopen first.'}, status=400)
        order.status = 'CANCELLED'
        order.save(update_fields=['status'])
        return Response(_serialize_order(order, include_vouchers=True))
