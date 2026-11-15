"""Crea grupos de pacientes y actividades grupales ficticias para desarrollo local.

Uso:
    python manage.py generar_grupos_demo            # crea o actualiza los datos demo
    python manage.py generar_grupos_demo --limpiar  # borra todo lo demo y sale

Los pacientes demo usan RUT del rango 30.000.0xx (no asignado a personas) y
quedan INGRESADOS para poder agruparlos. Algunos estan en mas de un grupo.
"""

from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.pacientes.models import (
    ActividadGrupal,
    GrupoPacientes,
    MiembroGrupo,
    MovimientoGrupo,
    Paciente,
    ParticipanteActividad,
)
from apps.usuarios.models import Usuario

MARCA = "Dato demo de grupos (desarrollo local)."


def rut_con_dv(cuerpo: int) -> str:
    """RUT normalizado (sin puntos ni guion) con su digito verificador."""
    suma, factor = 0, 2
    for digito in reversed(str(cuerpo)):
        suma += int(digito) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    dv = "0" if resto == 11 else "K" if resto == 10 else str(resto)
    return f"{cuerpo}{dv}"


C = Paciente.Categoria
P = Paciente.Prioridad

# (clave, nombre, edad, categoria, prioridad, diagnostico, sector, indice de kine)
PACIENTES = [
    ("lumbago1", "Ana María Fuentes Rojas", 46, C.LUMBAGOS, P.MEDIANA, "Lumbago mecánico", "ROJO", 0),
    ("lumbago2", "Luis Alberto Pizarro Díaz", 52, C.LUMBAGOS, P.MODERADA, "Lumbociática", "AZUL", 0),
    ("lumbago3", "Patricia Soto Morales", 39, C.LUMBAGOS, P.ALTA, "Lumbago crónico", "VERDE", 0),
    ("lumbago4", "Jorge Castillo Vera", 58, C.LUMBAGOS, P.MEDIANA, "Lumbago mecánico", "ROJO", 0),
    ("hombro1", "Claudia Reyes Toro", 49, C.HOMBROS, P.ALTA, "Tendinopatía manguito rotador", "AZUL", 0),
    ("hombro2", "Ricardo Navarro Paz", 55, C.HOMBROS, P.MEDIANA, "Post operado de hombro", "AMARILLO", 0),
    ("hombro3", "Mónica Herrera Lagos", 61, C.HOMBROS, P.MODERADA, "Hombro congelado", "VERDE", 1),
    ("mayor1", "Elena Contreras Valdés", 72, C.MAS65, P.MEDIANA, "Artrosis de cadera", "ROJO", 1),
    ("mayor2", "Héctor Bravo Salinas", 78, C.MAS65, P.ALTA, "Gonartrosis bilateral", "AZUL", 1),
    ("mayor3", "Olga Riquelme Pino", 69, C.MAS65, P.MODERADA, "Alteración del equilibrio", "VERDE", 1),
    ("mayor4", "Sergio Mella Ortiz", 75, C.MAS65, P.MEDIANA, "Artrosis de rodilla", "AMARILLO", 1),
    ("mayor5", "Rosa Espinoza Lillo", 81, C.MAS65, P.ALTA, "Sarcopenia", "ROJO", 1),
    ("rodilla1", "Daniela Campos Ruiz", 44, C.OA_MENOS65, P.MODERADA, "Gonartrosis", "AZUL", 2),
    ("rodilla2", "Marcelo Tapia Gómez", 57, C.OA_MENOS65, P.MEDIANA, "Gonartrosis bilateral", "VERDE", 2),
    ("neuro1", "Gloria Sepúlveda Araya", 63, C.SDNT, P.ALTA, "Secuela de ACV", "ROJO", 2),
    ("neuro2", "Iván Fernández Cortés", 59, C.SDT, P.MEDIANA, "Parkinson inicial", "AZUL", 2),
]

