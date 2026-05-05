from django.urls import re_path

from .auth_views import RutTokenObtainPairView, ScopedTokenRefreshView
from .views import ChangePasswordView, LogoutView, MeView

urlpatterns = [
    re_path(r"^login/?$", RutTokenObtainPairView.as_view(), name="auth-login"),
    re_path(r"^refresh/?$", ScopedTokenRefreshView.as_view(), name="token_refresh"),
    re_path(r"^logout/?$", LogoutView.as_view(), name="auth-logout"),
    re_path(r"^me/?$", MeView.as_view(), name="auth-me"),
    re_path(r"^change-password/?$", ChangePasswordView.as_view(), name="auth-change-password"),
]
