"""Deja una base lista para presentar: usuarios, pacientes y grupos ficticios.

Se puede correr varias veces (no duplica). Pensado para el despliegue de
demostración (Render + Supabase), donde corre al arrancar si DEMO_SEED=1.
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.pacientes.diagnosticos import registrar_diagnosticos
from apps.pacientes.models import Paciente


class Command(BaseCommand):
    help = "Carga los datos ficticios de demostración (usuarios, pacientes, grupos y diagnósticos)."

    def handle(self, *args, **options):
        call_command("generar_usuarios_demo", stdout=self.stdout)
        call_command("generar_pacientes_demo", stdout=self.stdout)
        call_command("generar_grupos_demo", stdout=self.stdout)

        # El catálogo de diagnósticos sale de las fichas creadas.
        for texto in Paciente.objects.exclude(diagnostico="").values_list("diagnostico", flat=True):
            registrar_diagnosticos(texto)

        self.stdout.write(self.style.SUCCESS("Demo lista. Entra con RUT 66666666K y clave Ccr2025*."))
