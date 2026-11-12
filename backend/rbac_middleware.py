import json
import re
from django.http import JsonResponse
from django.contrib.auth import get_user_model
from accounts.models import UserProfile

User = get_user_model()


class RBACPermissionMiddleware:
    """
    Enforces Role-Based Access Control (RBAC) across all /api/ endpoints:
    - Admins & Managers: Full access.
    - Sales Users:
      1. Cannot DELETE any record across the system.
      2. Cannot create/modify Suppliers, Purchase Bills, Payments, Journal Entries, Stock Items, or User Approvals.
      3. Cannot modify Customer Legal Name, GSTIN, GST Category, or Customer Type on existing customers.
      4. Cannot directly approve Sales Invoices (forced to Draft).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def _resolve_user_profile(self, request):
        target_user = None
        if getattr(request, 'user', None) and request.user.is_authenticated:
            target_user = request.user
        else:
            user_id = request.headers.get('X-User-ID') or request.GET.get('user_id')
            username = request.headers.get('X-Username') or request.GET.get('username')
            if user_id and str(user_id).isdigit():
                target_user = User.objects.filter(id=int(user_id)).first()
            elif username:
                target_user = User.objects.filter(username__iexact=username).first()

        if not target_user:
            return None, None

        profile = UserProfile.objects.filter(user=target_user).first()
        return target_user, profile

    def __call__(self, request):
        path = request.path
        method = request.method.upper()

        if method == 'OPTIONS' or not path.startswith('/api/'):
            return self.get_response(request)

        # Allow login / auth endpoints
        if '/login' in path or '/token' in path or '/register' in path:
            return self.get_response(request)

        user, profile = self._resolve_user_profile(request)
        if not user:
            return self.get_response(request)

        role_str = (profile.role if profile and profile.role else '').strip().upper().replace(' ', '_')
        is_privileged = bool(user.is_superuser or user.is_staff or role_str in ['ADMIN', 'MANAGER'])

        if is_privileged:
            return self.get_response(request)

        # --- STRICT RESTRICTIONS FOR SALES USER ---
        if role_str == 'SALES_USER':
            # 1. Block all DELETE operations
            if method == 'DELETE':
                return JsonResponse(
                    {'error': 'Permission Denied: Sales Users are not authorized to delete records.'},
                    status=403
                )

            # 2. Block write access to restricted modules
            restricted_prefixes = [
                '/api/buying/',
                '/api/accounts/payments/',
                '/api/accounts/journal-entries/',
                '/api/accounts/users/',
                '/api/accounts/approve',
                '/api/accounts/reject',
                '/api/stock/items/',
            ]
            if method in ['POST', 'PUT', 'PATCH']:
                for prefix in restricted_prefixes:
                    if path.startswith(prefix):
                        return JsonResponse(
                            {'error': f'Permission Denied: Sales Users cannot modify {prefix}.'},
                            status=403
                        )

            # 3. Enforce Customer Core Fields Lock on Edit (PUT / PATCH)
            cust_match = re.match(r'^/api/selling/customers/(\d+)/?$', path)
            if cust_match and method in ['PUT', 'PATCH']:
                cust_id = int(cust_match.group(1))
                try:
                    from selling.models import Customer
                    existing = Customer.objects.filter(id=cust_id).first()
                    if existing and request.body:
                        payload = json.loads(request.body.decode('utf-8'))
                        locked_fields = ['customer_name', 'gstin', 'gst_category', 'customer_type']
                        for field in locked_fields:
                            if field in payload:
                                old_val = (getattr(existing, field, '') or '').strip()
                                new_val = (payload.get(field) or '').strip()
                                if old_val != new_val:
                                    return JsonResponse(
                                        {
                                            'error': f'Compliance Lock: Sales Users cannot modify "{field}" once a customer is created. Contact a Manager or Admin.'
                                        },
                                        status=403
                                    )
                except Exception:
                    pass

            # 4. Prevent Sales User from directly approving Sales Invoices
            if path.startswith('/api/selling/invoices/') and method in ['POST', 'PUT', 'PATCH']:
                try:
                    if request.body:
                        payload = json.loads(request.body.decode('utf-8'))
                        if str(payload.get('status', '')).lower() == 'approved':
                            return JsonResponse(
                                {'error': 'Maker-Checker Policy: Sales Users cannot approve invoices directly.'},
                                status=403
                            )
                except Exception:
                    pass

        return self.get_response(request)
