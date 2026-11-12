from backend.views import CompanyListView
from backend.views import RBACUserManagementView
from django.urls import re_path
from backend.views import UniversalLoginView, CompanyListView
from django.views.generic import RedirectView
from accounts.views import AccountsCompanyListView, AccountsCompanySwitchView
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('api/accounts/companies/', CompanyListView.as_view()),
    path('api/accounts/users/pending/', RBACUserManagementView.as_view()),
    path('api/accounts/users/<int:pk>/approve/', RBACUserManagementView.as_view()),
    path('api/accounts/users/<int:pk>/reject/', RBACUserManagementView.as_view()),
    path('api/accounts/users/<int:pk>/', RBACUserManagementView.as_view()),
    path('api/accounts/users/', RBACUserManagementView.as_view()),
    path('api/accounts/pending-users/', RBACUserManagementView.as_view()),
    path('api/accounts/manage/users/', RBACUserManagementView.as_view()),
    path('api/org/users/pending/', RBACUserManagementView.as_view()),
    path('api/org/users/', RBACUserManagementView.as_view()),

    re_path(r'^api/accounts/auth/login/?$', UniversalLoginView.as_view()),
    path('', RedirectView.as_view(url='http://localhost:5173/', permanent=False)),
    re_path(r'^api/login/?$', UniversalLoginView.as_view()),
    re_path(r'^api/token/?$', UniversalLoginView.as_view()),
    re_path(r'^api/accounts/login/?$', UniversalLoginView.as_view()),
    re_path(r'^api/accounts/token/?$', UniversalLoginView.as_view()),
    re_path(r'^api/org/login/?$', UniversalLoginView.as_view()),
    re_path(r'^api/auth/login/?$', UniversalLoginView.as_view()),
    
    path('', RedirectView.as_view(url='http://localhost:5173/', permanent=False)),
    path('api/companies/', AccountsCompanyListView.as_view()),
    path('api/companies/switch/', AccountsCompanySwitchView.as_view()),

    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    path('api/stock/', include('stock.urls')),
    path('api/selling/', include('selling.urls')),
    path('api/buying/', include('buying.urls')),
    path('api/org/', include('core_org.urls')),
]