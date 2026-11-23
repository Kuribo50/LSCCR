"""Corrige el sector de los pacientes usando la carga automática (histórico de Tomé).

Muchas fichas traen en `sector_cesfam` el centro que derivó (CESFAM DR. ALBERTO
REYES, HOSPITAL DE TOMÉ, FET, HLH...) en vez del sector del CESFAM. Este comando
lo reemplaza por el sector que indica la carga automática (AZUL, ROJO, VERDE,
CECOSF EL SANTO, CECOSF CERRO ESTANQUE, o el CESFAM de otra comuna) y completa el
sector territorial si está vacío.

Por defecto solo muestra lo que cambiaría. Con --aplicar guarda los cambios.
"""

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.importar.models import HistoricoPaciente
from apps.importar.sectorizacion import sectores_desde_codigo
from apps.pacientes.models import MovimientoPaciente, Paciente

SECTORES_CCR = {"AZUL", "ROJO", "VERDE", "CECOSF EL SANTO", "CECOSF CERRO ESTANQUE"}


class Command(BaseCommand):
    help = "Reemplaza sectores que no son del CESFAM por el de la carga automática."

    def add_arguments(self, parser):
        parser.add_argument("--aplicar", action="store_true", help="Guarda los cambios (sin esto solo informa).")

    def handle(self, *args, aplicar=False, **options):
        pacientes = [
            p for p in Paciente.objects.only("id", "rut", "sector_cesfam", "sector_oficial")
            if (p.sector_cesfam or "").strip().upper() not in SECTORES_CCR
        ]
        ruts = {p.rut for p in pacientes}
        historico = {h.rut: h for h in HistoricoPaciente.objects.filter(rut__in=ruts)}

        cambios = []
        resumen = Counter()
        sin_datos = 0
        for p in pacientes:
            h = historico.get(p.rut)
            if not h:
                sin_datos += 1
                continue
            nuevo = sectores_desde_codigo(h.codigo_sector, h.sector)
            sector = nuevo["sector_cesfam"]
            if not sector:
                sin_datos += 1
                continue
            territorial = p.sector_oficial or nuevo["sector_oficial"]
            if sector == (p.sector_cesfam or "").strip().upper() and territorial == p.sector_oficial:
                continue
            cambios.append((p, sector, territorial))
            resumen[f"{p.sector_cesfam or '(vacío)'} -> {sector}"] += 1

        self.stdout.write(f"Pacientes con sector fuera del CESFAM: {len(pacientes)}")
        self.stdout.write(f"Se pueden corregir con la carga automática: {len(cambios)}")
        self.stdout.write(f"Sin datos en la carga automática (quedan igual): {sin_datos}")
        for texto, n in resumen.most_common():
            self.stdout.write(f"  {n:4d}  {texto}")

        if not aplicar:
            self.stdout.write(self.style.WARNING("Solo informe. Usa --aplicar para guardar."))
            return

        with transaction.atomic():
            for p, sector, territorial in cambios:
                anterior = p.sector_cesfam
                Paciente.objects.filter(pk=p.pk).update(sector_cesfam=sector, sector_oficial=territorial)
                MovimientoPaciente.objects.create(
                    paciente=p,
                    usuario=None,
                    estado_anterior=None,
                    estado_nuevo=Paciente.objects.values_list("estado", flat=True).get(pk=p.pk),
                    notas=f"Sector actualizado desde la carga automática: {anterior or 'vacío'} -> {sector}.",
                )
        self.stdout.write(self.style.SUCCESS(f"Actualizados {len(cambios)} pacientes."))
