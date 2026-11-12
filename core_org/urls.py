from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CompanyViewSet,
    register_user,
    user_profile,
    change_password,
    switch_active_company,
    list_pending_users,
    approve_user_access
)

router = DefaultRouter()
router.register(r'companies', CompanyViewSet, basename='companies')

urlpatterns = [
    path('', include(router.urls)),
    path('signup/', register_user, name='org-signup'),
    path('profile/', user_profile, name='org-profile'),
    path('change-password/', change_password, name='org-change-password'),
    path('switch-company/', switch_active_company, name='org-switch-company'),
    path('admin/pending-users/', list_pending_users, name='org-pending-users'),
    path('admin/approve-user/', approve_user_access, name='org-approve-user'),
]