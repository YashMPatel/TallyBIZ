from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Company, OrgUserProfile, UserCompanyAccess

User = get_user_model()


# 

class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = '__all__'


# 

class UserSignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    gender = serializers.ChoiceField(choices=OrgUserProfile.GENDER_CHOICES, write_only=True, required=False, default='MALE')
    address = serializers.CharField(write_only=True, required=False, allow_blank=True)
    company_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    currency = serializers.CharField(write_only=True, required=False, allow_blank=True, default='INR')
    invite_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'password', 'phone', 'gender', 'address',
            'company_name', 'currency', 'invite_token'
        ]

    def validate(self, attrs):
        from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
        from accounts.models import Company as AccountsCompany

        invite_token = (attrs.get('invite_token') or '').strip()
        company_name = (attrs.get('company_name') or '').strip()

        if invite_token:
            signer = TimestampSigner(salt='tallybiz-staff-invite')
            try:
                payload = signer.unsign_object(invite_token, max_age=7 * 86400)
            except SignatureExpired:
                raise serializers.ValidationError({'invite_token': 'This invite link has expired. Please ask your Admin for a new link.'})
            except BadSignature:
                raise serializers.ValidationError({'invite_token': 'Invalid staff invite link.'})

            comp = AccountsCompany.objects.filter(id=payload.get('company_id')).first()
            if not comp:
                raise serializers.ValidationError({'invite_token': 'The invited company no longer exists.'})

            expected_username = (payload.get('username') or '').strip()
            if expected_username and attrs.get('username', '').strip().lower() != expected_username.lower():
                raise serializers.ValidationError({'username': f'This invite link was issued specifically for username "{expected_username}".'})

            attrs['_invite_payload'] = payload
            attrs['_target_company'] = comp
        else:
            if not company_name:
                raise serializers.ValidationError({'company_name': 'Company / Business Name is required to create your workspace.'})
            if AccountsCompany.objects.filter(name__iexact=company_name).exists():
                raise serializers.ValidationError({'company_name': f'Company "{company_name}" already exists. If you are joining an existing company, please use an Admin Invite Link.'})

        return attrs

    def create(self, validated_data):
        from django.db import transaction
        from accounts.models import Company as AccountsCompany, UserProfile as AccountsUserProfile

        phone = validated_data.pop('phone', '')
        gender = validated_data.pop('gender', 'MALE')
        address = validated_data.pop('address', '')
        password = validated_data.pop('password')
        company_name = (validated_data.pop('company_name', '') or '').strip()
        currency = (validated_data.pop('currency', 'INR') or 'INR').strip().upper()
        validated_data.pop('invite_token', None)
        invite_payload = validated_data.pop('_invite_payload', None)
        target_company = validated_data.pop('_target_company', None)

        with transaction.atomic():
            user = User.objects.create(
                username=validated_data['username'],
                email=validated_data.get('email', ''),
                first_name=validated_data.get('first_name', ''),
                last_name=validated_data.get('last_name', '')
            )
            user.set_password(password)
            user.save()

            acc_prof, _ = AccountsUserProfile.objects.get_or_create(user=user)

            if invite_payload and target_company:
                # Mode B: Invited staff member -> linked to inviting company, pending admin approval
                invited_role = invite_payload.get('role') or 'Sales User'
                acc_prof.company = target_company
                acc_prof.role = invited_role
                acc_prof.is_approved = False
                acc_prof.save(update_fields=['company', 'role', 'is_approved'])

                OrgUserProfile.objects.create(
                    user=user,
                    phone=phone,
                    gender=gender,
                    address=address,
                    is_approved=False
                )
                user._signup_mode = 'INVITED'
                user._signup_company_name = target_company.name
            else:
                # Mode A: Public self-signup -> creates isolated company & approves user as Admin of their own company
                sym = '$' if currency in ('CAD', 'USD') else '₹'
                country = 'Canada' if currency == 'CAD' else ('United States' if currency == 'USD' else 'India')
                new_acc_comp = AccountsCompany.objects.create(
                    name=company_name,
                    default_currency=currency,
                    currency_symbol=sym,
                    country=country,
                    address=address,
                    email=validated_data.get('email', ''),
                    phone=phone,
                )
                acc_prof.company = new_acc_comp
                acc_prof.role = 'ADMIN'
                acc_prof.is_approved = True
                acc_prof.save(update_fields=['company', 'role', 'is_approved'])

                org_comp = Company.objects.create(
                    name=company_name,
                    company_code=f"COMP-{new_acc_comp.id:03d}",
                    address=address,
                    email=validated_data.get('email', ''),
                    phone=phone,
                )
                OrgUserProfile.objects.create(
                    user=user,
                    phone=phone,
                    gender=gender,
                    address=address,
                    is_approved=True,
                    active_company=org_comp,
                )
                UserCompanyAccess.objects.create(user=user, company=org_comp, role='ADMIN')
                user._signup_mode = 'SELF_COMPANY'
                user._signup_company_name = new_acc_comp.name

        return user


# 

class OrgUserProfileSerializer(serializers.ModelSerializer):
    active_company_name = serializers.ReadOnlyField(source='active_company.name')
    active_company_code = serializers.ReadOnlyField(source='active_company.company_code')

    class Meta:
        model = OrgUserProfile
        fields = ['phone', 'gender', 'address', 'is_approved', 'approved_at', 'active_company', 'active_company_name', 'active_company_code']


class UserDetailSerializer(serializers.ModelSerializer):
    profile = OrgUserProfileSerializer(source='org_profile', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_superuser', 'profile']


# 

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Invalid company authorization rule or user assignment.")
        return value


# 

class UserCompanyAccessSerializer(serializers.ModelSerializer):
    company_name = serializers.ReadOnlyField(source='company.name')
    company_code = serializers.ReadOnlyField(source='company.company_code')
    username = serializers.ReadOnlyField(source='user.username')
    user_full_name = serializers.SerializerMethodField()

    class Meta:
        model = UserCompanyAccess
        fields = '__all__'

    def get_user_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


# 

class AdminUserApprovalSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=True)
    is_approved = serializers.BooleanField(required=True)
    company_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=[])
    role = serializers.ChoiceField(choices=UserCompanyAccess.ROLE_CHOICES, default='SALES_USER')