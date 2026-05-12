from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.importar.models import ImportacionMensual


def _periodo_observacion(observacion: dict) -> tuple[int, int] | None:
    valor = str(observacion.get("fecha_derivacion") or "").strip()
    if not valor:
        valor = str(observacion.get("fecha_original") or "").strip()
    if not valor:
        return None

    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
        try:
            fecha = datetime.strptime(valor, fmt).date()
            return (fecha.month, fecha.year)
        except ValueError:
            continue
    return None


class Command(BaseCommand):
    help = "Recalcula mes_datos/anio_datos de importaciones usando fechas reales de pacientes vinculados."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Aplica los cambios. Sin este flag solo muestra lo que cambiaría.",
        )

    def handle(self, *args, **options):
        apply_changes = bool(options["apply"])
        fuentes = list(
            ImportacionMensual.objects.prefetch_related("pacientes_creados").order_by("id")
        )
        creadas = 0
        actualizadas = 0
        reasignados = 0

        with transaction.atomic():
            for importacion in fuentes:
                pacientes_por_periodo = defaultdict(list)
                for paciente in importacion.pacientes_creados.all():
                    pacientes_por_periodo[
                        (paciente.fecha_derivacion.month, paciente.fecha_derivacion.year)
                    ].append(paciente)

                observaciones_por_periodo = defaultdict(list)
                for observacion in importacion.observaciones_revision or []:
                    periodo = _periodo_observacion(observacion)
                    if periodo:
                        observaciones_por_periodo[periodo].append(deepcopy(observacion))

                periodos = sorted(
                    set(pacientes_por_periodo) | set(observaciones_por_periodo),
                    key=lambda item: (item[1], item[0]),
                )
                if not periodos:
                    continue

                self.stdout.write(
                    f"Importacion {importacion.id}: {importacion.mes_datos}/{importacion.anio_datos} -> "
                    + ", ".join(f"{mes}/{anio}" for mes, anio in periodos)
                )

                for index, periodo in enumerate(periodos):
                    mes, anio = periodo
                    pacientes = pacientes_por_periodo.get(periodo, [])
                    observaciones = observaciones_por_periodo.get(periodo, [])
                    errores = [obs for obs in observaciones if obs.get("tipo") == "ERROR"]
                    duplicados = sum(1 for obs in observaciones if obs.get("tipo") == "RECURRENTE")
                    total_registros = len(pacientes) + len(observaciones)

                    if index == 0:
                        destino = importacion
                    else:
                        destino = (
                            ImportacionMensual.objects.filter(
                                archivo_nombre=importacion.archivo_nombre,
                                mes_datos=mes,
                                anio_datos=anio,
                            )
                            .exclude(id=importacion.id)
                            .first()
                        )
                        if destino is None and apply_changes:
                            destino = ImportacionMensual.objects.create(
                                archivo=importacion.archivo,
                                archivo_nombre=importacion.archivo_nombre,
                                mes=importacion.mes,
                                anio=importacion.anio,
                                mes_datos=mes,
                                anio_datos=anio,
                                usuario=importacion.usuario,
                                estado=importacion.estado,
                                total_registros=0,
                                registros_importados=0,
                                duplicados=0,
                                errores=[],
                                observaciones_revision=[],
                                reemplazada_por=importacion.reemplazada_por,
                            )
                            creadas += 1
                        elif destino is None:
                            continue

                    if apply_changes:
                        destino.mes_datos = mes
                        destino.anio_datos = anio
                        destino.total_registros = total_registros
                        destino.registros_importados = len(pacientes)
                        destino.duplicados = duplicados
                        destino.errores = errores
                        destino.observaciones_revision = observaciones
                        destino.estado = (
                            ImportacionMensual.Estado.CON_ERRORES
                            if errores
                            else ImportacionMensual.Estado.COMPLETADO
                        )
                        destino.save(
                            update_fields=[
                                "mes_datos",
                                "anio_datos",
                                "total_registros",
                                "registros_importados",
                                "duplicados",
                                "errores",
                                "observaciones_revision",
                                "estado",
                            ]
                        )
                        for paciente in pacientes:
                            if paciente.importacion_origen_id != destino.id:
                                paciente.importacion_origen = destino
                                paciente.save(update_fields=["importacion_origen"])
                                reasignados += 1
                        actualizadas += 1

            if not apply_changes:
                transaction.set_rollback(True)
                self.stdout.write(
                    self.style.WARNING("Dry-run: no se aplicaron cambios. Usa --apply para actualizar.")
                )
                return

        self.stdout.write(
            self.style.SUCCESS(
                f"Listo: {actualizadas} importaciones actualizadas, {creadas} creadas, {reasignados} pacientes reasignados."
            )
        )
