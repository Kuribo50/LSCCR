import json
from datetime import date, timedelta
from io import BytesIO, StringIO
import shutil
import tempfile

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.test import APITestCase

from apps.importar.models import HistoricoPaciente, ImportacionMensual
from apps.pacientes.models import MovimientoPaciente, Paciente
from apps.usuarios.models import Usuario


EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

HEADERS_OFICIALES_IMPORTAR = [
    "FECHA DERIV",
    "SECTOR OFICIAL",
    "SectorCesfam",
    "NOMBRE",
    "RUT",
    "EDAD",
    "DIAGNÓSTICO",
    "PROFESIONAL",
    "PRIORIDAD",
    "OBSERVACIONES",
    "KINE ASIGNADO",
    "ESTADO SUGERIDO",
    "CATEGORIA",
    "ASIGNADO HISTORICO",
]


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
            "DIAGNÓSTICO",
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


def excel_derivaciones_con_headers(headers, rows, sheet_name="JULIO"):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(headers)
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

    def archivo_con_headers(self, headers, rows, name="derivaciones.xlsx"):
        return SimpleUploadedFile(
            name,
            excel_derivaciones_con_headers(headers, rows),
            content_type=EXCEL_CONTENT_TYPE,
        )

    def crear_kines_activos(self):
        datos = [
            ("101010101", "Sebastián Campos"),
            ("202020202", "Sebastián Salgado"),
            ("303030303", "Mane Sáez"),
            ("404040404", "Pilar Alarcón"),
            ("505050505", "Karen Torres"),
        ]
        for rut, nombre in datos:
            Usuario.objects.create_user(
                rut=rut,
                password="testpass",
                nombre=nombre,
                rol=Usuario.Rol.KINE,
                is_active=True,
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
        self.assertEqual(response.data["registros"][0]["tipo_revision"], "ADVERTENCIA")
        self.assertIn("Sector territorial vacío", response.data["registros"][0]["motivo_revision"])

    def test_periodo_de_corte_forzado_reasigna_el_mes(self):
        filas = [[date(2026, 8, 5), "Paciente Uno", "11111111-1", 50, "CESFAM", "Lumbago", "KINESIOLOGO", "ALTA", ""]]
        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": self.archivo(filas), "periodo_mes": 11, "periodo_anio": 2026},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["periodos_detectados"], {"2026-11": 1})

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": self.archivo(filas), "periodo_mes": 11, "periodo_anio": 2026},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        corte = ImportacionMensual.objects.get()
        self.assertEqual((corte.mes_datos, corte.anio_datos), (11, 2026))
        self.assertEqual(Paciente.objects.get().fecha_derivacion, date(2026, 8, 5))

    def test_periodo_de_corte_invalido_responde_400(self):
        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": self.archivo([]), "periodo_mes": 13, "periodo_anio": 2026},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_correcciones_editan_y_descartan_filas(self):
        filas = [
            [date(2026, 9, 2), "Paciente Uno", "11111111-1", 50, "CESFAM", "Lumbago", "KINESIOLOGO", "ALTA", ""],
            ["sin fecha", "Paciente Dos", "22222222-2", 60, "CESFAM", "Hombro", "KINESIOLOGO", "ALTA", ""],
            [date(2026, 9, 3), "Paciente Tres", "33333333-3", 40, "CESFAM", "Rodilla", "KINESIOLOGO", "ALTA", ""],
        ]
        correcciones = [
            {"hoja": "JULIO", "fila": 3, "campos": {"fecha": "04/09/2026"}},
            {"hoja": "JULIO", "fila": 4, "descartar": True},
        ]
        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": self.archivo(filas), "correcciones": json.dumps(correcciones)},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["errores_count"], 0)

    def test_preview_rechaza_archivo_que_no_es_xlsx(self):
        archivo = SimpleUploadedFile(
            "derivaciones.csv",
            b"fecha,nombre\n",
            content_type="text/csv",
        )

        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Paciente.objects.count(), 0)
        self.assertIn("archivo", response.data)

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
        pacientes_importados = list(Paciente.objects.filter(importacion_origen=importacion))
        self.assertEqual(len(pacientes_importados), 2)
        for paciente in pacientes_importados:
            self.assertTrue(paciente.id_ccr)
            self.assertTrue(paciente.id_ccr.startswith("CCR-"))
            self.assertEqual(paciente.importacion_origen, importacion)

    def test_importa_columnas_nuevas_y_asigna_kines_activos(self):
        self.crear_kines_activos()
        archivo = self.archivo_con_headers(
            HEADERS_OFICIALES_IMPORTAR,
            [
                [date(2025, 7, 2), "AZUL", "SECTOR AZUL", "Paciente Campos", "12121212-1", 50, "Lumbago", "KINE", "ALTA", "", "SEBA C", "INGRESADO", "LUMBAGOS", "SI"],
                [date(2025, 7, 3), "ROJO", "CECOSF CERRO ESTANQUE", "Paciente Salgado", "13131313-1", 45, "Hombro", "KINE", "MODERADA", "", "SEBASTIÁN SALGADO", "PENDIENTE", "HOMBRO", "NO"],
                [date(2025, 7, 4), "VERDE", "EL SANTO", "Paciente Mane", "14141414-1", 65, "Rodilla", "KINE", "MEDIA", "", "MANE SÁEZ", "", "", "SI"],
            ],
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["importados"], 3)
        campos = Paciente.objects.get(rut="121212121")
        salgado = Paciente.objects.get(rut="131313131")
        mane = Paciente.objects.get(rut="141414141")
        self.assertEqual(campos.sector_oficial, "AZUL")
        self.assertEqual(campos.sector_cesfam, "AZUL")
        self.assertEqual(campos.categoria, Paciente.Categoria.LUMBAGOS)
        self.assertEqual(campos.kine_asignado.nombre, "Sebastián Campos")
        self.assertEqual(campos.estado, Paciente.Estado.INGRESADO)
        self.assertTrue(campos.asignado_historico)
        self.assertEqual(salgado.sector_cesfam, "CECOSF CERRO ESTANQUE")
        self.assertEqual(salgado.categoria, Paciente.Categoria.HOMBROS)
        self.assertEqual(salgado.kine_asignado.nombre, "Sebastián Salgado")
        self.assertFalse(salgado.asignado_historico)
        self.assertEqual(mane.sector_cesfam, "CECOSF EL SANTO")
        self.assertEqual(mane.kine_asignado.nombre, "Mane Sáez")
        self.assertTrue(mane.asignado_historico)

    def test_previsualizacion_formato_oficial_entrega_conteos_operativos(self):
        self.crear_kines_activos()
        archivo = self.archivo_con_headers(
            HEADERS_OFICIALES_IMPORTAR,
            [
                [date(2025, 7, 2), "AZUL", "AZUL", "Paciente Ingresado", "61616161-1", 50, "Lumbago", "KINE", "ALTA", "", "SEBA C", "INGRESADO", "LUMBAGOS", "SI"],
                [date(2025, 7, 3), "ROJO", "ROJO", "Paciente Pendiente", "62626262-1", 45, "Hombro", "KINE", "MODERADA", "", "", "PENDIENTE", "HOMBROS", "NO"],
            ],
        )

        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 2)
        self.assertEqual(response.data["validos"], 2)
        self.assertEqual(response.data["con_kine_asignado"], 1)
        self.assertEqual(response.data["sin_kine_asignado"], 1)
        self.assertEqual(response.data["ingresados"], 1)
        self.assertEqual(response.data["pendientes"], 1)
        self.assertEqual(response.data["asignado_historico"], 1)
        self.assertEqual(response.data["conteo_sector_cesfam"]["AZUL"], 1)
        self.assertEqual(response.data["conteo_categoria"]["LUMBAGOS"], 1)
        self.assertEqual(response.data["conteo_kine_asignado"]["Sebastián Campos"], 1)

    def test_kine_vacio_no_se_infiere_desde_observaciones(self):
        self.crear_kines_activos()
        archivo = self.archivo_con_headers(
            HEADERS_OFICIALES_IMPORTAR,
            [
                [date(2025, 7, 2), "AZUL", "AZUL", "Paciente Observacion", "63636363-1", 50, "Lumbago", "KINE", "ALTA", "Revisado por SEBA C", "", "PENDIENTE", "LUMBAGOS", "NO"],
            ],
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        paciente = Paciente.objects.get(rut="636363631")
        self.assertIsNone(paciente.kine_asignado)

    def test_kines_no_activos_quedan_sin_asignacion_y_en_revision(self):
        self.crear_kines_activos()
        headers = [
            "FECHA DERIV",
            "NOMBRE",
            "RUT",
            "EDAD",
            "DIAGNÓSTICO",
            "PROFESIONAL",
            "PRIORIDAD",
            "OBSERVACIONES",
            "KINE ASIGNADO",
        ]
        archivo = self.archivo_con_headers(
            headers,
            [
                [date(2025, 7, 2), "Paciente Benja", "15151515-1", 40, "Lumbago", "KINE", "MODERADA", "", "BENJA"],
                [date(2025, 7, 3), "Paciente Ignacia", "16161616-1", 41, "Hombro", "KINE", "MODERADA", "", "MARÍA IGNACIA"],
            ],
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["importados"], 2)
        self.assertEqual(Paciente.objects.filter(kine_asignado__isnull=True).count(), 2)
        importacion = ImportacionMensual.objects.get()
        self.assertEqual(len(importacion.observaciones_revision), 2)
        self.assertEqual(importacion.observaciones_revision[0]["tipo"], "ADVERTENCIA")
        self.assertIn("Kine no activo", importacion.observaciones_revision[0]["motivo"])

    def test_encabezados_sector_y_sector_territorial(self):
        headers = ["FECHA DERIV", "SECTOR TERRITORIAL", "SECTOR", "NOMBRE", "RUT", "EDAD", "DIAGNÓSTICO",
                   "PROFESIONAL", "PRIORIDAD"]
        filas = [[date(2026, 9, 2), "Loma Alta", "Azul", "Paciente Sector", "11111111-1", 50, "Lumbago",
                  "KINESIOLOGO", "ALTA"]]
        response = self.client.post(
            "/api/importar/previsualizar/",
            {"archivo": self.archivo_con_headers(headers, filas)},
            format="multipart",
        )
        registro = response.data["registros"][0]
        self.assertEqual(registro["sector_oficial"], "LOMA ALTA")
        self.assertEqual(registro["sector_cesfam"], "AZUL")

    def test_categoria_vacia_o_invalida_se_calcula_sin_bloquear(self):
        headers = [
            "FECHA DERIV",
            "SECTOR OFICIAL",
            "SectorCesfam",
            "NOMBRE",
            "RUT",
            "EDAD",
            "DIAGNÓSTICO",
            "PROFESIONAL",
            "PRIORIDAD",
            "OBSERVACIONES",
            "CATEGORIA",
        ]
        archivo = self.archivo_con_headers(
            headers,
            [
                [date(2025, 7, 2), "AZUL", "AZUL", "Paciente Sin Categoria", "31313131-1", 50, "Lumbago", "KINE", "ALTA", "", ""],
                [date(2025, 7, 3), "ROJO", "ROJO", "Paciente Categoria Mala", "32323232-1", 45, "Hombro", "KINE", "MODERADA", "", "NO EXISTE"],
            ],
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sin_categoria = Paciente.objects.get(rut="313131311")
        categoria_mala = Paciente.objects.get(rut="323232321")
        self.assertEqual(sin_categoria.categoria, Paciente.Categoria.LUMBAGOS)
        self.assertEqual(categoria_mala.categoria, Paciente.Categoria.HOMBROS)
        importacion = ImportacionMensual.objects.get()
        self.assertIn("Categoría inválida", importacion.observaciones_revision[0]["motivo"])

    def test_estado_sugerido_ingresado_crea_movimiento_inicial(self):
        self.crear_kines_activos()
        headers = [
            "FECHA DERIV",
            "NOMBRE",
            "RUT",
            "EDAD",
            "DIAGNOSTICO",
            "PROFESIONAL",
            "PRIORIDAD",
            "OBSERVACIONES",
            "KINE ASIGNADO",
            "ESTADO SUGERIDO",
        ]
        archivo = self.archivo_con_headers(
            headers,
            [
                [date(2025, 7, 5), "Paciente Ingresado", "17171717-1", 50, "Lumbago", "KINE", "ALTA", "", "SEBA CAMPOS", "INGRESADO"],
                [date(2025, 7, 6), "Paciente Pendiente", "18181818-1", 50, "Lumbago", "KINE", "ALTA", "", "SEBA CAMPOS", ""],
            ],
        )

        response = self.client.post(
            "/api/importar/derivaciones/",
            {"archivo": archivo, "mes": 7, "anio": 2025},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        ingresado = Paciente.objects.get(rut="171717171")
        pendiente = Paciente.objects.get(rut="181818181")
        self.assertEqual(ingresado.estado, Paciente.Estado.INGRESADO)
        self.assertEqual(pendiente.estado, Paciente.Estado.PENDIENTE)
        movimiento = MovimientoPaciente.objects.get(paciente=ingresado)
        self.assertEqual(movimiento.estado_anterior, None)
        self.assertEqual(movimiento.estado_nuevo, Paciente.Estado.INGRESADO)
        self.assertIn("Carga inicial desde planilla CCR", movimiento.notas)
        self.assertIn("preorden histórico", movimiento.notas)

    def test_limpia_excel_ccr_genera_importar_revision_y_resumen(self):
        self.crear_kines_activos()
        input_path = f"{self.media_root}/original.xlsx"
        output_path = f"{self.media_root}/CCR_precarga_limpia.xlsx"
        wb = Workbook()
        ws = wb.active
        ws.title = "JULIO"
        ws.append(HEADERS_OFICIALES_IMPORTAR)
        ws.append([date(2025, 7, 2), "AZUL", "AZUL", "Paciente Limpio", "19191919-1", 50, "Lumbago", "KINE", "ALTA", "", "SEBA C", "", "LUMBAGOS", "SI"])
        ws.append([date(2025, 7, 3), "ROJO", "ROJO", "Paciente Revision", "20202020-1", 50, "Lumbago", "KINE", "ALTA", "", "BENJA", "", "LUMBAGOS", "NO"])
        wb.save(input_path)

        call_command("limpiar_excel_ccr", input=input_path, output=output_path)

        salida = load_workbook(output_path)
        self.assertEqual(salida.sheetnames, ["IMPORTAR", "REVISION", "RESUMEN"])
        self.assertEqual(salida["IMPORTAR"].max_row, 2)
        self.assertEqual(salida["REVISION"].max_row, 2)
        headers_salida = [cell.value for cell in salida["IMPORTAR"][1]]
        self.assertEqual(headers_salida[:14], [
            "FECHA DERIV",
            "SECTOR OFICIAL",
            "SectorCesfam",
            "NOMBRE",
            "RUT",
            "EDAD",
            "DIAGNÓSTICO",
            "PROFESIONAL",
            "PRIORIDAD",
            "OBSERVACIONES",
            "KINE ASIGNADO",
            "ESTADO SUGERIDO",
            "CATEGORIA",
            "ASIGNADO HISTORICO",
        ])
        self.assertNotIn("PERCÁPITA / DESDE", headers_salida)
        self.assertNotIn("FUENTE ASIGNACION", headers_salida)
        self.assertNotIn("RECEPCION ORIGINAL", headers_salida)
        self.assertNotIn("SECCIÓN", headers_salida)
        self.assertEqual(salida["IMPORTAR"]["B2"].value, "AZUL")
        self.assertEqual(salida["IMPORTAR"]["C2"].value, "AZUL")
        self.assertEqual(salida["IMPORTAR"]["N2"].value, "SI")
        self.assertIn("Kine no activo", salida["REVISION"]["A2"].value)

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
        ImportacionMensual.objects.create(
            archivo=ContentFile(b"vacio", name="sin-datos.xlsx"),
            archivo_nombre="sin-datos.xlsx",
            mes=8,
            anio=2026,
            mes_datos=8,
            anio_datos=2026,
            usuario=self.admin,
            total_registros=0,
            registros_importados=0,
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

        historial = self.client.get("/api/importar/historial/")
        self.assertEqual(historial.status_code, status.HTTP_200_OK)
        self.assertEqual(len(historial.data), 1)
        self.assertEqual(historial.data[0]["periodo_label"], "Julio 2025")

    def test_exportar_historial_mensual_devuelve_xlsx(self):
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
            id_ccr="CCR-9999",
            fecha_derivacion=date(2025, 7, 5),
            percapita_desde="CESFAM",
            nombre="PACIENTE CORTE",
            rut="666666666",
            edad=50,
            diagnostico="Lumbago",
            profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.MODERADA,
            categoria=Paciente.Categoria.LUMBAGOS,
            importacion_origen=importacion,
        )

        response = self.client.get("/api/importar/historial/7/2025/exportar/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], EXCEL_CONTENT_TYPE)
        workbook = load_workbook(BytesIO(response.content))
        ws = workbook.active
        self.assertEqual(ws["A1"].value, "ListaEsperaCCR")
        self.assertIn("Importación origen", [cell.value for cell in ws[7]])

    def test_vaciar_datos_ccr_no_ejecuta_sin_confirmar(self):
        usuario = Usuario.objects.create_user(
            rut="77777777-7",
            password="testpass",
            nombre="Kine Conservado",
            rol=Usuario.Rol.KINE,
        )
        Paciente.objects.create(
            id_ccr="VAC-1",
            fecha_derivacion=date(2025, 7, 5),
            nombre="PACIENTE VACIO",
            rut="777777771",
            edad=50,
            diagnostico="Lumbago",
            profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.MODERADA,
            categoria=Paciente.Categoria.LUMBAGOS,
        )

        salida = StringIO()
        call_command("vaciar_datos_ccr", stdout=salida)

        self.assertIn("falta --confirmar", salida.getvalue())
        self.assertEqual(Paciente.objects.count(), 1)
        self.assertTrue(Usuario.objects.filter(pk=usuario.pk).exists())

    def test_vaciar_datos_ccr_borra_operativos_y_conserva_usuarios(self):
        usuario = Usuario.objects.create_user(
            rut="88888888-8",
            password="testpass",
            nombre="Kine Conservado",
            rol=Usuario.Rol.KINE,
        )
        paciente = Paciente.objects.create(
            id_ccr="VAC-2",
            fecha_derivacion=date(2025, 7, 5),
            nombre="PACIENTE VACIO",
            rut="888888881",
            edad=50,
            diagnostico="Lumbago",
            profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.MODERADA,
            categoria=Paciente.Categoria.LUMBAGOS,
        )
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=usuario,
            estado_anterior=None,
            estado_nuevo=Paciente.Estado.PENDIENTE,
            notas="Movimiento de prueba",
        )
        ImportacionMensual.objects.create(
            archivo=ContentFile(b"test", name="vaciar.xlsx"),
            archivo_nombre="vaciar.xlsx",
            mes=5,
            anio=2026,
            mes_datos=7,
            anio_datos=2025,
            usuario=self.admin,
        )

        salida = StringIO()
        call_command("vaciar_datos_ccr", confirmar=True, force_production=True, stdout=salida)

        self.assertEqual(Paciente.objects.count(), 0)
        self.assertEqual(MovimientoPaciente.objects.count(), 0)
        self.assertEqual(ImportacionMensual.objects.count(), 0)
        self.assertTrue(Usuario.objects.filter(pk=usuario.pk).exists())
        self.assertIn("Datos operativos CCR eliminados", salida.getvalue())


class ParsearFechaYCategoriaTests(APITestCase):
    def test_fecha_texto_mes_dia_estadounidense(self):
        from apps.importar.parser import _parsear_fecha

        self.assertEqual(_parsear_fecha("3/27/2026"), date(2026, 3, 27))
        # Ambigua: se mantiene dia/mes (formato chileno).
        self.assertEqual(_parsear_fecha("3/5/2026"), date(2026, 5, 3))
        self.assertEqual(_parsear_fecha("27/03/2026"), date(2026, 3, 27))
        self.assertIsNone(_parsear_fecha("13/13/2026"))

    def test_categoria_por_diagnostico_planilla_ccr(self):
        from apps.pacientes.services import categoria_por_diagnostico

        casos = {
            "SD DOLOROSO NO TRAUMÁTICO": Paciente.Categoria.SDNT,
            "SD DOLOROSO TRAUMÁTICO": Paciente.Categoria.SDT,
            "OTROS NEUROMUSCULARES": Paciente.Categoria.OTROS_NEUROS,
            "NEURO PRIORITARIO": Paciente.Categoria.OTROS_NEUROS,
            "AYUDA TECNICA": Paciente.Categoria.AATT,
            "ARTROSIS DORSAL": Paciente.Categoria.OA_MENOS65,
            "LUMBAGO": Paciente.Categoria.LUMBAGOS,
            "HOMBRO DOLOROSO": Paciente.Categoria.HOMBROS,
        }
        for diagnostico, esperada in casos.items():
            with self.subTest(diagnostico=diagnostico):
                self.assertEqual(categoria_por_diagnostico(diagnostico, 40), esperada)
        self.assertEqual(
            categoria_por_diagnostico("SD DOLOROSO NO TRAUMÁTICO", 70), Paciente.Categoria.MAS65
        )


class CompletarEdadesTests(APITestCase):
    def _paciente(self, rut, edad, diagnostico="LUMBAGO", categoria_excel=False):
        p = Paciente(rut=rut, nombre="X", edad=edad, diagnostico=diagnostico, categoria="LUMBAGOS", observaciones="")
        p._importacion_categoria_excel = categoria_excel
        return p

    def test_completa_edad_desde_otra_fila_del_mismo_rut(self):
        from apps.importar.parser import _completar_edades_faltantes

        sin_edad = self._paciente("80688709", 0)
        registros = [{"rut": "80688709", "edad": 72}, {"rut": "80688709", "edad": 0}]
        completadas = _completar_edades_faltantes([sin_edad], registros)

        self.assertEqual(completadas, 1)
        self.assertEqual(sin_edad.edad, 72)
        self.assertTrue(sin_edad.mayor_60)
        # Con 72 anios pasa a la categoria de mayores de 65.
        self.assertEqual(sin_edad.categoria, Paciente.Categoria.MAS65)
        self.assertIn("Edad tomada de otra derivación", sin_edad.observaciones)
        self.assertEqual(registros[1]["edad"], 72)

    def test_respeta_categoria_explicita_y_deja_sin_dato_si_no_hay_fuente(self):
        from apps.importar.parser import _completar_edades_faltantes

        explicita = self._paciente("11111111", 0, categoria_excel=True)
        sin_fuente = self._paciente("22222222", 0)
        _completar_edades_faltantes([explicita, sin_fuente], [{"rut": "11111111", "edad": 70}])

        self.assertEqual(explicita.edad, 70)
        self.assertEqual(explicita.categoria, "LUMBAGOS")
        self.assertEqual(sin_fuente.edad, 0)

    def test_usa_edad_de_paciente_ya_registrado(self):
        from apps.importar.parser import _completar_edades_faltantes

        Paciente.objects.create(
            rut="33333333", nombre="Previo", edad=55, diagnostico="LUMBAGO", categoria="LUMBAGOS",
            prioridad="MEDIANA", fecha_derivacion=date(2026, 1, 5),
        )
        nuevo = self._paciente("33333333", 0)
        _completar_edades_faltantes([nuevo], [])
        self.assertEqual(nuevo.edad, 55)


def excel_telefonos(headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    output = BytesIO()
    wb.save(output)
    return output.getvalue()


class NormalizarTelefonoTests(APITestCase):
    def test_formatos_chilenos(self):
        from apps.pacientes.telefonos import normalizar_telefono

        self.assertEqual(normalizar_telefono("9 1234 5678"), "+56912345678")
        self.assertEqual(normalizar_telefono(912345678.0), "+56912345678")
        self.assertEqual(normalizar_telefono("+56 9 1234-5678"), "+56912345678")
        self.assertEqual(normalizar_telefono("56912345678"), "+56912345678")
        self.assertEqual(normalizar_telefono("223456789"), "+56223456789")
        # 8 digitos es ambiguo: se guarda limpio, sin inventar prefijo.
        self.assertEqual(normalizar_telefono("1234-5678"), "12345678")
        self.assertEqual(normalizar_telefono("123"), "")
        self.assertEqual(normalizar_telefono(None), "")


class TelefonosImportacionTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override_settings = override_settings(MEDIA_ROOT=self.media_root)
        self.override_settings.enable()
        self.admin = Usuario.objects.create_user(
            rut="44444444-4", password="testpass", nombre="Admin", rol=Usuario.Rol.ADMIN,
        )
        self.client.force_authenticate(self.admin)

    def tearDown(self):
        self.override_settings.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)
        super().tearDown()

    def paciente(self, rut, **extra):
        datos = {
            "nombre": f"Paciente {rut}", "edad": 50, "diagnostico": "Lumbago",
            "categoria": Paciente.Categoria.LUMBAGOS, "prioridad": Paciente.Prioridad.ALTA,
            "fecha_derivacion": date(2025, 7, 2),
        }
        datos.update(extra)
        return Paciente.objects.create(rut=rut, **datos)

    def subir_telefonos(self, rows, aplicar, headers=("RUT", "TELEFONO", "TELEFONO RECADOS")):
        archivo = SimpleUploadedFile(
            "telefonos.xlsx", excel_telefonos(list(headers), rows), content_type=EXCEL_CONTENT_TYPE,
        )
        return self.client.post(
            "/api/importar/telefonos/", {"archivo": archivo, "aplicar": aplicar}, format="multipart",
        )

    def importar(self, headers, rows):
        archivo = SimpleUploadedFile(
            "deriv.xlsx", excel_derivaciones_con_headers(headers, rows), content_type=EXCEL_CONTENT_TYPE,
        )
        return self.client.post(
            "/api/importar/derivaciones/", {"archivo": archivo, "mes": 7, "anio": 2025}, format="multipart",
        )

    def test_importacion_nueva_guarda_telefono(self):
        response = self.importar(
            ["FECHA", "NOMBRE", "RUT", "EDAD", "DIAGNÓSTICO", "PRIORIDAD", "FONO", "TELEFONO RECADOS"],
            [[date(2025, 7, 2), "Paciente Fono", "11111111-1", 50, "Lumbago", "ALTA", 912345678, "22 345 6789"]],
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        paciente = Paciente.objects.get(rut="111111111")
        self.assertEqual(paciente.telefono, "+56912345678")
        self.assertEqual(paciente.telefono_recados, "+56223456789")

    def test_importacion_completa_telefono_de_paciente_existente(self):
        existente = self.paciente("111111111")
        response = self.importar(
            ["FECHA", "NOMBRE", "RUT", "EDAD", "DIAGNÓSTICO", "PRIORIDAD", "TELEFONO"],
            [[date(2025, 7, 2), "Paciente Existente", "11111111-1", 50, "Lumbago", "ALTA", "912345678"]],
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["telefonos_completados"], 1)
        existente.refresh_from_db()
        self.assertEqual(existente.telefono, "+56912345678")

    def test_previsualizar_no_modifica(self):
        paciente = self.paciente("111111111")
        response = self.subir_telefonos([["11.111.111-1", "912345678", ""]], aplicar=False)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["actualizados"], 1)
        self.assertFalse(response.data["aplicado"])
        paciente.refresh_from_db()
        self.assertEqual(paciente.telefono, "")

    def test_aplicar_completa_solo_vacios_y_reporta(self):
        vacio = self.paciente("111111111")
        rederivado = self.paciente("111111111", diagnostico="Hombro")
        con_fono = self.paciente("222222222", telefono="+56911111111")
        mismo = self.paciente("333333333", telefono="+56933333333")
        movimientos_antes = MovimientoPaciente.objects.count()

        response = self.subir_telefonos([
            ["11111111-1", 912345678, "223456789"],
            ["22222222-2", "987654321", ""],
            ["33333333-3", "933333333", ""],
            ["99999999-9", "955555555", ""],
            ["44444444-4", "12", ""],
        ], aplicar=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertTrue(data["aplicado"])
        self.assertEqual(data["total"], 5)
        self.assertEqual(data["actualizados"], 2)  # 111 (sus dos derivaciones) y 222 (recados)
        self.assertEqual(data["sin_cambios"], 1)
        self.assertEqual(data["no_encontrados"], 1)
        self.assertEqual(data["invalidos"], 1)

        for p in (vacio, rederivado):
            p.refresh_from_db()
            self.assertEqual(p.telefono, "+56912345678")
            self.assertEqual(p.telefono_recados, "+56223456789")
        con_fono.refresh_from_db()
        # No pisa el principal: el numero nuevo va a recados, que estaba vacio.
        self.assertEqual(con_fono.telefono, "+56911111111")
        self.assertEqual(con_fono.telefono_recados, "+56987654321")
        mismo.refresh_from_db()
        self.assertEqual(mismo.telefono, "+56933333333")
        self.assertEqual(mismo.telefono_recados, "")
        self.assertEqual(MovimientoPaciente.objects.count(), movimientos_antes)

    def test_conflicto_si_ambos_campos_ocupados(self):
        lleno = self.paciente("111111111", telefono="+56911111111", telefono_recados="+56922222222")
        response = self.subir_telefonos([["11111111-1", "987654321", ""]], aplicar=True)
        self.assertEqual(response.data["conflictos"], 1)
        lleno.refresh_from_db()
        self.assertEqual(lleno.telefono, "+56911111111")
        self.assertEqual(lleno.telefono_recados, "+56922222222")

    def test_archivo_sin_columnas_de_telefono(self):
        response = self.subir_telefonos([["11111111-1", "x"]], aplicar=True, headers=("RUT", "NOMBRE"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("teléfono", response.data["detail"])

    def test_plantilla_lista_pacientes_activos_sin_telefono(self):
        self.paciente("111111111")
        self.paciente("111111111", diagnostico="Hombro")
        self.paciente("222222222", telefono="+56911111111")
        self.paciente("333333333", estado=Paciente.Estado.EGRESO_VOLUNTARIO)
        response = self.client.get("/api/importar/telefonos/plantilla/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ws = load_workbook(BytesIO(response.content)).active
        self.assertEqual([c.value for c in ws[1]], ["RUT", "NOMBRE", "ESTADO", "TELEFONO", "TELEFONO RECADOS"])
        ruts = [ws.cell(row=r, column=1).value for r in range(2, ws.max_row + 1)]
        self.assertEqual(ruts, ["111111111"])

    def test_medico_puede_previsualizar_telefonos(self):
        medico = Usuario.objects.create_user(rut="66666666-6", password="x", nombre="Medico", rol=Usuario.Rol.MEDICO)
        self.client.force_authenticate(medico)
        response = self.subir_telefonos([["11111111-1", "912345678", ""]], aplicar=False)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_kine_no_puede_cargar_telefonos(self):
        kine = Usuario.objects.create_user(rut="55555555-5", password="x", nombre="Kine", rol=Usuario.Rol.KINE)
        self.client.force_authenticate(kine)
        response = self.subir_telefonos([["11111111-1", "912345678", ""]], aplicar=True)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ReversionCargaTests(APITestCase):
    """El Médico puede revertir su carga solo dentro de los 10 minutos."""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override_settings = override_settings(MEDIA_ROOT=self.media_root)
        self.override_settings.enable()
        self.medico = Usuario.objects.create_user(rut="99999999-9", password="x", nombre="Medico", rol=Usuario.Rol.MEDICO)
        self.admin = Usuario.objects.create_user(rut="44444444-4", password="x", nombre="Admin", rol=Usuario.Rol.ADMIN)
        self.existente = Paciente.objects.create(
            rut="111111111", nombre="Paciente Previo", edad=50, diagnostico="Lumbago",
            categoria=Paciente.Categoria.LUMBAGOS, prioridad=Paciente.Prioridad.ALTA,
            fecha_derivacion=date(2025, 6, 2),
        )
        self.client.force_authenticate(self.medico)

    def tearDown(self):
        self.override_settings.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)
        super().tearDown()

    def cargar(self):
        archivo = SimpleUploadedFile(
            "deriv.xlsx",
            excel_derivaciones_con_headers(
                ["FECHA", "NOMBRE", "RUT", "EDAD", "DIAGNÓSTICO", "PRIORIDAD", "TELEFONO"],
                [
                    [date(2025, 7, 2), "Paciente Nuevo", "22222222-2", 40, "Lumbago", "ALTA", ""],
                    [date(2025, 7, 3), "Paciente Previo", "11111111-1", 50, "Hombro doloroso", "ALTA", "912345678"],
                ],
            ),
            content_type=EXCEL_CONTENT_TYPE,
        )
        response = self.client.post(
            "/api/importar/derivaciones/", {"archivo": archivo, "mes": 7, "anio": 2025}, format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return response.data

    def revertir(self, corte_id):
        return self.client.delete(f"/api/importar/historial/corte/{corte_id}/")

    def test_revertir_dentro_de_10_minutos_deja_todo_como_antes(self):
        movimientos_antes = MovimientoPaciente.objects.count()
        meses_antes = self.existente.n_meses_espera
        data = self.cargar()
        self.assertTrue(data["lote"])
        corte_id = data["importaciones"][0]["id"]

        self.existente.refresh_from_db()
        self.assertEqual(self.existente.n_meses_espera, meses_antes + 1)
        self.assertIn("Hombro doloroso", self.existente.diagnostico)
        self.assertEqual(self.existente.telefono, "+56912345678")
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

        response = self.revertir(corte_id)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["revertida"])
        self.assertEqual(response.data["pacientes_eliminados"], 1)

        self.existente.refresh_from_db()
        self.assertEqual(self.existente.n_meses_espera, meses_antes)
        self.assertEqual(self.existente.diagnostico, "Lumbago")
        self.assertEqual(self.existente.telefono, "")
        self.assertFalse(Paciente.objects.filter(rut="222222222").exists())
        self.assertFalse(ImportacionMensual.objects.exists())
        self.assertEqual(MovimientoPaciente.objects.count(), movimientos_antes)

    def test_pasados_10_minutos_la_carga_queda_consolidada(self):
        data = self.cargar()
        corte_id = data["importaciones"][0]["id"]
        ImportacionMensual.objects.update(fecha_subida=timezone.now() - timedelta(minutes=11))

        historial = self.client.get("/api/importar/historial/").data
        self.assertFalse(historial[0]["revertible"])
        self.assertIn("10 minutos", historial[0]["motivo_no_revertible"])

        response = self.revertir(corte_id)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ImportacionMensual.objects.filter(id=corte_id).exists())
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

    def test_solo_quien_cargo_puede_revertir(self):
        data = self.cargar()
        otro = Usuario.objects.create_user(rut="88888888-8", password="x", nombre="Otro Medico", rol=Usuario.Rol.MEDICO)
        self.client.force_authenticate(otro)
        response = self.revertir(data["importaciones"][0]["id"])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

    def test_no_revierte_si_ya_hay_llamados(self):
        from apps.pacientes.models import LlamadoPaciente

        data = self.cargar()
        nuevo = Paciente.objects.get(rut="222222222")
        LlamadoPaciente.objects.create(paciente=nuevo, usuario=self.admin, resultado=LlamadoPaciente.Resultado.NO_CONTESTA)
        response = self.revertir(data["importaciones"][0]["id"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

    def test_no_revierte_si_otro_usuario_ya_trabajo_el_paciente(self):
        from apps.pacientes.models import ObservacionPaciente

        data = self.cargar()
        nuevo = Paciente.objects.get(rut="222222222")
        ObservacionPaciente.objects.create(paciente=nuevo, texto="Llamar mañana", autor=self.admin)
        response = self.revertir(data["importaciones"][0]["id"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

    def test_no_revierte_si_otro_usuario_cambio_el_estado(self):
        data = self.cargar()
        nuevo = Paciente.objects.get(rut="222222222")
        MovimientoPaciente.objects.create(
            paciente=nuevo, usuario=self.admin, estado_anterior="PENDIENTE", estado_nuevo="INGRESADO"
        )
        response = self.revertir(data["importaciones"][0]["id"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Paciente.objects.filter(rut="222222222").exists())

    def test_medico_no_elimina_periodo_completo(self):
        self.cargar()
        response = self.client.delete("/api/importar/historial/7/2025/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(ImportacionMensual.objects.exists())

    def test_admin_puede_limpiar_corte_consolidado(self):
        data = self.cargar()
        ImportacionMensual.objects.update(fecha_subida=timezone.now() - timedelta(minutes=30))
        self.client.force_authenticate(self.admin)
        response = self.revertir(data["importaciones"][0]["id"])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["revertida"])

    def test_resumen_de_cargas_para_el_inicio(self):
        self.cargar()
        response = self.client.get("/api/importar/resumen-cargas/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["derivaciones_mes"], 1)
        self.assertEqual(response.data["cargas_mes"], 1)
        # El paciente nuevo no trae teléfono; el previo lo completó la carga.
        self.assertEqual(response.data["pendientes_telefono"], 1)
        self.assertEqual(response.data["ventana_minutos"], 10)
        self.assertTrue(response.data["recientes"][0]["revertible"])

        kine = Usuario.objects.create_user(rut="55555555-5", password="x", nombre="Kine", rol=Usuario.Rol.KINE)
        self.client.force_authenticate(kine)
        self.assertEqual(self.client.get("/api/importar/resumen-cargas/").status_code, status.HTTP_403_FORBIDDEN)


class RevisionConHistoricoTests(APITestCase):
    """Cruce de la bandeja de revisión con el histórico de pacientes de Tomé."""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override_settings = override_settings(MEDIA_ROOT=self.media_root)
        self.override_settings.enable()
        self.admin = Usuario.objects.create_user(
            rut="55555555-5", password="testpass", nombre="Admin Revision", rol=Usuario.Rol.ADMIN,
        )
        self.client.force_authenticate(self.admin)
        self.paciente = Paciente.objects.create(
            id_ccr="REV-1", fecha_derivacion=date(2026, 8, 3), nombre="ANA PEREZ SOTO", rut="111111111",
            edad=60, diagnostico="Lumbago", profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.ALTA, categoria=Paciente.Categoria.LUMBAGOS,
        )
        HistoricoPaciente.objects.create(
            rut="111111111", nombre="ANA MARIA PEREZ SOTO", fecha_nacimiento=date(1966, 1, 1),
            comuna="Tomé", sector="FRUTILLARES", codigo_sector="A7", telefono="+56912345678",
        )
        HistoricoPaciente.objects.create(
            rut="222222222", nombre="JUAN FALLECIDO", fecha_nacimiento=date(1940, 1, 1),
            fecha_fallecimiento=date(2026, 5, 1), comuna="Penco",
        )

        def obs(tipo, rut, motivo, **extra):
            return {
                "tipo": tipo, "tipo_label": tipo, "periodo_label": "Agosto 2026", "archivo_nombre": "r.xlsx",
                "hoja": "AGOSTO", "fila": 2, "motivo": motivo, "accion": "", "nombre": "ANA PEREZ SOTO",
                "rut": rut, "edad": 60, "estado_revision": "PENDIENTE", "paciente_id": None, **extra,
            }

        self.importacion = ImportacionMensual.objects.create(
            archivo=ContentFile(b"x", name="r.xlsx"), archivo_nombre="r.xlsx", mes=11, anio=2026,
            mes_datos=8, anio_datos=2026, usuario=self.admin,
            observaciones_revision=[
                obs("ADVERTENCIA", "111111111", "Sector oficial vacío.", paciente_id=self.paciente.id),
                obs("ADVERTENCIA", "111111111", "Kine no confirmado detectado: x.", paciente_id=self.paciente.id),
                obs("RECURRENTE", "111111111", "Registro repetido en el sistema.",
                    paciente_id=self.paciente.id, fecha_derivacion="10/06/2026"),
                obs("ERROR", "333333333", "Nombre vacío"),
                obs("RECURRENTE", "222222222", "Registro repetido en el sistema."),
            ],
        )
        # El mismo paciente ya había aparecido en el corte de julio.
        ImportacionMensual.objects.create(
            archivo=ContentFile(b"x", name="j.xlsx"), archivo_nombre="j.xlsx", mes=11, anio=2026,
            mes_datos=7, anio_datos=2026, usuario=self.admin,
            observaciones_revision=[
                obs("RECURRENTE", "111111111", "Registro repetido en el sistema.",
                    paciente_id=self.paciente.id, fecha_derivacion="15/07/2026", estado_revision="RESUELTO"),
            ],
        )

    def tearDown(self):
        self.override_settings.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)
        super().tearDown()

    def test_bandeja_trae_historico_resumen_y_ordena_errores_primero(self):
        response = self.client.get("/api/importar/revision/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"][0]["tipo"], "ERROR")
        # Advertencia de sector + recurrente que sigue en lista.
        self.assertEqual(response.data["resumen"]["auto_resolubles"], 2)
        self.assertEqual(response.data["resumen"]["fallecidos"], 1)
        self.assertEqual(response.data["resumen"]["otra_comuna"], 1)
        advertencia = next(i for i in response.data["items"] if i["revision_index"] == 0)
        self.assertTrue(advertencia["auto_resoluble"])
        self.assertEqual(advertencia["historico"]["sector_oficial"], "FRUTILLARES")
        self.assertTrue(advertencia["historico"]["nombre_coincide"])

    def test_filtro_por_alerta_fallecido(self):
        response = self.client.get("/api/importar/revision/?alerta=FALLECIDO")
        self.assertEqual([i["rut"] for i in response.data["items"]], ["222222222"])

    def test_autoresolver_simula_y_luego_completa_sector(self):
        simulado = self.client.post("/api/importar/revision/autoresolver/", {"simular": True}, format="json")
        self.assertEqual(simulado.data["resueltas"], 2)
        self.importacion.refresh_from_db()
        self.assertEqual(self.importacion.observaciones_revision[0]["estado_revision"], "PENDIENTE")

        aplicado = self.client.post("/api/importar/revision/autoresolver/", {}, format="json")
        self.assertEqual(aplicado.data["advertencias"], 1)
        self.assertEqual(aplicado.data["recurrentes"], 1)
        self.assertEqual(aplicado.data["fichas_completadas"], 1)
        # El recurrente de un paciente sin ficha (fallecido) queda para una persona.
        self.importacion.refresh_from_db()
        self.assertEqual(self.importacion.observaciones_revision[4]["estado_revision"], "PENDIENTE")
        self.importacion.refresh_from_db()
        self.assertEqual(self.importacion.observaciones_revision[0]["estado_revision"], "RESUELTO")
        self.assertNotIn("historico", self.importacion.observaciones_revision[0])
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.sector_oficial, "FRUTILLARES")
        self.assertEqual(self.paciente.sector_cesfam, "AZUL")
        # La advertencia con otro motivo no se toca.
        self.assertEqual(self.importacion.observaciones_revision[1]["estado_revision"], "PENDIENTE")

    def test_accion_masiva_no_resuelve_errores_pero_si_los_descarta(self):
        items = [{"importacion_id": self.importacion.id, "index": i} for i in (2, 3)]
        resolver = self.client.post("/api/importar/revision/masiva/", {"accion": "RESOLVER", "items": items}, format="json")
        self.assertEqual((resolver.data["procesadas"], resolver.data["omitidas"]), (1, 1))
        descartar = self.client.post(
            "/api/importar/revision/masiva/",
            {"accion": "DESCARTAR", "items": [{"importacion_id": self.importacion.id, "index": 3}]},
            format="json",
        )
        self.assertEqual(descartar.data["procesadas"], 1)
        self.importacion.refresh_from_db()
        self.assertEqual(self.importacion.observaciones_revision[2]["estado_revision"], "RESUELTO")
        self.assertEqual(self.importacion.observaciones_revision[3]["estado_revision"], "DESCARTADO")

    def test_recurrente_queda_en_lista_con_espera_acumulada_y_se_puede_deshacer(self):
        resolver = self.client.post(
            "/api/importar/revision/masiva/",
            {"accion": "RESOLVER", "items": [{"importacion_id": self.importacion.id, "index": 2}]},
            format="json",
        )
        self.assertEqual(resolver.data["procesadas"], 1)
        self.paciente.refresh_from_db()
        # Espera desde la primera derivación vista y 2 cortes (julio y agosto).
        self.assertEqual(self.paciente.fecha_derivacion, date(2026, 6, 10))
        self.assertEqual(self.paciente.n_meses_espera, 2)
        self.assertEqual(self.paciente.estado, Paciente.Estado.PENDIENTE)

        deshacer = self.client.post("/api/importar/revision/deshacer/", {"lote": resolver.data["lote"]}, format="json")
        self.assertEqual(deshacer.data["deshechas"], 1)
        self.assertEqual(deshacer.data["fichas_restauradas"], 1)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.fecha_derivacion, date(2026, 8, 3))
        self.assertEqual(self.paciente.n_meses_espera, 1)
        self.importacion.refresh_from_db()
        obs = self.importacion.observaciones_revision[2]
        self.assertEqual(obs["estado_revision"], "PENDIENTE")
        self.assertNotIn("lote_resolucion", obs)

    def test_deshacer_por_items_y_lote_de_autoresolucion(self):
        auto = self.client.post("/api/importar/revision/autoresolver/", {}, format="json")
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.sector_oficial, "FRUTILLARES")
        deshacer = self.client.post("/api/importar/revision/deshacer/", {"lote": auto.data["lote"]}, format="json")
        self.assertEqual(deshacer.data["deshechas"], 2)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.sector_oficial, "")
        self.assertEqual(self.paciente.fecha_derivacion, date(2026, 8, 3))

        descartar = self.client.post(
            "/api/importar/revision/masiva/",
            {"accion": "DESCARTAR", "items": [{"importacion_id": self.importacion.id, "index": 3}]},
            format="json",
        )
        self.assertEqual(descartar.data["procesadas"], 1)
        uno = self.client.post(
            "/api/importar/revision/deshacer/",
            {"items": [{"importacion_id": self.importacion.id, "index": 3}]},
            format="json",
        )
        self.assertEqual(uno.data["deshechas"], 1)
        vacio = self.client.post("/api/importar/revision/deshacer/", {}, format="json")
        self.assertEqual(vacio.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accion_masiva_valida_la_entrada(self):
        malo = self.client.post("/api/importar/revision/masiva/", {"accion": "BORRAR", "items": []}, format="json")
        self.assertEqual(malo.status_code, status.HTTP_400_BAD_REQUEST)
        vacio = self.client.post("/api/importar/revision/masiva/", {"accion": "RESOLVER", "items": []}, format="json")
        self.assertEqual(vacio.status_code, status.HTTP_400_BAD_REQUEST)


class SectorizacionTests(APITestCase):
    def test_codigo_numerado_da_color_y_barrio_canonico(self):
        from apps.importar.sectorizacion import sectorizar

        self.assertEqual(
            sectorizar("CARA7-0012", "FRUTILLARES"),
            {"codigo": "A7", "sector_cesfam": "AZUL", "sector_oficial": "FRUTILLARES"},
        )

    def test_bellavista_usa_el_barrio_del_padron(self):
        from apps.importar.sectorizacion import sectorizar

        self.assertEqual(
            sectorizar("CB1A003919", "LOMA ALTA (CB)"),
            {"codigo": "CB", "sector_cesfam": "CESFAM BELLAVISTA", "sector_oficial": "LOMA ALTA"},
        )

    def test_codigo_sin_sector_valido_queda_solo_en_color(self):
        from apps.importar.sectorizacion import codigo_desde_familia

        # Igual que la macro: prueba dos digitos y luego uno; si ninguno sirve, solo color.
        self.assertEqual(codigo_desde_familia("CARA12-0345"), "A12")
        self.assertEqual(codigo_desde_familia("CARV0"), "V")
