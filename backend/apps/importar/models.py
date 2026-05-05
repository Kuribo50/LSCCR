from django.conf import settings
from django.db import models


class ImportacionMensual(models.Model):
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
