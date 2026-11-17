from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

from rest_framework import generics, viewsets, status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Company as AccountsCompany, UserProfile
from .models import GLEntry, PaymentEntry, JournalEntry, JournalEntryLine, PaymentInvoiceAllocation, BusinessUnit
from .serializers import PaymentEntrySerializer, JournalEntrySerializer

from selling.models import SalesInvoice, CreditNote
from buying.models import PurchaseInvoice, DebitNote
from stock.models import Item, StockLedgerEntry


def get_active_company(request):
    comp_id = (
        request.headers.get('X-Company-Id')
        or request.GET.get('company_id')
        or (getattr(request, 'data', None) and request.data.get('company_id'))
        or (getattr(request, 'data', None) and request.data.get('company'))
    )
    if comp_id and str(comp_id) not in ['undefined', 'null', '']:
        try:
            comp = AccountsCompany.objects.filter(id=int(comp_id)).first()
            if comp:
                return comp
        except (ValueError, TypeError):
            pass
    if hasattr(request.user, 'profile') and request.user.profile.company:
        return request.user.profile.company
    return AccountsCompany.objects.first()




def _resolve_gateway_user(request):
    u = getattr(request, 'user', None)
    if u and getattr(u, 'is_authenticated', False):
        return u
    try:
        from rest_framework_simplejwt.authentication import JWTAuthentication
        auth_res = JWTAuthentication().authenticate(request)
        if auth_res:
            return auth_res[0]
    except Exception:
        pass
    from django.contrib.auth.models import User
    uid = request.headers.get('X-User-ID') or request.META.get('HTTP_X_USER_ID')
    uname = request.headers.get('X-Username') or request.META.get('HTTP_X_USERNAME')
    if uid:
        u = User.objects.filter(id=uid).first()
        if u:
            return u
    if uname:
        return User.objects.filter(username=uname).first()
    return None



def _get_user_unit_access(request, company):
    from django.contrib.auth import get_user_model
    from .models import UserProfile, ensure_default_units
    if not company:
        return None, True, None
    ensure_default_units(company)
    UserModel = get_user_model()
    target_user = None
    if getattr(request, 'user', None) and request.user.is_authenticated:
        target_user = request.user
    if not target_user:
        uid = request.headers.get('X-User-ID') or request.GET.get('user_id')
        uname = request.headers.get('X-Username') or request.GET.get('username')
        if uid and str(uid).isdigit():
            target_user = UserModel.objects.filter(id=int(uid)).first()
        elif uname:
            target_user = UserModel.objects.filter(username__iexact=str(uname)).first()
    if not target_user or target_user.is_superuser:
        return target_user, True, None
    profile = UserProfile.objects.filter(user=target_user).select_related('assigned_unit').first()
    if profile and profile.assigned_unit and profile.assigned_unit.company_id == company.id and profile.assigned_unit.is_active:
        return target_user, False, profile.assigned_unit
    return target_user, True, None


def resolve_active_unit(request, company, default_unit_type=None):
    from .models import BusinessUnit, ensure_default_units
    if not company:
        return None
    units_map = ensure_default_units(company)
    _, can_view_all, locked_unit = _get_user_unit_access(request, company)
    if not can_view_all and locked_unit:
        return locked_unit

    uid = (
        (isinstance(getattr(request, 'data', None), dict) and (request.data.get('unit_id') or request.data.get('unit')))
        or request.headers.get('X-Unit-Id')
        or request.GET.get('unit_id')
    )
    if uid and str(uid) not in ('all', 'ALL', 'undefined', 'null', ''):
        try:
            u = BusinessUnit.objects.filter(company=company, id=int(uid)).first()
            if u:
                return u
        except (ValueError, TypeError):
            pass
    if default_unit_type and default_unit_type in units_map:
        return units_map[default_unit_type]
    return None


class BusinessUnitListCreateAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from .models import BusinessUnit, ensure_default_units
        company = get_active_company(request)
        if not company:
            return Response([], status=status.HTTP_200_OK)
        ensure_default_units(company)
        units = BusinessUnit.objects.filter(company=company, is_active=True).order_by('id')
        data = [
            {
                'id': u.id,
                'code': u.code,
                'name': u.name,
                'unit_type': u.unit_type,
            }
            for u in units
        ]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        from .models import BusinessUnit, ensure_default_units
        company = get_active_company(request)
        if not company:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        ensure_default_units(company)
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'error': 'Division name is required'}, status=status.HTTP_400_BAD_REQUEST)
        code = (request.data.get('code') or '').strip().upper() or f"UNIT-{BusinessUnit.objects.filter(company=company).count() + 1:02d}"
        if BusinessUnit.objects.filter(company=company, code=code).exists():
            code = f"{code}-{BusinessUnit.objects.filter(company=company).count() + 1}"
        u = BusinessUnit.objects.create(
            company=company,
            code=code,
            name=name,
            unit_type=request.data.get('unit_type') or 'CUSTOM',
            is_active=True,
        )
        return Response({'id': u.id, 'code': u.code, 'name': u.name, 'unit_type': u.unit_type}, status=status.HTTP_201_CREATED)

class AccountsCompanyListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        req_user = _resolve_gateway_user(request)
        if req_user and not req_user.is_superuser:
            prof = getattr(req_user, 'profile', None)
            if prof and prof.company_id:
                companies = AccountsCompany.objects.filter(id=prof.company_id).order_by('id')
            else:
                companies = AccountsCompany.objects.none()
        else:
            companies = AccountsCompany.objects.all().order_by('id')
        data = [
            {
                'id': c.id,
                'name': c.name,
                'currency': getattr(c, 'default_currency', 'CAD' if 'CAD' in c.name else 'INR'),
                'symbol': getattr(c, 'currency_symbol', '$' if 'CAD' in c.name or 'USD' in c.name else '₹'),
                'currency_symbol': getattr(c, 'currency_symbol', '$' if 'CAD' in c.name or 'USD' in c.name else '₹'),
                'country': getattr(c, 'country', 'India'),
                'business_type': getattr(c, 'business_type', 'HYBRID'),
                'parent_company_id': getattr(c, 'parent_company_id', None),
            }
            for c in companies
        ]
        return Response(data, status=status.HTTP_200_OK)


class AccountsCompanySwitchView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        company_id = request.data.get('company_id')
        try:
            company = AccountsCompany.objects.get(id=company_id)
            sym = getattr(company, 'currency_symbol', '$' if 'CAD' in company.name or 'USD' in company.name else '₹')
            cur = getattr(company, 'default_currency', 'CAD' if 'CAD' in company.name else 'INR')
            return Response({
                'company': {
                    'id': company.id,
                    'name': company.name,
                    'currency': cur,
                    'symbol': sym,
                    'currency_symbol': sym,
                }
            }, status=status.HTTP_200_OK)
        except Exception:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)


