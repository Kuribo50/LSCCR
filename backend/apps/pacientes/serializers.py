from datetime import date

from rest_framework import serializers

from .models import (
    DiagnosticoCatalogo,
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)
from .services import ESTADOS_REQUIEREN_NOTA


class LlamadoPacienteSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre", read_only=True)
    resultado_label = serializers.SerializerMethodField()

    class Meta:
        model = LlamadoPaciente
        fields = (
            "id",
            "paciente",
            "usuario",
            "usuario_nombre",
            "fecha",
            "telefono_usado",
            "resultado",
            "resultado_label",
            "notas",
            "proxima_accion",
        )
        read_only_fields = ("id", "usuario", "usuario_nombre", "fecha", "resultado_label")

    def get_resultado_label(self, obj: LlamadoPaciente) -> str:
        if obj.resultado == LlamadoPaciente.Resultado.REAGENDAR_LLAMADO:
            return "Reagendar contacto"
        return obj.get_resultado_display()


class InasistenciaPacienteSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre", read_only=True)

    class Meta:
        model = InasistenciaPaciente
        fields = (
            "id",
            "paciente",
            "usuario",
            "usuario_nombre",
            "fecha",
            "justificada",
            "motivo",
            "creado_en",
        )
        read_only_fields = ("id", "usuario", "usuario_nombre", "creado_en")


class RegistroAgendaPacienteSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre", read_only=True)
    resultado_label = serializers.CharField(source="get_resultado_display", read_only=True)

    class Meta:
        model = RegistroAgendaPaciente
        fields = (
            "id",
            "paciente",
            "usuario",
            "usuario_nombre",
            "fecha_programada",
            "resultado",
            "resultado_label",
            "observacion",
            "nueva_fecha",
            "creado_en",
        )
        read_only_fields = (
            "id",
            "usuario",
            "usuario_nombre",
            "resultado_label",
            "creado_en",
        )


class PacienteSerializer(serializers.ModelSerializer):
    kine_asignado_nombre = serializers.CharField(source="kine_asignado.nombre", read_only=True)
    responsable_asignado = serializers.IntegerField(source="kine_asignado_id", read_only=True)
    responsable_nombre = serializers.CharField(source="kine_asignado.nombre", read_only=True)
    categoria_label = serializers.CharField(source="get_categoria_display", read_only=True)
    dias_en_lista = serializers.SerializerMethodField()
    llamados_count = serializers.SerializerMethodField()
    inasistencias_count = serializers.SerializerMethodField()
    ultimo_llamado = serializers.SerializerMethodField()
    ultima_inasistencia = serializers.SerializerMethodField()

    class Meta:
        model = Paciente
        fields = (
            "id",
            "id_ccr",
            "fecha_derivacion",
            "percapita_desde",
            "sector_oficial",
            "sector_cesfam",
            "asignado_historico",
            "nombre",
            "rut",
            "edad",
            "diagnostico",
            "profesional",
            "prioridad",
            "categoria",
            "categoria_label",
            "mayor_60",
            "kine_asignado",
            "kine_asignado_nombre",
            "responsable_asignado",
            "responsable_nombre",
            "estado",
            "fecha_cambio_estado",
            "n_intentos_contacto",
            "n_inasistencias",
            "fecha_ultima_inasistencia",
            "motivo_ultima_inasistencia",
            "observaciones",
            "dias_en_lista",
            "llamados_count",
            "inasistencias_count",
            "ultimo_llamado",
            "ultima_inasistencia",
            "n_meses_espera",
            "creado_en",
            # Datos de contacto y seguimiento operativo.
            "fecha_nacimiento",
            "telefono",
            "telefono_recados",
            "email",
            "fecha_ingreso",
            "fecha_siguiente_cita",
            "proxima_atencion",
            "fecha_egreso",
        )
        read_only_fields = (
            "id",
            "id_ccr",
            "mayor_60",
            "categoria_label",
            "responsable_asignado",
            "responsable_nombre",
            "fecha_cambio_estado",
            "n_intentos_contacto",
            "n_inasistencias",
            "fecha_ultima_inasistencia",
            "motivo_ultima_inasistencia",
            "dias_en_lista",
            "llamados_count",
            "inasistencias_count",
            "ultimo_llamado",
            "ultima_inasistencia",
        )

    def get_dias_en_lista(self, obj: Paciente) -> int:
        today = self.context.get("today") or date.today()
        return (today - obj.fecha_derivacion).days

    def get_llamados_count(self, obj: Paciente) -> int:
        return obj.llamados.count()

    def get_inasistencias_count(self, obj: Paciente) -> int:
        return obj.inasistencias.count()

    def get_ultimo_llamado(self, obj: Paciente) -> dict | None:
        llamado = obj.llamados.first()
        if llamado is None:
            return None
        return LlamadoPacienteSerializer(llamado).data

    def get_ultima_inasistencia(self, obj: Paciente) -> dict | None:
        inasistencia = obj.inasistencias.first()
        if inasistencia is None:
            return None
        return InasistenciaPacienteSerializer(inasistencia).data


class PacienteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paciente
        fields = (
            "id",
            "fecha_derivacion",
            "percapita_desde",
            "sector_oficial",
            "sector_cesfam",
            "asignado_historico",
            "nombre",
            "rut",
            "edad",
            "diagnostico",
            "profesional",
            "prioridad",
            "categoria",
            "observaciones",
            "fecha_nacimiento",
            "telefono",
            "email",
        )
        read_only_fields = ("id",)


class CambiarEstadoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Paciente.Estado.choices)
    notas = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        estado = attrs["estado"]
        notas = (attrs.get("notas") or "").strip()
        if estado in ESTADOS_REQUIEREN_NOTA and not notas:
            raise serializers.ValidationError(
                {"notas": "Este cambio de estado requiere notas obligatorias."}
            )
        attrs["notas"] = notas
        return attrs


class ProgramarAtencionSerializer(serializers.Serializer):
    fecha_hora = serializers.DateTimeField(required=True)


class AgendaFechaSerializer(serializers.Serializer):
    fecha_programada = serializers.DateTimeField(required=False)
    observacion = serializers.CharField(required=False, allow_blank=True, default="")


class RegistrarInasistenciaAgendaSerializer(serializers.Serializer):
    fecha_programada = serializers.DateTimeField(required=False)
    motivo = serializers.CharField(required=False, allow_blank=True, default="")
    justificada = serializers.BooleanField(default=False)


class ReagendarAtencionSerializer(serializers.Serializer):
    fecha_programada = serializers.DateTimeField(required=False)
    nueva_fecha = serializers.DateTimeField(required=True)
    observacion = serializers.CharField(required=False, allow_blank=True, default="")


class RegistrarLlamadoSerializer(serializers.Serializer):
    contesto = serializers.BooleanField()
    notas = serializers.CharField(required=False, allow_blank=True, default="")
    telefono_usado = serializers.CharField(required=False, allow_blank=True, default="")
    proxima_accion = serializers.CharField(required=False, allow_blank=True, default="")


class RegistrarInasistenciaSerializer(serializers.Serializer):
    fecha = serializers.DateField()
    justificada = serializers.BooleanField(default=False)
    motivo = serializers.CharField(required=False, allow_blank=True, default="")


class MovimientoPacienteSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source="usuario.nombre", read_only=True)

    class Meta:
        model = MovimientoPaciente
        fields = (
            "id",
            "paciente",
            "usuario",
            "usuario_nombre",
            "estado_anterior",
            "estado_nuevo",
            "fecha",
            "notas",
        )


class DiagnosticoCatalogoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiagnosticoCatalogo
        fields = ("id", "categoria", "diagnostico")
