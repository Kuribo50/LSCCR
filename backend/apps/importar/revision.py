"""Cruce de la bandeja de revisión con el histórico de pacientes de Tomé.

Las observaciones viven como JSON dentro de ImportacionMensual. Aquí se les
agrega, solo para mostrarlas, lo que el histórico sabe del RUT (nombre, edad,
sector, teléfono, fallecimiento) y se decide cuáles se pueden resolver solas.
"""

from datetime import date, datetime

from apps.pacientes.models import Paciente

from .models import HistoricoPaciente
from .sectorizacion import normalizar_nombre, sectores_desde_codigo

# Motivos que solo hablan de sector: si el cruce ya los resolvió, la revisión sobra.
MOTIVOS_SOLO_SECTOR = {
    "sector oficial vacio",
    "sectorcesfam vacio o no identificable",
    "sector territorial vacio",
    "sector vacio o no identificable",
}

ESTADOS_EN_LISTA = {Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE}


def puede_volver_a_lista(paciente: Paciente | None) -> bool:
    """Un recurrente egresado (alta, abandono, egreso...) puede volver a la lista con su nueva derivación."""
    from apps.pacientes.services import validar_transicion_estado

    if not paciente or paciente.estado in ESTADOS_EN_LISTA or paciente.estado == Paciente.Estado.INGRESADO:
        return False
    return validar_transicion_estado(paciente.estado, Paciente.Estado.PENDIENTE)

RESOLUCION_AUTO = "Resuelta automáticamente: el sector quedó completo con el cruce del histórico de Tomé."


def _sin_tildes(texto: str) -> str:
    return normalizar_nombre(texto).lower()


def motivo_solo_sector(motivo: str) -> bool:
    frases = [_sin_tildes(f) for f in str(motivo or "").split(".") if f.strip()]
    return bool(frases) and all(f in MOTIVOS_SOLO_SECTOR for f in frases)


def _edad(fecha_nacimiento: date | None, hoy: date | None = None) -> int | None:
    if not fecha_nacimiento:
        return None
    hoy = hoy or date.today()
    return hoy.year - fecha_nacimiento.year - ((hoy.month, hoy.day) < (fecha_nacimiento.month, fecha_nacimiento.day))


def _similitud(a: str, b: str) -> float:
    ta, tb = set(normalizar_nombre(a).split()), set(normalizar_nombre(b).split())
    return len(ta & tb) / max(1, len(ta | tb))


def _vista_historico(h: HistoricoPaciente, observacion: dict) -> dict:
    edad = _edad(h.fecha_nacimiento)
    nombre_obs = observacion.get("paciente_nombre") or observacion.get("nombre") or ""
    edad_obs = int(observacion.get("edad") or 0)
    sectores = sectores_desde_codigo(h.codigo_sector, h.sector)
    return {
        "encontrado": True,
        "nombre": h.nombre,
        "edad": edad,
        "fecha_nacimiento": h.fecha_nacimiento.isoformat() if h.fecha_nacimiento else "",
        # sector_oficial = barrio donde vive; sector_cesfam = color/centro del CESFAM.
        "sector_oficial": sectores["sector_oficial"],
        "sector_cesfam": sectores["sector_cesfam"],
        "telefono": h.telefono,
        "telefono_recados": h.telefono_recados,
        "comuna": h.comuna,
        "centro_inscripcion": h.centro_inscripcion,
        "fallecido": bool(h.fecha_fallecimiento),
        "fecha_fallecimiento": h.fecha_fallecimiento.isoformat() if h.fecha_fallecimiento else "",
        "otra_comuna": bool(h.comuna) and "tom" not in h.comuna.lower(),
        "nombre_coincide": _similitud(nombre_obs, h.nombre) >= 0.5 if nombre_obs else None,
        "edad_coincide": (edad is not None and edad_obs > 0 and edad - 3 <= edad_obs <= edad + 1) if edad_obs else None,
    }


def enriquecer_observaciones(observaciones: list[dict]) -> None:
    """Agrega `historico`, `auto_resoluble` y `auto_motivo` a cada observación."""
    ruts = {o.get("rut") for o in observaciones if o.get("rut")}
    historicos = {h.rut: h for h in HistoricoPaciente.objects.filter(rut__in=ruts)} if ruts else {}
    ids = {o.get("paciente_id") for o in observaciones if o.get("paciente_id")}
    pacientes = {p.id: p for p in Paciente.objects.filter(id__in=ids)} if ids else {}
    # Recurrentes sin paciente_id: su ficha se busca por RUT (la más reciente).
    ruts_recurrentes = {o.get("rut") for o in observaciones if o.get("tipo") == "RECURRENTE" and not o.get("paciente_id") and o.get("rut")}
    por_rut: dict[str, Paciente] = {}
    for p in Paciente.objects.filter(rut__in=ruts_recurrentes).order_by("id") if ruts_recurrentes else []:
        por_rut[p.rut] = p

    ruts_en_lista = (
        set(Paciente.objects.filter(rut__in=ruts, estado__in=ESTADOS_EN_LISTA).values_list("rut", flat=True))
        if ruts
        else set()
    )

    for obs in observaciones:
        h = historicos.get(obs.get("rut"))
        obs["historico"] = _vista_historico(h, obs) if h else {"encontrado": False}

        obs["auto_resoluble"] = False
        obs["auto_motivo"] = ""
        obs["egresado"] = False
        if (obs.get("estado_revision") or "PENDIENTE") != "PENDIENTE":
            continue
        if obs.get("tipo") == "RECURRENTE":
            paciente = pacientes.get(obs.get("paciente_id")) or por_rut.get(obs.get("rut"))
            if puede_volver_a_lista(paciente):
                obs["egresado"] = True
                obs["egresado_estado"] = paciente.get_estado_display()
                obs["egresado_paciente_id"] = paciente.id
            sigue = paciente.estado in ESTADOS_EN_LISTA if paciente else obs.get("rut") in ruts_en_lista
            if sigue:
                obs["auto_resoluble"] = True
                obs["auto_motivo"] = "Sigue en lista: se acumula su tiempo de espera."
            continue
        if obs.get("tipo") != "ADVERTENCIA":
            continue
        if not motivo_solo_sector(obs.get("motivo")):
            continue
        paciente = pacientes.get(obs.get("paciente_id"))
        if not paciente:
            continue
        sector_historico = obs["historico"].get("sector_oficial") if h else ""
        if paciente.sector_oficial or sector_historico:
            obs["auto_resoluble"] = True
            obs["auto_motivo"] = (
                "El sector ya está en la ficha."
                if paciente.sector_oficial
                else "El histórico trae el sector y se completará en la ficha."
            )


