from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Company, OrgUserProfile, UserCompanyAccess

User = get_user_model()


# ૧. કંપની સીરીયલાઈઝર
class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = '__all__'


# ૨. નવું યુઝર સાઇનઅપ સીરીયલાઈઝર
class UserSignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    gender = serializers.ChoiceField(choices=OrgUserProfile.GENDER_CHOICES, write_only=True, required=False, default='MALE')
    address = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'password', 'phone', 'gender', 'address']

    def create(self, validated_data):
        phone = validated_data.pop('phone', '')
        gender = validated_data.pop('gender', 'MALE')
        address = validated_data.pop('address', '')
        password = validated_data.pop('password')

        # યુઝર ઓબ્જેક્ટ બનાવવો (નવો યુઝર બાય ડિફોલ્ટ active પણ is_approved=False રહેશે)
        user = User.objects.create(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        user.set_password(password)
        user.save()

        # સંબંધિત OrgUserProfile બનાવવું (is_approved=False)
        OrgUserProfile.objects.create(
            user=user,
            phone=phone,
            gender=gender,
            address=address,
            is_approved=False
        )

        return user


# ૩. યુઝર પ્રોફાઇલ વિગતો દર્શાવવા માટે
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


# ૪. પાસવર્ડ બદલવા માટેનું સીરીયલાઈઝર
class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("જૂનો પાસવર્ડ ખોટો છે.")
        return value


# ૫. કંપની એક્સેસ અને રોલ્સ સીરીયલાઈઝર
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


# ૬. એડમિન માટે યુઝર અપ્રૂવલ સીરીયલાઈઝર
class AdminUserApprovalSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=True)
    is_approved = serializers.BooleanField(required=True)
    company_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=[])
    role = serializers.ChoiceField(choices=UserCompanyAccess.ROLE_CHOICES, default='SALES_USER')