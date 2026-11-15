from rest_framework.permissions import BasePermission

from apps.usuarios.models import Usuario
from .models import Paciente


class PuedeAsignarPaciente(BasePermission):
    """Permite que un KINE tome pacientes desde lista de espera."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return request.user.rol == Usuario.Rol.KINE


class PuedeCambiarEstado(BasePermission):
    """Restringe cambios de estado segun rol y asignacion.

    ADMIN puede corregir globalmente; KINE trabaja su cartera; ADMINISTRATIVO
    puede operar cuando ya existe responsable CCR asignado.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        rol = request.user.rol
        if rol in {Usuario.Rol.KINE, Usuario.Rol.ADMIN}:
            return True
        return obj.kine_asignado_id is not None and rol == Usuario.Rol.ADMINISTRATIVO


class PuedeRegistrarLlamado(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.rol in {Usuario.Rol.ADMINISTRATIVO, Usuario.Rol.ADMIN, Usuario.Rol.KINE}


class PuedeProgramarAtencion(BasePermission):
    """Controla agenda: solo pacientes activos y con responsable CCR."""

    ESTADOS_PROGRAMABLES = {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.RESCATE,
        Paciente.Estado.INGRESADO,
    }

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.rol in {Usuario.Rol.KINE, Usuario.Rol.ADMIN}

    def has_object_permission(self, request, view, obj):
        if obj.estado not in self.ESTADOS_PROGRAMABLES:
            return False
        if obj.kine_asignado_id is None:
            return False
        if request.user.rol == Usuario.Rol.KINE:
            return obj.kine_asignado_id == request.user.id
        return request.user.rol == Usuario.Rol.ADMIN


class PuedeGestionarActividadGrupal(BasePermission):
    """Todos los usuarios ven actividades; KINE y ADMIN las crean y gestionan.

    Un KINE solo modifica actividades que le pertenecen (responsable o creador).
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return user.rol in {Usuario.Rol.KINE, Usuario.Rol.ADMIN}

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user.rol == Usuario.Rol.ADMIN:
            return True
        return request.user.id in {obj.responsable_id, obj.creado_por_id}
