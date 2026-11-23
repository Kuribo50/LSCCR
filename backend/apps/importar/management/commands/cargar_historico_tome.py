"""Carga el padrón histórico de pacientes (CSV separado por "~") en HistoricoPaciente.

Uso: python manage.py cargar_historico_tome "ruta/Historico Pacientes Tome.csv"
Es idempotente: vuelve a correr y actualiza por RUT.
"""

import csv
import re
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from apps.importar.models import HistoricoPaciente
from apps.importar.sectorizacion import sectorizar
from apps.pacientes.telefonos import normalizar_telefono
from apps.pacientes.utils import normalizar_rut


def _fecha(valor: str):
    try:
        return datetime.strptime((valor or "").strip(), "%d-%m-%Y").date()
    except ValueError:
        return None


class Command(BaseCommand):
    help = "Carga el histórico de pacientes de Tomé para cruzar por RUT."

    def add_arguments(self, parser):
        parser.add_argument("archivo")
        parser.add_argument("--encoding", default="utf-8")
        parser.add_argument("--lote", type=int, default=2000)

    def handle(self, *args, **opts):
        csv.field_size_limit(10_000_000)
        try:
            fh = open(opts["archivo"], encoding=opts["encoding"], errors="replace", newline="")
        except OSError as exc:
            raise CommandError(str(exc))

        existentes = set(HistoricoPaciente.objects.values_list("rut", flat=True))
        nuevos, vistos, leidos = [], set(), 0
        with fh:
            for fila in csv.DictReader(fh, delimiter="~", quotechar='"'):
                leidos += 1
                rut = normalizar_rut(fila.get("rut"))
                if not rut or rut in vistos:
                    continue
                vistos.add(rut)
                sector = sectorizar(fila.get("nro_familia", ""), fila.get("sector", ""))
                celular = fila.get("telefono_celular") or fila.get("telefono_contacto")
                nombre = " ".join(
                    p for p in (fila.get("nombres"), fila.get("apellido_paterno"), fila.get("apellido_materno")) if p
                )
                nuevos.append(
                    HistoricoPaciente(
                        rut=rut,
                        nombre=nombre.strip()[:200],
                        fecha_nacimiento=_fecha(fila.get("fecha_nacimiento")),
                        fecha_fallecimiento=_fecha(fila.get("fecha_fallecimiento")),
                        comuna=(fila.get("comuna") or "")[:80],
                        centro_inscripcion=(fila.get("centro_inscripcion") or "")[:120],
                        sector=(fila.get("sector") or "")[:120],
                        codigo_sector=sector["codigo"][:4],
                        telefono=normalizar_telefono(celular),
                        telefono_recados=normalizar_telefono(fila.get("telefono_recado")),
                    )
                )
        HistoricoPaciente.objects.bulk_create(
            [p for p in nuevos if p.rut not in existentes], batch_size=opts["lote"]
        )
        actualizar = [p for p in nuevos if p.rut in existentes]
        if actualizar:
            por_rut = {p.rut: p for p in HistoricoPaciente.objects.filter(rut__in=[p.rut for p in actualizar])}
            campos = ["nombre", "fecha_nacimiento", "fecha_fallecimiento", "comuna", "centro_inscripcion",
                      "sector", "codigo_sector", "telefono", "telefono_recados"]
            for p in actualizar:
                destino = por_rut[p.rut]
                for c in campos:
                    setattr(destino, c, getattr(p, c))
            HistoricoPaciente.objects.bulk_update(list(por_rut.values()), campos, batch_size=opts["lote"])
        self.stdout.write(self.style.SUCCESS(
            f"Histórico cargado: {len(nuevos)} RUT únicos de {leidos} filas "
            f"({len(nuevos) - len(actualizar)} nuevos, {len(actualizar)} actualizados)."
        ))
