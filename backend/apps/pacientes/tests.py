from datetime import datetime, timedelta
from io import BytesIO

from openpyxl import load_workbook
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.usuarios.models import Usuario

from .models import (
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    ObservacionPaciente,
    Paciente,
    RegistroAgendaPaciente,
)


EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class PacienteWorkflowTests(APITestCase):
    def setUp(self):
        self.kine = Usuario.objects.create_user(
            rut="11111111-1",
            password="testpass",
            nombre="Kine Test",
            rol=Usuario.Rol.KINE,
        )
        self.admin = Usuario.objects.create_user(
            rut="22222222-2",
            password="testpass",
            nombre="Admin Test",
            rol=Usuario.Rol.ADMIN,
        )
        self.client.force_authenticate(self.admin)
        self.paciente_counter = 0

    def crear_paciente(self, **overrides):
        self.paciente_counter += 1
        data = {
            "fecha_derivacion": timezone.localdate(),
            "percapita_desde": "CESFAM",
            "nombre": "Paciente Test",
            "rut": f"900000{self.paciente_counter:02d}-{self.paciente_counter % 10}",
            "edad": 45,
            "diagnostico": "Lumbago",
            "profesional": "KINESIOLOGO",
            "prioridad": Paciente.Prioridad.MODERADA,
            "categoria": Paciente.Categoria.LUMBAGOS,
            "kine_asignado": self.kine,
        }
        data.update(overrides)
        return Paciente.objects.create(**data)

    def test_medico_no_accede_a_lista_de_espera_ni_estadisticas(self):
        medico = Usuario.objects.create_user(rut="33333333-3", password="testpass", nombre="Medico Test", rol=Usuario.Rol.MEDICO)
        paciente = self.crear_paciente()
        self.client.force_authenticate(medico)

        bloqueadas = [
            "/api/pacientes/",
            f"/api/pacientes/{paciente.id}/",
            "/api/pacientes/dashboard-resumen/",
            "/api/pacientes/cola-llamados/",
            "/api/pacientes/exportar/",
            f"/api/pacientes/perfil/{paciente.rut}/",
            "/api/grupos-pacientes/",
            "/api/actividades-grupales/",
            "/api/reportes/resumen/",
            "/api/reportes/por-kine/",
        ]
        for url in bloqueadas:
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        llamado = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-llamado/", {"resultado": LlamadoPaciente.Resultado.NO_CONTESTA}, format="json"
        )
        self.assertEqual(llamado.status_code, status.HTTP_403_FORBIDDEN)
        cambio = self.client.post(
            f"/api/pacientes/{paciente.id}/cambiar-estado/", {"estado": Paciente.Estado.INGRESADO, "notas": "x"}, format="json"
        )
        self.assertEqual(cambio.status_code, status.HTTP_403_FORBIDDEN)
        edicion = self.client.patch(f"/api/pacientes/{paciente.id}/", {"telefono": "+56912345678"}, format="json")
        self.assertEqual(edicion.status_code, status.HTTP_403_FORBIDDEN)

        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.PENDIENTE)
        self.assertEqual(paciente.telefono, "")
        self.assertFalse(paciente.llamados.exists())

    def test_listado_incluye_aliases_de_responsable_y_campos_compatibles(self):
        paciente = self.crear_paciente(nombre="Paciente Alias")

        response = self.client.get("/api/pacientes/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        item = next(p for p in data if p["id"] == paciente.id)
        self.assertEqual(item["kine_asignado"], self.kine.id)
        self.assertEqual(item["kine_asignado_nombre"], self.kine.nombre)
        self.assertEqual(item["responsable_asignado"], self.kine.id)
        self.assertEqual(item["responsable_nombre"], self.kine.nombre)

    def test_filtro_categoria_acepta_varias_separadas_por_coma(self):
        lumbago = self.crear_paciente(categoria=Paciente.Categoria.LUMBAGOS)
        sdt = self.crear_paciente(categoria=Paciente.Categoria.SDT)
        hombro = self.crear_paciente(categoria=Paciente.Categoria.HOMBROS)

        response = self.client.get("/api/pacientes/", {"categoria": "LUMBAGOS,SDT"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        ids = {p["id"] for p in data}
        self.assertIn(lumbago.id, ids)
        self.assertIn(sdt.id, ids)
        self.assertNotIn(hombro.id, ids)

        response = self.client.get("/api/pacientes/", {"categoria": "HOMBROS"})
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual({p["id"] for p in data}, {hombro.id})

    def test_filtros_prioridad_sector_y_kine_aceptan_varios_valores(self):
        alta = self.crear_paciente(prioridad=Paciente.Prioridad.ALTA, sector_cesfam="Rojo")
        mediana = self.crear_paciente(prioridad=Paciente.Prioridad.MEDIANA, sector_cesfam="AZUL")
        moderada = self.crear_paciente(prioridad=Paciente.Prioridad.MODERADA, sector_cesfam="Verde")
        sin_kine = self.crear_paciente(kine_asignado=None, sector_cesfam="Verde")

        def ids(params):
            response = self.client.get("/api/pacientes/", params)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
            return {p["id"] for p in data}

        self.assertEqual(ids({"prioridad": "ALTA,MEDIANA"}), {alta.id, mediana.id})
        self.assertEqual(ids({"sector_cesfam": "rojo,azul"}), {alta.id, mediana.id})
        self.assertEqual(ids({"kine": "SIN_ASIGNAR"}), {sin_kine.id})
        self.assertEqual(
            ids({"kine": f"{self.kine.id},SIN_ASIGNAR"}),
            {alta.id, mediana.id, moderada.id, sin_kine.id},
        )

    def test_categoria_borrador_mantiene_valor_y_muestra_no_categorizado(self):
        paciente = self.crear_paciente(categoria=Paciente.Categoria.BORRADOR)

        response = self.client.get("/api/pacientes/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        item = next(p for p in data if p["id"] == paciente.id)
        self.assertEqual(item["categoria"], Paciente.Categoria.BORRADOR)
        self.assertEqual(item["categoria_label"], "No categorizado")

    def test_busqueda_incluye_sector_responsable_y_observaciones(self):
        responsable = Usuario.objects.create_user(
            rut="33333333-3",
            password="testpass",
            nombre="Responsable Buscada",
            rol=Usuario.Rol.KINE,
        )
        por_sector_cesfam = self.crear_paciente(
            nombre="Paciente Sector Cesfam",
            sector_cesfam="ROJO NORTE",
        )
        por_sector_oficial = self.crear_paciente(
            nombre="Paciente Sector Oficial",
            sector_oficial="AZUL SUR",
        )
        por_responsable = self.crear_paciente(
            nombre="Paciente Responsable",
            kine_asignado=responsable,
        )
        por_observacion = self.crear_paciente(
            nombre="Paciente Observacion",
            observaciones="Prefiere llamado en la tarde",
        )

        casos = [
            ("ROJO NORTE", [por_sector_cesfam]),
            ("AZUL SUR", [por_sector_oficial]),
            ("Responsable Buscada", [por_responsable]),
            ("llamado en la tarde", [por_observacion]),
        ]
        for termino, esperados in casos:
            with self.subTest(termino=termino):
                response = self.client.get("/api/pacientes/", {"search": termino})
                self.assertResponseSoloPacientes(response, esperados)

    def test_filtro_estado_acepta_multiples_valores(self):
        pendiente = self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        rescate = self.crear_paciente(estado=Paciente.Estado.RESCATE)
        self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        self.crear_paciente(estado=Paciente.Estado.ALTA_MEDICA)

        response = self.client.get("/api/pacientes/?estado=PENDIENTE,RESCATE")

        self.assertResponseSoloPacientes(response, [pendiente, rescate])

    def test_solo_mios_acota_resultados_de_kine(self):
        otro_kine = Usuario.objects.create_user(
            rut="44444444-4",
            password="testpass",
            nombre="Otro Kine",
            rol=Usuario.Rol.KINE,
        )
        mio = self.crear_paciente(nombre="Paciente Mio", kine_asignado=self.kine)
        self.crear_paciente(nombre="Paciente Otro", kine_asignado=otro_kine)
        self.crear_paciente(nombre="Paciente Sin Responsable", kine_asignado=None)
        self.client.force_authenticate(self.kine)

        response = self.client.get("/api/pacientes/?solo_mios=1")

        self.assertResponseSoloPacientes(response, [mio])

    def test_registrar_llamado_contesto_crea_historial_e_ingresa(self):
        paciente = self.crear_paciente(fecha_ingreso=None)

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-llamado/",
            {"contesto": True, "notas": "Confirma asistencia"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertEqual(paciente.n_intentos_contacto, 0)
        self.assertIsNotNone(paciente.fecha_ingreso)
        self.assertEqual(LlamadoPaciente.objects.count(), 1)
        self.assertEqual(
            LlamadoPaciente.objects.first().resultado,
            LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO,
        )

    def llamar(self, paciente, **datos):
        return self.client.post(f"/api/pacientes/{paciente.id}/registrar-llamado/", datos, format="json")

    def test_registrar_llamado_no_contesta_pasa_a_rescate_al_tercer_intento(self):
        paciente = self.crear_paciente()

        for intento in range(1, 3):
            response = self.llamar(paciente, resultado="NO_CONTESTA")
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            self.assertEqual(response.data["estado"], Paciente.Estado.PENDIENTE)
            self.assertEqual(response.data["intentos_estado"], intento)
            self.assertEqual(response.data["intentos_umbral"], 3)

        response = self.llamar(paciente, contesto=False, notas="")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.RESCATE)
        self.assertEqual(paciente.n_intentos_contacto, 3)
        self.assertEqual(LlamadoPaciente.objects.filter(paciente=paciente).count(), 3)
        self.assertEqual(
            MovimientoPaciente.objects.get(paciente=paciente).notas,
            "3 llamados sin respuesta. Pasa a RESCATE.",
        )
        # Al entrar a RESCATE el conteo vuelve a cero.
        self.assertEqual(response.data["intentos_estado"], 0)
        self.assertEqual(response.data["intentos_umbral"], 2)

    def test_registrar_llamado_rescate_ultimo_intento_exige_observacion(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.RESCATE, fecha_cambio_estado=timezone.now())
        self.assertEqual(self.llamar(paciente, resultado="NO_CONTESTA").status_code, status.HTTP_200_OK)

        response = self.llamar(paciente, resultado="NO_CONTESTA", notas="")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.RESCATE)
        self.assertEqual(LlamadoPaciente.objects.filter(paciente=paciente).count(), 1)

    def test_registrar_llamado_rescate_con_observacion_egresa_administrativamente(self):
        paciente = self.crear_paciente(
            estado=Paciente.Estado.RESCATE, fecha_cambio_estado=timezone.now(), fecha_egreso=None
        )
        self.llamar(paciente, resultado="NO_CONTESTA")

        response = self.llamar(paciente, resultado="NO_CONTESTA", notas="Segundo intento sin respuesta")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.EGRESO_ADMINISTRATIVO)
        self.assertIsNotNone(paciente.fecha_egreso)
        self.assertEqual(MovimientoPaciente.objects.filter(paciente=paciente).count(), 1)

    def test_contesta_con_fecha_ingresa_y_cita_en_un_paso(self):
        paciente = self.crear_paciente(fecha_ingreso=None)
        cita = timezone.now() + timedelta(days=3)

        response = self.llamar(paciente, resultado="CONTESTA_CONFIRMADO", fecha_atencion=cita.isoformat())

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertIsNotNone(paciente.fecha_ingreso)
        self.assertEqual(paciente.proxima_atencion, cita)
        self.assertEqual(paciente.fecha_siguiente_cita, timezone.localdate(cita))

    def test_reagendar_llamado_guarda_cuando_volver_a_llamar(self):
        paciente = self.crear_paciente()
        volver = timezone.now() + timedelta(days=2)

        sin_fecha = self.llamar(paciente, resultado="REAGENDAR_LLAMADO")
        self.assertEqual(sin_fecha.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.llamar(paciente, resultado="REAGENDAR_LLAMADO", volver_a_llamar=volver.isoformat())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.proximo_llamado, volver)
        self.assertEqual(paciente.estado, Paciente.Estado.PENDIENTE)
        self.assertEqual(paciente.n_intentos_contacto, 0)

        # Cualquier otro resultado limpia la fecha para volver a llamar.
        self.llamar(paciente, resultado="NUMERO_EQUIVOCADO")
        paciente.refresh_from_db()
        self.assertIsNone(paciente.proximo_llamado)

    def test_rechaza_atencion_egresa_voluntariamente_con_observacion(self):
        paciente = self.crear_paciente()

        self.assertEqual(self.llamar(paciente, resultado="RECHAZA_ATENCION").status_code, status.HTTP_400_BAD_REQUEST)
        response = self.llamar(paciente, resultado="RECHAZA_ATENCION", notas="Se atiende en otro centro")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.EGRESO_VOLUNTARIO)
        self.assertIsNotNone(paciente.fecha_egreso)

    def test_llamado_a_ingresado_sin_cita(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO)

        no_contesta = self.llamar(paciente, resultado="NO_CONTESTA")
        self.assertEqual(no_contesta.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertEqual(paciente.n_intentos_contacto, 0)

        sin_fecha = self.llamar(paciente, resultado="CONTESTA_CONFIRMADO")
        self.assertEqual(sin_fecha.status_code, status.HTTP_400_BAD_REQUEST)
        resuelto = self.llamar(paciente, resultado="YA_RESUELTO", notas="x")
        self.assertEqual(resuelto.status_code, status.HTTP_400_BAD_REQUEST)

        cita = timezone.now() + timedelta(days=1)
        response = self.llamar(paciente, resultado="CONTESTA_CONFIRMADO", fecha_atencion=cita.isoformat())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.proxima_atencion, cita)
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)

    def test_registrar_llamado_rechaza_paciente_egresado(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.ALTA_MEDICA)

        response = self.llamar(paciente, contesto=False, notas="No corresponde")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deshacer_llamado_restaura_estado_y_borra_rastro(self):
        paciente = self.crear_paciente(fecha_ingreso=None)
        cita = timezone.now() + timedelta(days=3)
        response = self.llamar(paciente, resultado="CONTESTA_CONFIRMADO", fecha_atencion=cita.isoformat())
        llamado_id = response.data["ultimo_llamado"]["id"]

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/deshacer-llamado/", {"llamado_id": llamado_id}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.PENDIENTE)
        self.assertIsNone(paciente.fecha_ingreso)
        self.assertIsNone(paciente.proxima_atencion)
        self.assertFalse(LlamadoPaciente.objects.filter(paciente=paciente).exists())
        self.assertFalse(MovimientoPaciente.objects.filter(paciente=paciente).exists())

    def test_deshacer_llamado_solo_reciente_y_propio(self):
        paciente = self.crear_paciente()
        llamado_id = self.llamar(paciente, resultado="NO_CONTESTA").data["ultimo_llamado"]["id"]
        url = f"/api/pacientes/{paciente.id}/deshacer-llamado/"

        self.client.force_authenticate(self.kine)
        otro_usuario = self.client.post(url, {"llamado_id": llamado_id}, format="json")
        self.assertEqual(otro_usuario.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.admin)
        LlamadoPaciente.objects.filter(pk=llamado_id).update(fecha=timezone.now() - timedelta(minutes=11))
        vencido = self.client.post(url, {"llamado_id": llamado_id}, format="json")
        self.assertEqual(vencido.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cola_llamados_separa_por_contactar_y_por_citar(self):
        pendiente = self.crear_paciente()
        rescate = self.crear_paciente(estado=Paciente.Estado.RESCATE)
        por_citar = self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        self.crear_paciente(estado=Paciente.Estado.INGRESADO, proxima_atencion=timezone.now() + timedelta(days=1))
        self.crear_paciente(kine_asignado=None)

        response = self.client.get("/api/pacientes/cola-llamados/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({p["id"] for p in response.data["por_contactar"]}, {pendiente.id, rescate.id})
        self.assertEqual({p["id"] for p in response.data["por_citar"]}, {por_citar.id})

    def test_cambiar_estado_bloquea_abandono_antes_de_ingreso(self):
        for estado_actual in [Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE]:
            paciente = self.crear_paciente(estado=estado_actual, rut=f"1234567{estado_actual[0]}-5")
            response = self.client.post(
                f"/api/pacientes/{paciente.id}/cambiar-estado/",
                {"estado": Paciente.Estado.ABANDONO, "notas": "Cierre"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            paciente.refresh_from_db()
            self.assertEqual(paciente.estado, estado_actual)

    def test_cambiar_estado_finales_requieren_nota_y_setean_fecha_egreso(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO, fecha_egreso=None)

        sin_nota = self.client.post(
            f"/api/pacientes/{paciente.id}/cambiar-estado/",
            {"estado": Paciente.Estado.ABANDONO, "notas": ""},
            format="json",
        )
        self.assertEqual(sin_nota.status_code, status.HTTP_400_BAD_REQUEST)

        abandono = self.client.post(
            f"/api/pacientes/{paciente.id}/cambiar-estado/",
            {"estado": Paciente.Estado.ABANDONO, "notas": "Dos inasistencias evaluadas"},
            format="json",
        )
        self.assertEqual(abandono.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.ABANDONO)
        self.assertIsNotNone(paciente.fecha_egreso)

    def test_cambiar_estado_derivado_permitido_desde_ingresado_con_nota(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO)

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/cambiar-estado/",
            {"estado": Paciente.Estado.DERIVADO, "notas": "Derivado a otro dispositivo"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.DERIVADO)
        self.assertIsNotNone(paciente.fecha_egreso)

    def test_registrar_inasistencia_reglas_y_alerta(self):
        pendiente = self.crear_paciente()
        rechazado = self.client.post(
            f"/api/pacientes/{pendiente.id}/registrar-inasistencia/",
            {
                "fecha": str(timezone.localdate()),
                "justificada": False,
                "motivo": "No asiste",
            },
            format="json",
        )
        self.assertEqual(rechazado.status_code, status.HTTP_400_BAD_REQUEST)

        ingresado = self.crear_paciente(estado=Paciente.Estado.INGRESADO, rut="87654321-9")
        justificada = self.client.post(
            f"/api/pacientes/{ingresado.id}/registrar-inasistencia/",
            {
                "fecha": str(timezone.localdate()),
                "justificada": True,
                "motivo": "Aviso previo",
            },
            format="json",
        )
        self.assertEqual(justificada.status_code, status.HTTP_201_CREATED)
        ingresado.refresh_from_db()
        self.assertEqual(ingresado.n_inasistencias, 0)

        for index in range(2):
            response = self.client.post(
                f"/api/pacientes/{ingresado.id}/registrar-inasistencia/",
                {
                    "fecha": str(timezone.localdate()),
                    "justificada": False,
                    "motivo": f"No asiste {index + 1}",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        ingresado.refresh_from_db()
        self.assertEqual(ingresado.n_inasistencias, 2)
        self.assertTrue(response.data["alerta_abandono"])
        self.assertEqual(ingresado.estado, Paciente.Estado.INGRESADO)
        self.assertEqual(InasistenciaPaciente.objects.filter(paciente=ingresado).count(), 3)

    def test_registrar_asistencia_ingresa_pendiente_y_limpia_agenda(self):
        fecha = timezone.now() + timedelta(days=1)
        paciente = self.crear_paciente(
            estado=Paciente.Estado.PENDIENTE,
            fecha_ingreso=None,
            proxima_atencion=fecha,
            fecha_siguiente_cita=timezone.localdate(fecha),
        )

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-asistencia/",
            {"fecha_programada": fecha.isoformat(), "observacion": "Asiste"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertIsNotNone(paciente.fecha_ingreso)
        self.assertIsNone(paciente.proxima_atencion)
        self.assertIsNone(paciente.fecha_siguiente_cita)
        self.assertEqual(
            RegistroAgendaPaciente.objects.get(paciente=paciente).resultado,
            RegistroAgendaPaciente.Resultado.ASISTIO,
        )
        self.assertTrue(
            MovimientoPaciente.objects.filter(
                paciente=paciente,
                notas="Paciente asistió a atención programada.",
            ).exists()
        )

    def test_registrar_asistencia_ingresado_mantiene_estado_y_limpia_agenda(self):
        fecha = timezone.now() + timedelta(days=1)
        paciente = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            proxima_atencion=fecha,
            fecha_siguiente_cita=timezone.localdate(fecha),
        )

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-asistencia/",
            {"fecha_programada": fecha.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertIsNone(paciente.proxima_atencion)
        self.assertEqual(
            RegistroAgendaPaciente.objects.filter(
                paciente=paciente,
                resultado=RegistroAgendaPaciente.Resultado.ASISTIO,
            ).count(),
            1,
        )

    def test_registrar_inasistencia_agenda_incrementa_y_alerta_sin_abandono(self):
        fecha = timezone.now() + timedelta(days=1)
        paciente = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            n_inasistencias=1,
            proxima_atencion=fecha,
            fecha_siguiente_cita=timezone.localdate(fecha),
        )

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-inasistencia-agenda/",
            {
                "fecha_programada": fecha.isoformat(),
                "motivo": "No asiste a atención programada.",
                "justificada": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        paciente.refresh_from_db()
        self.assertEqual(paciente.n_inasistencias, 2)
        self.assertEqual(paciente.estado, Paciente.Estado.INGRESADO)
        self.assertIsNone(paciente.proxima_atencion)
        self.assertTrue(response.data["alerta_abandono"])
        self.assertEqual(InasistenciaPaciente.objects.filter(paciente=paciente).count(), 1)
        self.assertEqual(
            RegistroAgendaPaciente.objects.get(paciente=paciente).resultado,
            RegistroAgendaPaciente.Resultado.NO_ASISTIO,
        )
        self.assertTrue(
            MovimientoPaciente.objects.filter(
                paciente=paciente,
                notas="No asiste a atención programada.",
            ).exists()
        )

    def test_reagendar_atencion_actualiza_proxima_y_no_cambia_estado(self):
        fecha = timezone.now() + timedelta(days=1)
        nueva_fecha = fecha + timedelta(days=3)
        paciente = self.crear_paciente(
            estado=Paciente.Estado.RESCATE,
            proxima_atencion=fecha,
            fecha_siguiente_cita=timezone.localdate(fecha),
        )

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/reagendar-atencion/",
            {
                "fecha_programada": fecha.isoformat(),
                "nueva_fecha": nueva_fecha.isoformat(),
                "observacion": "Solicitud del paciente.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.estado, Paciente.Estado.RESCATE)
        self.assertEqual(paciente.proxima_atencion, nueva_fecha)
        self.assertEqual(paciente.fecha_siguiente_cita, timezone.localdate(nueva_fecha))
        registro = RegistroAgendaPaciente.objects.get(paciente=paciente)
        self.assertEqual(registro.resultado, RegistroAgendaPaciente.Resultado.REAGENDADO)
        self.assertEqual(registro.nueva_fecha, nueva_fecha)

    def test_eliminar_cita_limpia_proxima_y_no_borra_paciente(self):
        fecha = timezone.now() + timedelta(days=1)
        paciente = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            proxima_atencion=fecha,
            fecha_siguiente_cita=timezone.localdate(fecha),
        )

        response = self.client.post(
            f"/api/pacientes/{paciente.id}/eliminar-cita/",
            {"fecha_programada": fecha.isoformat(), "observacion": "Cita eliminada."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertIsNone(paciente.proxima_atencion)
        self.assertTrue(Paciente.objects.filter(pk=paciente.pk).exists())
        self.assertEqual(
            RegistroAgendaPaciente.objects.get(paciente=paciente).resultado,
            RegistroAgendaPaciente.Resultado.CANCELADO,
        )

    def test_acciones_de_agenda_requieren_proxima_atencion(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO, proxima_atencion=None)

        endpoints = [
            ("registrar-asistencia", {}),
            ("registrar-inasistencia-agenda", {"motivo": "No asiste"}),
            ("eliminar-cita", {}),
        ]
        for endpoint, payload in endpoints:
            response = self.client.post(
                f"/api/pacientes/{paciente.id}/{endpoint}/",
                payload,
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_historial_completo_retorna_componentes_operativos(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            estado_anterior=Paciente.Estado.PENDIENTE,
            estado_nuevo=Paciente.Estado.INGRESADO,
            notas="Ingreso",
        )
        LlamadoPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            resultado=LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO,
            notas="Confirma",
        )
        InasistenciaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha=timezone.localdate(),
            motivo="No asiste",
        )
        RegistroAgendaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha_programada=timezone.now(),
            resultado=RegistroAgendaPaciente.Resultado.ASISTIO,
        )

        response = self.client.get(f"/api/pacientes/{paciente.id}/historial-completo/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("paciente", response.data)
        self.assertEqual(len(response.data["movimientos"]), 1)
        self.assertEqual(len(response.data["llamados"]), 1)
        self.assertEqual(len(response.data["inasistencias"]), 1)
        self.assertEqual(len(response.data["registros_agenda"]), 1)

    def test_historial_acciones_retorna_eventos_combinados(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            estado_anterior=Paciente.Estado.PENDIENTE,
            estado_nuevo=Paciente.Estado.INGRESADO,
            notas="Ingreso",
        )
        LlamadoPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            resultado=LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO,
            notas="Confirma",
        )
        InasistenciaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha=timezone.localdate(),
            motivo="No asiste",
        )
        RegistroAgendaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha_programada=timezone.now(),
            resultado=RegistroAgendaPaciente.Resultado.ASISTIO,
            observacion="Asiste",
        )

        response = self.client.get(f"/api/pacientes/{paciente.id}/historial-acciones/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("paciente", response.data)
        tipos = {accion["tipo"] for accion in response.data["acciones"]}
        self.assertEqual(tipos, {"CAMBIO_ESTADO", "CONTACTO", "INASISTENCIA", "AGENDA_ASISTIO"})

    def test_historial_acciones_no_duplica_inasistencia_de_agenda(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        fecha_programada = timezone.now()
        RegistroAgendaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha_programada=fecha_programada,
            resultado=RegistroAgendaPaciente.Resultado.NO_ASISTIO,
            observacion="No asiste a atención programada.",
        )
        InasistenciaPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            fecha=fecha_programada.date(),
            motivo="No asiste a atención programada.",
        )

        response = self.client.get(f"/api/pacientes/{paciente.id}/historial-acciones/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tipos = [accion["tipo"] for accion in response.data["acciones"]]
        self.assertIn("AGENDA_NO_ASISTIO", tipos)
        self.assertNotIn("INASISTENCIA", tipos)

    def test_alertas_operativas_retorna_grupos_esperados(self):
        alta = self.crear_paciente(
            prioridad=Paciente.Prioridad.ALTA,
            kine_asignado=None,
            estado=Paciente.Estado.PENDIENTE,
        )
        antiguo = self.crear_paciente(
            fecha_derivacion=timezone.localdate() - timedelta(days=91),
            estado=Paciente.Estado.PENDIENTE,
        )
        intento = self.crear_paciente(
            estado=Paciente.Estado.PENDIENTE,
            n_intentos_contacto=1,
        )
        rescate = self.crear_paciente(estado=Paciente.Estado.RESCATE)
        sin_agenda = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            proxima_atencion=None,
        )
        abandono = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            n_inasistencias=2,
        )
        sin_telefonos = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            telefono="",
            telefono_recados="",
        )

        response = self.client.get("/api/pacientes/alertas-operativas/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertInPaciente(response.data["alta_sin_responsable"], alta)
        self.assertInPaciente(response.data["sobre_90_dias"], antiguo)
        self.assertInPaciente(response.data["pendientes_con_1_intento"], intento)
        self.assertInPaciente(response.data["rescates_activos"], rescate)
        self.assertInPaciente(
            response.data["ingresados_sin_proxima_atencion"], sin_agenda
        )
        self.assertInPaciente(response.data["posible_abandono"], abandono)
        self.assertInPaciente(response.data["telefonos_incompletos"], sin_telefonos)

    def test_alertas_operativas_limita_cada_grupo_a_8_pacientes(self):
        for _ in range(10):
            self.crear_paciente(estado=Paciente.Estado.RESCATE)

        response = self.client.get("/api/pacientes/alertas-operativas/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["rescates_activos"]["total"], 10)
        self.assertLessEqual(len(response.data["rescates_activos"]["pacientes"]), 8)

    def test_actividad_reciente_reune_eventos_y_oculta_lo_que_generan_las_cargas(self):
        paciente = self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        LlamadoPaciente.objects.create(
            paciente=paciente,
            usuario=self.kine,
            resultado=LlamadoPaciente.Resultado.NO_CONTESTA,
        )
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=self.kine,
            estado_anterior=Paciente.Estado.PENDIENTE,
            estado_nuevo=Paciente.Estado.INGRESADO,
            notas="Ingresa a tratamiento.",
        )
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=self.admin,
            estado_anterior=None,
            estado_nuevo=Paciente.Estado.PENDIENTE,
            notas="Diagnóstico agregado desde importación recurrente: LUMBAGO.",
        )

        response = self.client.get("/api/pacientes/actividad-reciente/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tipos = [a["tipo"] for a in response.data["acciones"]]
        self.assertIn("CONTACTO", tipos)
        self.assertIn("CAMBIO_ESTADO", tipos)
        notas = [a["observacion"] for a in response.data["acciones"]]
        self.assertNotIn("Diagnóstico agregado desde importación recurrente: LUMBAGO.", notas)
        self.assertEqual(response.data["acciones"][0]["paciente_nombre"], paciente.nombre)

        con_cargas = self.client.get("/api/pacientes/actividad-reciente/?incluir_cargas=1")
        self.assertEqual(con_cargas.data["total"], response.data["total"] + 1)

        por_rut = self.client.get("/api/pacientes/actividad-reciente/", {"search": paciente.rut})
        self.assertGreaterEqual(por_rut.data["total"], 1)
        sin_formato = self.client.get("/api/pacientes/actividad-reciente/", {"search": paciente.rut.replace("-", "")})
        self.assertGreaterEqual(sin_formato.data["total"], 1)

        solo_contactos = self.client.get("/api/pacientes/actividad-reciente/?tipo=CONTACTO")
        self.assertEqual({a["tipo"] for a in solo_contactos.data["acciones"]}, {"CONTACTO"})

    def test_actividad_reciente_del_profesional_solo_incluye_su_cartera(self):
        otro = Usuario.objects.create_user(rut="55555555-5", password="testpass", nombre="Otro Kine", rol=Usuario.Rol.KINE)
        mio = self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        ajeno = self.crear_paciente(estado=Paciente.Estado.PENDIENTE, kine_asignado=otro)
        for paciente in (mio, ajeno):
            LlamadoPaciente.objects.create(paciente=paciente, usuario=self.admin, resultado=LlamadoPaciente.Resultado.NO_CONTESTA)
        self.client.force_authenticate(self.kine)

        response = self.client.get("/api/pacientes/actividad-reciente/")

        self.assertEqual({a["paciente_id"] for a in response.data["acciones"]}, {mio.id})

    def test_actividad_reciente_el_encargado_y_el_admin_ven_todo_el_equipo(self):
        otro = Usuario.objects.create_user(rut="66666666-6", password="testpass", nombre="Otro Kine", rol=Usuario.Rol.KINE)
        encargado = Usuario.objects.create_user(
            rut="77777777-7", password="testpass", nombre="Kine Encargado", rol=Usuario.Rol.KINE, es_encargado=True
        )
        mio = self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        ajeno = self.crear_paciente(estado=Paciente.Estado.PENDIENTE, kine_asignado=otro)
        for paciente in (mio, ajeno):
            LlamadoPaciente.objects.create(paciente=paciente, usuario=self.admin, resultado=LlamadoPaciente.Resultado.NO_CONTESTA)

        for usuario in (encargado, self.admin):
            self.client.force_authenticate(usuario)
            response = self.client.get("/api/pacientes/actividad-reciente/")
            self.assertEqual({a["paciente_id"] for a in response.data["acciones"]}, {mio.id, ajeno.id})

        medico = Usuario.objects.create_user(rut="88888888-8", password="testpass", nombre="Medico", rol=Usuario.Rol.MEDICO)
        self.client.force_authenticate(medico)
        self.assertEqual(self.client.get("/api/pacientes/actividad-reciente/").status_code, status.HTTP_403_FORBIDDEN)

    def test_actividad_reciente_valida_el_rango_de_fechas(self):
        malo = self.client.get("/api/pacientes/actividad-reciente/?desde=no-es-fecha")
        self.assertEqual(malo.status_code, status.HTTP_400_BAD_REQUEST)
        invertido = self.client.get("/api/pacientes/actividad-reciente/?desde=2026-02-01&hasta=2026-01-01")
        self.assertEqual(invertido.status_code, status.HTTP_400_BAD_REQUEST)

    def test_dashboard_resumen_admin_devuelve_contadores_agregados(self):
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        self.crear_paciente(estado=Paciente.Estado.RESCATE)
        self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE, kine_asignado=None)
        self.crear_paciente(estado=Paciente.Estado.ALTA_MEDICA)
        self.crear_paciente(estado=Paciente.Estado.ALTA_MEDICA, kine_asignado=None)

        response = self.client.get("/api/pacientes/dashboard-resumen/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["lista_activa"], 4)
        self.assertEqual(response.data["pendientes"], 2)
        self.assertEqual(response.data["rescate"], 1)
        self.assertEqual(response.data["ingresados"], 1)
        self.assertEqual(response.data["lista_espera_global"], 3)
        self.assertEqual(response.data["sin_asignar"], 2)
        self.assertEqual(response.data["asignados_activos"], 3)
        self.assertEqual(response.data["mios_activos"], 0)
        self.assertEqual(response.data["rescates_globales"], 1)
        self.assertEqual(response.data["cola_llamados"], 2)

    def test_dashboard_resumen_kine_acota_resumen_y_cola_a_su_cartera(self):
        otro_kine = Usuario.objects.create_user(
            rut="33333333-3",
            password="testpass",
            nombre="Otro Kine",
            rol=Usuario.Rol.KINE,
        )
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE)
        self.crear_paciente(estado=Paciente.Estado.RESCATE)
        self.crear_paciente(estado=Paciente.Estado.INGRESADO)
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE, kine_asignado=otro_kine)
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE, kine_asignado=None)
        self.crear_paciente(estado=Paciente.Estado.DERIVADO)
        self.client.force_authenticate(self.kine)

        response = self.client.get("/api/pacientes/dashboard-resumen/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["lista_activa"], 3)
        self.assertEqual(response.data["pendientes"], 1)
        self.assertEqual(response.data["rescate"], 1)
        self.assertEqual(response.data["ingresados"], 1)
        self.assertEqual(response.data["lista_espera_global"], 4)
        self.assertEqual(response.data["sin_asignar"], 1)
        self.assertEqual(response.data["asignados_activos"], 4)
        self.assertEqual(response.data["mios_activos"], 3)
        self.assertEqual(response.data["rescates_globales"], 1)
        self.assertEqual(response.data["cola_llamados"], 2)

    def test_agenda_resumen_admin_devuelve_citas_del_mes(self):
        fecha_uno = timezone.make_aware(datetime(2026, 5, 6, 9, 0))
        fecha_dos = timezone.make_aware(datetime(2026, 5, 6, 10, 0))
        fecha_otro_dia = timezone.make_aware(datetime(2026, 5, 8, 11, 0))
        fecha_otro_mes = timezone.make_aware(datetime(2026, 6, 1, 9, 0))
        self.crear_paciente(proxima_atencion=fecha_uno)
        self.crear_paciente(proxima_atencion=fecha_dos)
        self.crear_paciente(proxima_atencion=fecha_otro_dia)
        self.crear_paciente(proxima_atencion=fecha_otro_mes)
        self.crear_paciente(
            estado=Paciente.Estado.ALTA_MEDICA,
            proxima_atencion=fecha_uno,
        )

        response = self.client.get("/api/pacientes/agenda-resumen/?mes=2026-05")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            [
                {"fecha": "2026-05-06", "total": 2},
                {"fecha": "2026-05-08", "total": 1},
            ],
        )

    def test_agenda_resumen_kine_muestra_solo_su_cartera(self):
        otro_kine = Usuario.objects.create_user(
            rut="44444444-4",
            password="testpass",
            nombre="Kine Agenda",
            rol=Usuario.Rol.KINE,
        )
        fecha = timezone.make_aware(datetime(2026, 5, 6, 9, 0))
        self.crear_paciente(proxima_atencion=fecha)
        self.crear_paciente(proxima_atencion=fecha, kine_asignado=otro_kine)
        self.crear_paciente(proxima_atencion=fecha, kine_asignado=None)
        self.client.force_authenticate(self.kine)

        response = self.client.get("/api/pacientes/agenda-resumen/?mes=2026-05")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [{"fecha": "2026-05-06", "total": 1}])

    def test_agenda_resumen_rechaza_mes_invalido(self):
        response = self.client.get("/api/pacientes/agenda-resumen/?mes=2026")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def assertInPaciente(self, grupo, paciente):
        ids = {item["id"] for item in grupo["pacientes"]}
        self.assertIn(paciente.id, ids)

    def test_filtro_alerta_alta_sin_responsable(self):
        esperado = self.crear_paciente(
            prioridad=Paciente.Prioridad.ALTA,
            kine_asignado=None,
            estado=Paciente.Estado.PENDIENTE,
        )
        self.crear_paciente(
            prioridad=Paciente.Prioridad.ALTA,
            estado=Paciente.Estado.PENDIENTE,
        )

        response = self.client.get("/api/pacientes/?alerta=alta_sin_responsable")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_sobre_90_dias(self):
        esperado = self.crear_paciente(
            fecha_derivacion=timezone.localdate() - timedelta(days=91),
            estado=Paciente.Estado.RESCATE,
        )
        self.crear_paciente(
            fecha_derivacion=timezone.localdate() - timedelta(days=91),
            estado=Paciente.Estado.INGRESADO,
        )
        self.crear_paciente(
            fecha_derivacion=timezone.localdate() - timedelta(days=20),
            estado=Paciente.Estado.PENDIENTE,
        )

        response = self.client.get("/api/pacientes/?alerta=sobre_90_dias")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_pendientes_con_1_intento(self):
        esperado = self.crear_paciente(
            estado=Paciente.Estado.PENDIENTE,
            n_intentos_contacto=1,
        )
        self.crear_paciente(
            estado=Paciente.Estado.PENDIENTE,
            n_intentos_contacto=2,
        )

        response = self.client.get("/api/pacientes/?alerta=pendientes_con_1_intento")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_rescates_activos(self):
        esperado = self.crear_paciente(estado=Paciente.Estado.RESCATE)
        self.crear_paciente(estado=Paciente.Estado.PENDIENTE)

        response = self.client.get("/api/pacientes/?alerta=rescates_activos")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_ingresados_sin_proxima_atencion(self):
        esperado = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            proxima_atencion=None,
        )
        self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            proxima_atencion=timezone.now(),
        )

        response = self.client.get(
            "/api/pacientes/?alerta=ingresados_sin_proxima_atencion"
        )

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_posible_abandono(self):
        esperado = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            n_inasistencias=2,
        )
        self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            n_inasistencias=1,
        )

        response = self.client.get("/api/pacientes/?alerta=posible_abandono")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_telefonos_incompletos(self):
        esperado = self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            telefono="",
            telefono_recados="",
        )
        self.crear_paciente(
            estado=Paciente.Estado.INGRESADO,
            telefono="123456789",
            telefono_recados="",
        )
        self.crear_paciente(
            estado=Paciente.Estado.ALTA_MEDICA,
            telefono="",
            telefono_recados="",
        )

        response = self.client.get("/api/pacientes/?alerta=telefonos_incompletos")

        self.assertResponseSoloPacientes(response, [esperado])

    def test_filtro_alerta_desconocida_no_rompe(self):
        paciente = self.crear_paciente()

        response = self.client.get("/api/pacientes/?alerta=no_existe")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertResponseSoloPacientes(response, [paciente])

    def assertResponseSoloPacientes(self, response, pacientes):
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        expected_ids = {paciente.id for paciente in pacientes}
        response_ids = {item["id"] for item in response.data}
        self.assertEqual(response_ids, expected_ids)

    def test_exportar_lista_espera_devuelve_excel(self):
        self.crear_paciente(nombre="Paciente Exportado")

        response = self.client.get("/api/pacientes/exportar/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], EXCEL_CONTENT_TYPE)
        workbook = load_workbook(BytesIO(response.content))
        ws = workbook.active
        self.assertEqual(ws["A1"].value, "ListaEsperaCCR")
        self.assertIn("ID CCR", [cell.value for cell in ws[7]])

    def test_exportar_lista_espera_respeta_alerta_rescates(self):
        self.crear_paciente(nombre="Paciente Pendiente", estado=Paciente.Estado.PENDIENTE)
        rescate = self.crear_paciente(nombre="Paciente Rescate", estado=Paciente.Estado.RESCATE)

        response = self.client.get("/api/pacientes/exportar/?alerta=rescates_activos")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workbook = load_workbook(BytesIO(response.content))
        ws = workbook.active
        nombres = [row[3] for row in ws.iter_rows(min_row=8, values_only=True) if row[3]]
        self.assertEqual(nombres, [rescate.nombre])

    def test_exportar_lista_espera_sanitiza_formula_excel(self):
        self.crear_paciente(nombre="=cmd", diagnostico="+diagnostico", observaciones="@observacion")

        response = self.client.get("/api/pacientes/exportar/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workbook = load_workbook(BytesIO(response.content))
        ws = workbook.active
        fila = next(row for row in ws.iter_rows(min_row=8, values_only=True) if row[3])
        self.assertEqual(fila[3], "'=cmd")
        self.assertEqual(fila[8], "NO")
        self.assertEqual(fila[9], "'+diagnostico")
        self.assertEqual(fila[20], "'@observacion")

    def test_exportar_lista_espera_muestra_no_categorizado(self):
        self.crear_paciente(categoria=Paciente.Categoria.BORRADOR)

        response = self.client.get("/api/pacientes/exportar/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workbook = load_workbook(BytesIO(response.content))
        ws = workbook.active
        fila = next(row for row in ws.iter_rows(min_row=8, values_only=True) if row[3])
        self.assertEqual(fila[12], "No categorizado")

    def test_usuario_no_autenticado_no_puede_exportar(self):
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/pacientes/exportar/")

        self.assertIn(
            response.status_code,
            {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
        )


class ActividadGrupalTests(APITestCase):
    def setUp(self):
        self.kine = Usuario.objects.create_user(
            rut="33333333-3", password="testpass", nombre="Kine Uno", rol=Usuario.Rol.KINE
        )
        self.otro_kine = Usuario.objects.create_user(
            rut="44444444-4", password="testpass", nombre="Kine Dos", rol=Usuario.Rol.KINE
        )
        self.admin = Usuario.objects.create_user(
            rut="55555555-5", password="testpass", nombre="Admin", rol=Usuario.Rol.ADMIN
        )
        self.contador = 0
        self.p1 = self.crear(self.kine)
        self.p2 = self.crear(self.kine)
        self.ajeno = self.crear(self.otro_kine)
        self.pendiente = self.crear(self.kine, estado=Paciente.Estado.PENDIENTE)

    def crear(self, kine, **extra):
        self.contador += 1
        data = {
            "fecha_derivacion": timezone.localdate(),
            "percapita_desde": "CESFAM",
            "nombre": f"Paciente {self.contador}",
            "rut": f"800000{self.contador:02d}-{self.contador % 10}",
            "edad": 50,
            "diagnostico": "Lumbago",
            "profesional": "KINESIOLOGO",
            "prioridad": Paciente.Prioridad.MODERADA,
            "categoria": Paciente.Categoria.LUMBAGOS,
            "kine_asignado": kine,
            "estado": Paciente.Estado.INGRESADO,
        }
        data.update(extra)
        return Paciente.objects.create(**data)

    def payload(self, ids):
        return {
            "nombre": "Taller de columna",
            "fecha_hora": (timezone.now() + timedelta(days=2)).isoformat(),
            "duracion_minutos": 60,
            "lugar": "Gimnasio",
            "paciente_ids": ids,
        }

    def test_kine_crea_actividad_con_sus_pacientes_y_marca_asistencia(self):
        self.client.force_authenticate(self.kine)
        response = self.client.post("/api/actividades-grupales/", self.payload([self.p1.id, self.p2.id]), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["total_participantes"], 2)
        self.assertEqual(response.data["responsable"], self.kine.id)

        actividad_id = response.data["id"]
        response = self.client.post(
            f"/api/actividades-grupales/{actividad_id}/asistencia/",
            {"paciente_id": self.p1.id, "asistencia": "ASISTIO"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_asistentes"], 1)

        historial = self.client.get(f"/api/pacientes/{self.p1.id}/historial-acciones/")
        tipos = [a["tipo"] for a in historial.data["acciones"]]
        self.assertIn("ACTIVIDAD_GRUPAL", tipos)

    def test_kine_no_puede_agregar_pacientes_ajenos_ni_no_ingresados(self):
        self.client.force_authenticate(self.kine)
        response = self.client.post("/api/actividades-grupales/", self.payload([self.p1.id, self.ajeno.id]), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post("/api/actividades-grupales/", self.payload([self.pendiente.id]), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post("/api/actividades-grupales/", self.payload([]), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_mezcla_kines_y_filtra_por_fecha_y_paciente(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/actividades-grupales/", self.payload([self.p1.id, self.ajeno.id]), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        hoy = timezone.localdate()
        listado = self.client.get(
            "/api/actividades-grupales/",
            {"desde": hoy.isoformat(), "hasta": (hoy + timedelta(days=7)).isoformat(), "paciente": self.ajeno.id},
        )
        data = listado.data.get("results", listado.data) if isinstance(listado.data, dict) else listado.data
        self.assertEqual(len(data), 1)

        # Otro kine ve la actividad porque participa un paciente suyo, pero no puede editarla.
        self.client.force_authenticate(self.otro_kine)
        actividad_id = response.data["id"]
        self.assertEqual(self.client.get(f"/api/actividades-grupales/{actividad_id}/").status_code, status.HTTP_200_OK)
        editar = self.client.patch(f"/api/actividades-grupales/{actividad_id}/", {"nombre": "Otro"}, format="json")
        self.assertEqual(editar.status_code, status.HTTP_403_FORBIDDEN)

    def test_actividad_con_varios_profesionales(self):
        self.client.force_authenticate(self.kine)
        response = self.client.post(
            "/api/actividades-grupales/",
            {**self.payload([self.p1.id, self.ajeno.id]), "profesional_ids": [self.otro_kine.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual([p["id"] for p in response.data["profesionales"]], [self.otro_kine.id])
        actividad_id = response.data["id"]

        # El segundo profesional la ve, la edita y marca asistencia.
        self.client.force_authenticate(self.otro_kine)
        listado = self.client.get("/api/actividades-grupales/")
        data = listado.data.get("results", listado.data) if isinstance(listado.data, dict) else listado.data
        self.assertEqual([a["id"] for a in data], [actividad_id])
        editar = self.client.patch(f"/api/actividades-grupales/{actividad_id}/", {"nombre": "Taller 2"}, format="json")
        self.assertEqual(editar.status_code, status.HTTP_200_OK, editar.data)
        asistencia = self.client.post(
            f"/api/actividades-grupales/{actividad_id}/asistencia/",
            {"paciente_id": self.p1.id, "asistencia": "ASISTIO"},
            format="json",
        )
        self.assertEqual(asistencia.status_code, status.HTTP_200_OK)

        # Un profesional que no es parte no puede sumar pacientes de otros.
        self.client.force_authenticate(self.kine)
        sin_equipo = self.client.post(
            "/api/actividades-grupales/", self.payload([self.ajeno.id]), format="json"
        )
        self.assertEqual(sin_equipo.status_code, status.HTTP_400_BAD_REQUEST)

    def test_actualizar_participantes(self):
        self.client.force_authenticate(self.kine)
        creada = self.client.post("/api/actividades-grupales/", self.payload([self.p1.id]), format="json")
        response = self.client.patch(
            f"/api/actividades-grupales/{creada.data['id']}/",
            {"paciente_ids": [self.p2.id], "estado": "REALIZADA"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual([p["paciente_id"] for p in response.data["participantes"]], [self.p2.id])
        self.assertEqual(response.data["estado"], "REALIZADA")


class GrupoPacientesTests(ActividadGrupalTests):
    """Reutiliza los usuarios y pacientes de ActividadGrupalTests."""

    def test_kine_crea_grupo_agrega_y_quita_miembros(self):
        self.client.force_authenticate(self.kine)
        creado = self.client.post(
            "/api/grupos-pacientes/",
            {"nombre": "Columna martes", "tipo": "PERMANENTE", "paciente_ids": [self.p1.id]},
            format="json",
        )
        self.assertEqual(creado.status_code, status.HTTP_201_CREATED, creado.data)
        grupo_id = creado.data["id"]

        agregado = self.client.post(f"/api/grupos-pacientes/{grupo_id}/agregar/", {"paciente_ids": [self.p2.id]}, format="json")
        self.assertEqual(agregado.status_code, status.HTTP_200_OK, agregado.data)
        self.assertEqual(agregado.data["total_miembros"], 2)

        ajeno = self.client.post(f"/api/grupos-pacientes/{grupo_id}/agregar/", {"paciente_ids": [self.ajeno.id]}, format="json")
        self.assertEqual(ajeno.status_code, status.HTTP_400_BAD_REQUEST)

        quitado = self.client.post(f"/api/grupos-pacientes/{grupo_id}/quitar/", {"paciente_ids": [self.p1.id]}, format="json")
        self.assertEqual([m["paciente_id"] for m in quitado.data["miembros"]], [self.p2.id])

    def test_grupo_temporal_requiere_fecha_y_marca_vencido(self):
        self.client.force_authenticate(self.kine)
        sin_fecha = self.client.post("/api/grupos-pacientes/", {"nombre": "Taller", "tipo": "TEMPORAL"}, format="json")
        self.assertEqual(sin_fecha.status_code, status.HTTP_400_BAD_REQUEST)
        ayer = (timezone.localdate() - timedelta(days=1)).isoformat()
        vencido = self.client.post(
            "/api/grupos-pacientes/", {"nombre": "Taller", "tipo": "TEMPORAL", "vigente_hasta": ayer}, format="json"
        )
        self.assertEqual(vencido.status_code, status.HTTP_201_CREATED, vencido.data)
        self.assertTrue(vencido.data["vencido"])

    def test_archivar_oculta_grupo_y_otro_kine_no_lo_ve(self):
        self.client.force_authenticate(self.kine)
        grupo = self.client.post("/api/grupos-pacientes/", {"nombre": "G1"}, format="json").data
        self.client.patch(f"/api/grupos-pacientes/{grupo['id']}/", {"activo": False}, format="json")
        self.assertEqual(self.client.get("/api/grupos-pacientes/").data, [])
        todos = self.client.get("/api/grupos-pacientes/", {"incluir_inactivos": "1"}).data
        self.assertEqual(len(todos), 1)

        self.client.force_authenticate(self.otro_kine)
        self.assertEqual(self.client.get(f"/api/grupos-pacientes/{grupo['id']}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_actividad_creada_desde_grupo_guarda_referencia(self):
        self.client.force_authenticate(self.kine)
        grupo = self.client.post(
            "/api/grupos-pacientes/", {"nombre": "Columna", "paciente_ids": [self.p1.id, self.p2.id]}, format="json"
        ).data
        payload = self.payload([self.p1.id, self.p2.id])
        payload["grupo"] = grupo["id"]
        actividad = self.client.post("/api/actividades-grupales/", payload, format="json")
        self.assertEqual(actividad.status_code, status.HTTP_201_CREATED, actividad.data)
        self.assertEqual(actividad.data["grupo_nombre"], "Columna")
        detalle = self.client.get(f"/api/grupos-pacientes/{grupo['id']}/").data
        self.assertEqual(detalle["total_actividades"], 1)

    def test_paciente_puede_estar_en_varios_grupos_y_filtrar_por_paciente(self):
        self.client.force_authenticate(self.kine)
        for nombre in ("Columna", "Caminata"):
            self.client.post("/api/grupos-pacientes/", {"nombre": nombre, "paciente_ids": [self.p1.id]}, format="json")
        self.client.post("/api/grupos-pacientes/", {"nombre": "Hombros", "paciente_ids": [self.p2.id]}, format="json")
        data = self.client.get("/api/grupos-pacientes/", {"paciente": self.p1.id}).data
        self.assertEqual(sorted(g["nombre"] for g in data), ["Caminata", "Columna"])

    def test_historial_registra_cambios_del_grupo_y_citaciones(self):
        self.client.force_authenticate(self.kine)
        grupo = self.client.post(
            "/api/grupos-pacientes/", {"nombre": "Columna", "paciente_ids": [self.p1.id]}, format="json"
        ).data
        gid = grupo["id"]
        self.client.post(f"/api/grupos-pacientes/{gid}/agregar/", {"paciente_ids": [self.p2.id]}, format="json")
        self.client.post(f"/api/grupos-pacientes/{gid}/quitar/", {"paciente_ids": [self.p1.id]}, format="json")
        self.client.patch(f"/api/grupos-pacientes/{gid}/", {"nombre": "Columna Martes"}, format="json")
        payload = self.payload([self.p2.id])
        payload["grupo"] = gid
        self.client.post("/api/actividades-grupales/", payload, format="json")
        self.client.patch(f"/api/grupos-pacientes/{gid}/", {"activo": False}, format="json")

        data = self.client.get(f"/api/grupos-pacientes/{gid}/historial/").data
        tipos = [m["tipo"] for m in data["movimientos"]]
        self.assertEqual(
            tipos,
            ["ARCHIVADO", "CITADO", "EDITADO", "MIEMBROS_QUITADOS", "MIEMBROS_AGREGADOS", "CREADO"],
        )
        editado = next(m for m in data["movimientos"] if m["tipo"] == "EDITADO")
        self.assertIn("Columna Martes", editado["descripcion"])
        self.assertEqual(len(data["actividades"]), 1)


class ProfesionalEncargadoTests(APITestCase):
    """El encargado corrige datos y la Revisión de carga; el resto solo el contacto."""

    def setUp(self):
        crear = Usuario.objects.create_user
        self.profesional = crear(rut="11111111-1", password="x", nombre="Profesional", rol=Usuario.Rol.KINE)
        self.encargado = crear(rut="22222222-2", password="x", nombre="Encargada", rol=Usuario.Rol.KINE, es_encargado=True)
        self.medico = crear(rut="33333333-3", password="x", nombre="Medico", rol=Usuario.Rol.MEDICO)
        self.admin = crear(rut="44444444-4", password="x", nombre="Admin", rol=Usuario.Rol.ADMIN)
        self.paciente = Paciente.objects.create(
            rut="900000011", nombre="Paciente", edad=50, diagnostico="Lumbago",
            categoria=Paciente.Categoria.LUMBAGOS, prioridad=Paciente.Prioridad.ALTA,
            fecha_derivacion=timezone.localdate(), kine_asignado=self.profesional,
        )

    def patch(self, usuario, datos):
        self.client.force_authenticate(usuario)
        return self.client.patch(f"/api/pacientes/{self.paciente.id}/", datos, format="json")

    def test_profesional_solo_edita_contacto(self):
        self.assertEqual(self.patch(self.profesional, {"telefono": "+56912345678"}).status_code, status.HTTP_200_OK)
        respuesta = self.patch(self.profesional, {"diagnostico": "Hombro"})
        self.assertEqual(respuesta.status_code, status.HTTP_403_FORBIDDEN)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.telefono, "+56912345678")
        self.assertEqual(self.paciente.diagnostico, "Lumbago")

    def test_encargado_corrige_datos_y_responsable(self):
        respuesta = self.patch(self.encargado, {"diagnostico": "Hombro doloroso", "kine_asignado": self.encargado.id})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.diagnostico, "Hombro doloroso")
        self.assertEqual(self.paciente.kine_asignado, self.encargado)

    def test_revision_de_carga_solo_admin_y_encargado(self):
        for usuario, esperado in [
            (self.encargado, status.HTTP_200_OK),
            (self.admin, status.HTTP_200_OK),
            (self.medico, status.HTTP_403_FORBIDDEN),
            (self.profesional, status.HTTP_403_FORBIDDEN),
        ]:
            with self.subTest(usuario=usuario.nombre):
                self.client.force_authenticate(usuario)
                self.assertEqual(self.client.get("/api/importar/revision/").status_code, esperado)

    def test_alerta_la_resuelve_el_encargado_no_el_profesional(self):
        Paciente.objects.filter(pk=self.paciente.pk).update(alerta="Confirmar categoría.")
        self.assertEqual(self.patch(self.profesional, {"alerta": ""}).status_code, status.HTTP_403_FORBIDDEN)
        respuesta = self.patch(self.encargado, {"alerta": ""})
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual(respuesta.data["alerta"], "")

    def test_importar_e_historial_de_cortes_para_encargado(self):
        for usuario, esperado in [
            (self.encargado, status.HTTP_200_OK),
            (self.medico, status.HTTP_200_OK),
            (self.admin, status.HTTP_200_OK),
            (self.profesional, status.HTTP_403_FORBIDDEN),
        ]:
            with self.subTest(usuario=usuario.nombre):
                self.client.force_authenticate(usuario)
                self.assertEqual(self.client.get("/api/importar/historial/").status_code, esperado)
                self.assertEqual(self.client.get("/api/importar/plantilla/").status_code, esperado)
        # Resetear la población sigue siendo solo del Administrador.
        self.client.force_authenticate(self.encargado)
        self.assertEqual(self.client.delete("/api/importar/reset/").status_code, status.HTTP_403_FORBIDDEN)

    def test_completar_telefonos_medico_y_encargado(self):
        for usuario, esperado in [
            (self.encargado, status.HTTP_200_OK),
            (self.medico, status.HTTP_200_OK),
            (self.profesional, status.HTTP_403_FORBIDDEN),
        ]:
            with self.subTest(usuario=usuario.nombre):
                self.client.force_authenticate(usuario)
                self.assertEqual(self.client.get("/api/importar/telefonos/plantilla/").status_code, esperado)

    def test_lista_de_profesionales_para_asignar(self):
        self.client.force_authenticate(self.encargado)
        respuesta = self.client.get("/api/usuarios/profesionales/")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.assertEqual({u["nombre"] for u in respuesta.data}, {"Profesional", "Encargada"})
        self.client.force_authenticate(self.profesional)
        self.assertEqual(self.client.get("/api/usuarios/profesionales/").status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_marca_encargado_solo_en_profesionales(self):
        self.client.force_authenticate(self.admin)
        respuesta = self.client.patch(f"/api/usuarios/{self.profesional.id}/", {"es_encargado": True}, format="json")
        self.assertEqual(respuesta.status_code, status.HTTP_200_OK)
        self.profesional.refresh_from_db()
        self.assertTrue(self.profesional.es_encargado)
        self.client.patch(f"/api/usuarios/{self.medico.id}/", {"es_encargado": True}, format="json")
        self.medico.refresh_from_db()
        self.assertFalse(self.medico.es_encargado)


class InasistenciasResumenTests(APITestCase):
    """Apartado de inasistencias: un paciente por fila con sus totales."""

    def setUp(self):
        crear = Usuario.objects.create_user
        self.kine = crear(rut="61111111-1", password="x", nombre="Kine Uno", rol=Usuario.Rol.KINE)
        self.otro = crear(rut="62222222-2", password="x", nombre="Kine Dos", rol=Usuario.Rol.KINE)
        self.encargado = crear(rut="63333333-3", password="x", nombre="Encargada", rol=Usuario.Rol.KINE, es_encargado=True)
        self.medico = crear(rut="64444444-4", password="x", nombre="Medico", rol=Usuario.Rol.MEDICO)

        def paciente(rut, nombre, kine):
            return Paciente.objects.create(
                rut=rut, nombre=nombre, edad=50, diagnostico="Lumbago", categoria=Paciente.Categoria.LUMBAGOS,
                prioridad=Paciente.Prioridad.ALTA, fecha_derivacion=timezone.localdate(),
                kine_asignado=kine, estado=Paciente.Estado.INGRESADO,
            )

        self.ana = paciente("900000021", "ANA", self.kine)
        self.beto = paciente("900000022", "BETO", self.otro)
        paciente("900000023", "SIN FALTAS", self.kine)
        hoy = timezone.localdate()
        for dias, justificada in ((1, False), (8, False), (15, True)):
            InasistenciaPaciente.objects.create(
                paciente=self.ana, usuario=self.kine, fecha=hoy - timedelta(days=dias), justificada=justificada,
                motivo=f"motivo {dias}",
            )
        InasistenciaPaciente.objects.create(paciente=self.beto, usuario=self.otro, fecha=hoy - timedelta(days=40))

    def get(self, usuario, query=""):
        self.client.force_authenticate(usuario)
        return self.client.get(f"/api/pacientes/inasistencias-resumen/{query}")

    def test_encargado_ve_todos_ordenados_por_no_justificadas(self):
        data = self.get(self.encargado).data
        self.assertEqual([i["nombre"] for i in data["items"]], ["ANA", "BETO"])
        ana = data["items"][0]
        self.assertEqual((ana["total"], ana["no_justificadas"], ana["justificadas"]), (3, 2, 1))
        self.assertEqual(ana["ultimo_motivo"], "motivo 1")
        self.assertEqual(len(ana["detalle"]), 3)
        self.assertEqual(
            (data["total_pacientes"], data["total_inasistencias"], data["no_justificadas"], data["en_riesgo"]),
            (2, 4, 3, 1),
        )

    def test_profesional_ve_solo_su_cartera(self):
        data = self.get(self.kine).data
        self.assertEqual([i["nombre"] for i in data["items"]], ["ANA"])

    def test_filtro_por_fechas(self):
        desde = (timezone.localdate() - timedelta(days=10)).isoformat()
        data = self.get(self.encargado, f"?desde={desde}").data
        self.assertEqual(data["total_inasistencias"], 2)
        self.assertEqual(self.get(self.encargado, "?desde=malo").status_code, status.HTTP_400_BAD_REQUEST)

    def test_medico_no_tiene_acceso(self):
        self.assertEqual(self.get(self.medico).status_code, status.HTTP_403_FORBIDDEN)


class ObservacionesPacienteTests(APITestCase):
    """Observaciones como lista: tipo, fijar, editar y borrar por separado."""

    def setUp(self):
        crear = Usuario.objects.create_user
        self.kine = crear(rut="71111111-1", password="x", nombre="Kine Uno", rol=Usuario.Rol.KINE)
        self.otro = crear(rut="72222222-2", password="x", nombre="Kine Dos", rol=Usuario.Rol.KINE)
        self.encargado = crear(rut="73333333-3", password="x", nombre="Encargada", rol=Usuario.Rol.KINE, es_encargado=True)
        self.medico = crear(rut="74444444-4", password="x", nombre="Medico", rol=Usuario.Rol.MEDICO)
        self.paciente = Paciente.objects.create(
            rut="900000031", nombre="PACIENTE OBS", edad=40, diagnostico="Lumbago",
            categoria=Paciente.Categoria.LUMBAGOS, prioridad=Paciente.Prioridad.ALTA,
            fecha_derivacion=timezone.localdate(),
        )
        self.url = "/api/observaciones-paciente/"

    def crear(self, usuario, **datos):
        self.client.force_authenticate(usuario)
        return self.client.post(self.url, {"paciente": self.paciente.id, "texto": "Llamar en la tarde", **datos}, format="json")

    def test_crear_listar_y_resumen(self):
        r = self.crear(self.kine, tipo="CONTACTO")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertEqual(r.data["autor_nombre"], "Kine Uno")
        self.assertTrue(r.data["puede_editar"])
        self.crear(self.kine, texto="Nota fijada", fijada=True)
        lista = self.client.get(f"{self.url}?paciente={self.paciente.id}").data
        self.assertEqual([o["texto"] for o in lista], ["Nota fijada", "Llamar en la tarde"])
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.observaciones, "Nota fijada | Llamar en la tarde")
        self.assertEqual(self.client.get(self.url).data, [])

    def test_solo_autor_encargado_o_admin_editan_y_borran(self):
        obs_id = self.crear(self.kine).data["id"]
        self.client.force_authenticate(self.otro)
        self.assertEqual(self.client.patch(f"{self.url}{obs_id}/", {"texto": "x"}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"{self.url}{obs_id}/").status_code, 403)
        self.client.force_authenticate(self.encargado)
        r = self.client.patch(f"{self.url}{obs_id}/", {"texto": "Editada", "fijada": True, "tipo": "CLINICA"}, format="json")
        self.assertEqual((r.status_code, r.data["texto"], r.data["fijada"], r.data["tipo"]), (200, "Editada", True, "CLINICA"))
        self.client.force_authenticate(self.kine)
        self.assertEqual(self.client.delete(f"{self.url}{obs_id}/").status_code, status.HTTP_204_NO_CONTENT)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.observaciones, "")

    def test_no_se_puede_mover_observacion_a_otro_paciente(self):
        otro_paciente = Paciente.objects.create(
            rut="900000032", nombre="OTRO PACIENTE", edad=30, diagnostico="Hombro",
            categoria=Paciente.Categoria.LUMBAGOS, prioridad=Paciente.Prioridad.ALTA,
            fecha_derivacion=timezone.localdate(),
        )
        obs_id = self.crear(self.kine).data["id"]
        r = self.client.patch(f"{self.url}{obs_id}/", {"paciente": otro_paciente.id}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)
        self.paciente.refresh_from_db()
        self.assertEqual(self.paciente.observaciones, "Llamar en la tarde")

    def test_filtro_paciente_no_numerico_responde_400(self):
        self.client.force_authenticate(self.kine)
        r = self.client.get(f"{self.url}?paciente=abc")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_texto_vacio_y_medico(self):
        self.assertEqual(self.crear(self.kine, texto="   ").status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.crear(self.medico).status_code, status.HTTP_403_FORBIDDEN)

    def test_separar_texto_antiguo(self):
        from .services import separar_observaciones

        entradas = separar_observaciones(
            "Observación original: NSP EL 6/10. SectorCesfam: CESFAM DR. ALBERTO REYES. "
            "Categoría: AATT. Revisión: Sector oficial vacío. | FALLECIDO (histórico Tomé 26-07-2026)"
        )
        self.assertEqual(entradas, [
            ("GENERAL", "NSP EL 6/10", False),
            ("IMPORTACION", "Datos de la carga: Sector: CESFAM DR. ALBERTO REYES. Categoría: AATT.", False),
            ("ADMINISTRATIVA", "FALLECIDO (histórico Tomé 26-07-2026)", True),
        ])
        self.assertEqual(separar_observaciones("Paciente con dolor"), [("GENERAL", "Paciente con dolor", False)])


class DiagnosticosCatalogoTests(APITestCase):
    """Catálogo de diagnósticos: agregar, corregir (y unir) y borrar."""

    def setUp(self):
        from datetime import date

        from .models import Diagnostico

        self.Diagnostico = Diagnostico
        self.admin = Usuario.objects.create_user(rut="11111111-1", password="x", nombre="Admin", rol=Usuario.Rol.ADMIN)
        self.kine = Usuario.objects.create_user(rut="22222222-2", password="x", nombre="Kine", rol=Usuario.Rol.KINE)
        base = dict(
            fecha_derivacion=date(2026, 10, 1), edad=60, profesional="KINESIOLOGO",
            prioridad=Paciente.Prioridad.MODERADA, categoria=Paciente.Categoria.LUMBAGOS,
        )
        self.p1 = Paciente.objects.create(id_ccr="D-1", nombre="UNO", rut="111", diagnostico="PARKISON", **base)
        self.p2 = Paciente.objects.create(id_ccr="D-2", nombre="DOS", rut="222", diagnostico="LUMBAGO\nparkison", **base)
        self.typo = Diagnostico.objects.create(nombre="PARKISON")
        Diagnostico.objects.create(nombre="PARKINSON")
        self.client.force_authenticate(self.admin)

    def test_lista_con_usos_y_agregar_normaliza(self):
        lista = self.client.get("/api/diagnosticos/")
        self.assertEqual({d["nombre"]: d["usos"] for d in lista.data}["PARKISON"], 2)
        creado = self.client.post("/api/diagnosticos/", {"nombre": "  tendinitis   rotuliana "}, format="json")
        self.assertEqual(creado.status_code, status.HTTP_201_CREATED)
        self.assertEqual(creado.data["nombre"], "TENDINITIS ROTULIANA")
        repetido = self.client.post("/api/diagnosticos/", {"nombre": "Tendinitis rotuliana"}, format="json")
        self.assertEqual(repetido.status_code, status.HTTP_200_OK)

    def test_corregir_hacia_existente_une_y_actualiza_pacientes(self):
        r = self.client.patch(f"/api/diagnosticos/{self.typo.id}/", {"nombre": "Parkinson"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["unido"])
        self.assertEqual(r.data["pacientes_actualizados"], 2)
        self.assertFalse(self.Diagnostico.objects.filter(nombre="PARKISON").exists())
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertEqual(self.p1.diagnostico, "PARKINSON")
        self.assertEqual(self.p2.diagnostico, "LUMBAGO\nPARKINSON")

    def test_borrar_no_toca_pacientes_y_kine_no_puede_editar(self):
        self.client.force_authenticate(self.kine)
        self.assertEqual(self.client.get("/api/diagnosticos/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.delete(f"/api/diagnosticos/{self.typo.id}/").status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(f"/api/diagnosticos/{self.typo.id}/").status_code, status.HTTP_204_NO_CONTENT)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.diagnostico, "PARKISON")
