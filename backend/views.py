from django.contrib.auth import get_user_model
User = get_user_model()
from accounts.models import UserProfile, Company
from django.contrib.auth import authenticate, get_user_model
from backend.permissions import IsCompanyAdmin, is_approved
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

class UniversalLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        data = request.data or {}
        identifier = str(data.get('username') or data.get('email') or data.get('username_or_email') or '').strip()
        password = str(data.get('password') or '').strip()

        if not identifier or not password:
            return Response({'error': 'Username/Email and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Match user by username or email
        user = User.objects.filter(username__iexact=identifier).first()
        if not user:
            user = User.objects.filter(email__iexact=identifier).first()

        if not user:
            return Response({'error': 'Invalid credentials. User does not exist.'}, status=status.HTTP_401_UNAUTHORIZED)

        # Authenticate
        auth_user = authenticate(username=user.username, password=password)
        if not auth_user and user.check_password(password):
            auth_user = user

        if not auth_user:
            return Response({'error': 'Invalid password. Please check your password.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not is_approved(auth_user):
            msg = 'Your account is pending admin approval.' if auth_user.is_active else 'This account is disabled.'
            return Response({'error': msg}, status=status.HTTP_403_FORBIDDEN)

        # Determine Role
        role = 'ADMIN' if (auth_user.is_superuser or auth_user.is_staff) else 'STAFF'
        assigned_unit_id = None
        assigned_unit_name = 'All Divisions'
        try:
            profile = getattr(auth_user, 'profile', None)
            if profile:
                if getattr(profile, 'role', None):
                    role = profile.role
                if not auth_user.is_superuser and getattr(profile, 'assigned_unit_id', None):
                    assigned_unit_id = profile.assigned_unit_id
                    assigned_unit_name = profile.assigned_unit.name if profile.assigned_unit else ''
        except Exception:
            pass

        refresh = RefreshToken.for_user(auth_user)
        access_token = str(refresh.access_token)

        user_data = {
            'id': auth_user.id,
            'username': auth_user.username,
            'email': auth_user.email,
            'first_name': auth_user.first_name or auth_user.username,
            'last_name': auth_user.last_name or '',
            'role': role,
            'is_superuser': auth_user.is_superuser,
            'is_staff': auth_user.is_staff,
            'assigned_unit_id': assigned_unit_id,
            'assigned_unit_name': assigned_unit_name,
            'can_view_all_units': assigned_unit_id is None,
            'custom_permissions': getattr(getattr(auth_user, 'profile', None), 'custom_permissions', []) or [],
        }

        return Response({
            'token': access_token,
            'access': access_token,
            'refresh': str(refresh),
            'user': user_data,
            'message': 'Login successful'
        }, status=status.HTTP_200_OK)


class RBACUserManagementView(APIView):
    permission_classes = [IsCompanyAdmin]

    def get(self, request, *args, **kwargs):
        from backend.permissions import jwt_user
        req_user = jwt_user(request)
        include_all = request.query_params.get('include_all') == '1'
        qs = UserProfile.objects.select_related('user', 'company', 'assigned_unit').order_by('is_approved', 'id')
        comp_filter = request.query_params.get('company_id') or request.headers.get('X-Company-Id')
        if req_user and not req_user.is_superuser:
            admin_prof = UserProfile.objects.filter(user=req_user).first()
            if admin_prof and admin_prof.company_id:
                qs = qs.filter(company_id=admin_prof.company_id)
            else:
                qs = qs.none()
        elif comp_filter and str(comp_filter).isdigit():
            qs = qs.filter(company_id=int(comp_filter))
        if not include_all:
            qs = qs.filter(is_approved=False)
        users_list = []
        for p in qs:
            u = p.user
            comp_id = p.company.id if p.company else None
            comp_name = p.company.name if p.company else 'Unassigned'
            unit_id = p.assigned_unit.id if p.assigned_unit else None
            unit_name = p.assigned_unit.name if p.assigned_unit else 'All Divisions'
            user_obj = {
                'id': u.id,
                'username': u.username,
                'email': u.email or '',
                'first_name': u.first_name or u.username,
                'last_name': u.last_name or '',
            }
            users_list.append({
                'id': p.id,
                'profile_id': p.id,
                'user_id': u.id,
                'user': user_obj,
                'username': u.username,
                'email': u.email or '',
                'first_name': u.first_name or u.username,
                'last_name': u.last_name or '',
                'role': p.role or 'Sales User',
                'company': comp_id,
                'company_id': comp_id,
                'company_name': comp_name,
                'assigned_unit_id': unit_id,
                'assigned_unit_name': unit_name,
                'can_view_all_units': unit_id is None,
                'is_approved': p.is_approved,
                'custom_permissions': getattr(p, 'custom_permissions', []) or [],
                'is_superuser': u.is_superuser,
                'date_joined': u.date_joined.strftime('%Y-%m-%d') if u.date_joined else '',
            })
        return Response(users_list, status=status.HTTP_200_OK)

    def post(self, request, pk=None, *args, **kwargs):
        from accounts.models import BusinessUnit
        from backend.permissions import jwt_user
        req_user = jwt_user(request)
        data = request.data or {}
        profile_id = pk or data.get('profile_id') or data.get('id') or data.get('user_id')
        profile = UserProfile.objects.filter(id=profile_id).first() or UserProfile.objects.filter(user_id=profile_id).first()

        if not profile:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

        if req_user and not req_user.is_superuser:
            admin_prof = UserProfile.objects.filter(user=req_user).first()
            if not admin_prof or not admin_prof.company_id or profile.company_id != admin_prof.company_id:
                return Response({'error': 'You can only manage users belonging to your own company.'}, status=status.HTTP_403_FORBIDDEN)

        action = request.path.strip('/').split('/')[-1]
        if action in ['approve', 'accept'] or data.get('action') in ['approve', 'update_access'] or data.get('is_approved') is True:
            if data.get('action') != 'update_access':
                profile.is_approved = True
            if data.get('role'):
                profile.role = data.get('role')
            if isinstance(data.get('custom_permissions'), (list, dict)):
                profile.custom_permissions = data.get('custom_permissions')
            if data.get('company') or data.get('company_id'):
                cid = data.get('company') or data.get('company_id')
                if req_user and not req_user.is_superuser:
                    admin_prof = UserProfile.objects.filter(user=req_user).first()
                    if admin_prof and admin_prof.company_id:
                        cid = admin_prof.company_id
                c = Company.objects.filter(id=cid).first()
                if c:
                    profile.company = c
            if 'assigned_unit_id' in data:
                au = data.get('assigned_unit_id')
                if not au or str(au) in ('all', 'ALL', 'null', 'None', ''):
                    profile.assigned_unit = None
                else:
                    bu = BusinessUnit.objects.filter(id=int(au)).first()
                    profile.assigned_unit = bu
            profile.save()
            profile.user.is_active = True
            profile.user.save()
            return Response({'message': f'User {profile.user.username} updated successfully!'}, status=status.HTTP_200_OK)

        if action in ['reject', 'delete'] or data.get('action') == 'reject':
            u = profile.user
            profile.delete()
            u.delete()
            return Response({'message': 'User registration rejected.'}, status=status.HTTP_200_OK)

        return Response({'message': 'OK'}, status=status.HTTP_200_OK)

    def patch(self, request, pk=None, *args, **kwargs):
        return self.post(request, pk=pk, *args, **kwargs)

class CompanyListView(APIView):

    def get(self, request, *args, **kwargs):
        user_id = request.query_params.get('user_id')
        username = request.query_params.get('username')

        target_user = None
        if user_id and str(user_id).isdigit():
            target_user = User.objects.filter(id=int(user_id)).first()
        elif username:
            target_user = User.objects.filter(username__iexact=username).first()
        elif getattr(request, 'user', None) and request.user.is_authenticated:
            target_user = request.user

        comps = Company.objects.all().order_by('id')

        if target_user and not target_user.is_superuser:
            profile = UserProfile.objects.filter(user=target_user).select_related('company').first()
            allowed_ids = set()
            if profile and profile.company_id:
                allowed_ids.add(profile.company_id)
            for m2m_name in ['companies', 'allowed_companies']:
                if profile and hasattr(profile, m2m_name):
                    allowed_ids.update(getattr(profile, m2m_name).values_list('id', flat=True))
            comps = comps.filter(id__in=allowed_ids)

        data = []
        for c in comps:
            curr = getattr(c, 'currency', 'INR') or 'INR'
            default_sym = '$' if curr in ['CAD', 'USD'] else '₹'
            sym = getattr(c, 'currency_symbol', None) or getattr(c, 'symbol', None) or default_sym
            data.append({
                'id': c.id,
                'name': c.name,
                'code': getattr(c, 'code', ''),
                'currency': curr,
                'symbol': sym,
                'currency_symbol': sym,
                'address': getattr(c, 'address', '') or '',
                'gstin': getattr(c, 'gstin', '') or '',
                'state': getattr(c, 'state', '') or '',
                'bank_details': getattr(c, 'bank_details', '') or '',
            })
        return Response(data, status=status.HTTP_200_OK)


class RBACInviteLinkView(APIView):
    permission_classes = [IsCompanyAdmin]

    def post(self, request):
        from django.core.signing import TimestampSigner
        from backend.permissions import jwt_user

        req_user = jwt_user(request)
        data = request.data or {}
        prof = UserProfile.objects.filter(user=req_user).select_related('company').first() if req_user else None

        comp_id = data.get('company_id') or (prof.company_id if prof else None)
        if req_user and not req_user.is_superuser and prof and prof.company_id:
            comp_id = prof.company_id

        comp = Company.objects.filter(id=comp_id).first() if comp_id else Company.objects.first()
        if not comp:
            return Response({'error': 'No active company found to generate invite link.'}, status=status.HTTP_400_BAD_REQUEST)

        username = (data.get('username') or '').strip()
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()
        role = (data.get('role') or 'Sales User').strip()
        if role not in ('Sales User', 'Manager', 'ADMIN', 'MANAGER', 'SALES_USER'):
            role = 'Sales User'

        payload = {
            'company_id': comp.id,
            'company_name': comp.name,
            'username': username,
            'first_name': first_name,
            'last_name': last_name,
            'role': role,
        }
        signer = TimestampSigner(salt='tallybiz-staff-invite')
        token = signer.sign_object(payload)
        return Response({
            'token': token,
            'company_id': comp.id,
            'company_name': comp.name,
            'username': username,
            'role': role,
            'expires_in_days': 7,
        }, status=status.HTTP_200_OK)
