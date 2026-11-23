"""Lectura del Excel de teléfonos (RUT + teléfono) para completar contactos.

Acepta cualquier hoja que tenga una columna de RUT y al menos una de teléfono,
con los mismos nombres de columna que reconoce la importación de derivaciones.
"""

from openpyxl import load_workbook

from apps.pacientes.telefonos import FilaTelefono

from .parser import COLUMN_ALIASES, _cs, _normalizar

CAMPOS = ("rut", "telefono", "telefono_recados")
FILAS_ENCABEZADO = 12


def _detectar_encabezado(ws) -> tuple[int, dict[str, int]] | None:
    aliases = {campo: {_normalizar(a) for a in COLUMN_ALIASES[campo]} for campo in CAMPOS}
    max_col = min(max(ws.max_column or 1, 1), 60)
    for row_idx in range(1, min(ws.max_row or 0, FILAS_ENCABEZADO) + 1):
        columnas: dict[str, int] = {}
        for col in range(1, max_col + 1):
            valor = _normalizar(_cs(ws.cell(row_idx, col).value))
            if not valor:
                continue
            for campo, nombres in aliases.items():
                if campo not in columnas and valor in nombres:
                    columnas[campo] = col
                    break
        if "rut" in columnas and ("telefono" in columnas or "telefono_recados" in columnas):
            return row_idx, columnas
    return None


def leer_excel_telefonos(archivo) -> list[FilaTelefono]:
    """Devuelve las filas con RUT y teléfono. Lanza ValueError si no hay columnas."""
    try:
        wb = load_workbook(archivo, data_only=True, read_only=False)
    except Exception as exc:  # archivo corrupto o no es Excel
        raise ValueError("No se pudo leer el archivo Excel.") from exc

    filas: list[FilaTelefono] = []
    hojas_validas = 0
    for ws in wb.worksheets:
        encabezado = _detectar_encabezado(ws)
        if encabezado is None:
            continue
        hojas_validas += 1
        header_row, columnas = encabezado
        for row_idx in range(header_row + 1, (ws.max_row or 0) + 1):
            valores = {
                campo: ws.cell(row_idx, col).value
                for campo, col in columnas.items()
            }
            if all(v in (None, "") for v in valores.values()):
                continue
            filas.append(FilaTelefono(
                rut=_cs(valores.get("rut")),
                telefono=valores.get("telefono") or "",
                telefono_recados=valores.get("telefono_recados") or "",
                fila=row_idx,
            ))

    if not hojas_validas:
        raise ValueError(
            "No se encontraron columnas de RUT y teléfono. "
            "Usa encabezados como RUT, TELEFONO y TELEFONO RECADOS."
        )
    return filas
