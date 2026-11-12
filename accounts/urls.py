from accounts.views import MakerCheckerApprovalAPIView
from django.urls import path
from . import views

urlpatterns = [
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
    path('manage/company/list/', views.AccountsCompanyListView.as_view(), name='manage-company-list'),
    path('manage/company/switch/', views.AccountsCompanySwitchView.as_view(), name='manage-company-switch'),
    path('manage/company/create/', views.FrontendCompanyCreateView.as_view(), name='manage-company-create'),

    # Fallback routes
    path('companies/', views.AccountsCompanyListView.as_view(), name='company-list'),
    path('companies/switch/', views.AccountsCompanySwitchView.as_view(), name='company-switch'),
    path('create-company/', views.FrontendCompanyCreateView.as_view(), name='create-company'),
]