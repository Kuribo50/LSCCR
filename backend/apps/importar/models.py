from django.conf import settings
from django.db import models


class ImportacionMensual(models.Model):
    """Corte mensual importado desde Excel.

    Una importacion puede crear pacientes, detectar recurrentes o dejar
    observaciones de revision para que un funcionario las complete despues.
    """

    class Estado(models.TextChoices):
        PROCESANDO = "PROCESANDO", "Procesando"
        COMPLETADO = "COMPLETADO", "Completado"
        REEMPLAZADO = "REEMPLAZADO", "Reemplazado"
        CON_ERRORES = "CON_ERRORES", "Con errores"

    archivo = models.FileField(upload_to="importaciones/%Y/%m/")
    archivo_nombre = models.CharField(max_length=255, blank=True)
    mes = models.PositiveSmallIntegerField()
    anio = models.PositiveSmallIntegerField()
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    fecha_subida = models.DateTimeField(auto_now_add=True)
    estado = models.CharField(
        max_length=20,
        choices=Estado.choices,
        default=Estado.COMPLETADO,
    )
    total_registros = models.PositiveIntegerField(default=0)
    registros_importados = models.PositiveIntegerField(default=0)
    duplicados = models.PositiveIntegerField(default=0)
    errores = models.JSONField(default=list, blank=True)
    # Observaciones normalizadas que alimentan /importar/revision/.
    # Incluyen ERROR, ADVERTENCIA y RECURRENTE; no son solo fallas de archivo.
    observaciones_revision = models.JSONField(default=list, blank=True)
    mes_datos = models.PositiveSmallIntegerField(null=True, blank=True)
    anio_datos = models.PositiveSmallIntegerField(null=True, blank=True)
    reemplazada_por = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reemplaza_a",
    )
    # Todos los cortes creados por una misma subida comparten lote: se
    # revierten juntos (ver apps/importar/reversion.py).
    lote = models.CharField(max_length=32, blank=True, default="", db_index=True)
    # Cambios que la carga hizo sobre pacientes que ya existían, para poder
    # deshacerlos dentro de la ventana de reversión.
    efectos = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-fecha_subida"]

    def __str__(self):
        meses = [
            "",
            "Ene",
            "Feb",
            "Mar",
            "Abr",
            "May",
            "Jun",
            "Jul",
            "Ago",
            "Sep",
            "Oct",
            "Nov",
            "Dic",
        ]
        mes_ref = self.mes_datos or self.mes
        anio_ref = self.anio_datos or self.anio
        return f"Importación {meses[mes_ref]}/{anio_ref} — {self.get_estado_display()}"

    @property
    def mes_label(self):
        meses = [
            "",
            "Enero",
            "Febrero",
            "Marzo",
            "Abril",
            "Mayo",
            "Junio",
            "Julio",
            "Agosto",
            "Septiembre",
            "Octubre",
            "Noviembre",
            "Diciembre",
        ]
        mes_ref = self.mes_datos or self.mes
        return meses[mes_ref] if 1 <= mes_ref <= 12 else str(mes_ref)

    @property
    def periodo_label(self):
        anio_ref = self.anio_datos or self.anio
        return f"{self.mes_label} {anio_ref}"

    @property
    def errores_count(self):
        return len(self.errores or [])

    @property
    def observaciones_pendientes_count(self):
        return len(
            [
                item
                for item in (self.observaciones_revision or [])
                if item.get("estado_revision", "PENDIENTE") == "PENDIENTE"
            ]
        )


class HistoricoPaciente(models.Model):
    """Padrón de pacientes (histórico de Tomé) usado para cruzar por RUT.

    Solo guarda lo mínimo para validar y completar fichas: identificación,
    fecha de nacimiento, sector, teléfonos y fallecimiento. No se copian
    dirección, correo, previsión ni otros datos del padrón.
    """

    rut = models.CharField(max_length=12, unique=True)
    nombre = models.CharField(max_length=200, blank=True, default="")
    fecha_nacimiento = models.DateField(null=True, blank=True)
    fecha_fallecimiento = models.DateField(null=True, blank=True)
    comuna = models.CharField(max_length=80, blank=True, default="")
    centro_inscripcion = models.CharField(max_length=120, blank=True, default="")
    sector = models.CharField(max_length=120, blank=True, default="")
    codigo_sector = models.CharField(max_length=4, blank=True, default="")
    telefono = models.CharField(max_length=20, blank=True, default="")
    telefono_recados = models.CharField(max_length=20, blank=True, default="")
    cargado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Paciente del histórico"
        verbose_name_plural = "Pacientes del histórico"

    def __str__(self):
        return f"{self.rut} {self.nombre}"
