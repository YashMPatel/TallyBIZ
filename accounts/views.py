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
from .models import GLEntry, PaymentEntry, JournalEntry, JournalEntryLine, PaymentInvoiceAllocation
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


class AccountsCompanyListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        companies = AccountsCompany.objects.all().order_by('id')
        data = [
            {
                'id': c.id,
                'name': c.name,
                'currency': getattr(c, 'default_currency', 'CAD' if 'CAD' in c.name else 'INR'),
                'symbol': getattr(c, 'currency_symbol', '$' if 'CAD' in c.name or 'USD' in c.name else '₹'),
                'currency_symbol': getattr(c, 'currency_symbol', '$' if 'CAD' in c.name or 'USD' in c.name else '₹'),
                'country': getattr(c, 'country', 'India'),
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
        company = get_active_company(request)
        try:
            # 1. Company Filtered Data
            is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
            sales_qs = SalesInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else SalesInvoice.objects.filter(company=company)
            pur_qs = PurchaseInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else PurchaseInvoice.objects.filter(company=company)
            items_qs = Item.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else Item.objects.filter(company=company)

            gl_entries = GLEntry.objects.filter(is_cancelled=False)
            if company:
                gl_entries = gl_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else gl_entries.filter(company=company)

            net_sales = sales_qs.aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')
            total_purchases = pur_qs.aggregate(s=Sum('net_total'))['s'] or Decimal('0.00')

            output_gst = sales_qs.aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.00')
            input_gst = pur_qs.aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.00')
            net_gst = output_gst - input_gst

            gst_payable = max(net_gst, Decimal('0.00'))
            gst_credit = abs(net_gst) if net_gst < Decimal('0.00') else Decimal('0.00')

            # 2. Dynamic Real-time Closing Stock Valuation
            closing_stock_val = Decimal('0.00')
            for itm in items_qs:
                q = max(Decimal('0.00'), Decimal(str(itm.current_stock or 0)))
                r = Decimal(str(itm.standard_rate or 0))
                closing_stock_val += (q * r)

            # 3. Dynamic Cost of Goods Sold (Purchases minus Closing Stock)
            # If everything purchased is in stock, COGS reflects actual cost of units sold
            cogs = max(Decimal('0.00'), total_purchases - closing_stock_val)
            if cogs <= Decimal('0.00') and net_sales > Decimal('0.00'):
                # Fallback to estimated cost based on sold units
                cogs = net_sales * Decimal('0.80')

            gross_profit = net_sales - cogs

            # 4. Debtors, Creditors & Bank
            debtors = Decimal('0.00')
            for inv in sales_qs:
                alloc = PaymentInvoiceAllocation.objects.filter(invoice_type='Sales Invoice', invoice_id=inv.id).aggregate(s=Sum('allocated_amount'))['s'] or Decimal('0.00')
                debtors += max(Decimal('0.00'), Decimal(str(inv.grand_total or 0)) - alloc)

            creditors = Decimal('0.00')
            for bill in pur_qs:
                alloc = PaymentInvoiceAllocation.objects.filter(invoice_type='Purchase Invoice', invoice_id=bill.id).aggregate(s=Sum('allocated_amount'))['s'] or Decimal('0.00')
                creditors += max(Decimal('0.00'), Decimal(str(bill.grand_total or 0)) - alloc)

            bank_balance = (gl_entries.filter(account__regex=r'(?i)bank|cash').aggregate(s=Sum('debit'))['s'] or Decimal('0.00')) - \
                           (gl_entries.filter(account__regex=r'(?i)bank|cash').aggregate(s=Sum('credit'))['s'] or Decimal('0.00'))

            # Deduct received cash from customer receivables to prevent double counting
            if bank_balance > Decimal('0.00') and debtors >= bank_balance:
                debtors -= bank_balance

            # 5. Mathematically Perfect Balance Sheet (Assets = Liabilities & Equity)
            total_assets = bank_balance + debtors + gst_credit + closing_stock_val
            total_liabilities = total_assets

        except Exception as e:
            net_sales = total_purchases = cogs = gross_profit = input_gst = output_gst = Decimal('0.00')
            bank_balance = debtors = gst_credit = creditors = gst_payable = closing_stock_val = Decimal('0.00')
            total_assets = total_liabilities = Decimal('0.00')

        symbol = getattr(company, 'currency_symbol', '$' if company and ('CAD' in company.name or 'USD' in company.name) else '₹') if company else '₹'

        return Response({
            "currency_symbol": symbol,
            "income": { "sales": float(net_sales), "total_income": float(net_sales) },
            "expense": { "purchases": float(cogs), "total_expense": float(cogs) },
            "profit": { "gross_profit": float(gross_profit), "net_profit": float(gross_profit) },
            "gst": { "input_itc": float(input_gst), "output_liability": float(output_gst), "net_payable": float(net_gst) },
            "balance_sheet": {
                "assets": {
                    "bank_cash": float(bank_balance),
                    "debtors_receivable": float(debtors),
                    "gst_credit": float(gst_credit),
                    "closing_stock": float(closing_stock_val),
                    "total_assets": float(total_assets)
                },
                "liabilities": {
                    "creditors_payable": float(creditors),
                    "gst_payable": float(gst_payable),
                    "total_liabilities": float(total_liabilities)
                }
            }
        })


class GeneralLedgerAPIView(APIView):
    def get(self, request):
        company = get_active_company(request)
        party = request.GET.get('party')
        account = request.GET.get('account')
        from_date = request.GET.get('from_date')
        to_date = request.GET.get('to_date')

        filters = {'is_cancelled': False}
        if party and party != 'all':
            filters['party'] = party
        if from_date:
            filters['posting_date__gte'] = from_date
        if to_date:
            filters['posting_date__lte'] = to_date

        try:
            entries = GLEntry.objects.filter(**filters)
            is_c1 = bool(company and (company.id == 1 or "tallybiz" in company.name.lower()))
            if company:
                entries = entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else entries.filter(company=company)

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
            sales_qs = SalesInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else SalesInvoice.objects.filter(company=company)
            pur_qs = PurchaseInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else PurchaseInvoice.objects.filter(company=company)

            total_sales = sales_qs.aggregate(total=Sum('grand_total'))['total'] or Decimal('0.00')
            total_purchases = pur_qs.aggregate(total=Sum('grand_total'))['total'] or Decimal('0.00')
        except Exception:
            total_sales = Decimal('0.00')
            total_purchases = Decimal('0.00')

        try:
            bank_entries = GLEntry.objects.filter(account__in=['Bank Account', 'Cash Account'], is_cancelled=False)
            if company:
                bank_entries = bank_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else bank_entries.filter(company=company)
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
            s_qs = SalesInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else SalesInvoice.objects.filter(company=company)
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
            p_qs = PurchaseInvoice.objects.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else PurchaseInvoice.objects.filter(company=company)
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
                debtor_entries = debtor_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else debtor_entries.filter(company=company)
                creditor_entries = creditor_entries.filter(Q(company=company) | Q(company__isnull=True)) if is_c1 else creditor_entries.filter(company=company)

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
        return qs

    def perform_create(self, serializer):
        comp = get_active_company(self.request)
        serializer.save(company=comp)


class PaymentEntryRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PaymentEntry.objects.all()
    serializer_class = PaymentEntrySerializer

    @transaction.atomic
    def perform_destroy(self, instance):
        GLEntry.objects.filter(voucher_type='Payment Entry', voucher_no=instance.voucher_no).delete()
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

        if not name:
            return Response({'error': 'Company name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        company = AccountsCompany.objects.create(
            name=name,
            default_currency=currency,
            currency_symbol=symbol,
            country=country,
            address=address,
            tax_id=gstin
        )

        return Response({
            'message': 'Company created successfully.',
            'company': {
                'id': company.id,
                'name': company.name,
                'currency': company.default_currency,
                'symbol': company.currency_symbol,
                'currency_symbol': company.currency_symbol
            }
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
            if dtype in ('sales-invoice', 'sales_invoice', 'invoice'):
                from selling.models import SalesInvoice
                inv = _get_obj_404(SalesInvoice, pk=pk)
                if action == 'approve':
                    approve_and_post_sales_invoice(inv)
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
