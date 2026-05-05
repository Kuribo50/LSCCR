from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.usuarios.models import Usuario

from .models import InasistenciaPaciente, LlamadoPaciente, MovimientoPaciente, Paciente


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

    def crear_paciente(self, **overrides):
        data = {
            "fecha_derivacion": timezone.localdate(),
            "percapita_desde": "CESFAM",
            "nombre": "Paciente Test",
            "rut": "12345678-5",
            "edad": 45,
            "diagnostico": "Lumbago",
            "profesional": "KINESIOLOGO",
            "prioridad": Paciente.Prioridad.MODERADA,
            "categoria": Paciente.Categoria.LUMBAGOS,
            "kine_asignado": self.kine,
        }
        data.update(overrides)
        return Paciente.objects.create(**data)

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

    def test_registrar_llamado_no_contesta_incrementa_y_segundo_pasa_a_rescate(self):
        paciente = self.crear_paciente()

        first = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-llamado/",
            {"contesto": False, "notas": "Sin respuesta"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.n_intentos_contacto, 1)
        self.assertEqual(paciente.estado, Paciente.Estado.PENDIENTE)

        second = self.client.post(
            f"/api/pacientes/{paciente.id}/registrar-llamado/",
            {"contesto": False, "notas": "Sin respuesta nuevamente"},
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        paciente.refresh_from_db()
        self.assertEqual(paciente.n_intentos_contacto, 2)
        self.assertEqual(paciente.estado, Paciente.Estado.RESCATE)
        self.assertNotEqual(paciente.estado, Paciente.Estado.ABANDONO)
        self.assertEqual(LlamadoPaciente.objects.count(), 2)

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

        response = self.client.get(f"/api/pacientes/{paciente.id}/historial-completo/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("paciente", response.data)
        self.assertEqual(len(response.data["movimientos"]), 1)
        self.assertEqual(len(response.data["llamados"]), 1)
        self.assertEqual(len(response.data["inasistencias"]), 1)
