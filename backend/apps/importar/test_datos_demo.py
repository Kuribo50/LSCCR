from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.importar.models import ImportacionMensual
from apps.pacientes.models import Paciente


class DatosDemoTests(TestCase):
    """El generador de la demo pública: volumen, datos inventados e idempotencia."""

    def generar(self):
        call_command("generar_datos_demo", stdout=StringIO())

    def setUp(self):
        call_command("generar_usuarios_demo", stdout=StringIO())
        self.generar()

    def test_crea_cuatro_cortes_con_pacientes_y_bandeja_de_revision(self):
        cortes = ImportacionMensual.objects.filter(archivo_nombre__startswith="demo_corte_")
        self.assertEqual(cortes.count(), 4)
        self.assertEqual(Paciente.objects.filter(importacion_origen__in=cortes).count(), 100)
        ultimo = cortes.order_by("anio_datos", "mes_datos").last()
        tipos = sorted(o["tipo"] for o in ultimo.observaciones_revision)
        self.assertEqual(tipos, ["ADVERTENCIA"] * 2 + ["ERROR"] * 2 + ["RECURRENTE"] * 4)

    def test_los_rut_son_ficticios_y_no_son_de_personas(self):
        for rut in Paciente.objects.filter(observaciones__startswith="Paciente ficticio").values_list("rut", flat=True):
            self.assertTrue(90_000_000 <= int(rut[:-1]) <= 99_999_999, rut)

    def test_no_duplica_al_repetirse_y_rehacer_regenera(self):
        self.generar()
        self.assertEqual(ImportacionMensual.objects.filter(archivo_nombre__startswith="demo_corte_").count(), 4)
        call_command("generar_datos_demo", rehacer=True, stdout=StringIO())
        self.assertEqual(
            Paciente.objects.filter(importacion_origen__archivo_nombre__startswith="demo_corte_").count(), 100
        )
