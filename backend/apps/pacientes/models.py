from django.conf import settings
from django.db import models

from .utils import normalizar_rut


class Paciente(models.Model):
    """Ficha operativa principal de una derivacion CCR.

    Este modelo no solo guarda datos demograficos: tambien representa en que
    etapa del flujo esta la persona, quien la tiene asignada y que hitos
    operativos ya ocurrieron.
    """

    class Prioridad(models.TextChoices):
        ALTA = "ALTA", "Alta"
        MEDIANA = "MEDIANA", "Mediana"
        MODERADA = "MODERADA", "Moderada"
        LICENCIA_MEDICA = "LICENCIA_MEDICA", "Licencia Medica"

    class Categoria(models.TextChoices):
        BORRADOR = "BORRADOR", "No categorizado"
        MAS65 = "MAS65", "Mayor o igual 65"
        OA_MENOS65 = "OA_MENOS65", "OA menor 65"
        HOMBROS = "HOMBROS", "Hombros"
        LUMBAGOS = "LUMBAGOS", "Lumbagos"
        SDNT = "SDNT", "SDNT"
        SDT = "SDT", "SDT"
        OTROS_NEUROS = "OTROS_NEUROS", "Otros neuros"
        AATT = "AATT", "AATT"
        DUPLA = "DUPLA", "Dupla"

    class Estado(models.TextChoices):
        # Flujo base:
        # PENDIENTE -> INGRESADO / RESCATE
        # RESCATE -> INGRESADO / EGRESO_ADMINISTRATIVO / PENDIENTE
        # INGRESADO -> estados finales clinico-operativos.
        # Las reglas completas estan centralizadas en services.TRANSICIONES_VALIDAS.
        PENDIENTE = "PENDIENTE", "Pendiente"
        INGRESADO = "INGRESADO", "Ingresado"
        RESCATE = "RESCATE", "Rescate"
        ABANDONO = "ABANDONO", "Abandono"
        ALTA_MEDICA = "ALTA_MEDICA", "Alta medica"
        EGRESO_VOLUNTARIO = "EGRESO_VOLUNTARIO", "Egreso voluntario"
        EGRESO_ADMINISTRATIVO = "EGRESO_ADMINISTRATIVO", "Egreso administrativo"
        DERIVADO = "DERIVADO", "Derivado"

    id_ccr = models.CharField(max_length=12, unique=True, blank=True, editable=False)
    fecha_derivacion = models.DateField()
    percapita_desde = models.CharField(max_length=150, blank=True)
    sector_oficial = models.CharField(max_length=120, blank=True, default="")
    sector_cesfam = models.CharField(max_length=120, blank=True, default="")
    asignado_historico = models.BooleanField(default=False)
    nombre = models.CharField(max_length=160)
    rut = models.CharField(max_length=12, db_index=True)
    edad = models.PositiveIntegerField()
    diagnostico = models.TextField()
    profesional = models.CharField(max_length=160)
    prioridad = models.CharField(max_length=20, choices=Prioridad.choices)
    categoria = models.CharField(max_length=20, choices=Categoria.choices)
    mayor_60 = models.BooleanField(default=False, editable=False)
    kine_asignado = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pacientes_asignados",
    )
    estado = models.CharField(
        max_length=30, choices=Estado.choices, default=Estado.PENDIENTE, db_index=True
    )
    fecha_cambio_estado = models.DateTimeField(null=True, blank=True)
    n_intentos_contacto = models.PositiveIntegerField(default=0)
    n_inasistencias = models.PositiveIntegerField(default=0)
    fecha_ultima_inasistencia = models.DateField(null=True, blank=True)
    motivo_ultima_inasistencia = models.TextField(blank=True, default="")
    n_meses_espera = models.PositiveIntegerField(default=1, help_text="Veces que ha aparecido en listas mensuales")
    observaciones = models.TextField(blank=True)
    # Observación o incongruencia que una persona debe revisar (se muestra como chip azul).
    alerta = models.TextField(blank=True, default="")
    # Datos de contacto y seguimiento operativo: los llamados, agenda y reportes
    # dependen de estos campos, por eso deben mantenerse sincronizados con vistas
    # de contacto y calendario.
    fecha_nacimiento = models.DateField(null=True, blank=True)
    telefono = models.CharField(max_length=20, blank=True, default='')
    telefono_recados = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    fecha_ingreso = models.DateField(null=True, blank=True)
    fecha_siguiente_cita = models.DateField(null=True, blank=True)
    proxima_atencion = models.DateTimeField(null=True, blank=True)
    # Cuando el paciente pide que lo llamen otro dia: la cola lo muestra desde esa fecha.
    proximo_llamado = models.DateTimeField(null=True, blank=True)
    fecha_egreso = models.DateField(null=True, blank=True)
    importacion_origen = models.ForeignKey(
        "importar.ImportacionMensual",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pacientes_creados"
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = []
        indexes = [
            models.Index(fields=["rut", "fecha_derivacion"]),
            models.Index(fields=["categoria"]),
            models.Index(fields=["sector_cesfam"], name="paciente_sector_cesfam_idx"),
            models.Index(fields=["sector_oficial"], name="paciente_sector_oficial_idx"),
            models.Index(fields=["prioridad"]),
            models.Index(fields=["estado"]),
        ]

    def save(self, *args, **kwargs):
        # Normalizacion defensiva para que busquedas por RUT y sectores sean
        # consistentes sin importar si el dato vino desde importacion o formulario.
        self.rut = normalizar_rut(self.rut)
        self.sector_oficial = " ".join((self.sector_oficial or "").split()).upper()
        self.sector_cesfam = " ".join((self.sector_cesfam or "").split()).upper()
        self.mayor_60 = self.edad >= 60
        is_new = self.pk is None
        if is_new and not self.id_ccr:
            # El ID CCR se deriva del PK para mantener una clave humana estable
            # y unica sin pedirla manualmente en cada importacion.
            super().save(*args, **kwargs)
            self.id_ccr = f"CCR-{self.pk:04d}"
            super().save(update_fields=["id_ccr"])
            return
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.id_ccr or 'CCR-SIN-ID'} - {self.nombre}"


