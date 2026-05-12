from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.management.color import no_style
from django.db import connection, transaction

from apps.importar.models import ImportacionMensual
from apps.pacientes.models import (
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)


MODELOS_OPERATIVOS = [
    RegistroAgendaPaciente,
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    ImportacionMensual,
]


def _reiniciar_secuencias(modelos) -> None:
    statements = connection.ops.sequence_reset_sql(no_style(), modelos)
    with connection.cursor() as cursor:
        for sql in statements:
            cursor.execute(sql)

        if connection.vendor == "sqlite":
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
            )
            if cursor.fetchone():
                for modelo in modelos:
                    cursor.execute(
                        "DELETE FROM sqlite_sequence WHERE name = %s",
                        [modelo._meta.db_table],
                    )


class Command(BaseCommand):
    help = "Vacía datos operativos CCR sin borrar usuarios ni catálogos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirmar",
            action="store_true",
            help="Confirma el borrado de datos operativos.",
        )
        parser.add_argument(
            "--reset-sequences",
            action="store_true",
            help="Reinicia secuencias/IDs después del borrado.",
        )
        parser.add_argument(
            "--force-production",
            action="store_true",
            help="Permite ejecutar en producción si DEBUG=False.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("ADVERTENCIA: haga respaldo antes de vaciar datos CCR."))

        if not options["confirmar"]:
            self.stdout.write(self.style.WARNING("Cancelado: falta --confirmar. No se borró ningún dato."))
            return

        if not settings.DEBUG and not options["force_production"]:
            self.stdout.write(
                self.style.ERROR(
                    "Cancelado: DEBUG=False requiere --force-production además de --confirmar."
                )
            )
            return

        conteos_antes = {
            modelo.__name__: modelo.objects.count()
            for modelo in MODELOS_OPERATIVOS
        }
        self.stdout.write("Conteos antes de borrar:")
        for nombre, total in conteos_antes.items():
            self.stdout.write(f"- {nombre}: {total}")

        eliminados: dict[str, int] = {}
        with transaction.atomic():
            for modelo in MODELOS_OPERATIVOS:
                total_eliminado, _detalle = modelo.objects.all().delete()
                eliminados[modelo.__name__] = total_eliminado

            if options["reset_sequences"]:
                _reiniciar_secuencias(MODELOS_OPERATIVOS)

        self.stdout.write(self.style.SUCCESS("Datos operativos CCR eliminados."))
        for nombre, total in eliminados.items():
            self.stdout.write(f"- {nombre}: {total}")
        if options["reset_sequences"]:
            self.stdout.write(self.style.SUCCESS("Secuencias reiniciadas."))
