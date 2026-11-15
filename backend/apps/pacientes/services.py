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