class FinancialStatementsAPIView(APIView):
    def get(self, request):
        from .models import BusinessUnit, ensure_default_units
        from stock.models import StockLedgerEntry

        company = get_active_company(request)
        unit_id = request.headers.get('X-Unit-Id') or request.GET.get('unit_id')
        has_unit_filter = bool(unit_id and str(unit_id) not in ('all', 'ALL', 'undefined', 'null', ''))

        is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
        base_sales_qs = SalesInvoice.objects.filter(company=company)
        base_pur_qs = PurchaseInvoice.objects.filter(company=company)
        items_qs = Item.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else Item.objects.filter(company=company)

        base_gl_entries = GLEntry.objects.filter(is_cancelled=False)
        if company:
            base_gl_entries = base_gl_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else base_gl_entries.filter(company=company)

        if has_unit_filter:
            u_int = int(unit_id)
            sales_qs = base_sales_qs.filter(unit_id=u_int)
            pur_qs = base_pur_qs.filter(unit_id=u_int)
            gl_entries = base_gl_entries.filter(unit_id=u_int)
        else:
            sales_qs = base_sales_qs
            pur_qs = base_pur_qs
            gl_entries = base_gl_entries

        ext_sales = sales_qs.aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')
        ext_purchases = pur_qs.aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')

        # Inter-Division Supply Income & Cost (Shown in individual division, eliminated in Consolidated!)
        inter_inc = (gl_entries.filter(account='Inter-Division Supply Income').aggregate(s=Sum('credit'))['s'] or Decimal('0.00')) if has_unit_filter else Decimal('0.00')
        inter_cost = (gl_entries.filter(account='Inter-Division Stock Cost').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')) if has_unit_filter else Decimal('0.00')

        net_sales = ext_sales + inter_inc
        total_purchases = ext_purchases + inter_cost

        output_gst = sales_qs.aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.00')
        input_gst = pur_qs.aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.00')
        net_gst = output_gst - input_gst

        gst_payable = max(net_gst, Decimal('0.00'))
        gst_credit = abs(net_gst) if net_gst < Decimal('0.00') else Decimal('0.00')

        # Closing Stock Valuation
        closing_stock_val = Decimal('0.00')
        for itm in items_qs:
            if has_unit_filter:
                u_qty = StockLedgerEntry.objects.filter(company=company, unit_id=int(unit_id), item=itm).aggregate(q=Sum('actual_qty'))['q'] or Decimal('0.00')
                q = max(Decimal('0.00'), Decimal(str(u_qty)))
            else:
                q = max(Decimal('0.00'), Decimal(str(itm.current_stock or 0)))
            r = Decimal(str(itm.standard_rate or 0))
            closing_stock_val += (q * r)

        cogs = max(Decimal('0.00'), total_purchases - closing_stock_val)
        if cogs <= Decimal('0.00') and net_sales > Decimal('0.00'):
            cogs = net_sales * Decimal('0.80')

        gross_profit = net_sales - cogs

        # Debtors, Creditors, Inter-Division Balances & Bank from Division-Scoped GL
        debtors_dr = gl_entries.filter(account__icontains='Debtor').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')
        debtors_cr = gl_entries.filter(account__icontains='Debtor').aggregate(s=Sum('credit'))['s'] or Decimal('0.00')
        debtors = max(Decimal('0.00'), debtors_dr - debtors_cr)

        if has_unit_filter:
            id_rec = (gl_entries.filter(account='Inter-Division Receivable').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')) -                      (gl_entries.filter(account='Inter-Division Receivable').aggregate(s=Sum('credit'))['s'] or Decimal('0.00'))
            debtors += max(Decimal('0.00'), id_rec)

        creditors_cr = gl_entries.filter(account__icontains='Creditor').aggregate(s=Sum('credit'))['s'] or Decimal('0.00')
        creditors_dr = gl_entries.filter(account__icontains='Creditor').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')
        creditors = max(Decimal('0.00'), creditors_cr - creditors_dr)

        if has_unit_filter:
            id_pay = (gl_entries.filter(account='Inter-Division Payable').aggregate(s=Sum('credit'))['s'] or Decimal('0.00')) -                      (gl_entries.filter(account='Inter-Division Payable').aggregate(s=Sum('debit'))['s'] or Decimal('0.00'))
            creditors += max(Decimal('0.00'), id_pay)

        bank_balance = (gl_entries.filter(account__regex=r'(?i)bank|cash').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')) - \
                       (gl_entries.filter(account__regex=r'(?i)bank|cash').aggregate(s=Sum('credit'))['s'] or Decimal('0.00'))

        fixed_assets = max(Decimal('0.00'), (
            (gl_entries.filter(account__icontains='Fixed Asset').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')) -
            (gl_entries.filter(account__icontains='Fixed Asset').aggregate(s=Sum('credit'))['s'] or Decimal('0.00'))
        ))
        total_assets = bank_balance + fixed_assets + debtors + gst_credit + closing_stock_val
        total_liabilities = total_assets

        symbol = getattr(company, 'currency_symbol', '$' if company and ('CAD' in company.name or 'USD' in company.name) else '₹') if company else '₹'

        adj_qs = gl_entries.filter(account='Freight & Adjustments')
        adj_cr = adj_qs.aggregate(s=Sum('credit'))['s'] or Decimal('0.00')
        adj_dr = adj_qs.aggregate(s=Sum('debit'))['s'] or Decimal('0.00')
        freight_adj = adj_cr - adj_dr

        excluded_accs = {
            'Sales Income', 'Cost of Goods Sold', 'Purchases',
            'Debtors', 'Debtors (Customer Receivables)',
            'Creditors', 'Creditors (Supplier Payables)',
            'Bank Account', 'Cash Account', 'Output GST', 'Input GST',
            'Freight & Adjustments', 'Stock in Hand', 'Inventory', 'Finished Goods Inventory',
            'Raw Material Inventory', 'Scrap Inventory', 'Direct Labour Payable', 'Manufacturing Overheads',
            'Opening Balance Equity', 'Capital Account', 'Fixed Assets (Partner Brought)', 'Unit Petty Cash',
            'Inter-Division Supply Income', 'Inter-Division Stock Cost',
            'Inter-Division Receivable', 'Inter-Division Payable'
        }
        other_exp_qs = (
            gl_entries.exclude(account__in=excluded_accs)
            .exclude(account__regex=r'(?i)^(bank|cash|debtors|creditors|output gst|input gst|sales income|cost of goods|inter-division|partner capital|loan payable|fixed asset|unit petty cash)')
            .values('account')
            .annotate(dr=Sum('debit'), cr=Sum('credit'))
        )
        other_expenses = []
        other_exp_total = Decimal('0.00')
        for row in other_exp_qs:
            net_exp = (row['dr'] or Decimal('0.00')) - (row['cr'] or Decimal('0.00'))
            if net_exp != Decimal('0.00'):
                other_expenses.append({'account': row['account'], 'amount': float(net_exp)})
                other_exp_total += net_exp
        net_profit_val = gross_profit + freight_adj - other_exp_total

        unit_bifurcation = []
        if company:
            ensure_default_units(company)
            for u in BusinessUnit.objects.filter(company=company, is_active=True).order_by('id'):
                u_gl = base_gl_entries.filter(unit=u)
                u_ext_sales = base_sales_qs.filter(unit=u).aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')
                u_inter_inc = u_gl.filter(account='Inter-Division Supply Income').aggregate(s=Sum('credit'))['s'] or Decimal('0.00')
                u_sales = u_ext_sales + u_inter_inc

                u_ext_pur = base_pur_qs.filter(unit=u).aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')
                u_inter_cost = u_gl.filter(account='Inter-Division Stock Cost').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')
                u_pur = u_ext_pur + u_inter_cost

                u_stock_val = Decimal('0.00')
                for itm in items_qs:
                    uq = StockLedgerEntry.objects.filter(company=company, unit=u, item=itm).aggregate(q=Sum('actual_qty'))['q'] or Decimal('0.00')
                    if uq > 0:
                        u_stock_val += uq * Decimal(str(itm.standard_rate or 0))
                u_cogs = max(Decimal('0.00'), u_pur - u_stock_val)
                if u_cogs <= Decimal('0.00') and u_sales > Decimal('0.00'):
                    u_cogs = u_sales * Decimal('0.80')
                u_gp = u_sales - u_cogs
                u_adj_qs = u_gl.filter(account='Freight & Adjustments')
                u_adj = (u_adj_qs.aggregate(s=Sum('credit'))['s'] or Decimal('0.00')) - (u_adj_qs.aggregate(s=Sum('debit'))['s'] or Decimal('0.00'))
                u_exp_qs = (
                    u_gl.exclude(account__in=excluded_accs)
                    .exclude(account__regex=r'(?i)^(bank|cash|debtors|creditors|output gst|input gst|sales income|cost of goods|inter-division)')
                    .values('account')
                    .annotate(dr=Sum('debit'), cr=Sum('credit'))
                )
                u_exp_list = []
                u_exp_tot = Decimal('0.00')
                for row in u_exp_qs:
                    ne = (row['dr'] or Decimal('0.00')) - (row['cr'] or Decimal('0.00'))
                    if ne != Decimal('0.00'):
                        u_exp_list.append({'account': row['account'], 'amount': float(ne)})
                        u_exp_tot += ne
                u_np = u_gp + u_adj - u_exp_tot
                unit_bifurcation.append({
                    'unit_id': u.id,
                    'code': u.code,
                    'name': u.name,
                    'unit_type': u.unit_type,
                    'sales': float(u_sales),
                    'purchases': float(u_pur),
                    'closing_stock': float(u_stock_val),
                    'cogs': float(u_cogs),
                    'gross_profit': float(u_gp),
                    'other_expenses': u_exp_list,
                    'other_expenses_total': float(u_exp_tot),
                    'net_profit': float(u_np),
                })

        return Response({
            "currency_symbol": symbol,
            "business_type": getattr(company, 'business_type', 'HYBRID') if company else 'HYBRID',
            "income": {
                "sales": float(net_sales),
                "freight_adjustments": float(freight_adj),
                "total_income": float(net_sales + freight_adj),
            },
            "expense": {
                "purchases": float(cogs),
                "other_expenses": other_expenses,
                "other_expenses_total": float(other_exp_total),
                "total_expense": float(cogs + other_exp_total),
            },
            "profit": {
                "gross_profit": float(gross_profit),
                "freight_adjustments": float(freight_adj),
                "other_expenses_total": float(other_exp_total),
                "net_profit": float(net_profit_val),
            },
            "gst": {
                "input_itc": float(input_gst),
                "output_liability": float(output_gst),
                "net_payable": float(net_gst),
            },
            "balance_sheet": {
                "assets": {
                    "bank_cash": float(bank_balance),
                    "fixed_assets": float(fixed_assets),
                    "debtors_receivable": float(debtors),
                    "gst_credit": float(gst_credit),
                    "closing_stock": float(closing_stock_val),
                    "total_assets": float(total_assets),
                },
                "liabilities": {
                    "creditors_payable": float(creditors),
                    "gst_payable": float(gst_payable),
                    "total_liabilities": float(total_liabilities),
                },
            },
            "unit_bifurcation": unit_bifurcation,
        })

class GeneralLedgerAPIView(APIView):
    def get(self, request):
        company = get_active_company(request)
        party = request.GET.get('party')
        account = request.GET.get('account')
        unit_id = request.GET.get('unit_id')
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')

        filters = {'is_cancelled': False}
        if party and party != 'all':
            filters['party'] = party
        if from_date:
            filters['posting_date__gte'] = from_date
        if to_date:
            filters['posting_date__lte'] = to_date
        ho_unit_filter = None
        if unit_id and str(unit_id) not in ('all', 'ALL', 'undefined', 'null', ''):
            u_obj = BusinessUnit.objects.filter(id=int(unit_id)).first()
            if u_obj and u_obj.unit_type == 'HO':
                ho_unit_filter = int(unit_id)
            else:
                filters['unit_id'] = int(unit_id)

        try:
            entries = GLEntry.objects.filter(**filters)
            if ho_unit_filter is not None:
                entries = entries.filter(
                    Q(unit_id=ho_unit_filter) |
                    Q(voucher_type__in=['Counter Receipt', 'Cash Received Voucher'])
                )
            is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
            if company:
                entries = entries.filter(company=company)

            # Universal Smart Drill-down
            if account and account != 'all':
                acc_lower = account.lower()
                if any(k in acc_lower for k in ['purchase', 'cost of goods', 'cogs', 'stock received']):
                    entries = entries.filter(
                        Q(account__icontains='Purchase') | 
                        Q(account__icontains='Stock Received') |
                        Q(voucher_type='Purchase Invoice')
                    )
                elif 'sales' in acc_lower:
                    entries = entries.filter(Q(account__icontains='Sales'))
                elif 'debtor' in acc_lower or 'receivable' in acc_lower:
                    entries = entries.filter(Q(account__icontains='Debtor'))
                elif 'creditor' in acc_lower or 'payable' in acc_lower:
                    entries = entries.filter(Q(account__icontains='Creditor'))
                elif 'bank' in acc_lower or 'cash' in acc_lower:
                    entries = entries.filter(account__regex=r'(?i)bank|cash')
                elif 'itc' in acc_lower or 'input gst' in acc_lower:
                    entries = entries.filter(account__icontains='Input GST')
                elif 'output gst' in acc_lower:
                    entries = entries.filter(account__icontains='Output GST')
                else:
                    entries = entries.filter(account__icontains=account)

            entries = entries.order_by('posting_date', 'id')
        except Exception:
            entries = []

        report = []
        running_balance = Decimal('0.00')
        is_filtered = bool(account and account != 'all')

        for row in entries:
            net_change = row.debit - row.credit
            if is_filtered:
                if row.account in ['Creditors', 'Output GST', 'Sales Income']:
                    running_balance += (row.credit - row.debit)
                else:
                    running_balance += (row.debit - row.credit)
                row_bal = running_balance
            else:
                row_bal = abs(net_change)

            report.append({
                'id': row.id,
                'posting_date': row.posting_date,
                'account': row.account,
                'party_type': row.party_type,
                'party': row.party,
                'voucher_type': row.voucher_type,
                'voucher_no': row.voucher_no,
                'against': row.against,
                'remarks': row.remarks,
                'unit_id': row.unit_id,
                'unit_name': row.unit.name if getattr(row, 'unit', None) else 'Unassigned',
                'debit': float(row.debit),
                'credit': float(row.credit),
                'balance': float(row_bal)
            })

        return Response(report)


class DashboardSummaryAPIView(APIView):
    def get(self, request):
        company = get_active_company(request)
        try:
            is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
            sales_qs = SalesInvoice.objects.filter(company=company)
            pur_qs = PurchaseInvoice.objects.filter(company=company)
            active_u = resolve_active_unit(request, company)
            if active_u:
                sales_qs = sales_qs.filter(unit=active_u)
                pur_qs = pur_qs.filter(unit=active_u)

            total_sales = sales_qs.aggregate(total=Sum('grand_total'))['total'] or Decimal('0.00')
            total_purchases = pur_qs.aggregate(total=Sum('grand_total'))['total'] or Decimal('0.00')
        except Exception:
            total_sales = Decimal('0.00')
            total_purchases = Decimal('0.00')

        try:
            bank_entries = GLEntry.objects.filter(account__in=['Bank Account', 'Cash Account'], is_cancelled=False)
            if company:
                bank_entries = bank_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else bank_entries.filter(company=company)
            active_u = resolve_active_unit(request, company)
            if active_u:
                bank_entries = bank_entries.filter(unit=active_u)
            bank_debit = bank_entries.aggregate(total=Sum('debit'))['total'] or 0
            bank_credit = bank_entries.aggregate(total=Sum('credit'))['total'] or 0
            bank_balance = float(bank_debit) - float(bank_credit)
        except Exception:
            bank_balance = 0.0

        currency = getattr(company, 'default_currency', 'CAD' if company and 'CAD' in company.name else 'INR') if company else 'INR'
        symbol = getattr(company, 'currency_symbol', '$' if company and ('CAD' in company.name or 'USD' in company.name) else '₹') if company else '₹'

        return Response({
            "total_sales": float(total_sales),
            "total_purchases": float(total_purchases),
            "bank_balance": bank_balance,
            "currency": currency,
            "currency_symbol": symbol,
            "company_name": company.name if company else ""
        })


class GSTReturnSummaryAPIView(APIView):
    def get(self, request):
        company = get_active_company(request)
        summary_map = {}
        is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))

        try:
            s_qs = SalesInvoice.objects.filter(company=company)
            for inv in s_qs:
                p_date = getattr(inv, 'posting_date', None)
                if not p_date:
                    continue
                m_str = str(p_date)[:7]
                if m_str not in summary_map:
                    summary_map[m_str] = {'month': m_str, 'sales': Decimal('0.00'), 'purchases': Decimal('0.00'), 'output_gst': Decimal('0.00'), 'input_gst': Decimal('0.00')}
                summary_map[m_str]['sales'] += Decimal(str(inv.net_total or 0))
                summary_map[m_str]['output_gst'] += Decimal(str(inv.tax_amount or 0))
        except Exception:
            pass

        try:
            p_qs = PurchaseInvoice.objects.filter(company=company)
            for pur in p_qs:
                p_date = getattr(pur, 'posting_date', None)
                if not p_date:
                    continue
                m_str = str(p_date)[:7]
                if m_str not in summary_map:
                    summary_map[m_str] = {'month': m_str, 'sales': Decimal('0.00'), 'purchases': Decimal('0.00'), 'output_gst': Decimal('0.00'), 'input_gst': Decimal('0.00')}
                summary_map[m_str]['purchases'] += Decimal(str(pur.net_total or 0))
                summary_map[m_str]['input_gst'] += Decimal(str(pur.tax_amount or 0))
        except Exception:
            pass

        result = []
        for m_str in sorted(summary_map.keys(), reverse=True):
            row = summary_map[m_str]
            out_tax = row['output_gst']
            in_tax = row['input_gst']
            result.append({
                'id': m_str,
                'month': m_str,
                'sales': float(row['sales']),
                'purchases': float(row['purchases']),
                'output_gst': float(out_tax),
                'input_gst': float(in_tax),
                'net_gst': float(out_tax - in_tax),
            })
        return Response(result, status=status.HTTP_200_OK)


class PartyOutstandingAPIView(APIView):
    def get(self, request):
        company = get_active_company(request)
        is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
        try:
            debtor_entries = GLEntry.objects.filter(account="Debtors", is_cancelled=False)
            creditor_entries = GLEntry.objects.filter(account="Creditors", is_cancelled=False)
            if company:
                debtor_entries = debtor_entries.filter(company=company)
                creditor_entries = creditor_entries.filter(company=company)

            cust_summary = debtor_entries.values('party').annotate(total_debit=Sum('debit'), total_credit=Sum('credit')).order_by('-total_debit')
            customers_data = {}
            total_receivable = Decimal('0.00')
            for c in cust_summary:
                party = c['party'] or 'Unknown'
                bal = (c['total_debit'] or Decimal('0.00')) - (c['total_credit'] or Decimal('0.00'))
                if bal > Decimal('0.00'):
                    total_receivable += bal
                customers_data[party] = float(bal)

            supp_summary = creditor_entries.values('party').annotate(total_credit=Sum('credit'), total_debit=Sum('debit')).order_by('-total_credit')
            suppliers_data = {}
            total_payable = Decimal('0.00')
            for s in supp_summary:
                party = s['party'] or 'Unknown'
                bal = (s['total_credit'] or Decimal('0.00')) - (s['total_debit'] or Decimal('0.00'))
                if bal > Decimal('0.00'):
                    total_payable += bal
                suppliers_data[party] = float(bal)

            return Response({
                'customers': customers_data,
                'suppliers': suppliers_data,
                'total_receivable': float(total_receivable),
                'total_payable': float(total_payable)
            })
        except Exception:
            return Response({'customers': {}, 'suppliers': {}, 'total_receivable': 0.0, 'total_payable': 0.0})


class PaymentEntryListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = PaymentEntrySerializer

    def get_queryset(self):
        comp = get_active_company(self.request)
        qs = PaymentEntry.objects.all().order_by('-id')
        if comp:
            if comp.id == 1 or "tallybiz" in comp.name.lower():
                qs = qs.filter(Q(company=comp) | Q(company__isnull=True))
            else:
                qs = qs.filter(company=comp)
        u = resolve_active_unit(self.request, comp)
        if u and u.unit_type != 'HO':
            qs = qs.filter(unit=u)
        return qs

    def perform_create(self, serializer):
        comp = get_active_company(self.request)
        u = resolve_active_unit(self.request, comp, default_unit_type='HO')
        vno = (self.request.data.get('voucher_no') or '').strip()
        if not vno or PaymentEntry.objects.filter(company=comp, unit=u, voucher_no=vno).exists():
            cnt = PaymentEntry.objects.filter(company=comp, unit=u).count() + 1
            vno = f"PAY-{cnt:04d}"
            while PaymentEntry.objects.filter(company=comp, unit=u, voucher_no=vno).exists():
                cnt += 1
                vno = f"PAY-{cnt:04d}"
        serializer.save(company=comp, unit=u, voucher_no=vno)


class PaymentEntryRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PaymentEntry.objects.all()
    serializer_class = PaymentEntrySerializer

    @transaction.atomic
    def perform_destroy(self, instance):
        GLEntry.objects.filter(company=instance.company, unit=instance.unit, voucher_type='Payment Entry', voucher_no=instance.voucher_no).delete()
        instance.delete()


class CustomLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username') or request.data.get('email')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': 'Both username/email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        if not user:
            try:
                user_obj = User.objects.get(email=username)
                user = authenticate(username=user_obj.username, password=password)
            except User.DoesNotExist:
                user = None

        if not user:
            return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)
        
        if not user.is_superuser:
            profile = getattr(user, 'profile', None)
            if profile and not profile.is_approved:
                return Response({'error': 'Your account has not been approved.'}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        role = 'ADMIN' if user.is_superuser else 'SALES_USER'
        company_data = None

        if hasattr(user, 'profile') and user.profile.company:
            comp = user.profile.company
            sym = getattr(comp, 'currency_symbol', '$' if 'CAD' in comp.name or 'USD' in comp.name else '₹')
            cur = getattr(comp, 'default_currency', 'CAD' if 'CAD' in comp.name else 'INR')
            company_data = {
                'id': comp.id,
                'name': comp.name,
                'currency': cur,
                'symbol': sym,
                'currency_symbol': sym,
                'country': getattr(comp, 'country', 'India')
            }

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'role': role,
                'company': company_data
            }
        }, status=status.HTTP_200_OK)