# (nombre, tipo, dias de vigencia (None = permanente), activo, indice de kine responsable o None = admin, miembros, descripcion)
GRUPOS = [
    (
        "Columna lunes y miércoles",
        "PERMANENTE",
        None,
        True,
        0,
        ["lumbago1", "lumbago2", "lumbago3", "lumbago4"],
        "Ejercicio terapéutico de columna, dos veces por semana.",
    ),
    (
        "Taller adulto mayor",
        "PERMANENTE",
        None,
        True,
        1,
        ["mayor1", "mayor2", "mayor3", "mayor4", "mayor5", "hombro3"],
        "Fuerza, equilibrio y prevención de caídas.",
    ),
    (
        "Hombro post operado",
        "TEMPORAL",
        30,
        True,
        0,
        ["hombro1", "hombro2"],
        "Ciclo de 4 semanas de rehabilitación de hombro.",
    ),
    (
        "Caminata grupal de noviembre",
        "TEMPORAL",
        14,
        True,
        None,
        ["lumbago1", "lumbago4", "mayor1", "mayor3", "rodilla1", "rodilla2"],
        "Caminata en el parque los jueves. Mezcla pacientes de varios kines.",
    ),
    (
        "Rodilla primavera",
        "TEMPORAL",
        -10,
        True,
        2,
        ["rodilla1", "rodilla2", "mayor4"],
        "Grupo temporal que ya venció: sirve para ver cómo se muestra.",
    ),
    (
        "Equilibrio neurológico",
        "PERMANENTE",
        None,
        False,
        2,
        ["neuro1", "neuro2", "mayor3"],
        "Grupo archivado de ejemplo.",
    ),
]


