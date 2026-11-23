"""Reversión de una carga de derivaciones dentro de su ventana de 10 minutos.

Una subida de archivo puede crear varios cortes (uno por periodo detectado);
todos comparten `lote` y se revierten juntos. Revertir deja la base como
estaba antes de la carga:

- borra los pacientes que la carga creó;
- devuelve a su valor anterior lo que la carga cambió en pacientes que ya
  existían (meses de espera, diagnóstico agregado, teléfonos completados);
- borra los movimientos que la carga registró y los cortes con su archivo.

Pasada la ventana la carga queda consolidada: solo el Administrador puede
limpiar un corte, como mantención (ver ImportacionMensualDetalleView).
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.pacientes.models import (
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)
from apps.usuarios.models import Usuario

from .models import ImportacionMensual

MINUTOS_REVERSION = 10


def cortes_del_lote(importacion: ImportacionMensual) -> list[ImportacionMensual]:
    if not importacion.lote:
        return [importacion]
    return list(ImportacionMensual.objects.filter(lote=importacion.lote).order_by("id"))


def revertible_hasta(importacion: ImportacionMensual):
    return importacion.fecha_subida + timedelta(minutes=MINUTOS_REVERSION)


def estado_reversion(importacion: ImportacionMensual, usuario, ahora=None) -> dict:
    """Si `usuario` puede revertir esta carga ahora, y si no, por qué."""
    ahora = ahora or timezone.now()
    hasta = revertible_hasta(importacion)
    motivo = ""
    if not importacion.lote:
        motivo = "Carga anterior al registro de reversiones."
    elif ahora > hasta:
        motivo = "Consolidada: pasaron más de 10 minutos."
    elif importacion.estado == ImportacionMensual.Estado.REEMPLAZADO or importacion.reemplaza_a.exists():
        motivo = "Reemplazó otro corte; no se puede revertir."
    elif usuario is None or (
        importacion.usuario_id != getattr(usuario, "id", None) and getattr(usuario, "rol", None) != Usuario.Rol.ADMIN
    ):
        motivo = "Solo quien realizó la carga puede revertirla."
    return {
        "revertible": not motivo,
        "revertible_hasta": hasta.isoformat(),
        "en_ventana": bool(importacion.lote) and ahora <= hasta,
        "motivo_no_revertible": motivo,
    }


@transaction.atomic
def revertir_carga(importacion: ImportacionMensual, usuario) -> dict:
    cortes = cortes_del_lote(importacion)
    for corte in cortes:
        estado = estado_reversion(corte, usuario)
        if not estado["revertible"]:
            if "Solo quien" in estado["motivo_no_revertible"]:
                raise PermissionDenied(estado["motivo_no_revertible"])
            raise ValidationError({"detail": estado["motivo_no_revertible"]})

    creados = Paciente.objects.filter(importacion_origen__in=cortes)
    ids_creados = list(creados.values_list("id", flat=True))
    con_gestion = (
        LlamadoPaciente.objects.filter(paciente_id__in=ids_creados).exists()
        or RegistroAgendaPaciente.objects.filter(paciente_id__in=ids_creados).exists()
        or InasistenciaPaciente.objects.filter(paciente_id__in=ids_creados).exists()
    )
    if con_gestion:
        raise ValidationError(
            {"detail": "Algún paciente de esta carga ya tiene llamados o citas registrados; no se puede revertir."}
        )

    # Los efectos sobre pacientes existentes se guardan igual en cada corte del lote.
    efectos = next((c.efectos for c in cortes if c.efectos), {}) or {}

    recurrentes = efectos.get("recurrentes", [])
    if recurrentes:
        Paciente.objects.filter(id__in=recurrentes, n_meses_espera__gt=0).update(n_meses_espera=F("n_meses_espera") - 1)

    for item in efectos.get("diagnosticos", []):
        # Solo si nadie lo cambió después de la carga.
        Paciente.objects.filter(id=item["id"], diagnostico=item["nuevo"]).update(diagnostico=item["previo"])

    for item in efectos.get("telefonos", []):
        Paciente.objects.filter(
            id=item["id"],
            telefono=item["nuevo_telefono"],
            telefono_recados=item["nuevo_telefono_recados"],
        ).update(telefono=item["telefono"], telefono_recados=item["telefono_recados"])

    movimientos = efectos.get("movimientos", [])
    if movimientos:
        MovimientoPaciente.objects.filter(id__in=movimientos).delete()

    pacientes_eliminados = creados.count()
    creados.delete()

    for corte in cortes:
        if corte.archivo:
            corte.archivo.delete(save=False)
    ImportacionMensual.objects.filter(id__in=[c.id for c in cortes]).delete()

    return {
        "cortes_revertidos": len(cortes),
        "pacientes_eliminados": pacientes_eliminados,
        "recurrentes_restaurados": len(recurrentes),
        "diagnosticos_restaurados": len(efectos.get("diagnosticos", [])),
        "telefonos_restaurados": len(efectos.get("telefonos", [])),
    }
