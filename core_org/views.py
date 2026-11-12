from rest_framework import status, permissions, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Company, OrgUserProfile, UserCompanyAccess
from .serializers import (
    CompanySerializer,
    UserSignupSerializer,
    UserDetailSerializer,
    ChangePasswordSerializer,
    UserCompanyAccessSerializer,
    AdminUserApprovalSerializer
)

User = get_user_model()


# 1. Company CRUD ViewSet
class CompanyViewSet(viewsets.ModelViewSet):
    serializer_class = CompanySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Return all companies for superuser
        if user.is_superuser:
            return Company.objects.all().order_by('id')
        # Return active companies assigned to regular user
        return Company.objects.filter(org_user_accesses__user=user, is_active=True).distinct()


# 2. User Registration / Signup API (Public)
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def register_user(request):
    serializer = UserSignupSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({
            "message": "Registration successful! Your account is pending admin approval."
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def _get_authenticated_user(request):
    if getattr(request, 'user', None) and request.user.is_authenticated:
        return request.user
    raw_req = getattr(request, '_request', None)
    if raw_req and getattr(raw_req, 'user', None) and raw_req.user.is_authenticated:
        return raw_req.user
    from django.contrib.auth import get_user_model
    UserModel = get_user_model()
    user_id = request.headers.get('X-User-ID') or request.GET.get('user_id')
    username = request.headers.get('X-Username')
    if user_id:
        u = UserModel.objects.filter(id=user_id).first()
        if u:
            return u
    if username:
        u = UserModel.objects.filter(username=username).first()
        if u:
            return u
    return None


# 3. User Profile API
@api_view(['GET', 'PUT'])
@permission_classes([permissions.AllowAny])
def user_profile(request):
    user = _get_authenticated_user(request)
    if not user:
        return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

    profile, _ = OrgUserProfile.objects.get_or_create(user=user)

    if request.method == 'GET':
        serializer = UserDetailSerializer(user)
        data = dict(serializer.data)
        data['phone'] = profile.phone or ''
        data['gender'] = profile.gender or 'OTHER'
        data['address'] = profile.address or ''
        return Response(data)

    elif request.method == 'PUT':
        user.first_name = request.data.get('first_name', user.first_name)
        user.last_name = request.data.get('last_name', user.last_name)
        if 'email' in request.data:
            user.email = request.data.get('email', user.email)
        user.save()

        profile.phone = request.data.get('phone', profile.phone)
        profile.gender = request.data.get('gender', profile.gender)
        profile.address = request.data.get('address', profile.address)
        profile.save()

        serializer = UserDetailSerializer(user)
        data = dict(serializer.data)
        data['phone'] = profile.phone or ''
        data['gender'] = profile.gender or 'OTHER'
        data['address'] = profile.address or ''
        data['message'] = "Profile updated successfully."
        return Response(data)


# 4. Change Password API
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def change_password(request):
    user = _get_authenticated_user(request)
    if not user:
        return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)

    old_password = request.data.get('old_password', '')
    new_password = request.data.get('new_password', '')
    if not old_password or not new_password:
        return Response({"error": "Both current and new passwords are required."}, status=status.HTTP_400_BAD_REQUEST)

    if not user.check_password(old_password):
        return Response({"error": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)

    if len(new_password) < 4:
        return Response({"error": "New password must be at least 4 characters long."}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    return Response({"message": "Password changed successfully."})


# 5. Switch Active Company API (Multi-Company Switcher)
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def switch_active_company(request):
    company_id = request.data.get('company_id')
    if not company_id:
        return Response({"error": "Company ID is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    has_access = user.is_superuser or UserCompanyAccess.objects.filter(user=user, company_id=company_id).exists()
    if not has_access:
        return Response({"error": "You do not have permission to access this company."}, status=status.HTTP_403_FORBIDDEN)

    profile, _ = OrgUserProfile.objects.get_or_create(user=user)
    try:
        company = Company.objects.get(id=company_id)
        profile.active_company = company
        profile.save()
        return Response({
            "message": f"Active company switched to '{company.name}'.",
            "company_id": company.id,
            "company_name": company.name,
            "company_code": company.company_code
        })
    except Company.DoesNotExist:
        return Response({"error": "Company not found."}, status=status.HTTP_404_NOT_FOUND)


# 6. Admin: List Pending Users (Excluding Superusers)
@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def list_pending_users(request):
    pending_profiles = OrgUserProfile.objects.filter(
        is_approved=False,
        user__is_superuser=False
    ).select_related('user')
    users = [p.user for p in pending_profiles]
    serializer = UserDetailSerializer(users, many=True)
    return Response(serializer.data)


# 7. Admin: Approve / Reject User Access & Assign Roles
@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def approve_user_access(request):
    serializer = AdminUserApprovalSerializer(data=request.data)
    if serializer.is_valid():
        user_id = serializer.validated_data['user_id']
        is_approved = serializer.validated_data['is_approved']
        company_ids = serializer.validated_data.get('company_ids', [])
        role = serializer.validated_data.get('role', 'SALES_USER')

        try:
            target_user = User.objects.get(id=user_id)
            profile, _ = OrgUserProfile.objects.get_or_create(user=target_user)
            profile.is_approved = is_approved
            profile.approved_by = request.user
            profile.approved_at = timezone.now() if is_approved else None
            profile.save()

            if is_approved and company_ids:
                for c_id in company_ids:
                    try:
                        comp = Company.objects.get(id=c_id)
                        UserCompanyAccess.objects.update_or_create(
                            user=target_user,
                            company=comp,
                            defaults={'role': role}
                        )
                    except Company.DoesNotExist:
                        continue

                # Set first assigned company as active if none set
                if not profile.active_company:
                    profile.active_company_id = company_ids[0]
                    profile.save()

            status_text = "approved" if is_approved else "rejected"
            return Response({"message": f"User '{target_user.username}' has been {status_text} successfully."})
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)