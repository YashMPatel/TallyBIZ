from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from .models import (
    Company, BusinessUnit, ensure_default_units,
    GLEntry, PaymentEntry, UnitPettyCashTransaction, DepartmentRequest
)
from .views import get_active_company, resolve_active_unit


class UnitPettyCashAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'transactions': [], 'unit_balances': [], 'total_balance': 0})
        ensure_default_units(comp)
        u = resolve_active_unit(request, comp)

        qs = UnitPettyCashTransaction.objects.filter(company=comp).select_related('unit')
        if u and u.unit_type != 'HO':
            qs = qs.filter(unit=u)

        txns = [
            {
                'id': t.id,
                'voucher_no': t.voucher_no,
                'posting_date': str(t.posting_date),
                'unit_id': t.unit_id,
                'unit_name': t.unit.name if t.unit else '',
                'unit_type': t.unit.unit_type if t.unit else '',
                'txn_type': t.txn_type,
                'party_or_payee': t.party_or_payee,
                'expense_head': t.expense_head,
                'amount': float(t.amount),
                'signed_amount': float(-t.amount if t.txn_type == 'COUNTER_EXPENSE' else t.amount),
                'description': t.description,
                'created_by': t.created_by,
                'sent_to_ho': t.sent_to_ho,
            }
            for t in qs.order_by('-posting_date', '-id')[:200]
        ]

        unit_balances = []
        total_bal = Decimal('0.00')
        for bu in BusinessUnit.objects.filter(company=comp, is_active=True).order_by('id'):
            u_txns = UnitPettyCashTransaction.objects.filter(company=comp, unit=bu)
            credits = u_txns.filter(txn_type__in=['HO_ALLOCATION', 'SCRAP_INCOME']).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            debits = u_txns.filter(txn_type='COUNTER_EXPENSE').aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            bal = credits - debits
            total_bal += bal
            unit_balances.append({
                'unit_id': bu.id,
                'code': bu.code,
                'name': bu.name,
                'unit_type': bu.unit_type,
                'total_credited': float(credits),
                'total_spent': float(debits),
                'credit_balance': float(bal),
            })

        return Response({
            'transactions': txns,
            'unit_balances': unit_balances,
            'total_balance': float(total_bal),
        })

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)

        data = request.data
        txn_type = (data.get('txn_type') or 'COUNTER_EXPENSE').strip()
        amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        if amt <= 0:
            return Response({'error': 'Amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        target_unit_id = data.get('unit_id')
        unit_obj = BusinessUnit.objects.filter(company=comp, id=target_unit_id).first() if target_unit_id else resolve_active_unit(request, comp, default_unit_type='MANUFACTURING')
        if not unit_obj:
            unit_obj = BusinessUnit.objects.filter(company=comp, is_active=True).first()

        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first() or unit_obj
        p_date = data.get('posting_date') or timezone.now().date()
        payee = (data.get('party_or_payee') or '').strip()
        head = (data.get('expense_head') or ('Scrap Cash Income' if txn_type == 'SCRAP_INCOME' else 'Daily Unit Expense')).strip()
        desc = (data.get('description') or '').strip()
        created_by = (data.get('created_by') or request.headers.get('X-Username') or 'Staff').strip()

        prefix = 'PCR' if txn_type == 'COUNTER_EXPENSE' else ('SCR' if txn_type == 'SCRAP_INCOME' else 'PCA')
        cnt = UnitPettyCashTransaction.objects.filter(company=comp, voucher_no__startswith=prefix).count() + 1
        vno = f"{prefix}-{cnt:04d}"

        txn = UnitPettyCashTransaction.objects.create(
            company=comp,
            unit=unit_obj,
            voucher_no=vno,
            posting_date=p_date,
            txn_type=txn_type,
            party_or_payee=payee,
            expense_head=head,
            amount=amt,
            description=desc,
            created_by=created_by,
            sent_to_ho=True,
        )

        # Double-Entry GL Posting (Strictly Division-Attributed)
        if txn_type == 'HO_ALLOCATION':
            # Head Office allocates Petty Cash Credit to Unit
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account='Inter-Division Receivable', party_type='Division', party=unit_obj.name,
                voucher_type='Petty Cash Allocation', voucher_no=vno,
                against='Bank Account', debit=amt, credit=Decimal('0.00'),
                remarks=f"Petty Cash Credit allocated to {unit_obj.name}: {desc}"
            )
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account='Bank Account', party_type=None, party=None,
                voucher_type='Petty Cash Allocation', voucher_no=vno,
                against=unit_obj.name, debit=Decimal('0.00'), credit=amt,
                remarks=f"Petty Cash transferred to {unit_obj.name}"
            )
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Unit Petty Cash', party_type=None, party=None,
                voucher_type='Petty Cash Allocation', voucher_no=vno,
                against='Head Office', debit=amt, credit=Decimal('0.00'),
                remarks=f"Petty Cash Credit (+) received from Head Office"
            )
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Inter-Division Payable', party_type='Division', party=ho_unit.name,
                voucher_type='Petty Cash Allocation', voucher_no=vno,
                against='Unit Petty Cash', debit=Decimal('0.00'), credit=amt,
                remarks=f"Petty Cash Credit liability to Head Office"
            )
        elif txn_type == 'COUNTER_EXPENSE':
            # Unit pays daily expense via Counter Receipt -> Credit (-) & Unit Expense booked
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account=head or 'Unit Petty Expenses', party_type='Payee', party=payee or 'Counter Receipt',
                voucher_type='Counter Receipt', voucher_no=vno,
                against='Unit Petty Cash', debit=amt, credit=Decimal('0.00'),
                remarks=f"Counter Receipt #{vno} ({unit_obj.name}): {desc}"
            )
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Unit Petty Cash', party_type=None, party=None,
                voucher_type='Counter Receipt', voucher_no=vno,
                against=head or 'Unit Petty Expenses', debit=Decimal('0.00'), credit=amt,
                remarks=f"Petty Cash Credit (-) spent via Counter Receipt #{vno}"
            )
        elif txn_type == 'SCRAP_INCOME':
            # Factory sells scrap/waste for cash -> Credit (+) & Scrap Income credited
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Unit Petty Cash', party_type=None, party=None,
                voucher_type='Cash Received Voucher', voucher_no=vno,
                against='Scrap & Waste Income', debit=amt, credit=Decimal('0.00'),
                remarks=f"Scrap/Waste Cash Received #{vno} ({unit_obj.name}): {desc}"
            )
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Scrap & Waste Income', party_type='Buyer', party=payee or 'Scrap Cash Sale',
                voucher_type='Cash Received Voucher', voucher_no=vno,
                against='Unit Petty Cash', debit=Decimal('0.00'), credit=amt,
                remarks=f"Cash Received Voucher #{vno}: {desc}"
            )

        return Response({'id': txn.id, 'voucher_no': txn.voucher_no, 'message': 'Petty cash voucher recorded.'}, status=status.HTTP_201_CREATED)


class DepartmentRequestListCreateAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response([])
        u = resolve_active_unit(request, comp)
        qs = DepartmentRequest.objects.filter(company=comp).select_related('from_unit', 'to_unit')
        if u and u.unit_type != 'HO':
            qs = qs.filter(Q(from_unit=u) | Q(to_unit=u))

        rows = [
            {
                'id': r.id,
                'request_no': r.request_no,
                'posting_date': str(r.posting_date),
                'from_unit_id': r.from_unit_id,
                'from_unit_name': r.from_unit.name if r.from_unit else '',
                'to_unit_id': r.to_unit_id,
                'to_unit_name': r.to_unit.name if r.to_unit else 'Head Office',
                'request_type': r.request_type,
                'title': r.title,
                'details': r.details,
                'line_items': r.line_items or [],
                'amount': float(r.amount),
                'status': r.status,
                'requested_by': r.requested_by,
                'resolved_by': r.resolved_by,
                'resolution_note': r.resolution_note,
            }
            for r in qs
        ]
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)

        data = request.data
        req_type = (data.get('request_type') or 'SALARY').strip()
        from_unit_id = data.get('from_unit_id')
        from_u = BusinessUnit.objects.filter(company=comp, id=from_unit_id).first() if from_unit_id else resolve_active_unit(request, comp, default_unit_type='MANUFACTURING')
        if not from_u:
            from_u = BusinessUnit.objects.filter(company=comp, is_active=True).first()

        if req_type == 'MATERIAL_PURCHASE':
            to_u = BusinessUnit.objects.filter(company=comp, unit_type='TRADING').first()
        else:
            to_u = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()

        cnt = DepartmentRequest.objects.filter(company=comp).count() + 1
        req_no = f"REQ-{cnt:04d}"

        line_items = data.get('line_items') or []
        calc_amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        if line_items and calc_amt <= 0:
            calc_amt = sum(Decimal(str(x.get('amount') or 0)) for x in line_items).quantize(Decimal('0.01'))

        obj = DepartmentRequest.objects.create(
            company=comp,
            from_unit=from_u,
            to_unit=to_u,
            request_no=req_no,
            posting_date=data.get('posting_date') or timezone.now().date(),
            request_type=req_type,
            title=(data.get('title') or f"{req_type} Request").strip(),
            details=(data.get('details') or '').strip(),
            line_items=line_items,
            amount=calc_amt,
            status='OPEN',
            requested_by=(data.get('requested_by') or request.headers.get('X-Username') or 'Unit Staff').strip(),
        )
        return Response({'id': obj.id, 'request_no': obj.request_no, 'status': obj.status}, status=status.HTTP_201_CREATED)


class DepartmentRequestResolveAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        req_obj = DepartmentRequest.objects.filter(company=comp, id=pk).first()
        if not req_obj:
            return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

        action = (request.data.get('action') or 'CLOSE').upper()
        resolver = (request.data.get('resolved_by') or request.headers.get('X-Username') or 'Head Office').strip()
        note = (request.data.get('resolution_note') or '').strip()

        if action == 'REJECT':
            req_obj.status = 'REJECTED'
            req_obj.resolved_by = resolver
            req_obj.resolution_note = note
            req_obj.save(update_fields=['status', 'resolved_by', 'resolution_note', 'updated_at'])
            return Response({'id': req_obj.id, 'status': req_obj.status})

        if req_obj.status == 'CLOSED':
            return Response({'id': req_obj.id, 'status': 'CLOSED'})

        p_date = timezone.now().date()
        amt = Decimal(str(req_obj.amount or 0)).quantize(Decimal('0.01'))
        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first() or req_obj.from_unit

        # If Head Office approves & closes a Salary / Expense / Petty Top-Up Request with amount > 0:
        if amt > 0 and req_obj.request_type in ('SALARY', 'EXPENSE', 'PETTY_TOPUP'):
            if req_obj.request_type == 'PETTY_TOPUP':
                # Credit (+) Petty Cash to requesting unit
                cnt = UnitPettyCashTransaction.objects.filter(company=comp, voucher_no__startswith='PCA').count() + 1
                vno = f"PCA-{cnt:04d}"
                UnitPettyCashTransaction.objects.create(
                    company=comp, unit=req_obj.from_unit, voucher_no=vno, posting_date=p_date,
                    txn_type='HO_ALLOCATION', party_or_payee='Head Office',
                    expense_head='Petty Cash Top-Up', amount=amt,
                    description=f"Approved Request {req_obj.request_no}: {req_obj.title}",
                    created_by=resolver, sent_to_ho=True
                )
                GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Inter-Division Receivable', party_type='Division', party=req_obj.from_unit.name, voucher_type='Petty Cash Allocation', voucher_no=vno, against='Bank Account', debit=amt, credit=Decimal('0.00'), remarks=f"Approved {req_obj.request_no}")
                GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Bank Account', voucher_type='Petty Cash Allocation', voucher_no=vno, against=req_obj.from_unit.name, debit=Decimal('0.00'), credit=amt, remarks=f"Approved {req_obj.request_no}")
                GLEntry.objects.create(company=comp, unit=req_obj.from_unit, posting_date=p_date, account='Unit Petty Cash', voucher_type='Petty Cash Allocation', voucher_no=vno, against='Head Office', debit=amt, credit=Decimal('0.00'), remarks=f"Approved {req_obj.request_no}")
                GLEntry.objects.create(company=comp, unit=req_obj.from_unit, posting_date=p_date, account='Inter-Division Payable', party_type='Division', party=ho_unit.name, voucher_type='Petty Cash Allocation', voucher_no=vno, against='Unit Petty Cash', debit=Decimal('0.00'), credit=amt, remarks=f"Approved {req_obj.request_no}")
            else:
                exp_acc = 'Worker Wages & Salary' if req_obj.request_type == 'SALARY' else 'Unit Operating Expenses'
                pay_cnt = PaymentEntry.objects.filter(company=comp).count() + 1
                pvno = f"PAY-{pay_cnt:04d}"
                PaymentEntry.objects.create(
                    company=comp, unit=ho_unit, voucher_no=pvno, posting_date=p_date,
                    payment_type='Pay', party_type='Unit Expense', party_name=f"{req_obj.from_unit.name} ({exp_acc})",
                    mode_of_payment='Bank', paid_amount=amt, reference_no=req_obj.request_no,
                    remarks=f"{req_obj.title} — {note}"
                )
                # Head Office pays from Bank & charges requesting unit via Inter-Division
                GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Inter-Division Receivable', party_type='Division', party=req_obj.from_unit.name, voucher_type='Request Settlement', voucher_no=req_obj.request_no, against='Bank Account', debit=amt, credit=Decimal('0.00'), remarks=f"Paid for {req_obj.from_unit.name}: {req_obj.title}")
                GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Bank Account', voucher_type='Request Settlement', voucher_no=req_obj.request_no, against=req_obj.from_unit.name, debit=Decimal('0.00'), credit=amt, remarks=f"Paid {req_obj.request_no}: {req_obj.title}")
                # Requesting unit books its own Salary/Expense in its P&L!
                GLEntry.objects.create(company=comp, unit=req_obj.from_unit, posting_date=p_date, account=exp_acc, party_type='Department', party=req_obj.from_unit.name, voucher_type='Request Settlement', voucher_no=req_obj.request_no, against='Head Office', debit=amt, credit=Decimal('0.00'), remarks=f"{req_obj.title} ({req_obj.request_no})")
                GLEntry.objects.create(company=comp, unit=req_obj.from_unit, posting_date=p_date, account='Inter-Division Payable', party_type='Division', party=ho_unit.name, voucher_type='Request Settlement', voucher_no=req_obj.request_no, against=exp_acc, debit=Decimal('0.00'), credit=amt, remarks=f"Payable to Head Office for {req_obj.request_no}")

        req_obj.status = 'CLOSED'
        req_obj.resolved_by = resolver
        req_obj.resolution_note = note or 'Approved, paid & closed.'
        req_obj.save(update_fields=['status', 'resolved_by', 'resolution_note', 'updated_at'])
        return Response({'id': req_obj.id, 'request_no': req_obj.request_no, 'status': 'CLOSED'})
