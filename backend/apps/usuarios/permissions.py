from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .models import Usuario


class BloqueaMedicoMixin:
    """El Médico solo opera la carga de derivaciones (apps.importar).

    Se aplica en `initial` y no como permission_class porque varias acciones
    declaran sus propios permisos y reemplazarían a los de la vista.
    """

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if getattr(request.user, "rol", None) == Usuario.Rol.MEDICO:
            raise PermissionDenied("El rol Médico solo opera la carga de derivaciones.")


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.rol == Usuario.Rol.ADMIN)


def es_encargado(user) -> bool:
    """Profesional encargado: corrige datos y resuelve la Revisión de carga."""
    return bool(
        user
        and user.is_authenticated
        and user.rol == Usuario.Rol.KINE
        and getattr(user, "es_encargado", False)
    )


class IsAdminOrEncargado(BasePermission):
    """Revisión de carga y corrección de datos: Administrador y profesionales encargados."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.rol == Usuario.Rol.ADMIN or es_encargado(user)))


class IsAdminMedicoOrEncargado(BasePermission):
    """Completar teléfonos: lo hace quien carga (Médico) y quien corrige (encargado)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.rol in {Usuario.Rol.ADMIN, Usuario.Rol.MEDICO} or es_encargado(user))
        )


class IsAdminOrMedicoRole(BasePermission):
    """Carga de derivaciones e historial de cortes: Administrador, Médico y
    profesionales encargados (que además resuelven la Revisión de carga)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.rol in {Usuario.Rol.ADMIN, Usuario.Rol.MEDICO} or es_encargado(user))
        )