RESOLUCION_RECURRENTE = (
    "Se mantiene en lista de espera: el tiempo de espera se cuenta desde su primera "
    "derivación y suma los meses en que apareció en las listas."
)


def _fecha_ddmmyyyy(valor: str):
    try:
        return datetime.strptime(str(valor or "").strip(), "%d/%m/%Y").date()
    except ValueError:
        return None


CAMPOS_ESPERA = ("fecha_derivacion", "n_meses_espera")
CAMPOS_SECTOR = ("sector_oficial", "sector_cesfam")
# Lo que cambia "Volver a lista": se guarda para poder deshacerlo.
CAMPOS_REINGRESO = ("estado", "fecha_egreso")


def foto_paciente(paciente: Paciente, campos: tuple[str, ...] = CAMPOS_ESPERA + CAMPOS_SECTOR) -> dict:
    """Valores previos de los campos que una acción va a cambiar, para deshacerla."""
    foto: dict = {"id": paciente.id}
    for campo in campos:
        valor = getattr(paciente, campo)
        foto[campo] = valor.isoformat() if isinstance(valor, date) else valor
    return foto


def restaurar_paciente(foto: dict) -> bool:
    """Vuelve solo los campos guardados en la foto (no pisa otros cambios)."""
    if not foto or not foto.get("id"):
        return False
    valores = {k: v for k, v in foto.items() if k in CAMPOS_ESPERA + CAMPOS_SECTOR + CAMPOS_REINGRESO}
    for campo in ("fecha_derivacion", "fecha_egreso"):
        if valores.get(campo):
            valores[campo] = date.fromisoformat(valores[campo])
    return bool(valores) and bool(Paciente.objects.filter(pk=foto["id"]).update(**valores))


def indice_recurrencias(importaciones) -> dict[str, dict]:
    """Por RUT: fechas de derivación y cortes donde volvió a aparecer como recurrente."""
    indice: dict[str, dict] = {}
    for importacion in importaciones:
        corte = (importacion.mes_datos or importacion.mes, importacion.anio_datos or importacion.anio)
        for obs in importacion.observaciones_revision or []:
            if obs.get("tipo") != "RECURRENTE" or not obs.get("rut"):
                continue
            info = indice.setdefault(obs["rut"], {"fechas": set(), "cortes": set()})
            fecha = _fecha_ddmmyyyy(obs.get("fecha_derivacion"))
            if fecha:
                info["fechas"].add(fecha)
            info["cortes"].add(corte)
    return indice


def acumular_espera(paciente: Paciente, info: dict) -> str:
    """Cuenta la espera desde la primera derivación y suma los meses en listas.

    Devuelve un texto con lo que cambió ("" si no había nada que cambiar).
    """
    cambios = {}
    primera = min([paciente.fecha_derivacion, *info.get("fechas", set())])
    if primera < paciente.fecha_derivacion:
        cambios["fecha_derivacion"] = primera
    cortes = set(info.get("cortes", set()))
    origen = paciente.importacion_origen
    if origen:
        cortes.add((origen.mes_datos or origen.mes, origen.anio_datos or origen.anio))
    meses = max(paciente.n_meses_espera or 1, len(cortes))
    if meses != paciente.n_meses_espera:
        cambios["n_meses_espera"] = meses
    if not cambios:
        return ""
    Paciente.objects.filter(pk=paciente.pk).update(**cambios)
    partes = []
    if "fecha_derivacion" in cambios:
        partes.append(f"espera desde {primera.strftime('%d/%m/%Y')} (antes {paciente.fecha_derivacion.strftime('%d/%m/%Y')})")
    if "n_meses_espera" in cambios:
        partes.append(f"{meses} meses en listas (antes {paciente.n_meses_espera})")
    return "; ".join(partes)


def completar_sector_paciente(observacion: dict) -> bool:
    """Llena sector vacío de la ficha con el histórico. True si cambió algo."""
    paciente_id = observacion.get("paciente_id")
    h = observacion.get("historico") or {}
    if not paciente_id or not h.get("encontrado"):
        return False
    paciente = Paciente.objects.filter(pk=paciente_id).first()
    if not paciente:
        return False
    cambios = []
    if not paciente.sector_oficial and h.get("sector_oficial"):
        paciente.sector_oficial = h["sector_oficial"]
        cambios.append("sector_oficial")
    if (not paciente.sector_cesfam or paciente.sector_cesfam == "NO IDENTIFICABLE") and h.get("sector_cesfam"):
        paciente.sector_cesfam = h["sector_cesfam"]
        cambios.append("sector_cesfam")
    if cambios:
        Paciente.objects.filter(pk=paciente.pk).update(**{c: getattr(paciente, c) for c in cambios})
    return bool(cambios)
