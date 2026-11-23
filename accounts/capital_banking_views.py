from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

from .models import (
    Company, BusinessUnit, ensure_default_units, GLEntry,
    CompanyBankAccount, CompanyPartner, CompanyLoan
)
from .views import get_active_company


class BankAccountListCreateAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response([])
        accounts = CompanyBankAccount.objects.filter(company=comp, is_active=True).select_related('unit')
        rows = []
        for acc in accounts:
            dr = GLEntry.objects.filter(company=comp, is_cancelled=False, account=acc.ledger_name).aggregate(s=Sum('debit'))['s'] or Decimal('0.00')
            cr = GLEntry.objects.filter(company=comp, is_cancelled=False, account=acc.ledger_name).aggregate(s=Sum('credit'))['s'] or Decimal('0.00')
            curr_bal = dr - cr
            rows.append({
                'id': acc.id,
                'account_name': acc.account_name,
                'ledger_name': acc.ledger_name,
                'bank_name': acc.bank_name,
                'account_number': acc.account_number,
                'ifsc_code': acc.ifsc_code,
                'purpose': acc.purpose,
                'purpose_label': acc.get_purpose_display(),
                'unit_id': acc.unit_id,
                'unit_name': acc.unit.name if acc.unit else 'Head Office / All',
                'opening_balance': float(acc.opening_balance),
                'current_balance': float(curr_bal),
                'total_inflow': float(dr),
                'total_outflow': float(cr),
            })
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)
        data = request.data
        acc_name = (data.get('account_name') or '').strip()
        if not acc_name:
            return Response({'error': 'Account Name is required'}, status=status.HTTP_400_BAD_REQUEST)

        purpose = (data.get('purpose') or 'GENERAL').strip()
        unit_id = data.get('unit_id')
        unit_obj = BusinessUnit.objects.filter(company=comp, id=unit_id).first() if unit_id else (
            BusinessUnit.objects.filter(company=comp, unit_type='MANUFACTURING').first() if purpose == 'FACTORY'
            else BusinessUnit.objects.filter(company=comp, unit_type='TRADING').first() if purpose == 'SALES_PURCHASE'
            else BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        )
        open_bal = Decimal(str(data.get('opening_balance') or 0)).quantize(Decimal('0.01'))

        acc = CompanyBankAccount.objects.create(
            company=comp,
            unit=unit_obj,
            account_name=acc_name,
            bank_name=(data.get('bank_name') or '').strip(),
            account_number=(data.get('account_number') or '').strip(),
            ifsc_code=(data.get('ifsc_code') or '').strip(),
            purpose=purpose,
            opening_balance=open_bal,
        )

        if open_bal > 0:
            p_date = data.get('posting_date') or timezone.now().date()
            vno = f"BNK-OPEN-{acc.id:03d}"
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account=acc.ledger_name, party_type=None, party=None,
                voucher_type='Opening Balance', voucher_no=vno,
                against='Opening Balance Equity', debit=open_bal, credit=Decimal('0.00'),
                remarks=f"Opening balance for {acc.account_name} ({acc.get_purpose_display()})"
            )
            GLEntry.objects.create(
                company=comp, unit=unit_obj, posting_date=p_date,
                account='Opening Balance Equity', party_type=None, party=None,
                voucher_type='Opening Balance', voucher_no=vno,
                against=acc.ledger_name, debit=Decimal('0.00'), credit=open_bal,
                remarks=f"Opening balance offset for {acc.account_name}"
            )

        return Response({'id': acc.id, 'account_name': acc.account_name, 'ledger_name': acc.ledger_name}, status=status.HTTP_201_CREATED)


class PartnerListCreateAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'partners': [], 'summary': {}})

        from rest_framework.test import APIRequestFactory
        from .views import FinancialStatementsAPIView
        f_req = APIRequestFactory().get(f'/api/accounts/financial-statements/?company_id={comp.id}&unit_id=all')
        fs_data = FinancialStatementsAPIView.as_view()(f_req).data
        company_net_profit = Decimal(str(fs_data.get('profit', {}).get('net_profit', 0) or 0)).quantize(Decimal('0.01'))

        partners = CompanyPartner.objects.filter(company=comp, is_active=True)
        rows = []
        tot_share = Decimal('0.00')
        tot_cap = Decimal('0.00')
        tot_asset = Decimal('0.00')
        tot_drawings = Decimal('0.00')

        for p in partners:
            sh = Decimal(str(p.share_percentage or 0))
            cap = Decimal(str(p.capital_cash_bank or 0))
            ast = Decimal(str(p.asset_contribution or 0))
            drw = Decimal(str(p.drawings_withdrawn or 0))
            total_contrib = cap + ast
            pnl_share = ((company_net_profit * sh) / Decimal('100.00')).quantize(Decimal('0.01'))
            net_equity = (total_contrib + pnl_share - drw).quantize(Decimal('0.01'))

            tot_share += sh
            tot_cap += cap
            tot_asset += ast
            tot_drawings += drw

            rows.append({
                'id': p.id,
                'partner_name': p.partner_name,
                'share_percentage': float(sh),
                'capital_cash_bank': float(cap),
                'asset_contribution': float(ast),
                'asset_description': p.asset_description,
                'total_contribution': float(total_contrib),
                'drawings_withdrawn': float(drw),
                'current_pnl_share': float(pnl_share),
                'net_partner_equity': float(net_equity),
                'phone': p.phone,
                'notes': p.notes,
            })

        return Response({
            'partners': rows,
            'summary': {
                'company_net_profit': float(company_net_profit),
                'total_share_percentage': float(tot_share),
                'total_capital_cash': float(tot_cap),
                'total_assets_brought': float(tot_asset),
                'total_combined_capital': float(tot_cap + tot_asset),
                'total_drawings': float(tot_drawings),
            }
        })

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)
        data = request.data
        name = (data.get('partner_name') or '').strip()
        if not name:
            return Response({'error': 'Partner name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        share_pct = Decimal(str(data.get('share_percentage') or 0)).quantize(Decimal('0.01'))
        cap_cash = Decimal(str(data.get('capital_cash_bank') or 0)).quantize(Decimal('0.01'))
        asset_val = Decimal(str(data.get('asset_contribution') or 0)).quantize(Decimal('0.01'))
        asset_desc = (data.get('asset_description') or '').strip()
        bank_id = data.get('bank_account_id')
        bank_obj = CompanyBankAccount.objects.filter(company=comp, id=bank_id).first() if bank_id else (
            CompanyBankAccount.objects.filter(company=comp, purpose='PARTNER_LOAN').first()
        )
        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        p_date = data.get('posting_date') or timezone.now().date()

        partner = CompanyPartner.objects.create(
            company=comp,
            partner_name=name,
            share_percentage=share_pct,
            capital_cash_bank=cap_cash,
            asset_contribution=asset_val,
            asset_description=asset_desc,
            phone=(data.get('phone') or '').strip(),
            notes=(data.get('notes') or '').strip(),
        )

        vno = f"CAP-{partner.id:04d}"
        cap_acc = f"Partner Capital - {partner.partner_name}"
        if cap_cash > 0:
            bank_ledger = bank_obj.ledger_name if bank_obj else 'Bank Account'
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account=bank_ledger, party_type=None, party=None,
                voucher_type='Partner Capital', voucher_no=vno,
                against=cap_acc, debit=cap_cash, credit=Decimal('0.00'),
                remarks=f"Capital introduced by Partner {partner.partner_name} ({share_pct}%)"
            )
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account=cap_acc, party_type='Partner', party=partner.partner_name,
                voucher_type='Partner Capital', voucher_no=vno,
                against=bank_ledger, debit=Decimal('0.00'), credit=cap_cash,
                remarks=f"Capital Credit - {partner.partner_name}"
            )
        if asset_val > 0:
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account='Fixed Assets (Partner Brought)', party_type='Partner', party=partner.partner_name,
                voucher_type='Partner Asset', voucher_no=vno,
                against=cap_acc, debit=asset_val, credit=Decimal('0.00'),
                remarks=f"Asset brought by {partner.partner_name}: {asset_desc}"
            )
            GLEntry.objects.create(
                company=comp, unit=ho_unit, posting_date=p_date,
                account=cap_acc, party_type='Partner', party=partner.partner_name,
                voucher_type='Partner Asset', voucher_no=vno,
                against='Fixed Assets (Partner Brought)', debit=Decimal('0.00'), credit=asset_val,
                remarks=f"Asset Capital Credit - {partner.partner_name} ({asset_desc})"
            )

        return Response({'id': partner.id, 'partner_name': partner.partner_name}, status=status.HTTP_201_CREATED)


class PartnerTransactionAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        partner = CompanyPartner.objects.filter(company=comp, id=pk).first()
        if not partner:
            return Response({'error': 'Partner not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        action = (data.get('action') or 'ADD_CAPITAL').upper()
        amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        if amt <= 0:
            return Response({'error': 'Amount must be > 0'}, status=status.HTTP_400_BAD_REQUEST)

        bank_id = data.get('bank_account_id')
        bank_obj = CompanyBankAccount.objects.filter(company=comp, id=bank_id).first() if bank_id else (
            CompanyBankAccount.objects.filter(company=comp, purpose='PARTNER_LOAN').first()
        )
        bank_ledger = bank_obj.ledger_name if bank_obj else 'Bank Account'
        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        p_date = data.get('posting_date') or timezone.now().date()
        cap_acc = f"Partner Capital - {partner.partner_name}"
        note = (data.get('notes') or '').strip()

        if action == 'ADD_ASSET':
            partner.asset_contribution = Decimal(str(partner.asset_contribution)) + amt
            if note:
                partner.asset_description = f"{partner.asset_description}; {note}".strip('; ')
            partner.save(update_fields=['asset_contribution', 'asset_description'])
            vno = f"PAST-{partner.id}-{GLEntry.objects.count()+1}"
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Fixed Assets (Partner Brought)', party_type='Partner', party=partner.partner_name, voucher_type='Partner Asset', voucher_no=vno, against=cap_acc, debit=amt, credit=Decimal('0.00'), remarks=note or f"Asset added by {partner.partner_name}")
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=cap_acc, party_type='Partner', party=partner.partner_name, voucher_type='Partner Asset', voucher_no=vno, against='Fixed Assets (Partner Brought)', debit=Decimal('0.00'), credit=amt, remarks=note or f"Asset capital by {partner.partner_name}")
        elif action == 'WITHDRAW':
            partner.drawings_withdrawn = Decimal(str(partner.drawings_withdrawn)) + amt
            partner.save(update_fields=['drawings_withdrawn'])
            vno = f"PDRW-{partner.id}-{GLEntry.objects.count()+1}"
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=cap_acc, party_type='Partner', party=partner.partner_name, voucher_type='Partner Drawings', voucher_no=vno, against=bank_ledger, debit=amt, credit=Decimal('0.00'), remarks=note or f"Drawings / Profit payout to {partner.partner_name}")
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=bank_ledger, voucher_type='Partner Drawings', voucher_no=vno, against=cap_acc, debit=Decimal('0.00'), credit=amt, remarks=note or f"Paid to Partner {partner.partner_name}")
        else:
            partner.capital_cash_bank = Decimal(str(partner.capital_cash_bank)) + amt
            partner.save(update_fields=['capital_cash_bank'])
            vno = f"PCAP-{partner.id}-{GLEntry.objects.count()+1}"
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=bank_ledger, voucher_type='Partner Capital', voucher_no=vno, against=cap_acc, debit=amt, credit=Decimal('0.00'), remarks=note or f"Additional capital from {partner.partner_name}")
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=cap_acc, party_type='Partner', party=partner.partner_name, voucher_type='Partner Capital', voucher_no=vno, against=bank_ledger, debit=Decimal('0.00'), credit=amt, remarks=note or f"Additional capital - {partner.partner_name}")

        return Response({'status': 'OK'})


class LoanListCreateAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'loans': [], 'summary': {}})
        loans = CompanyLoan.objects.filter(company=comp).select_related('bank_account')
        rows = []
        tot_principal = Decimal('0.00')
        tot_repaid = Decimal('0.00')
        for ln in loans:
            prin = Decimal(str(ln.principal_amount or 0))
            rep = Decimal(str(ln.repaid_amount or 0))
            bal = max(Decimal('0.00'), prin - rep)
            tot_principal += prin
            tot_repaid += rep
            rows.append({
                'id': ln.id,
                'loan_code': ln.loan_code,
                'lender_name': ln.lender_name,
                'loan_type': ln.loan_type,
                'loan_type_label': ln.get_loan_type_display(),
                'start_date': str(ln.start_date),
                'principal_amount': float(prin),
                'interest_rate': float(ln.interest_rate),
                'repaid_amount': float(rep),
                'balance_payable': float(bal),
                'bank_account_name': ln.bank_account.account_name if ln.bank_account else 'Default Bank',
                'notes': ln.notes,
                'is_closed': ln.is_closed or bal <= 0,
            })
        return Response({
            'loans': rows,
            'summary': {
                'total_borrowed': float(tot_principal),
                'total_repaid': float(tot_repaid),
                'total_outstanding': float(max(Decimal('0.00'), tot_principal - tot_repaid)),
            }
        })

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)
        data = request.data
        lender = (data.get('lender_name') or '').strip()
        if not lender:
            return Response({'error': 'Lender / Fund provider name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        prin = Decimal(str(data.get('principal_amount') or 0)).quantize(Decimal('0.01'))
        if prin <= 0:
            return Response({'error': 'Loan / borrowed amount must be > 0'}, status=status.HTTP_400_BAD_REQUEST)

        bank_id = data.get('bank_account_id')
        bank_obj = CompanyBankAccount.objects.filter(company=comp, id=bank_id).first() if bank_id else (
            CompanyBankAccount.objects.filter(company=comp, purpose='PARTNER_LOAN').first()
        )
        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        s_date = data.get('start_date') or timezone.now().date()
        cnt = CompanyLoan.objects.filter(company=comp).count() + 1
        l_code = f"LN-{cnt:04d}"

        loan = CompanyLoan.objects.create(
            company=comp,
            bank_account=bank_obj,
            loan_code=l_code,
            lender_name=lender,
            loan_type=(data.get('loan_type') or 'PRIVATE_UDHARI').strip(),
            start_date=s_date,
            principal_amount=prin,
            interest_rate=Decimal(str(data.get('interest_rate') or 0)).quantize(Decimal('0.01')),
            notes=(data.get('notes') or '').strip(),
        )

        bank_ledger = bank_obj.ledger_name if bank_obj else 'Bank Account'
        loan_acc = f"Loan Payable - {loan.lender_name}"
        GLEntry.objects.create(
            company=comp, unit=ho_unit, posting_date=s_date,
            account=bank_ledger, voucher_type='Loan Receipt', voucher_no=l_code,
            against=loan_acc, debit=prin, credit=Decimal('0.00'),
            remarks=f"Borrowed fund / Loan received from {lender} ({l_code})"
        )
        GLEntry.objects.create(
            company=comp, unit=ho_unit, posting_date=s_date,
            account=loan_acc, party_type='Lender', party=lender,
            voucher_type='Loan Receipt', voucher_no=l_code,
            against=bank_ledger, debit=Decimal('0.00'), credit=prin,
            remarks=f"Loan / Udhari Liability - {lender} ({l_code})"
        )
        return Response({'id': loan.id, 'loan_code': loan.loan_code}, status=status.HTTP_201_CREATED)


class LoanRepayAPIView(APIView):

    @transaction.atomic
    def post(self, request, pk):
        comp = get_active_company(request)
        loan = CompanyLoan.objects.filter(company=comp, id=pk).first()
        if not loan:
            return Response({'error': 'Loan not found'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        repay_amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        interest_amt = Decimal(str(data.get('interest_amount') or 0)).quantize(Decimal('0.01'))
        if repay_amt <= 0 and interest_amt <= 0:
            return Response({'error': 'Repayment or interest amount must be > 0'}, status=status.HTTP_400_BAD_REQUEST)

        bank_id = data.get('bank_account_id')
        bank_obj = CompanyBankAccount.objects.filter(company=comp, id=bank_id).first() if bank_id else (
            loan.bank_account or CompanyBankAccount.objects.filter(company=comp, purpose='PARTNER_LOAN').first()
        )
        bank_ledger = bank_obj.ledger_name if bank_obj else 'Bank Account'
        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        p_date = data.get('posting_date') or timezone.now().date()
        vno = f"LREP-{loan.id}-{GLEntry.objects.count()+1}"
        loan_acc = f"Loan Payable - {loan.lender_name}"

        if repay_amt > 0:
            loan.repaid_amount = Decimal(str(loan.repaid_amount)) + repay_amt
            if loan.repaid_amount >= Decimal(str(loan.principal_amount)):
                loan.is_closed = True
            loan.save(update_fields=['repaid_amount', 'is_closed'])
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=loan_acc, party_type='Lender', party=loan.lender_name, voucher_type='Loan Repayment', voucher_no=vno, against=bank_ledger, debit=repay_amt, credit=Decimal('0.00'), remarks=f"Principal repaid to {loan.lender_name} ({loan.loan_code})")
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=bank_ledger, voucher_type='Loan Repayment', voucher_no=vno, against=loan_acc, debit=Decimal('0.00'), credit=repay_amt, remarks=f"Loan principal repayment ({loan.loan_code})")

        if interest_amt > 0:
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account='Interest & Finance Charges', party_type='Lender', party=loan.lender_name, voucher_type='Loan Interest', voucher_no=vno, against=bank_ledger, debit=interest_amt, credit=Decimal('0.00'), remarks=f"Loan interest paid to {loan.lender_name} ({loan.loan_code})")
            GLEntry.objects.create(company=comp, unit=ho_unit, posting_date=p_date, account=bank_ledger, voucher_type='Loan Interest', voucher_no=vno, against='Interest & Finance Charges', debit=Decimal('0.00'), credit=interest_amt, remarks=f"Loan interest paid ({loan.loan_code})")

        return Response({'status': 'OK', 'repaid_amount': float(loan.repaid_amount), 'is_closed': loan.is_closed})


class BankTransferAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response([])
        entries = GLEntry.objects.filter(
            company=comp, is_cancelled=False, voucher_type='Bank Fund Transfer', credit__gt=0
        ).select_related('unit').order_by('-posting_date', '-id')[:100]
        rows = [
            {
                'id': e.id,
                'voucher_no': e.voucher_no,
                'posting_date': str(e.posting_date),
                'from_bank': e.account.replace('Bank - ', ''),
                'to_bank': (e.against or '').replace('Bank - ', ''),
                'from_unit': e.unit.name if e.unit else 'Head Office',
                'amount': float(e.credit),
                'remarks': e.remarks or '',
            }
            for e in entries
        ]
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)

        data = request.data
        from_id = data.get('from_bank_id')
        to_id = data.get('to_bank_id')
        amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        if amt <= 0:
            return Response({'error': 'Transfer amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)
        if not from_id or not to_id or str(from_id) == str(to_id):
            return Response({'error': 'Select two different bank accounts for transfer.'}, status=status.HTTP_400_BAD_REQUEST)

        from_bank = CompanyBankAccount.objects.filter(company=comp, id=from_id).first()
        to_bank = CompanyBankAccount.objects.filter(company=comp, id=to_id).first()
        if not from_bank or not to_bank:
            return Response({'error': 'Selected bank account not found.'}, status=status.HTTP_404_NOT_FOUND)

        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        from_unit = from_bank.unit or ho_unit
        to_unit = to_bank.unit or ho_unit
        p_date = data.get('posting_date') or timezone.now().date()
        note = (data.get('remarks') or '').strip()

        cnt = GLEntry.objects.filter(company=comp, voucher_no__startswith='BTRF-').values('voucher_no').distinct().count() + 1
        vno = f"BTRF-{cnt:04d}"
        rem = note or f"Fund transfer: {from_bank.account_name} -> {to_bank.account_name}"

        if from_unit and to_unit and from_unit.id != to_unit.id:
            # Cross-Division Fund Transfer (Maintains strict division Balance Sheet & Zero Consolidated Double Count)
            GLEntry.objects.create(
                company=comp, unit=from_unit, posting_date=p_date,
                account='Inter-Division Receivable', party_type='Division', party=to_unit.name,
                voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=from_bank.ledger_name, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=from_unit, posting_date=p_date,
                account=from_bank.ledger_name, party_type=None, party=None,
                voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=to_bank.ledger_name, debit=Decimal('0.00'), credit=amt, remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=to_unit, posting_date=p_date,
                account=to_bank.ledger_name, party_type=None, party=None,
                voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=from_bank.ledger_name, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=to_unit, posting_date=p_date,
                account='Inter-Division Payable', party_type='Division', party=from_unit.name,
                voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=to_bank.ledger_name, debit=Decimal('0.00'), credit=amt, remarks=rem
            )
        else:
            GLEntry.objects.create(
                company=comp, unit=to_unit, posting_date=p_date,
                account=to_bank.ledger_name, voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=from_bank.ledger_name, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=from_unit, posting_date=p_date,
                account=from_bank.ledger_name, voucher_type='Bank Fund Transfer', voucher_no=vno,
                against=to_bank.ledger_name, debit=Decimal('0.00'), credit=amt, remarks=rem
            )

        return Response({'voucher_no': vno, 'message': f'Transferred {amt} from {from_bank.account_name} to {to_bank.account_name}.'}, status=status.HTTP_201_CREATED)


class FixedAssetPurchaseAPIView(APIView):

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response([])
        entries = GLEntry.objects.filter(
            company=comp, is_cancelled=False, account__icontains='Fixed Asset', debit__gt=0
        ).select_related('unit').order_by('-posting_date', '-id')[:100]
        rows = [
            {
                'id': e.id,
                'voucher_no': e.voucher_no,
                'posting_date': str(e.posting_date),
                'asset_account': e.account,
                'unit_name': e.unit.name if e.unit else 'Head Office',
                'vendor_or_source': e.party or e.against or '',
                'amount': float(e.debit),
                'remarks': e.remarks or '',
            }
            for e in entries
        ]
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(comp)

        data = request.data
        asset_name = (data.get('asset_name') or '').strip()
        if not asset_name:
            return Response({'error': 'Machinery / Asset name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        amt = Decimal(str(data.get('amount') or 0)).quantize(Decimal('0.01'))
        if amt <= 0:
            return Response({'error': 'Asset purchase amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        ho_unit = BusinessUnit.objects.filter(company=comp, unit_type='HO').first()
        target_unit_id = data.get('unit_id')
        target_unit = BusinessUnit.objects.filter(company=comp, id=target_unit_id).first() if target_unit_id else (
            BusinessUnit.objects.filter(company=comp, unit_type='MANUFACTURING').first() or ho_unit
        )

        bank_id = data.get('bank_account_id')
        bank_obj = CompanyBankAccount.objects.filter(company=comp, id=bank_id).first() if bank_id else (
            CompanyBankAccount.objects.filter(company=comp, purpose='PARTNER_LOAN').first()
        )
        bank_ledger = bank_obj.ledger_name if bank_obj else 'Bank Account'
        bank_unit = (bank_obj.unit if bank_obj and bank_obj.unit else ho_unit)

        p_date = data.get('posting_date') or timezone.now().date()
        vendor = (data.get('vendor_name') or 'Machinery Supplier').strip()
        note = (data.get('remarks') or '').strip()
        cnt = GLEntry.objects.filter(company=comp, voucher_no__startswith='AST-').values('voucher_no').distinct().count() + 1
        vno = f"AST-{cnt:04d}"
        asset_acc = f"Fixed Assets - {asset_name}"
        rem = note or f"Purchased {asset_name} for {target_unit.name if target_unit else 'Company'} from {vendor}"

        if bank_unit and target_unit and bank_unit.id != target_unit.id:
            # Paid from Head Office Bank for Manufacturing / Branch Unit Asset
            GLEntry.objects.create(
                company=comp, unit=bank_unit, posting_date=p_date,
                account='Inter-Division Receivable', party_type='Division', party=target_unit.name,
                voucher_type='Asset Purchase', voucher_no=vno,
                against=bank_ledger, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=bank_unit, posting_date=p_date,
                account=bank_ledger, voucher_type='Asset Purchase', voucher_no=vno,
                against=asset_acc, debit=Decimal('0.00'), credit=amt, remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=target_unit, posting_date=p_date,
                account=asset_acc, party_type='Vendor', party=vendor,
                voucher_type='Asset Purchase', voucher_no=vno,
                against=bank_ledger, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=target_unit, posting_date=p_date,
                account='Inter-Division Payable', party_type='Division', party=bank_unit.name,
                voucher_type='Asset Purchase', voucher_no=vno,
                against=asset_acc, debit=Decimal('0.00'), credit=amt, remarks=rem
            )
        else:
            GLEntry.objects.create(
                company=comp, unit=target_unit, posting_date=p_date,
                account=asset_acc, party_type='Vendor', party=vendor,
                voucher_type='Asset Purchase', voucher_no=vno,
                against=bank_ledger, debit=amt, credit=Decimal('0.00'), remarks=rem
            )
            GLEntry.objects.create(
                company=comp, unit=target_unit, posting_date=p_date,
                account=bank_ledger, voucher_type='Asset Purchase', voucher_no=vno,
                against=asset_acc, debit=Decimal('0.00'), credit=amt, remarks=rem
            )

        return Response({'voucher_no': vno, 'asset_account': asset_acc}, status=status.HTTP_201_CREATED)
