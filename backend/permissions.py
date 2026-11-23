from rest_framework.permissions import BasePermission
from rest_framework_simplejwt.authentication import JWTAuthentication


def jwt_user(request):
    """The logged-in user from the Bearer token; never from client-supplied id/username headers."""
    u = getattr(request, 'user', None)
    if u is not None and u.is_authenticated:
        return u
    try:
        res = JWTAuthentication().authenticate(request)
    except Exception:
        return None
    return res[0] if res else None


def is_admin(user):
    if not user:
        return False
    if user.is_superuser or user.is_staff:
        return True
    prof = getattr(user, 'profile', None)
    return bool(prof and (prof.role or '').strip().upper() == 'ADMIN')


class IsCompanyAdmin(BasePermission):
    message = 'Only a Company Admin can do this.'

    def has_permission(self, request, view):
        return is_admin(jwt_user(request))
