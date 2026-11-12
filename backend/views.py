from django.contrib.auth import get_user_model
User = get_user_model()
from accounts.models import UserProfile, Company
from django.contrib.auth import authenticate, get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status

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

        if not auth_user.is_active:
            auth_user.is_active = True
            auth_user.save()

        # Determine Role
        role = 'ADMIN' if (auth_user.is_superuser or auth_user.is_staff) else 'STAFF'
        try:
            profile = getattr(auth_user, 'profile', None)
            if profile and getattr(profile, 'role', None):
                role = profile.role
        except Exception:
            pass

        token_str = f"session_token_{auth_user.id}_{auth_user.username}"

        user_data = {
            'id': auth_user.id,
            'username': auth_user.username,
            'email': auth_user.email,
            'first_name': auth_user.first_name or auth_user.username,
            'last_name': auth_user.last_name or '',
            'role': role,
            'is_superuser': auth_user.is_superuser,
            'is_staff': auth_user.is_staff,
        }

        return Response({
            'token': token_str,
            'access': token_str,
            'refresh': token_str,
            'user': user_data,
            'message': 'Login successful'
        }, status=status.HTTP_200_OK)


class RBACUserManagementView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        pending = UserProfile.objects.filter(is_approved=False).select_related('user', 'company')
        users_list = []
        for p in pending:
            u = p.user
            comp_id = p.company.id if p.company else None
            comp_name = p.company.name if p.company else 'Unassigned'
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
                'user': user_obj,            # for nested access: item.user.username
                'username': u.username,       # for flat access: item.username
                'email': u.email or '',
                'first_name': u.first_name or u.username,
                'last_name': u.last_name or '',
                'role': p.role or 'Sales User',
                'company': comp_id,
                'company_id': comp_id,
                'company_name': comp_name,
                'is_approved': p.is_approved,
                'date_joined': u.date_joined.strftime('%Y-%m-%d') if u.date_joined else '',
            })

        # Return raw list by default
        return Response(users_list, status=status.HTTP_200_OK)

    def post(self, request, pk=None, *args, **kwargs):
        data = request.data or {}
        profile_id = pk or data.get('profile_id') or data.get('id') or data.get('user_id')
        profile = UserProfile.objects.filter(id=profile_id).first() or UserProfile.objects.filter(user_id=profile_id).first()

        if not profile:
            return Response({'error': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

        action = request.path.strip('/').split('/')[-1]
        if action in ['approve', 'accept'] or data.get('action') == 'approve' or data.get('is_approved') is True:
            profile.is_approved = True
            if data.get('role'):
                profile.role = data.get('role')
            if data.get('company') or data.get('company_id'):
                cid = data.get('company') or data.get('company_id')
                c = Company.objects.filter(id=cid).first()
                if c: profile.company = c
            profile.save()
            profile.user.is_active = True
            profile.user.save()
            return Response({'message': f'User {profile.user.username} approved successfully!'}, status=status.HTTP_200_OK)

        if action in ['reject', 'delete'] or data.get('action') == 'reject':
            u = profile.user
            profile.delete()
            u.delete()
            return Response({'message': 'User registration rejected.'}, status=status.HTTP_200_OK)

        return Response({'message': 'OK'}, status=status.HTTP_200_OK)

    def patch(self, request, pk=None, *args, **kwargs):
        return self.post(request, pk=pk, *args, **kwargs)

class CompanyListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

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

        if target_user:
            profile = UserProfile.objects.filter(user=target_user).select_related('company').first()
            role_str = (profile.role if profile and profile.role else '').upper()
            is_admin = bool(target_user.is_superuser or target_user.is_staff or role_str == 'ADMIN')

            if not is_admin:
                allowed_ids = set()
                if profile and profile.company_id:
                    allowed_ids.add(profile.company_id)
                # Check if ManyToMany field (companies / allowed_companies) exists
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