class MovimientoPaciente(models.Model):
    """Bitacora de cambios de estado y eventos relevantes de agenda."""

    paciente = models.ForeignKey(
        Paciente, on_delete=models.CASCADE, related_name="movimientos"
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    estado_anterior = models.CharField(max_length=30, blank=True, null=True)
    estado_nuevo = models.CharField(max_length=30)
    fecha = models.DateTimeField(auto_now_add=True)
    notas = models.TextField(blank=True)

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.paciente_id}: {self.estado_anterior} -> {self.estado_nuevo}"


class LlamadoPaciente(models.Model):
    """Registro auditable de contactabilidad.

    El resultado NO_CONTESTA alimenta el paso a RESCATE o egreso administrativo
    desde la vista correspondiente; no mover esa regla al modelo sin revisar API
    y frontend.
    """

    class Resultado(models.TextChoices):
        CONTESTA_CONFIRMADO = "CONTESTA_CONFIRMADO", "Contesta y confirma"
        NO_CONTESTA = "NO_CONTESTA", "No contesta"
        NUMERO_EQUIVOCADO = "NUMERO_EQUIVOCADO", "Numero equivocado"
        REAGENDAR_LLAMADO = "REAGENDAR_LLAMADO", "Reagendar llamado"
        RECHAZA_ATENCION = "RECHAZA_ATENCION", "Rechaza atencion"
        YA_RESUELTO = "YA_RESUELTO", "Ya resuelto"
        OTRO = "OTRO", "Otro"

    paciente = models.ForeignKey(
        Paciente, related_name="llamados", on_delete=models.CASCADE
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    fecha = models.DateTimeField(auto_now_add=True)
    telefono_usado = models.CharField(max_length=30, blank=True, default="")
    resultado = models.CharField(max_length=30, choices=Resultado.choices)
    notas = models.TextField(blank=True, default="")
    proxima_accion = models.CharField(max_length=160, blank=True, default="")
    volver_a_llamar = models.DateTimeField(null=True, blank=True)
    # Estado del paciente antes del llamado, para poder deshacerlo por unos minutos.
    deshacer = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.paciente_id}: {self.resultado}"


class ObservacionPaciente(models.Model):
    """Observación del paciente como entrada independiente: tipo, fijada, editable y borrable.

    `Paciente.observaciones` queda como texto resumen (exportaciones y búsqueda) y se
    reescribe desde esta lista con `services.sincronizar_observaciones`.
    """

    class Tipo(models.TextChoices):
        GENERAL = "GENERAL", "General"
        CLINICA = "CLINICA", "Clínica"
        CONTACTO = "CONTACTO", "Contacto"
        ADMINISTRATIVA = "ADMINISTRATIVA", "Administrativa"
        IMPORTACION = "IMPORTACION", "Importación"

    paciente = models.ForeignKey(Paciente, related_name="notas", on_delete=models.CASCADE)
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.GENERAL)
    texto = models.TextField()
    fijada = models.BooleanField(default=False)
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-fijada", "-creado_en", "-id"]

    def __str__(self):
        return f"{self.paciente_id} [{self.tipo}] {self.texto[:40]}"


class InasistenciaPaciente(models.Model):
    paciente = models.ForeignKey(
        Paciente, related_name="inasistencias", on_delete=models.CASCADE
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    fecha = models.DateField()
    justificada = models.BooleanField(default=False)
    motivo = models.TextField(blank=True, default="")
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.paciente_id}: {self.fecha}"


