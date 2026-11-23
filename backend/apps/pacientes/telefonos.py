"""Teléfonos de pacientes: normalización y carga por RUT.

Las planillas de derivación del CESFAM no traen teléfono, así que el número se
completa aparte con un Excel de RUT + teléfono (sacado de la ficha clínica).
Regla operativa: solo se llenan campos vacíos. Un teléfono que ya existe nunca
se pisa; si el archivo trae otro número, se informa como conflicto para que
alguien lo revise a mano.
"""

import re
from dataclasses import dataclass, field

from django.db import transaction

from .models import Paciente
from .utils import normalizar_rut

LARGO_MAXIMO = Paciente._meta.get_field("telefono").max_length


def normalizar_telefono(valor) -> str:
    """Lleva un teléfono chileno a +56XXXXXXXXX cuando se reconoce el formato.

    Devuelve "" si no hay al menos 8 dígitos. Un formato no reconocido se
    conserva limpio (solo dígitos y un + inicial) para no perder el dato.
    """
    if valor is None:
        return ""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = str(valor).strip()
    if not texto:
        return ""
    digitos = re.sub(r"\D", "", texto)
    if len(digitos) < 8:
        return ""
    if len(digitos) == 11 and digitos.startswith("56"):
        return f"+{digitos}"
    if len(digitos) == 9:
        # Celular (9XXXXXXXX) o fijo con código de área (2XXXXXXXX).
        return f"+56{digitos}"
    # 8 dígitos u otro largo: es ambiguo, se guarda limpio sin adivinar.
    limpio = ("+" if texto.startswith("+") else "") + digitos
    return limpio[:LARGO_MAXIMO]


@dataclass
class FilaTelefono:
    rut: str
    telefono: str = ""
    telefono_recados: str = ""
    fila: int | None = None


@dataclass
class ResumenTelefonos:
    total: int = 0
    actualizados: int = 0
    sin_cambios: int = 0
    conflictos: int = 0
    no_encontrados: int = 0
    invalidos: int = 0
    detalle: list[dict] = field(default_factory=list)
    # Valores anteriores de cada paciente modificado (para revertir una carga).
    previos: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "total": self.total,
            "actualizados": self.actualizados,
            "sin_cambios": self.sin_cambios,
            "conflictos": self.conflictos,
            "no_encontrados": self.no_encontrados,
            "invalidos": self.invalidos,
            "detalle": self.detalle,
        }


def completar_telefonos(filas: list[FilaTelefono], *, aplicar: bool) -> ResumenTelefonos:
    """Llena teléfonos vacíos de los pacientes con ese RUT.

    Un RUT puede tener varios pacientes (derivaciones repetidas): se completan
    todos. Con `aplicar=False` solo calcula qué pasaría (previsualización).
    """
    resumen = ResumenTelefonos()
    por_rut: dict[str, FilaTelefono] = {}
    for fila in filas:
        resumen.total += 1
        rut = normalizar_rut(fila.rut)
        telefono = normalizar_telefono(fila.telefono)
        recados = normalizar_telefono(fila.telefono_recados)
        if not rut or not (telefono or recados):
            resumen.invalidos += 1
            resumen.detalle.append({
                "fila": fila.fila,
                "rut": rut,
                "resultado": "INVALIDO",
                "motivo": "Falta RUT." if not rut else "Teléfono vacío o con menos de 8 dígitos.",
            })
            continue
        if recados == telefono:
            recados = ""
        # Si el RUT se repite en el archivo, gana la primera fila con dato.
        previo = por_rut.get(rut)
        if previo:
            previo.telefono = previo.telefono or telefono
            previo.telefono_recados = previo.telefono_recados or recados
        else:
            por_rut[rut] = FilaTelefono(rut=rut, telefono=telefono, telefono_recados=recados, fila=fila.fila)

    pacientes_por_rut: dict[str, list[Paciente]] = {}
    for paciente in Paciente.objects.filter(rut__in=por_rut.keys()).only(
        "id", "rut", "nombre", "estado", "telefono", "telefono_recados"
    ):
        pacientes_por_rut.setdefault(paciente.rut, []).append(paciente)

    cambios: list[Paciente] = []
    for rut, fila in por_rut.items():
        pacientes = pacientes_por_rut.get(rut)
        if not pacientes:
            resumen.no_encontrados += 1
            resumen.detalle.append({"fila": fila.fila, "rut": rut, "resultado": "NO_ENCONTRADO", "motivo": "No hay pacientes con este RUT."})
            continue

        conflicto = False
        actualizado = False
        for paciente in pacientes:
            nuevos = _nuevos_valores(paciente, fila)
            if nuevos.pop("_conflicto", False):
                conflicto = True
            if nuevos:
                actualizado = True
                resumen.previos.append({
                    "id": paciente.id,
                    "telefono": paciente.telefono,
                    "telefono_recados": paciente.telefono_recados,
                    "nuevo_telefono": nuevos.get("telefono", paciente.telefono),
                    "nuevo_telefono_recados": nuevos.get("telefono_recados", paciente.telefono_recados),
                })
                for campo, valor in nuevos.items():
                    setattr(paciente, campo, valor)
                cambios.append(paciente)

        nombre = pacientes[0].nombre
        if actualizado:
            resumen.actualizados += 1
            resultado = "ACTUALIZADO"
            motivo = "Se completó el teléfono." if aplicar else "Teléfono vacío: se completará al confirmar."
        elif conflicto:
            resumen.conflictos += 1
            resultado, motivo = "CONFLICTO", "Ya tiene otro teléfono registrado; no se modificó."
        else:
            resumen.sin_cambios += 1
            resultado, motivo = "SIN_CAMBIOS", "Ya tenía este teléfono."
        resumen.detalle.append({
            "fila": fila.fila,
            "rut": rut,
            "nombre": nombre,
            "telefono": fila.telefono,
            "telefono_recados": fila.telefono_recados,
            "resultado": resultado,
            "motivo": motivo,
        })

    if aplicar and cambios:
        with transaction.atomic():
            # bulk_update no dispara señales: completar un teléfono no es un
            # cambio de estado y no debe generar movimientos.
            Paciente.objects.bulk_update(cambios, ["telefono", "telefono_recados"], batch_size=200)
    return resumen


def _nuevos_valores(paciente: Paciente, fila: FilaTelefono) -> dict:
    """Campos vacíos que se pueden llenar sin pisar datos existentes."""
    actuales = {paciente.telefono, paciente.telefono_recados} - {""}
    entrantes = [n for n in (fila.telefono, fila.telefono_recados) if n and n not in actuales]
    nuevos: dict = {}
    if not entrantes:
        return nuevos
    if not paciente.telefono:
        nuevos["telefono"] = entrantes.pop(0)
    if entrantes and not paciente.telefono_recados:
        nuevos["telefono_recados"] = entrantes.pop(0)
    if entrantes:
        nuevos["_conflicto"] = True
    return nuevos
