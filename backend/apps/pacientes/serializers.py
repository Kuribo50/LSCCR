from datetime import date

from rest_framework import serializers

from .models import (
    ActividadGrupal,
    DiagnosticoCatalogo,
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    ParticipanteActividad,
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
    """Serializer de lectura/escritura general que consume el frontend.

    Expone alias `responsable_*` junto a `kine_asignado_*` para que la UI pueda
    hablar de responsable CCR sin romper endpoints existentes.
    """

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
        return len(obj.llamados.all())

    def get_inasistencias_count(self, obj: Paciente) -> int:
        return len(obj.inasistencias.all())

    def get_ultimo_llamado(self, obj: Paciente) -> dict | None:
        llamados = obj.llamados.all()
        return LlamadoPacienteSerializer(llamados[0]).data if llamados else None

    def get_ultima_inasistencia(self, obj: Paciente) -> dict | None:
        inasistencias = obj.inasistencias.all()
        return InasistenciaPacienteSerializer(inasistencias[0]).data if inasistencias else None


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
    """Exige notas cuando el nuevo estado corresponde a cierre operativo."""

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
    """Registra no asistencia desde calendario y, si corresponde, inasistencia."""

    fecha_programada = serializers.DateTimeField(required=False)
    motivo = serializers.CharField(required=False, allow_blank=True, default="")
    justificada = serializers.BooleanField(default=False)


class ReagendarAtencionSerializer(serializers.Serializer):
    fecha_programada = serializers.DateTimeField(required=False)
    nueva_fecha = serializers.DateTimeField(required=True)
    observacion = serializers.CharField(required=False, allow_blank=True, default="")


class RegistrarLlamadoSerializer(serializers.Serializer):
    """Entrada del flujo de llamados.

    La vista decide el efecto operativo: contesta ingresa; no contesta pasa a
    RESCATE o EGRESO_ADMINISTRATIVO segun estado actual.
    """

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



class ParticipanteActividadSerializer(serializers.ModelSerializer):
    paciente_id = serializers.IntegerField(source="paciente.id", read_only=True)
    nombre = serializers.CharField(source="paciente.nombre", read_only=True)
    rut = serializers.CharField(source="paciente.rut", read_only=True)
    id_ccr = serializers.CharField(source="paciente.id_ccr", read_only=True)
    categoria = serializers.CharField(source="paciente.categoria", read_only=True)
    telefono = serializers.CharField(source="paciente.telefono", read_only=True)
    asistencia_label = serializers.CharField(source="get_asistencia_display", read_only=True)

    class Meta:
        model = ParticipanteActividad
        fields = (
            "paciente_id",
            "nombre",
            "rut",
            "id_ccr",
            "categoria",
            "telefono",
            "asistencia",
            "asistencia_label",
        )


class ActividadGrupalSerializer(serializers.ModelSerializer):
    """Actividad grupal con sus participantes.

    Para crear o cambiar participantes se envia `paciente_ids`; la asistencia
    se marca con la accion `asistencia` del viewset.
    """

    participantes = ParticipanteActividadSerializer(many=True, read_only=True)
    paciente_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)
    responsable_nombre = serializers.CharField(source="responsable.nombre", read_only=True, default=None)
    creado_por_nombre = serializers.CharField(source="creado_por.nombre", read_only=True, default=None)
    total_participantes = serializers.SerializerMethodField()
    total_asistentes = serializers.SerializerMethodField()

    class Meta:
        model = ActividadGrupal
        fields = (
            "id",
            "nombre",
            "descripcion",
            "lugar",
            "fecha_hora",
            "duracion_minutos",
            "estado",
            "estado_label",
            "responsable",
            "responsable_nombre",
            "creado_por_nombre",
            "participantes",
            "paciente_ids",
            "total_participantes",
            "total_asistentes",
            "creado_en",
        )
        read_only_fields = ("id", "creado_en")

    def get_total_participantes(self, obj):
        return len(obj.participantes.all())

    def get_total_asistentes(self, obj):
        return sum(
            1 for p in obj.participantes.all()
            if p.asistencia == ParticipanteActividad.Asistencia.ASISTIO
        )

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Ingresa un nombre para la actividad.")
        return value

    def validate_duracion_minutos(self, value):
        if value < 5 or value > 600:
            raise serializers.ValidationError("La duración debe estar entre 5 y 600 minutos.")
        return value

    def validate(self, attrs):
        ids = attrs.get("paciente_ids")
        if ids is None:
            if self.instance is None:
                raise serializers.ValidationError({"paciente_ids": "Selecciona al menos un paciente."})
            return attrs
        ids = list(dict.fromkeys(ids))
        if not ids:
            raise serializers.ValidationError({"paciente_ids": "Selecciona al menos un paciente."})
        pacientes = list(Paciente.objects.filter(id__in=ids))
        if len(pacientes) != len(ids):
            raise serializers.ValidationError({"paciente_ids": "Hay pacientes que no existen."})
        no_ingresados = [p.nombre for p in pacientes if p.estado != Paciente.Estado.INGRESADO]
        if no_ingresados:
            raise serializers.ValidationError(
                {"paciente_ids": f"Solo pacientes ingresados pueden participar: {', '.join(no_ingresados[:3])}."}
            )
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "rol", None) == "KINE":
            ajenos = [p.nombre for p in pacientes if p.kine_asignado_id != user.id]
            if ajenos:
                raise serializers.ValidationError(
                    {"paciente_ids": "Solo puedes agregar pacientes de tu cartera."}
                )
        attrs["paciente_ids"] = ids
        return attrs

    def _guardar_participantes(self, actividad, ids):
        if ids is None:
            return
        actuales = set(actividad.participantes.values_list("paciente_id", flat=True))
        nuevos = set(ids)
        actividad.participantes.filter(paciente_id__in=actuales - nuevos).delete()
        ParticipanteActividad.objects.bulk_create(
            [ParticipanteActividad(actividad=actividad, paciente_id=pid) for pid in nuevos - actuales]
        )

    def create(self, validated_data):
        ids = validated_data.pop("paciente_ids", None)
        actividad = ActividadGrupal.objects.create(**validated_data)
        self._guardar_participantes(actividad, ids)
        return actividad

    def update(self, instance, validated_data):
        ids = validated_data.pop("paciente_ids", None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        self._guardar_participantes(instance, ids)
        return instance


class AsistenciaActividadSerializer(serializers.Serializer):
    paciente_id = serializers.IntegerField()
    asistencia = serializers.ChoiceField(choices=ParticipanteActividad.Asistencia.choices)
