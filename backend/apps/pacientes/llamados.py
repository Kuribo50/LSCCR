"""Reglas de la cola de llamados.

Un llamado registra el resultado real del contacto y aplica su efecto:

- Pacientes en lista (PENDIENTE / RESCATE):
  - CONTESTA_CONFIRMADO: ingresa y, si viene fecha, queda citado.
  - NO_CONTESTA: suma un intento. Al llegar a INTENTOS_PARA_RESCATE pasa a
    RESCATE; en RESCATE, al llegar a INTENTOS_RESCATE_PARA_EGRESO pasa a
    EGRESO_ADMINISTRATIVO (con observacion obligatoria).
  - RECHAZA_ATENCION: egreso voluntario (observacion obligatoria).
  - YA_RESUELTO: egreso administrativo (observacion obligatoria).
- Pacientes INGRESADOS sin cita ("por citar"):
  - CONTESTA_CONFIRMADO: queda citado (fecha obligatoria).
  - RECHAZA_ATENCION: egreso voluntario (observacion obligatoria).
  - El resto solo queda registrado.
- En cualquier estado, REAGENDAR_LLAMADO guarda cuando volver a llamar.

Cada llamado guarda el estado previo del paciente para poder deshacerlo
durante MINUTOS_PARA_DESHACER (corrige un clic equivocado sin dejar rastro).
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.exceptions import ValidationError

from .models import LlamadoPaciente, MovimientoPaciente, Paciente

R = LlamadoPaciente.Resultado
E = Paciente.Estado

INTENTOS_PARA_RESCATE = getattr(settings, "CCR_INTENTOS_PARA_RESCATE", 3)
INTENTOS_RESCATE_PARA_EGRESO = getattr(settings, "CCR_INTENTOS_RESCATE_PARA_EGRESO", 2)
MINUTOS_PARA_DESHACER = 10

ESTADOS_EN_COLA = {E.PENDIENTE, E.RESCATE}
ESTADOS_LLAMABLES = ESTADOS_EN_COLA | {E.INGRESADO}

# Resultados que cierran el caso: siempre con observacion.
REQUIEREN_NOTA = {R.RECHAZA_ATENCION, R.YA_RESUELTO, R.OTRO}

CAMPOS_DESHACER = (
    "estado",
    "n_intentos_contacto",
    "fecha_cambio_estado",
    "fecha_ingreso",
    "fecha_egreso",
    "proxima_atencion",
    "fecha_siguiente_cita",
    "proximo_llamado",
)


def intentos_en_estado(paciente: Paciente, llamados=None) -> int:
    """Llamados sin respuesta desde que el paciente entro a su estado actual."""
    if llamados is None:
        llamados = paciente.llamados.all()
    desde = paciente.fecha_cambio_estado

    def cuenta(ll) -> bool:
        if ll.resultado != R.NO_CONTESTA or (desde is not None and ll.fecha < desde):
            return False
        # El llamado que provoco el cambio de estado puede compartir instante con
        # fecha_cambio_estado; el estado guardado al registrarlo lo descarta.
        estado_al_llamar = (ll.deshacer or {}).get("estado")
        return estado_al_llamar is None or estado_al_llamar == paciente.estado

    return sum(1 for ll in llamados if cuenta(ll))


def umbral_intentos(estado: str) -> int | None:
    if estado == E.PENDIENTE:
        return INTENTOS_PARA_RESCATE
    if estado == E.RESCATE:
        return INTENTOS_RESCATE_PARA_EGRESO
    return None


def _snapshot(paciente: Paciente) -> dict:
    datos = {}
    for campo in CAMPOS_DESHACER:
        valor = getattr(paciente, campo)
        datos[campo] = valor.isoformat() if hasattr(valor, "isoformat") else valor
    return datos


def _restaurar(campo: str, valor):
    if valor is None or campo in {"estado", "n_intentos_contacto"}:
        return valor
    if campo in {"fecha_ingreso", "fecha_egreso", "fecha_siguiente_cita"}:
        return parse_date(valor)
    return parse_datetime(valor)


def registrar_llamado(paciente: Paciente, usuario, datos: dict) -> LlamadoPaciente:
    """Valida, registra el llamado y aplica su efecto en una sola transaccion."""
    resultado = datos["resultado"]
    notas = (datos.get("notas") or "").strip()
    fecha_atencion = datos.get("fecha_atencion")
    volver_a_llamar = datos.get("volver_a_llamar")
    estado = paciente.estado

    if paciente.kine_asignado_id is None:
        raise ValidationError({"detail": "Debe existir un responsable CCR asignado antes del contacto."})
    if estado not in ESTADOS_LLAMABLES:
        raise ValidationError({"detail": "Solo se registran llamados a pacientes pendientes, en rescate o ingresados."})
    if resultado == R.YA_RESUELTO and estado == E.INGRESADO:
        raise ValidationError({"resultado": "Un paciente ingresado se egresa desde su ficha, no desde llamados."})
    if resultado in REQUIEREN_NOTA and not notas:
        raise ValidationError({"notas": "Agrega una observación para este resultado."})
    if resultado == R.CONTESTA_CONFIRMADO and estado == E.INGRESADO and not fecha_atencion:
        raise ValidationError({"fecha_atencion": "Indica la fecha y hora de la cita."})
    if resultado == R.REAGENDAR_LLAMADO:
        if not volver_a_llamar:
            raise ValidationError({"volver_a_llamar": "Indica cuándo volver a llamar."})
        if volver_a_llamar <= timezone.now():
            raise ValidationError({"volver_a_llamar": "La fecha para volver a llamar debe ser futura."})

    # Con este intento, ¿alcanza el umbral para cambiar de estado?
    umbral = umbral_intentos(estado)
    alcanza_umbral = (
        resultado == R.NO_CONTESTA
        and umbral is not None
        and intentos_en_estado(paciente) + 1 >= umbral
    )
    if alcanza_umbral and estado == E.RESCATE and not notas:
        raise ValidationError(
            {"notas": "Este intento deja al paciente en egreso administrativo: agrega una observación."}
        )

    with transaction.atomic():
        snapshot = _snapshot(paciente)
        llamado = LlamadoPaciente.objects.create(
            paciente=paciente,
            usuario=usuario,
            telefono_usado=datos.get("telefono_usado") or paciente.telefono or paciente.telefono_recados,
            resultado=resultado,
            notas=notas,
            proxima_accion=datos.get("proxima_accion", ""),
            volver_a_llamar=volver_a_llamar if resultado == R.REAGENDAR_LLAMADO else None,
        )

        nuevo_estado = estado
        nota_movimiento = notas
        campos = {"proximo_llamado", "actualizado_en"}
        paciente.proximo_llamado = volver_a_llamar if resultado == R.REAGENDAR_LLAMADO else None

        if resultado == R.CONTESTA_CONFIRMADO:
            if estado in ESTADOS_EN_COLA:
                nuevo_estado = E.INGRESADO
                nota_movimiento = notas or "Contesta el llamado y confirma atención."
                if paciente.fecha_ingreso is None:
                    paciente.fecha_ingreso = timezone.localdate()
                    campos.add("fecha_ingreso")
            if fecha_atencion:
                paciente.proxima_atencion = fecha_atencion
                paciente.fecha_siguiente_cita = timezone.localdate(fecha_atencion)
                campos |= {"proxima_atencion", "fecha_siguiente_cita"}
        elif resultado == R.NO_CONTESTA and estado in ESTADOS_EN_COLA:
            paciente.n_intentos_contacto += 1
            campos.add("n_intentos_contacto")
            if alcanza_umbral:
                if estado == E.PENDIENTE:
                    nuevo_estado = E.RESCATE
                    nota_movimiento = notas or f"{umbral} llamados sin respuesta. Pasa a RESCATE."
                else:
                    nuevo_estado = E.EGRESO_ADMINISTRATIVO
        elif resultado == R.RECHAZA_ATENCION:
            nuevo_estado = E.EGRESO_VOLUNTARIO
        elif resultado == R.YA_RESUELTO:
            nuevo_estado = E.EGRESO_ADMINISTRATIVO

        if nuevo_estado in {E.EGRESO_VOLUNTARIO, E.EGRESO_ADMINISTRATIVO} and paciente.fecha_egreso is None:
            paciente.fecha_egreso = timezone.localdate()
            campos.add("fecha_egreso")
        if nuevo_estado != estado:
            paciente.estado = nuevo_estado
            campos.add("estado")
            paciente._movimiento_usuario = usuario
            paciente._movimiento_notas = nota_movimiento

        paciente.save(update_fields=list(campos))

        if nuevo_estado != estado:
            movimiento = MovimientoPaciente.objects.filter(paciente=paciente).order_by("-id").first()
            snapshot["movimiento_id"] = movimiento.id if movimiento else None
        llamado.deshacer = snapshot
        llamado.save(update_fields=["deshacer"])
    return llamado


def deshacer_llamado(paciente: Paciente, usuario, llamado_id: int) -> None:
    """Revierte el ultimo llamado del paciente si es reciente y del mismo usuario."""
    ultimo = paciente.llamados.order_by("-fecha", "-id").first()
    if ultimo is None or ultimo.id != llamado_id:
        raise ValidationError({"detail": "Solo se puede deshacer el último llamado del paciente."})
    if not ultimo.deshacer:
        raise ValidationError({"detail": "Este llamado no se puede deshacer."})
    if ultimo.usuario_id != usuario.id and getattr(usuario, "rol", None) != "ADMIN":
        raise ValidationError({"detail": "Solo quien registró el llamado puede deshacerlo."})
    if timezone.now() - ultimo.fecha > timedelta(minutes=MINUTOS_PARA_DESHACER):
        raise ValidationError({"detail": f"Pasaron más de {MINUTOS_PARA_DESHACER} minutos; ya no se puede deshacer."})

    with transaction.atomic():
        datos = ultimo.deshacer
        valores = {campo: _restaurar(campo, datos.get(campo)) for campo in CAMPOS_DESHACER}
        # update() evita la señal: deshacer no debe generar un movimiento nuevo.
        Paciente.objects.filter(pk=paciente.pk).update(**valores, actualizado_en=timezone.now())
        if datos.get("movimiento_id"):
            MovimientoPaciente.objects.filter(pk=datos["movimiento_id"], paciente=paciente).delete()
        ultimo.delete()
