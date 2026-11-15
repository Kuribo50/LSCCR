from datetime import date, datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.pacientes.models import (
    DiagnosticoCatalogo,
    InasistenciaPaciente,
    LlamadoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)
from apps.usuarios.models import Usuario


DIAGNOSTICOS_DEMO = [
    (Paciente.Categoria.LUMBAGOS, "Lumbago mecánico"),
    (Paciente.Categoria.HOMBROS, "Síndrome manguito rotador"),
    (Paciente.Categoria.OA_MENOS65, "Gonartrosis bilateral"),
    (Paciente.Categoria.MAS65, "Artrosis de cadera"),
    (Paciente.Categoria.SDNT, "Secuela ACV"),
    (Paciente.Categoria.SDT, "Parkinson"),
]

PACIENTES_DEMO = [
    {
        "nombre": "María González Pérez",
        "rut": "12345678K",
        "edad": 58,
        "diagnostico": "Lumbago mecánico",
        "categoria": Paciente.Categoria.LUMBAGOS,
        "prioridad": Paciente.Prioridad.MODERADA,
        "estado": Paciente.Estado.PENDIENTE,
        "sector_cesfam": "ROJO",
        "kine_rut": "11111111K",
        "telefono": "+56912345678",
        "n_meses_espera": 3,
    },
    {
        "nombre": "Juan Carlos Muñoz",
        "rut": "13456789K",
        "edad": 42,
        "diagnostico": "Síndrome manguito rotador",
        "categoria": Paciente.Categoria.HOMBROS,
        "prioridad": Paciente.Prioridad.ALTA,
        "estado": Paciente.Estado.PENDIENTE,
        "sector_cesfam": "AZUL",
        "kine_rut": "11111111K",
        "telefono": "+56987654321",
        "n_meses_espera": 2,
    },
    {
        "nombre": "Carmen Soto Riquelme",
        "rut": "14567890K",
        "edad": 67,
        "diagnostico": "Artrosis de cadera",
        "categoria": Paciente.Categoria.MAS65,
        "prioridad": Paciente.Prioridad.MEDIANA,
        "estado": Paciente.Estado.PENDIENTE,
        "sector_cesfam": "VERDE",
        "kine_rut": "22222222K",
        "telefono": "+56923456789",
        "n_meses_espera": 5,
    },
    {
        "nombre": "Pedro Andrade Silva",
        "rut": "15678901K",
        "edad": 51,
        "diagnostico": "Gonartrosis bilateral",
        "categoria": Paciente.Categoria.OA_MENOS65,
        "prioridad": Paciente.Prioridad.MODERADA,
        "estado": Paciente.Estado.PENDIENTE,
        "sector_cesfam": "AMARILLO",
        "kine_rut": "22222222K",
        "telefono": "+56934567890",
        "n_meses_espera": 1,
    },
    {
        "nombre": "Rosa del Carmen Vargas",
        "rut": "16789012K",
        "edad": 73,
        "diagnostico": "Secuela ACV",
        "categoria": Paciente.Categoria.SDNT,
        "prioridad": Paciente.Prioridad.ALTA,
        "estado": Paciente.Estado.RESCATE,
        "sector_cesfam": "NARANJO",
        "kine_rut": "33333333K",
        "telefono": "+56945678901",
        "n_intentos_contacto": 3,
        "n_meses_espera": 4,
    },
    {
        "nombre": "Luis Alberto Contreras",
        "rut": "17890123K",
        "edad": 61,
        "diagnostico": "Lumbago mecánico",
        "categoria": Paciente.Categoria.LUMBAGOS,
        "prioridad": Paciente.Prioridad.MODERADA,
        "estado": Paciente.Estado.RESCATE,
        "sector_cesfam": "MORADO",
        "kine_rut": "33333333K",
        "telefono": "+56956789012",
        "n_intentos_contacto": 2,
        "n_meses_espera": 2,
    },
    {
        "nombre": "Ana María Fuenzalida",
        "rut": "18901234K",
        "edad": 48,
        "diagnostico": "Síndrome manguito rotador",
        "categoria": Paciente.Categoria.HOMBROS,
        "prioridad": Paciente.Prioridad.MEDIANA,
        "estado": Paciente.Estado.INGRESADO,
        "sector_cesfam": "CELESTE",
        "kine_rut": "77777777K",
        "telefono": "+56967890123",
        "fecha_ingreso": timezone.localdate() - timedelta(days=45),
        "fecha_siguiente_cita": timezone.localdate() + timedelta(days=7),
        "n_meses_espera": 1,
    },
    {
        "nombre": "Francisco Javier Morales",
        "rut": "19012345K",
        "edad": 55,
        "diagnostico": "Gonartrosis bilateral",
        "categoria": Paciente.Categoria.OA_MENOS65,
        "prioridad": Paciente.Prioridad.MODERADA,
        "estado": Paciente.Estado.INGRESADO,
        "sector_cesfam": "ROSADO",
        "kine_rut": "77777777K",
        "telefono": "+56978901234",
        "fecha_ingreso": timezone.localdate() - timedelta(days=30),
        "fecha_siguiente_cita": timezone.localdate() + timedelta(days=3),
        "n_inasistencias": 1,
        "n_meses_espera": 2,
    },
    {
        "nombre": "Patricia Herrera Lagos",
        "rut": "10123456K",
        "edad": 39,
        "diagnostico": "Lumbago mecánico",
        "categoria": Paciente.Categoria.LUMBAGOS,
        "prioridad": Paciente.Prioridad.LICENCIA_MEDICA,
        "estado": Paciente.Estado.INGRESADO,
        "sector_cesfam": "ROJO",
        "kine_rut": "88888888K",
        "telefono": "+56989012345",
        "fecha_ingreso": timezone.localdate() - timedelta(days=60),
        "fecha_siguiente_cita": timezone.localdate() + timedelta(days=14),
        "n_meses_espera": 1,
    },
    {
        "nombre": "Héctor Ramírez Orellana",
        "rut": "11234567K",
        "edad": 70,
        "diagnostico": "Parkinson",
        "categoria": Paciente.Categoria.SDT,
        "prioridad": Paciente.Prioridad.ALTA,
        "estado": Paciente.Estado.ALTA_MEDICA,
        "sector_cesfam": "VERDE",
        "kine_rut": "88888888K",
        "telefono": "+56990123456",
        "fecha_ingreso": timezone.localdate() - timedelta(days=120),
        "fecha_egreso": timezone.localdate() - timedelta(days=10),
        "n_meses_espera": 6,
    },
    {
        "nombre": "Elena Pizarro Campos",
        "rut": "11345678K",
        "edad": 63,
        "diagnostico": "Artrosis de cadera",
        "categoria": Paciente.Categoria.MAS65,
        "prioridad": Paciente.Prioridad.MEDIANA,
        "estado": Paciente.Estado.EGRESO_VOLUNTARIO,
        "sector_cesfam": "AZUL",
        "kine_rut": "11111111K",
        "telefono": "+56901234567",
        "fecha_ingreso": timezone.localdate() - timedelta(days=90),
        "fecha_egreso": timezone.localdate() - timedelta(days=5),
        "n_meses_espera": 4,
    },
    {
        "nombre": "Roberto Salinas Núñez",
        "rut": "12456789K",
        "edad": 46,
        "diagnostico": "Lumbago mecánico",
        "categoria": Paciente.Categoria.LUMBAGOS,
        "prioridad": Paciente.Prioridad.MODERADA,
        "estado": Paciente.Estado.PENDIENTE,
        "sector_cesfam": "AMARILLO",
        "kine_rut": None,
        "telefono": "+56911223344",
        "n_meses_espera": 1,
    },
]


