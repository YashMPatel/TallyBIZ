from accounts.views import MakerCheckerApprovalAPIView
from django.urls import path
from . import views
from .unit_ops_views import UnitPettyCashAPIView, DepartmentRequestListCreateAPIView, DepartmentRequestResolveAPIView
from .capital_banking_views import BankAccountListCreateAPIView, PartnerListCreateAPIView, PartnerTransactionAPIView, LoanListCreateAPIView, LoanRepayAPIView, BankTransferAPIView, FixedAssetPurchaseAPIView
from .unit_ops_views import UnitPettyCashAPIView, DepartmentRequestListCreateAPIView, DepartmentRequestResolveAPIView

urlpatterns = [
    path('bank-accounts/', BankAccountListCreateAPIView.as_view(), name='bank-accounts'),
    path('bank-transfers/', BankTransferAPIView.as_view(), name='bank-transfers'),
    path('asset-purchases/', FixedAssetPurchaseAPIView.as_view(), name='asset-purchases'),
    path('partners/', PartnerListCreateAPIView.as_view(), name='partners'),
    path('partners/<int:pk>/txn/', PartnerTransactionAPIView.as_view(), name='partner-txn'),
    path('loans/', LoanListCreateAPIView.as_view(), name='loans'),
    path('loans/<int:pk>/repay/', LoanRepayAPIView.as_view(), name='loan-repay'),
    path('<str:action_type>/<str:doc_type>/<int:pk>/', MakerCheckerApprovalAPIView.as_view()),
    path('login/', views.CustomLoginView.as_view(), name='login'),
    path('payments/', views.PaymentEntryListCreateAPIView.as_view(), name='payment-list'),
    path('payments/<int:pk>/', views.PaymentEntryRetrieveUpdateDestroyAPIView.as_view(), name='payment-detail'),
    path('general-ledger/', views.GeneralLedgerAPIView.as_view(), name='general-ledger'),
    path('financial-statements/', views.FinancialStatementsAPIView.as_view(), name='financial-statements'),
    path('dashboard-summary/', views.DashboardSummaryAPIView.as_view(), name='dashboard-summary'),
    path('gst-returns/', views.GSTReturnSummaryAPIView.as_view(), name='gst-returns'),
    path('party-outstanding/', views.PartyOutstandingAPIView.as_view(), name='party-outstanding'),

    # Exact routes called by Frontend
    path('units/', views.BusinessUnitListCreateAPIView.as_view(), name='business-units'),
    path('petty-cash/', UnitPettyCashAPIView.as_view(), name='unit-petty-cash'),
    path('requests/', DepartmentRequestListCreateAPIView.as_view(), name='dept-requests'),
    path('requests/<int:pk>/resolve/', DepartmentRequestResolveAPIView.as_view(), name='dept-request-resolve'),
    path('company-branding/', views.CompanyBrandingAPIView.as_view(), name='company-branding'),
    path('manage/company/list/', views.AccountsCompanyListView.as_view(), name='manage-company-list'),
    path('manage/company/switch/', views.AccountsCompanySwitchView.as_view(), name='manage-company-switch'),
    path('manage/company/create/', views.FrontendCompanyCreateView.as_view(), name='manage-company-create'),
    path('manage/backup/', views.DatabaseBackupAPIView.as_view(), name='manage-backup'),
    path('manage/restore/', views.DatabaseRestoreAPIView.as_view(), name='manage-restore'),

    # Fallback routes
    path('companies/', views.AccountsCompanyListView.as_view(), name='company-list'),
    path('companies/switch/', views.AccountsCompanySwitchView.as_view(), name='company-switch'),
    path('create-company/', views.FrontendCompanyCreateView.as_view(), name='create-company'),
]