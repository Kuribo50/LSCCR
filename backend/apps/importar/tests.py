from datetime import date
from io import BytesIO
import shutil
import tempfile

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.importar.models import ImportacionMensual
from apps.pacientes.models import Paciente
from apps.usuarios.models import Usuario


def excel_derivaciones(rows, sheet_name="JULIO"):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(
        [
            "FECHA",
            "NOMBRE",
            "RUT",
            "EDAD",
            "DESDE",
            "DIAGNOSTICO",
            "PROFESIONAL",
            "PRIORIDAD",
            "OBSERVACIONES",
        ]
    )
    for row in rows:
        ws.append(row)
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


class ImportacionesMensualesTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override_settings = override_settings(MEDIA_ROOT=self.media_root)
        self.override_settings.enable()
        self.admin = Usuario.objects.create_user(
            rut="44444444-4",
            password="testpass",
            nombre="Admin Importaciones",
            rol=Usuario.Rol.ADMIN,
        )
        self.client.force_authenticate(self.admin)

    def tearDown(self):
        self.override_settings.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)
        super().tearDown()

    def archivo(self, rows, name="derivaciones.xlsx"):
        return SimpleUploadedFile(
            name,
            excel_derivaciones(rows),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def test_preview_no_crea_pacientes_y_entrega_resumen(self):
        archivo = self.archivo(
            [
                [date(2025, 7, 2), "Paciente Nuevo", "11111111-1", 50, "CESFAM", "Lumbago", "KINESIOLOGO", "ALTA", ""],
                ["sin fecha", "Paciente Error", "22222222-2", 60, "CESFAM", "Hombro", "KINESIOLOGO", "MODERADA", ""],
            ]
        )

        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Paciente.objects.count(), 0)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["nuevos"], 1)
        self.assertEqual(response.data["errores_count"], 1)
        self.assertEqual(response.data["registros"][0]["tipo_revision"], "")
        self.assertEqual(response.data["registros"][1]["tipo_revision"], "ERROR")

    def test_importacion_crea_pacientes_y_asocia_importacion(self):
        archivo = self.archivo(
            [
                [date(2025, 7, 2), "Paciente Uno", "11111111-1", 50, "CESFAM", "Lumbago", "KINESIOLOGO", "ALTA", ""],
                [date(2025, 7, 3), "Paciente Dos", "22222222-2", 55, "CESFAM", "Hombro", "KINESIOLOGO", "MODERADA", ""],
            ]
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["importados"], 2)
        importacion = ImportacionMensual.objects.get()
        self.assertEqual(importacion.registros_importados, 2)
        self.assertEqual(importacion.pacientes_creados.count(), 2)
        self.assertTrue(
            Paciente.objects.filter(importacion_origen=importacion, id_ccr__in=["1", "2"]).exists()
        )

    def test_recurrentes_no_crean_duplicados_y_quedan_en_revision(self):
        Paciente.objects.create(
            id_ccr="EXISTENTE-1",
            fecha_derivacion=date(2025, 7, 2),
            percapita_desde="CESFAM",
            nombre="PACIENTE EXISTENTE",
            rut="111111111",
            edad=50,
            diagnostico="Lumbago",
            profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.ALTA,
            categoria=Paciente.Categoria.LUMBAGOS,
        )
        archivo = self.archivo(
            [
                [date(2025, 7, 2), "Paciente Existente", "11111111-1", 50, "CESFAM", "Lumbago", "KINESIOLOGO", "ALTA", ""],
            ]
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["importados"], 0)
        self.assertEqual(response.data["recurrentes"], 1)
        self.assertEqual(Paciente.objects.count(), 1)
        importacion = ImportacionMensual.objects.get()
        self.assertEqual(importacion.duplicados, 1)
        self.assertEqual(importacion.observaciones_revision[0]["tipo"], "RECURRENTE")

    def test_errores_quedan_guardados_en_importacion(self):
        archivo = self.archivo(
            [
                ["fecha mala", "Paciente Error", "33333333-3", 45, "CESFAM", "Rodilla", "KINESIOLOGO", "MODERADA", ""],
            ]
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        importacion = ImportacionMensual.objects.get()
        self.assertEqual(importacion.estado, ImportacionMensual.Estado.CON_ERRORES)
        self.assertEqual(len(importacion.errores), 1)
        self.assertEqual(importacion.observaciones_revision[0]["tipo"], "ERROR")

    def test_revision_get_y_patch_actualiza_estado(self):
        importacion = ImportacionMensual.objects.create(
            archivo=ContentFile(b"test", name="revision.xlsx"),
            archivo_nombre="revision.xlsx",
            mes=5,
            anio=2026,
            mes_datos=7,
            anio_datos=2025,
            usuario=self.admin,
            observaciones_revision=[
                {
                    "tipo": "ERROR",
                    "tipo_label": "Error de datos",
                    "periodo_label": "Julio 2025",
                    "archivo_nombre": "revision.xlsx",
                    "hoja": "JULIO",
                    "fila": 2,
                    "motivo": "Fecha inválida",
                    "accion": "Revisar fecha",
                    "nombre": "Paciente Error",
                    "rut": "333333333",
                    "fecha_derivacion": "",
                    "fecha_original": "fecha mala",
                    "edad": 45,
                    "diagnostico": "Rodilla",
                    "prioridad": "MODERADA",
                    "percapita_desde": "CESFAM",
                    "profesional": "KINESIOLOGO",
                    "observaciones": "",
                    "paciente_id": None,
                    "paciente_rut": None,
                    "paciente_nombre": None,
                    "paciente_estado": None,
                    "paciente_id_ccr": None,
                    "kine_asignado_nombre": None,
                    "requiere_revision": True,
                    "estado_revision": "PENDIENTE",
                    "resolucion": "",
                    "resuelto_en": None,
                    "resuelto_por_id": None,
                    "resuelto_por_nombre": None,
                }
            ],
        )

        listado = self.client.get("/api/importar/revision/?estado=PENDIENTE")
        self.assertEqual(listado.status_code, status.HTTP_200_OK)
        self.assertEqual(listado.data["pendientes"], 1)

        patch = self.client.patch(
            f"/api/importar/revision/{importacion.id}/0/",
            {"accion": "DESCARTAR", "resolucion": "No corresponde al corte."},
            format="json",
        )

        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        importacion.refresh_from_db()
        self.assertEqual(importacion.observaciones_revision[0]["estado_revision"], "DESCARTADO")

    def test_historial_mensual_devuelve_importaciones_y_resumen_corte(self):
        importacion = ImportacionMensual.objects.create(
            archivo=ContentFile(b"test", name="historial.xlsx"),
            archivo_nombre="historial.xlsx",
            mes=5,
            anio=2026,
            mes_datos=7,
            anio_datos=2025,
            usuario=self.admin,
            total_registros=1,
            registros_importados=1,
        )
        Paciente.objects.create(
            id_ccr="HIST-1",
            fecha_derivacion=date(2025, 7, 5),
            percapita_desde="CESFAM",
            nombre="PACIENTE HISTORIAL",
            rut="555555555",
            edad=50,
            diagnostico="Lumbago",
            profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.MODERADA,
            categoria=Paciente.Categoria.LUMBAGOS,
            importacion_origen=importacion,
        )

        response = self.client.get("/api/importar/historial/7/2025/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["periodo_label"], "Julio 2025")
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["pacientes_actuales_del_corte"]["pendientes"], 1)
