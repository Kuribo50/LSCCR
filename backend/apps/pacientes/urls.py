from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from .views import ActividadGrupalViewSet, PacienteViewSet, PerfilPacienteView

router = DefaultRouter()
router.trailing_slash = "/?"
router.register("pacientes", PacienteViewSet, basename="pacientes")
router.register("actividades-grupales", ActividadGrupalViewSet, basename="actividades-grupales")

urlpatterns = [
    re_path(r"^pacientes/perfil/(?P<rut>[^/.]+)/?$", PerfilPacienteView.as_view(), name="perfil_paciente"),
    path("", include(router.urls)),
]