class RegistroAgendaPaciente(models.Model):
    """Historial de eventos de calendario.

    Se conserva aunque la cita vigente cambie, para poder reconstruir asistencia,
    reagendamientos y cancelaciones desde el perfil del paciente.
    """

    class Resultado(models.TextChoices):
        ASISTIO = "ASISTIO", "Asistió"
        NO_ASISTIO = "NO_ASISTIO", "No asistió"
        REAGENDADO = "REAGENDADO", "Reagendado"
        CANCELADO = "CANCELADO", "Cita eliminada"

    paciente = models.ForeignKey(
        Paciente, related_name="registros_agenda", on_delete=models.CASCADE
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    fecha_programada = models.DateTimeField()
    resultado = models.CharField(max_length=20, choices=Resultado.choices)
    observacion = models.TextField(blank=True, default="")
    nueva_fecha = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creado_en", "-id"]

    def __str__(self):
        return f"{self.paciente_id}: {self.resultado}"


class DiagnosticoCatalogo(models.Model):
    categoria = models.CharField(max_length=20, choices=Paciente.Categoria.choices)
    diagnostico = models.CharField(max_length=255, unique=True)

    class Meta:
        ordering = ["categoria", "diagnostico"]

    def __str__(self):
        return f"{self.categoria} - {self.diagnostico}"


class ActividadGrupal(models.Model):
    """Actividad o sesion grupal en una fecha: varios pacientes asisten juntos."""

    class Estado(models.TextChoices):
        PROGRAMADA = "PROGRAMADA", "Programada"
        REALIZADA = "REALIZADA", "Realizada"
        CANCELADA = "CANCELADA", "Cancelada"

    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True, default="")
    lugar = models.CharField(max_length=150, blank=True, default="")
    fecha_hora = models.DateTimeField()
    duracion_minutos = models.PositiveSmallIntegerField(default=60)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.PROGRAMADA)
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="actividades_grupales",
        on_delete=models.SET_NULL,
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="actividades_grupales_creadas",
        on_delete=models.SET_NULL,
    )
    pacientes = models.ManyToManyField(
        Paciente, through="ParticipanteActividad", related_name="actividades_grupales"
    )
    grupo = models.ForeignKey(
        "GrupoPacientes",
        null=True,
        blank=True,
        related_name="actividades",
        on_delete=models.SET_NULL,
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["fecha_hora", "id"]

    def __str__(self):
        return f"{self.nombre} ({self.fecha_hora:%Y-%m-%d %H:%M})"


class ParticipanteActividad(models.Model):
    class Asistencia(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        ASISTIO = "ASISTIO", "Asistió"
        NO_ASISTIO = "NO_ASISTIO", "No asistió"

    actividad = models.ForeignKey(
        ActividadGrupal, related_name="participantes", on_delete=models.CASCADE
    )
    paciente = models.ForeignKey(
        Paciente, related_name="participaciones_grupales", on_delete=models.CASCADE
    )
    asistencia = models.CharField(
        max_length=20, choices=Asistencia.choices, default=Asistencia.PENDIENTE
    )

    class Meta:
        ordering = ["paciente__nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["actividad", "paciente"], name="participante_unico_por_actividad"
            )
        ]

    def __str__(self):
        return f"{self.actividad_id}: {self.paciente_id}"


class GrupoPacientes(models.Model):
    """Grupo guardado de pacientes para citarlos juntos a actividades.

    Puede ser permanente o temporal (con fecha `vigente_hasta`); los miembros
    se agregan y quitan segun se necesite.
    """

    class Tipo(models.TextChoices):
        PERMANENTE = "PERMANENTE", "Permanente"
        TEMPORAL = "TEMPORAL", "Temporal"

    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True, default="")
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.PERMANENTE)
    vigente_hasta = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)
    responsable = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="grupos_pacientes",
        on_delete=models.SET_NULL,
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="grupos_pacientes_creados",
        on_delete=models.SET_NULL,
    )
    pacientes = models.ManyToManyField(
        Paciente, through="MiembroGrupo", related_name="grupos"
    )
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nombre", "id"]

    def __str__(self):
        return self.nombre


class MiembroGrupo(models.Model):
    grupo = models.ForeignKey(GrupoPacientes, related_name="miembros", on_delete=models.CASCADE)
    paciente = models.ForeignKey(Paciente, related_name="membresias_grupo", on_delete=models.CASCADE)
    agregado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["paciente__nombre"]
        constraints = [
            models.UniqueConstraint(fields=["grupo", "paciente"], name="miembro_unico_por_grupo")
        ]

    def __str__(self):
        return f"{self.grupo_id}: {self.paciente_id}"


class MovimientoGrupo(models.Model):
    """Historial de cambios de un grupo: creacion, ediciones, miembros y citaciones."""

    class Tipo(models.TextChoices):
        CREADO = "CREADO", "Grupo creado"
        EDITADO = "EDITADO", "Grupo editado"
        MIEMBROS_AGREGADOS = "MIEMBROS_AGREGADOS", "Pacientes agregados"
        MIEMBROS_QUITADOS = "MIEMBROS_QUITADOS", "Pacientes quitados"
        ARCHIVADO = "ARCHIVADO", "Grupo archivado"
        REACTIVADO = "REACTIVADO", "Grupo reactivado"
        CITADO = "CITADO", "Grupo citado a actividad"

    grupo = models.ForeignKey(GrupoPacientes, related_name="movimientos", on_delete=models.CASCADE)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    descripcion = models.TextField(blank=True, default="")
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.grupo_id}: {self.tipo}"
