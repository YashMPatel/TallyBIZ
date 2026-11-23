from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken


class UniversalLoginTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='login-test',
            email='login-test@example.com',
            password='valid-test-password',
        )
        self.user.profile.is_approved = True
        self.user.profile.save()
        self.client = APIClient()

    def test_login_returns_valid_jwt_access_and_refresh_tokens(self):
        response = self.client.post(
            '/api/accounts/auth/login/',
            {'username': self.user.username, 'password': 'valid-test-password'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data['access'], response.data['refresh'])
        self.assertEqual(
            AccessToken(response.data['access'])['user_id'],
            str(self.user.pk),
        )
        self.assertEqual(response.data['token'], response.data['access'])
        request = APIRequestFactory().get(
            '/',
            HTTP_AUTHORIZATION=f"Bearer {response.data['access']}",
        )
        authenticated_user, _ = JWTAuthentication().authenticate(request)
        self.assertEqual(authenticated_user.pk, self.user.pk)

    def test_login_accepts_email_address(self):
        response = self.client.post(
            '/api/accounts/auth/login/',
            {'email': self.user.email, 'password': 'valid-test-password'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            AccessToken(response.data['access'])['user_id'],
            str(self.user.pk),
        )

    def test_login_rejects_unapproved_and_disabled_users(self):
        self.user.profile.is_approved = False
        self.user.profile.save()
        body = {'username': self.user.username, 'password': 'valid-test-password'}
        response = self.client.post('/api/accounts/auth/login/', body, format='json')
        self.assertEqual(response.status_code, 403)

        self.user.profile.is_approved = True
        self.user.profile.save()
        self.user.is_active = False
        self.user.save()
        response = self.client.post('/api/accounts/auth/login/', body, format='json')
        self.assertEqual(response.status_code, 403)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
