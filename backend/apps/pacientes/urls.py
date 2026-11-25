from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from .diagnosticos import DiagnosticoViewSet
from .views import (
    ActividadGrupalViewSet,
    GrupoPacientesViewSet,
    ObservacionPacienteViewSet,
    PacienteViewSet,
    PerfilPacienteView,
)

router = DefaultRouter()
router.trailing_slash = "/?"
router.register("pacientes", PacienteViewSet, basename="pacientes")
router.register("actividades-grupales", ActividadGrupalViewSet, basename="actividades-grupales")
router.register("grupos-pacientes", GrupoPacientesViewSet, basename="grupos-pacientes")
router.register("diagnosticos", DiagnosticoViewSet, basename="diagnosticos")
router.register("observaciones-paciente", ObservacionPacienteViewSet, basename="observaciones-paciente")

urlpatterns = [
    re_path(r"^pacientes/perfil/(?P<rut>[^/.]+)/?$", PerfilPacienteView.as_view(), name="perfil_paciente"),
    path("", include(router.urls)),
]