class Command(BaseCommand):
    help = "Crea pacientes y datos operativos demo para desarrollo local."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina pacientes demo existentes antes de recrearlos.",
        )

    def handle(self, *args, **options):
        if options["limpiar"]:
            ruts = [item["rut"] for item in PACIENTES_DEMO]
            eliminados, _ = Paciente.objects.filter(rut__in=ruts).delete()
            self.stdout.write(f"Pacientes demo eliminados: {eliminados}")

        kines = {
            usuario.rut: usuario
            for usuario in Usuario.objects.filter(rol=Usuario.Rol.KINE, is_active=True)
        }
        admin = Usuario.objects.filter(rol=Usuario.Rol.ADMIN, is_active=True).first()

        for categoria, diagnostico in DIAGNOSTICOS_DEMO:
            DiagnosticoCatalogo.objects.get_or_create(
                diagnostico=diagnostico,
                defaults={"categoria": categoria},
            )

        hoy = timezone.localdate()
        creados = 0
        actualizados = 0

        for item in PACIENTES_DEMO:
            kine = kines.get(item.get("kine_rut")) if item.get("kine_rut") else None
            defaults = {
                "nombre": item["nombre"],
                "fecha_derivacion": hoy - timedelta(days=30 * item.get("n_meses_espera", 1)),
                "percapita_desde": "CESFAM Dr. Alberto Reyes",
                "sector_cesfam": item["sector_cesfam"],
                "sector_oficial": item["sector_cesfam"],
                "edad": item["edad"],
                "diagnostico": item["diagnostico"],
                "profesional": "MEDICO GENERAL",
                "prioridad": item["prioridad"],
                "categoria": item["categoria"],
                "estado": item["estado"],
                "kine_asignado": kine,
                "telefono": item.get("telefono", ""),
                "n_meses_espera": item.get("n_meses_espera", 1),
                "n_intentos_contacto": item.get("n_intentos_contacto", 0),
                "n_inasistencias": item.get("n_inasistencias", 0),
                "fecha_ingreso": item.get("fecha_ingreso"),
                "fecha_siguiente_cita": item.get("fecha_siguiente_cita"),
                "fecha_egreso": item.get("fecha_egreso"),
                "observaciones": "Paciente demo generado para desarrollo local.",
            }
            paciente, created = Paciente.objects.update_or_create(
                rut=item["rut"],
                defaults=defaults,
            )
            if created:
                creados += 1
            else:
                actualizados += 1

            if item["estado"] == Paciente.Estado.RESCATE and not paciente.llamados.exists():
                LlamadoPaciente.objects.create(
                    paciente=paciente,
                    usuario=kine or admin,
                    resultado=LlamadoPaciente.Resultado.NO_CONTESTA,
                    telefono_usado=paciente.telefono,
                    notas="Sin respuesta en intentos de contacto demo.",
                )

            if item["estado"] == Paciente.Estado.INGRESADO and item.get("n_inasistencias", 0) > 0:
                if not paciente.inasistencias.exists():
                    InasistenciaPaciente.objects.create(
                        paciente=paciente,
                        usuario=kine or admin,
                        fecha=hoy - timedelta(days=14),
                        justificada=False,
                        motivo="Inasistencia demo sin aviso.",
                    )

            if item["estado"] == Paciente.Estado.INGRESADO and item.get("fecha_siguiente_cita"):
                if not paciente.registros_agenda.exists():
                    fecha_cita = item["fecha_siguiente_cita"]
                    RegistroAgendaPaciente.objects.create(
                        paciente=paciente,
                        usuario=kine or admin,
                        fecha_programada=timezone.make_aware(
                            datetime.combine(fecha_cita, time(10, 30))
                        ),
                        resultado=RegistroAgendaPaciente.Resultado.ASISTIO,
                        observacion="Cita demo agendada.",
                    )

        self.stdout.write(self.style.SUCCESS("Datos demo de pacientes listos."))
        self.stdout.write(f"Creados: {creados} | Actualizados: {actualizados}")
        self.stdout.write(f"Total pacientes en BD: {Paciente.objects.count()}")
