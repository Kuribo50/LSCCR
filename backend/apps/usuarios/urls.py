from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from .views import ProfesionalesView, UsuarioViewSet


router = DefaultRouter()
router.trailing_slash = "/?"
router.register("usuarios", UsuarioViewSet, basename="usuarios")

urlpatterns = [
    # Antes del router: si no, "profesionales" se tomaría como id de usuario.
    # El proxy de Next puede quitar la barra final: se aceptan ambas formas.
    re_path(r"^usuarios/profesionales/?$", ProfesionalesView.as_view(), name="usuarios-profesionales"),
    path("", include(router.urls)),
]