class JournalEntryViewSet(viewsets.ModelViewSet):
    queryset = JournalEntry.objects.all().order_by('-posting_date', '-id')
    serializer_class = JournalEntrySerializer


class PaymentReconciliationAPIView(APIView):
    def get(self, request):
        return Response({"invoices": [], "payments": []})


class ApproveDocumentAPIView(APIView):
    @transaction.atomic
    def post(self, request, doc_type, doc_id):
        return Response({'status': 'Approved'}, status=status.HTTP_200_OK)


class FrontendCompanyCreateView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        name = request.data.get('name')
        currency = request.data.get('currency', 'INR')
        symbol = request.data.get('symbol', '$' if currency in ['CAD', 'USD'] else '₹')
        country = request.data.get('country', 'India')
        address = request.data.get('address', '')
        gstin = request.data.get('gstin', '')
        business_type = str(request.data.get('business_type', 'HYBRID')).strip().upper()
        if business_type not in ('HYBRID', 'TRADING', 'MANUFACTURING'):
            business_type = 'HYBRID'

        if not name:
            return Response({'error': 'Company name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        company = AccountsCompany.objects.create(
            name=name,
            default_currency=currency,
            currency_symbol=symbol,
            country=country,
            address=address,
            tax_id=gstin,
            business_type=business_type
        )

        req_user = _resolve_gateway_user(request)
        user_payload = None
        if req_user:
            prof, _ = UserProfile.objects.get_or_create(user=req_user)
            prof.role = 'ADMIN'
            prof.company = company
            prof.is_approved = True
            prof.save()
            user_payload = {
                'id': req_user.id,
                'username': req_user.username,
                'email': req_user.email,
                'first_name': req_user.first_name,
                'role': 'ADMIN',
                'company': {
                    'id': company.id,
                    'name': company.name,
                    'currency': company.default_currency,
                    'symbol': company.currency_symbol,
                    'country': company.country,
                    'business_type': company.business_type,
                }
            }

        return Response({
            'message': 'Company created successfully. You are now Admin.',
            'company': {
                'id': company.id,
                'name': company.name,
                'currency': company.default_currency,
                'symbol': company.currency_symbol,
                'currency_symbol': company.currency_symbol,
                'business_type': company.business_type
            },
            'user': user_payload
        }, status=status.HTTP_201_CREATED)


class FrontendUserCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({'message': 'OK'}, status=status.HTTP_201_CREATED)


# --- MAKER-CHECKER APPROVAL & REJECTION ENDPOINTS ---
from rest_framework.views import APIView as _ApprovalAPIView
from rest_framework.response import Response as _ApprovalResponse
from rest_framework.exceptions import ValidationError as _ApprovalValidationError
from django.shortcuts import get_object_or_404 as _get_obj_404


class MakerCheckerApprovalAPIView(_ApprovalAPIView):
    authentication_classes = []
    permission_classes = []
    def post(self, request, action_type, doc_type, pk):
        from backend.erp_workflow import (
            approve_and_post_sales_invoice,
            reverse_sales_invoice_on_delete,
            sync_purchase_invoice,
            reverse_purchase_invoice_on_delete,
        )

        action = str(action_type).strip().lower()
        dtype = str(doc_type).strip().lower()

        try:
            def _stamp_approval_audit(doc):
                from django.utils import timezone
                from django.contrib.auth import get_user_model
                UserModel = get_user_model()
                approver = None
                if getattr(request, 'user', None) and request.user.is_authenticated:
                    approver = request.user
                else:
                    uid = (
                        request.headers.get('X-User-ID')
                        or request.META.get('HTTP_X_USER_ID')
                        or request.GET.get('user_id')
                    )
                    uname = (
                        request.headers.get('X-Username')
                        or request.META.get('HTTP_X_USERNAME')
                    )
                    if uid:
                        approver = UserModel.objects.filter(id=uid).first()
                    if not approver and uname:
                        approver = UserModel.objects.filter(username=uname).first()
                uf = []
                if hasattr(doc, 'approved_by') and approver:
                    doc.approved_by = approver
                    uf.append('approved_by')
                if hasattr(doc, 'approval_date'):
                    doc.approval_date = timezone.now()
                    uf.append('approval_date')
                if uf:
                    doc.save(update_fields=uf)

            if dtype in ('sales-invoice', 'sales_invoice', 'invoice'):
                from selling.models import SalesInvoice
                inv = _get_obj_404(SalesInvoice, pk=pk)
                if action == 'approve':
                    approve_and_post_sales_invoice(inv)
                    _stamp_approval_audit(inv)
                    return _ApprovalResponse({'status': 'Approved', 'id': inv.id})
                elif action == 'reject':
                    reverse_sales_invoice_on_delete(inv)
                    inv.status = 'Rejected'
                    inv.save(update_fields=['status'])
                    return _ApprovalResponse({'status': 'Rejected', 'id': inv.id})

            elif dtype in ('purchase-invoice', 'purchase_invoice', 'purchase-bill', 'purchase_bill'):
                from buying.models import PurchaseInvoice
                bill = _get_obj_404(PurchaseInvoice, pk=pk)
                if action == 'approve':
                    bill.status = 'Approved'
                    bill.save(update_fields=['status'])
                    sync_purchase_invoice(bill)
                    _stamp_approval_audit(bill)
                    return _ApprovalResponse({'status': 'Approved', 'id': bill.id})
                elif action == 'reject':
                    reverse_purchase_invoice_on_delete(bill)
                    bill.status = 'Rejected'
                    bill.save(update_fields=['status'])
                    return _ApprovalResponse({'status': 'Rejected', 'id': bill.id})

            return _ApprovalResponse({'error': f'Unsupported document type: {doc_type}'}, status=400)

        except _ApprovalValidationError as exc:
            detail = exc.detail
            msg = detail.get('error') if isinstance(detail, dict) and 'error' in detail else str(detail)
            return _ApprovalResponse({'error': msg}, status=400)
        except Exception as exc:
            return _ApprovalResponse({'error': str(exc)}, status=400)


class DatabaseBackupAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        import io
        from django.core.management import call_command
        from django.http import HttpResponse
        from django.utils import timezone

        req_user = _resolve_gateway_user(request)
        if req_user and not req_user.is_superuser:
            prof = getattr(req_user, 'profile', None)
            if prof and prof.company_id and prof.role != 'ADMIN':
                return Response({'error': 'Only Company Admin can backup data.'}, status=status.HTTP_403_FORBIDDEN)

        buf = io.StringIO()
        call_command(
            'dumpdata',
            exclude=['contenttypes', 'auth.Permission', 'sessions.Session', 'admin.LogEntry'],
            natural_foreign=True,
            natural_primary=True,
            indent=2,
            stdout=buf,
        )
        fname = f"TallyBIZ_Backup_{timezone.now().strftime('%Y-%m-%d_%H-%M')}.json"
        resp = HttpResponse(buf.getvalue(), content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="{fname}"'
        return resp


class DatabaseRestoreAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        import json, os, tempfile
        from django.core.management import call_command

        req_user = _resolve_gateway_user(request)
        has_companies = AccountsCompany.objects.exists()
        if has_companies and req_user and not req_user.is_superuser:
            prof = getattr(req_user, 'profile', None)
            if prof and prof.company_id and prof.role != 'ADMIN':
                return Response({'error': 'Only Company Admin can restore data.'}, status=status.HTTP_403_FORBIDDEN)

        uploaded = request.FILES.get('file')
        if uploaded:
            raw_text = uploaded.read().decode('utf-8')
        elif isinstance(request.data, dict) and 'backup_json' in request.data:
            raw_text = request.data['backup_json']
        else:
            return Response({'error': 'Please upload a valid .json backup file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed = json.loads(raw_text)
            if not isinstance(parsed, list):
                return Response({'error': 'Invalid backup format.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': f'Invalid JSON file: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as tmp:
                tmp.write(raw_text)
                tmp_path = tmp.name
            import json as _json
            from django.db.models.signals import post_save
            from .models import UserProfile
            orig_rcv = list(post_save.receivers)
            post_save.receivers = []
            post_save.sender_receivers_cache.clear()
            try:
                with transaction.atomic():
                    unames = [x["fields"]["user"][0] for x in _json.load(open(tmp_path, encoding="utf-8")) if x.get("model") == "accounts.userprofile" and isinstance(x.get("fields", {}).get("user"), list)]
                    if unames:
                        UserProfile.objects.filter(user__username__in=unames).delete()
                    call_command("loaddata", tmp_path, verbosity=0)
            finally:
                post_save.receivers = orig_rcv
                post_save.sender_receivers_cache.clear()
            return Response({'message': 'Database restored successfully!'}, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': f'Restore failed: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)


class CompanyBrandingAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def _serialize_company(self, c):
        b_name = getattr(c, 'bank_name', '') or ''
        b_acc = getattr(c, 'bank_account_no', '') or ''
        b_ifsc = getattr(c, 'bank_ifsc', '') or ''
        b_branch = getattr(c, 'bank_branch', '') or ''
        b_acc_name = getattr(c, 'bank_account_name', '') or c.name

        # Fallback parse from legacy bank_details text if dedicated fields are empty
        legacy = getattr(c, 'bank_details', '') or ''
        if legacy and not (b_name or b_acc or b_ifsc):
            for part in legacy.split('|'):
                p = part.strip()
                if p.lower().startswith('bank:'):
                    b_name = p.split(':', 1)[1].strip()
                elif 'a/c' in p.lower() or 'acc' in p.lower():
                    b_acc = p.split(':', 1)[1].strip() if ':' in p else p
                elif p.lower().startswith('ifsc:'):
                    b_ifsc = p.split(':', 1)[1].strip()

        default_terms = (
            "1. Subject to local Jurisdiction.\n"
            "2. Our Responsibility Ceases as soon as goods leaves our Premises.\n"
            "3. Goods once sold will not be taken back.\n"
            "4. Interest @18% p.a. will be charged if payment is delayed."
        )
        return {
            'id': c.id,
            'name': c.name,
            'tagline': getattr(c, 'tagline', '') or '',
            'contact_person': getattr(c, 'contact_person', '') or '',
            'phone': getattr(c, 'phone', '') or '',
            'email': getattr(c, 'email', '') or '',
            'address': c.address or '',
            'gstin': c.gstin or c.tax_id or '',
            'pan': getattr(c, 'pan', '') or ((c.gstin or '')[2:12] if len(c.gstin or '') >= 12 else ''),
            'state': c.state or 'Gujarat (24)',
            'country': c.country or 'India',
            'currency_symbol': c.currency_symbol or '₹',
            'upi_id': getattr(c, 'upi_id', '') or '',
            'bank_name': b_name,
            'bank_branch': b_branch,
            'bank_account_name': b_acc_name,
            'bank_account_no': b_acc,
            'bank_ifsc': b_ifsc,
            'bank_details': legacy,
            'logo_data_url': getattr(c, 'logo_data_url', '') or '',
            'invoice_terms': (getattr(c, 'invoice_terms', '') or '').strip() or default_terms,
        }

    def get(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._serialize_company(comp), status=status.HTTP_200_OK)

    def put(self, request):
        comp = get_active_company(request)
        if not comp:
            return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)
        d = request.data or {}
        str_fields = [
            'name', 'tagline', 'contact_person', 'phone', 'email',
            'address', 'gstin', 'pan', 'state', 'upi_id',
            'bank_name', 'bank_branch', 'bank_account_name',
            'bank_account_no', 'bank_ifsc', 'logo_data_url', 'invoice_terms'
        ]
        for f in str_fields:
            if f in d and d[f] is not None:
                val = str(d[f]) if f in ('logo_data_url', 'invoice_terms', 'address') else str(d[f]).strip()
                if f == 'name' and not val:
                    continue
                setattr(comp, f, val)
        if 'gstin' in d and d['gstin']:
            comp.tax_id = str(d['gstin']).strip()

        parts = []
        if comp.bank_name:
            parts.append(f"Bank: {comp.bank_name}")
        if comp.bank_account_no:
            parts.append(f"A/c No: {comp.bank_account_no}")
        if comp.bank_ifsc:
            parts.append(f"IFSC: {comp.bank_ifsc}")
        if parts:
            comp.bank_details = " | ".join(parts)

        comp.save()
        return Response(self._serialize_company(comp), status=status.HTTP_200_OK)

    def post(self, request):
        return self.put(request)
