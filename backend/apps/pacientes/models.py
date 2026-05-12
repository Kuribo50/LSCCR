from django.conf import settings
from django.db import models


class Paciente(models.Model):
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
    # Datos de contacto y seguimiento
    fecha_nacimiento = models.DateField(null=True, blank=True)
    telefono = models.CharField(max_length=20, blank=True, default='')
    telefono_recados = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    fecha_ingreso = models.DateField(null=True, blank=True)
    fecha_siguiente_cita = models.DateField(null=True, blank=True)
    proxima_atencion = models.DateTimeField(null=True, blank=True)
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
        self.rut = self.rut.replace(".", "").replace("-", "").upper().strip()
        self.sector_oficial = " ".join((self.sector_oficial or "").split()).upper()
        self.sector_cesfam = " ".join((self.sector_cesfam or "").split()).upper()
        self.mayor_60 = self.edad >= 60
        is_new = self.pk is None
        if is_new and not self.id_ccr:
            super().save(*args, **kwargs)
            self.id_ccr = f"CCR-{self.pk:04d}"
            super().save(update_fields=["id_ccr"])
            return
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.id_ccr or 'CCR-SIN-ID'} - {self.nombre}"


class MovimientoPaciente(models.Model):
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

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.paciente_id}: {self.resultado}"


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
