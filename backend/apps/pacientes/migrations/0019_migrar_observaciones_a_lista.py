"""Convierte el texto de Paciente.observaciones en entradas de ObservacionPaciente.

La separación del texto está copiada aquí (congelada) a propósito: una migración no
debe depender del código vivo de la app, que puede cambiar después.
"""

import re

from django.db import migrations

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


def migrar(apps, schema_editor):
    Paciente = apps.get_model("pacientes", "Paciente")
    ObservacionPaciente = apps.get_model("pacientes", "ObservacionPaciente")
    nuevas = []
    resumenes = []
    for paciente in Paciente.objects.exclude(observaciones="").iterator():
        if ObservacionPaciente.objects.filter(paciente_id=paciente.pk).exists():
            continue
        entradas = separar_observaciones(paciente.observaciones)
        for tipo, texto, fijada in entradas:
            nuevas.append(ObservacionPaciente(paciente_id=paciente.pk, tipo=tipo, texto=texto, fijada=fijada))
        orden = sorted(entradas, key=lambda e: not e[2])
        paciente.observaciones = " | ".join(texto for _t, texto, _f in orden)
        resumenes.append(paciente)
    ObservacionPaciente.objects.bulk_create(nuevas, batch_size=500)
    Paciente.objects.bulk_update(resumenes, ["observaciones"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [("pacientes", "0018_observacion_paciente")]
    operations = [migrations.RunPython(migrar, migrations.RunPython.noop)]