class Command(BaseCommand):
    help = "Crea grupos y actividades grupales ficticias (con pacientes demo ingresados)."

    def add_arguments(self, parser):
        parser.add_argument("--limpiar", action="store_true", help="Borra los datos demo de grupos y sale.")

    def ruts(self):
        return {clave: rut_con_dv(30000001 + i) for i, (clave, *_rest) in enumerate(PACIENTES)}

    def limpiar(self):
        nombres = [g[0] for g in GRUPOS]
        actividades, _ = ActividadGrupal.objects.filter(descripcion__endswith=MARCA).delete()
        grupos, _ = GrupoPacientes.objects.filter(nombre__in=nombres, descripcion__endswith=MARCA).delete()
        pacientes, _ = Paciente.objects.filter(rut__in=self.ruts().values(), observaciones=MARCA).delete()
        self.stdout.write(f"Eliminados -> actividades: {actividades}, grupos: {grupos}, pacientes: {pacientes} (incluye registros asociados)")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["limpiar"]:
            self.limpiar()
            return

        kines = list(Usuario.objects.filter(rol=Usuario.Rol.KINE, is_active=True).order_by("id"))
        admin = Usuario.objects.filter(rol=Usuario.Rol.ADMIN, is_active=True).order_by("id").first()
        if not kines or not admin:
            raise CommandError("Se necesita al menos un usuario KINE y uno ADMIN activos.")

        def kine(i):
            return kines[i % len(kines)]

        hoy = timezone.localdate()
        ruts = self.ruts()
        pacientes = {}
        for clave, nombre, edad, categoria, prioridad, diagnostico, sector, k in PACIENTES:
            paciente, _ = Paciente.objects.update_or_create(
                rut=ruts[clave],
                defaults={
                    "nombre": nombre.upper(),
                    "fecha_derivacion": hoy - timedelta(days=120),
                    "percapita_desde": "CESFAM Dr. Alberto Reyes",
                    "sector_cesfam": sector,
                    "sector_oficial": sector,
                    "edad": edad,
                    "diagnostico": diagnostico,
                    "profesional": "MEDICO GENERAL",
                    "prioridad": prioridad,
                    "categoria": categoria,
                    "estado": Paciente.Estado.INGRESADO,
                    "kine_asignado": kine(k),
                    "fecha_ingreso": hoy - timedelta(days=20 + len(nombre)),
                    "telefono": f"+5699{ruts[clave][2:9]}",
                    "observaciones": MARCA,
                },
            )
            pacientes[clave] = paciente

        grupos = {}
        for nombre, tipo, dias, activo, k, miembros, descripcion in GRUPOS:
            responsable = admin if k is None else kine(k)
            grupo, _ = GrupoPacientes.objects.update_or_create(
                nombre=nombre,
                descripcion=f"{descripcion} {MARCA}",
                defaults={
                    "tipo": tipo,
                    "vigente_hasta": hoy + timedelta(days=dias) if dias is not None else None,
                    "activo": activo,
                    "responsable": responsable,
                    "creado_por": responsable,
                },
            )
            grupo.miembros.exclude(paciente__in=[pacientes[c] for c in miembros]).delete()
            for c in miembros:
                MiembroGrupo.objects.get_or_create(grupo=grupo, paciente=pacientes[c])
            if not grupo.movimientos.exists():
                MovimientoGrupo.objects.create(
                    grupo=grupo,
                    usuario=responsable,
                    tipo=MovimientoGrupo.Tipo.CREADO,
                    descripcion=f"{grupo.get_tipo_display()} con {len(miembros)} pacientes",
                )
                if not activo:
                    MovimientoGrupo.objects.create(grupo=grupo, usuario=responsable, tipo=MovimientoGrupo.Tipo.ARCHIVADO)
            grupos[nombre] = grupo

        def momento(dias, hora, minuto=0):
            return timezone.make_aware(datetime.combine(hoy + timedelta(days=dias), time(hora, minuto)))

        # Lunes proximo para la sesion de columna.
        dias_a_lunes = (7 - hoy.weekday()) % 7 or 7
        actividades = [
            ("Columna lunes y miércoles", "Sesión de columna", dias_a_lunes, 10, "Gimnasio CCR", "PROGRAMADA", None),
            ("Taller adulto mayor", "Taller de equilibrio", 2, 11, "Sala multiuso", "PROGRAMADA", None),
            ("Caminata grupal de noviembre", "Caminata en el parque", 4, 9, "Parque Ecuador", "PROGRAMADA", None),
            ("Taller adulto mayor", "Taller de fuerza", -5, 11, "Sala multiuso", "REALIZADA", {"mayor1", "mayor2", "mayor5", "hombro3"}),
        ]
        for grupo_nombre, nombre, dias, hora, lugar, estado, asistieron in actividades:
            grupo = grupos[grupo_nombre]
            actividad, _ = ActividadGrupal.objects.update_or_create(
                nombre=nombre,
                grupo=grupo,
                descripcion__endswith=MARCA,
                defaults={
                    "descripcion": f"Actividad de ejemplo. {MARCA}",
                    "fecha_hora": momento(dias, hora),
                    "duracion_minutos": 60,
                    "lugar": lugar,
                    "estado": estado,
                    "responsable": grupo.responsable,
                    "creado_por": grupo.responsable,
                },
            )
            if not grupo.movimientos.filter(tipo=MovimientoGrupo.Tipo.CITADO, descripcion__startswith=nombre).exists():
                MovimientoGrupo.objects.create(
                    grupo=grupo,
                    usuario=grupo.responsable,
                    tipo=MovimientoGrupo.Tipo.CITADO,
                    descripcion=f"{nombre} · {timezone.localtime(actividad.fecha_hora):%d-%m-%Y %H:%M}",
                )
            claves = [c for g in GRUPOS if g[0] == grupo_nombre for c in g[5]]
            for c in claves:
                asistencia = ParticipanteActividad.Asistencia.PENDIENTE
                if asistieron is not None:
                    asistencia = (
                        ParticipanteActividad.Asistencia.ASISTIO
                        if c in asistieron
                        else ParticipanteActividad.Asistencia.NO_ASISTIO
                    )
                ParticipanteActividad.objects.update_or_create(
                    actividad=actividad, paciente=pacientes[c], defaults={"asistencia": asistencia}
                )

        en_varios = sum(1 for p in pacientes.values() if p.membresias_grupo.count() > 1)
        self.stdout.write(self.style.SUCCESS("Grupos demo listos."))
        self.stdout.write(
            f"Pacientes demo: {len(pacientes)} | Grupos: {len(grupos)} | Actividades: {len(actividades)} | "
            f"Pacientes en más de un grupo: {en_varios}"
        )
        self.stdout.write("Para borrarlos: python manage.py generar_grupos_demo --limpiar")
