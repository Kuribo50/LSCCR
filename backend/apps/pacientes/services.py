import unicodedata

from .models import Paciente


# Estados finales: salen de la lista activa y se muestran en egresos.
# Si se agrega un nuevo cierre operativo, debe sumarse aqui, en reportes y en UI.
ESTADOS_FINALES = {
    Paciente.Estado.ALTA_MEDICA,
    Paciente.Estado.EGRESO_VOLUNTARIO,
    Paciente.Estado.EGRESO_ADMINISTRATIVO,
    Paciente.Estado.DERIVADO,
    Paciente.Estado.ABANDONO,
}

# Por trazabilidad, los cierres requieren nota. Esto evita egresos o abandonos
# sin contexto clinico-operativo para auditoria posterior.
ESTADOS_REQUIEREN_NOTA = {
    Paciente.Estado.ALTA_MEDICA,
    Paciente.Estado.EGRESO_VOLUNTARIO,
    Paciente.Estado.EGRESO_ADMINISTRATIVO,
    Paciente.Estado.DERIVADO,
    Paciente.Estado.ABANDONO,
}

# Matriz de transiciones permitidas del flujo CCR. Mantenerla centralizada evita
# que cada vista invente reglas distintas para lista de espera, rescate e ingreso.
TRANSICIONES_VALIDAS: dict[str, set[str]] = {
    Paciente.Estado.PENDIENTE: {Paciente.Estado.INGRESADO, Paciente.Estado.RESCATE},
    Paciente.Estado.RESCATE: {
        Paciente.Estado.INGRESADO,
        Paciente.Estado.EGRESO_ADMINISTRATIVO,
        Paciente.Estado.PENDIENTE,
    },
    Paciente.Estado.INGRESADO: {
        Paciente.Estado.ABANDONO,
        Paciente.Estado.ALTA_MEDICA,
        Paciente.Estado.EGRESO_VOLUNTARIO,
        Paciente.Estado.DERIVADO,
    },
    Paciente.Estado.ABANDONO: {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.INGRESADO,
        Paciente.Estado.RESCATE,
    },
    Paciente.Estado.ALTA_MEDICA: {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.INGRESADO,
        Paciente.Estado.RESCATE,
    },
    Paciente.Estado.EGRESO_VOLUNTARIO: {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.INGRESADO,
        Paciente.Estado.RESCATE,
    },
    Paciente.Estado.EGRESO_ADMINISTRATIVO: {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.INGRESADO,
        Paciente.Estado.RESCATE,
    },
    Paciente.Estado.DERIVADO: {
        Paciente.Estado.PENDIENTE,
        Paciente.Estado.INGRESADO,
        Paciente.Estado.RESCATE,
        Paciente.Estado.ABANDONO,
        Paciente.Estado.ALTA_MEDICA,
        Paciente.Estado.EGRESO_VOLUNTARIO,
        Paciente.Estado.EGRESO_ADMINISTRATIVO,
    },
}


def validar_transicion_estado(estado_actual: str, estado_nuevo: str) -> bool:
    if estado_actual == estado_nuevo:
        return True
    permitidos = TRANSICIONES_VALIDAS.get(estado_actual, set())
    return estado_nuevo in permitidos


def estado_requiere_nota(estado: str) -> bool:
    return estado in ESTADOS_REQUIEREN_NOTA


def categoria_por_diagnostico(diagnostico: str, edad: int) -> str:
    """Heuristica operativa para precategorizar cuando el Excel no trae categoria.

    No reemplaza criterio clinico: solo ayuda a ordenar la lista de espera y debe
    mantenerse alineada con el catalogo que usa importacion.
    """
    if edad >= 65:
        return Paciente.Categoria.MAS65

    # Sin tildes: la planilla CCR mezcla "TRAUMÁTICO"/"TRAUMATICO", "TÉCNICA"/"TECNICA".
    texto = unicodedata.normalize("NFKD", diagnostico or "").encode("ascii", "ignore").decode().lower()
    # El orden importa: se devuelve la primera regla que calza. "no traum" va
    # antes que "traum" para separar SDNT de SDT.
    reglas = {
        Paciente.Categoria.OA_MENOS65: ["osteoart", "gonart", "coxart", "artrosis", "oa "],
        Paciente.Categoria.HOMBROS: ["hombro", "manguito", "supraespinoso"],
        Paciente.Categoria.LUMBAGOS: ["lumb", "cervical", "dorsal", "columna"],
        Paciente.Categoria.SDNT: ["no traum", "tunel carpiano", "nervio", "radicul"],
        Paciente.Categoria.SDT: ["traum", "tendin", "tenosin", "epicondil", "fascitis"],
        Paciente.Categoria.OTROS_NEUROS: [
            "acv", "neurol", "parkinson", "esclerosis", "neuromusc", "neuro prioritario",
        ],
        # En la planilla CCR la hoja "AATT" agrupa las ayudas tecnicas.
        Paciente.Categoria.AATT: ["accidente trabajo", "aatt", "laboral", "ayuda tecnica"],
        Paciente.Categoria.DUPLA: ["dupla", "salud mental", "psicosocial"],
    }
    for categoria, keywords in reglas.items():
        if any(keyword in texto for keyword in keywords):
            return categoria
    return Paciente.Categoria.BORRADOR


