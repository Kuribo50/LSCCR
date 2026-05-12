from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView


def normalizar_rut(rut: str) -> str:
    """Acepta RUT con puntos/guion desde login y lo lleva al formato de BD."""
    return (rut or "").replace(".", "").replace("-", "").upper().strip()


class RutTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT con RUT como username field.

    El frontend manda `rut`; aqui se normaliza antes de que SimpleJWT valide
    credenciales.
    """

    def validate(self, attrs):
        username_field = self.username_field
        attrs[username_field] = normalizar_rut(attrs.get(username_field, ""))
        return super().validate(attrs)


class RutTokenObtainPairView(TokenObtainPairView):
    """Endpoint /api/auth/login/ consumido por Next.js."""

    serializer_class = RutTokenObtainPairSerializer
    throttle_scope = "auth_login"


class ScopedTokenRefreshView(TokenRefreshView):
    """Refresh JWT con throttle propio para proteger el endpoint."""

    throttle_scope = "auth_refresh"
