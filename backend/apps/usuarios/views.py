from django.contrib.auth import login, logout
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Usuario
from .permissions import IsAdminRole
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    UsuarioCreateSerializer,
    UsuarioPatchSerializer,
    UsuarioSerializer,
)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        return Response(UsuarioSerializer(user).data)


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UsuarioSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.requiere_cambio_password = False
        request.user.save(update_fields=["password", "requiere_cambio_password"])
        return Response({"detail": "Contraseña actualizada correctamente."})


class UsuarioViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Usuario.objects.order_by("nombre")
    permission_classes = [IsAdminRole]

    def get_serializer_class(self):
        if self.action == "create":
            return UsuarioCreateSerializer
        if self.action in {"partial_update", "update"}:
            return UsuarioPatchSerializer
        return UsuarioSerializer

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        usuario = self.get_object()
        rut_sin_verificador = usuario.rut[:-1]
        nueva_password = rut_sin_verificador[-4:]
        usuario.set_password(nueva_password)
        usuario.requiere_cambio_password = True
        usuario.save(update_fields=["password", "requiere_cambio_password"])
        return Response({"detail": "Contraseña restablecida correctamente."})