def prioridad_normalizada(valor: str) -> str:
    limpio = (valor or "").upper().strip()
    mapping = {
        "ALTA GES": Paciente.Prioridad.ALTA,
        "ALTA": Paciente.Prioridad.ALTA,
        "MEDIA": Paciente.Prioridad.MEDIANA,
        "MEDIANA": Paciente.Prioridad.MEDIANA,
        "MODERADA": Paciente.Prioridad.MODERADA,
        "MDORADA": Paciente.Prioridad.MODERADA,
        "MODERDA": Paciente.Prioridad.MODERADA,
        "MODERADO": Paciente.Prioridad.MODERADA,
        "LICENCIA MEDICA": Paciente.Prioridad.LICENCIA_MEDICA,
        "LICENCIA_MEDICA": Paciente.Prioridad.LICENCIA_MEDICA,
    }
    return mapping.get(limpio, Paciente.Prioridad.MODERADA)


# ---------------------------------------------------------------------------
# Observaciones como lista (ObservacionPaciente)
# ---------------------------------------------------------------------------

_CLAVES_CARGA = (
    "SectorCesfam", "Sector oficial", "Sector territorial", "Sector", "Responsable detectado",
    "Estado sugerido inválido", "Estado sugerido", "Categoría", "Kine no confirmado detectado", "Revisión",
)


def separar_observaciones(texto: str) -> list[tuple[str, str, bool]]:
    """Convierte el texto antiguo de observaciones en entradas (tipo, texto, fijada).

    - "Observación original: X" -> GENERAL con X (la nota real de la planilla).
    - "| FALLECIDO (...)" y otras notas agregadas con " | " -> ADMINISTRATIVA (fallecido, fijada).
    - Datos automáticos de la carga (sector, categoría, estado sugerido...) -> IMPORTACION.
    - Texto libre sin formato de carga -> GENERAL.
    """
    import re

    texto = (texto or "").strip()
    if not texto:
        return []
    entradas: list[tuple[str, str, bool]] = []
    claves = "|".join(re.escape(k) for k in _CLAVES_CARGA)

    # Notas agregadas al final con " | " (fallecido, edad completada, etc.)
    partes = [p.strip() for p in re.split(r"\s+\|\s+(?=FALLECIDO|Edad tomada)", texto) if p.strip()]
    principal, agregadas = partes[0], partes[1:]

    original = re.search(rf"Observación original:\s*(.*?)(?:\.\s+(?={claves}\s*:)|$)", principal, re.S)
    if original:
        nota = original.group(1).strip().rstrip(".")
        if nota:
            entradas.append(("GENERAL", nota, False))
        principal = (principal[: original.start()] + principal[original.end():]).strip()

    if principal:
        if re.search(rf"(?:^|\.\s+)(?:{claves})\s*:", principal):
            carga = re.sub(r"\bSectorCesfam\b", "Sector", principal)
            carga = re.sub(r"\bSector oficial\b", "Sector territorial", carga)
            # Lo de "Revisión: ..." ya se gestiona en Revisión de carga: no se repite aquí.
            carga = re.sub(r"\s*Revisión:.*$", "", carga, flags=re.S).strip()
            if carga:
                entradas.append(("IMPORTACION", f"Datos de la carga: {carga}", False))
        else:
            entradas.append(("GENERAL", principal, False))

    for nota in agregadas:
        fallecido = nota.upper().startswith("FALLECIDO")
        entradas.append(("ADMINISTRATIVA" if fallecido else "IMPORTACION", nota, fallecido))
    return entradas


def sincronizar_observaciones(paciente) -> str:
    """Reescribe Paciente.observaciones (resumen para exportar y buscar) desde la lista."""
    textos = [n.texto for n in paciente.notas.all().order_by("-fijada", "creado_en", "id")]
    resumen = " | ".join(textos)
    type(paciente).objects.filter(pk=paciente.pk).update(observaciones=resumen)
    paciente.observaciones = resumen
    return resumen


def crear_observaciones_iniciales(pacientes, autor=None) -> int:
    """Crea la lista de observaciones de pacientes nuevos a partir de su texto."""
    from .models import ObservacionPaciente

    nuevas = []
    for paciente in pacientes:
        if paciente.notas.exists():
            continue
        for tipo, texto, fijada in separar_observaciones(paciente.observaciones):
            nuevas.append(ObservacionPaciente(paciente=paciente, tipo=tipo, texto=texto, fijada=fijada, autor=autor))
    ObservacionPaciente.objects.bulk_create(nuevas, batch_size=500)
    return len(nuevas)
