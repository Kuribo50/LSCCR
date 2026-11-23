from datetime import date

from rest_framework import serializers

from .models import (
    ActividadGrupal,
    DiagnosticoCatalogo,
    GrupoPacientes,
    InasistenciaPaciente,
    LlamadoPaciente,
    MiembroGrupo,
    MovimientoPaciente,
    ObservacionPaciente,
    Paciente,
    ParticipanteActividad,
    RegistroAgendaPaciente,
)
from .llamados import intentos_en_estado, umbral_intentos
from .permissions import puede_editar_observacion
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
            "volver_a_llamar",
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
    intentos_estado = serializers.SerializerMethodField()
    intentos_umbral = serializers.SerializerMethodField()

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
            "alerta",
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
            "proximo_llamado",
            "intentos_estado",
            "intentos_umbral",
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
            "proximo_llamado",
            "intentos_estado",
            "intentos_umbral",
        )

    def get_intentos_estado(self, obj: Paciente) -> int:
        """Llamados sin respuesta en el estado actual (usa los llamados ya precargados)."""
        return intentos_en_estado(obj)

    def get_intentos_umbral(self, obj: Paciente) -> int | None:
        """Intentos sin respuesta que cambian el estado (None si no aplica)."""
        return umbral_intentos(obj.estado)

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
    """Entrada del flujo de llamados. Las reglas viven en `llamados.registrar_llamado`.

    `resultado` es el dato principal; `contesto` se mantiene por compatibilidad
    (true = CONTESTA_CONFIRMADO, false = NO_CONTESTA).
    """

    resultado = serializers.ChoiceField(choices=LlamadoPaciente.Resultado.choices, required=False)
    contesto = serializers.BooleanField(required=False)
    notas = serializers.CharField(required=False, allow_blank=True, default="")
    telefono_usado = serializers.CharField(required=False, allow_blank=True, default="")
    proxima_accion = serializers.CharField(required=False, allow_blank=True, default="")
    fecha_atencion = serializers.DateTimeField(required=False, allow_null=True)
    volver_a_llamar = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        if "resultado" not in attrs:
            if "contesto" not in attrs:
                raise serializers.ValidationError({"resultado": "Indica el resultado del llamado."})
            attrs["resultado"] = (
                LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO
                if attrs["contesto"]
                else LlamadoPaciente.Resultado.NO_CONTESTA
            )
        return attrs


class DeshacerLlamadoSerializer(serializers.Serializer):
    llamado_id = serializers.IntegerField()


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



def validar_pacientes_para_grupo(ids, request, permitir_vacio=False):
    """Valida ids de pacientes para actividades y grupos.

    Deben existir y estar ingresados; un KINE solo puede usar pacientes de su
    cartera. Devuelve la lista sin duplicados.
    """
    ids = list(dict.fromkeys(ids))
    if not ids:
        if permitir_vacio:
            return ids
        raise serializers.ValidationError({"paciente_ids": "Selecciona al menos un paciente."})
    pacientes = list(Paciente.objects.filter(id__in=ids))
    if len(pacientes) != len(ids):
        raise serializers.ValidationError({"paciente_ids": "Hay pacientes que no existen."})
    no_ingresados = [p.nombre for p in pacientes if p.estado != Paciente.Estado.INGRESADO]
    if no_ingresados:
        raise serializers.ValidationError(
            {"paciente_ids": f"Solo pacientes ingresados pueden participar: {', '.join(no_ingresados[:3])}."}
        )
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "rol", None) == "KINE":
        if any(p.kine_asignado_id != user.id for p in pacientes):
            raise serializers.ValidationError(
                {"paciente_ids": "Solo puedes agregar pacientes de tu cartera."}
            )
    return ids


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
    grupo_nombre = serializers.CharField(source="grupo.nombre", read_only=True, default=None)
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
            "grupo",
            "grupo_nombre",
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
        attrs["paciente_ids"] = validar_pacientes_para_grupo(ids, self.context.get("request"))
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


class MiembroGrupoSerializer(serializers.ModelSerializer):
    paciente_id = serializers.IntegerField(source="paciente.id", read_only=True)
    nombre = serializers.CharField(source="paciente.nombre", read_only=True)
    rut = serializers.CharField(source="paciente.rut", read_only=True)
    categoria = serializers.CharField(source="paciente.categoria", read_only=True)
    estado = serializers.CharField(source="paciente.estado", read_only=True)
    telefono = serializers.CharField(source="paciente.telefono", read_only=True)
    edad = serializers.IntegerField(source="paciente.edad", read_only=True)
    prioridad = serializers.CharField(source="paciente.prioridad", read_only=True)
    proxima_atencion = serializers.DateTimeField(source="paciente.proxima_atencion", read_only=True)
    kine_nombre = serializers.CharField(source="paciente.kine_asignado.nombre", read_only=True, default=None)

    class Meta:
        model = MiembroGrupo
        fields = (
            "paciente_id",
            "nombre",
            "rut",
            "categoria",
            "estado",
            "telefono",
            "edad",
            "prioridad",
            "proxima_atencion",
            "kine_nombre",
            "agregado_en",
        )


class GrupoPacientesSerializer(serializers.ModelSerializer):
    """Grupo guardado. `paciente_ids` reemplaza los miembros al crear o editar."""

    miembros = MiembroGrupoSerializer(many=True, read_only=True)
    paciente_ids = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)
    tipo_label = serializers.CharField(source="get_tipo_display", read_only=True)
    responsable_nombre = serializers.CharField(source="responsable.nombre", read_only=True, default=None)
    total_miembros = serializers.SerializerMethodField()
    vencido = serializers.SerializerMethodField()
    total_actividades = serializers.SerializerMethodField()

    class Meta:
        model = GrupoPacientes
        fields = (
            "id",
            "nombre",
            "descripcion",
            "tipo",
            "tipo_label",
            "vigente_hasta",
            "vencido",
            "activo",
            "responsable",
            "responsable_nombre",
            "miembros",
            "paciente_ids",
            "total_miembros",
            "total_actividades",
            "creado_en",
        )
        read_only_fields = ("id", "creado_en")

    def get_total_miembros(self, obj):
        return len(obj.miembros.all())

    def get_vencido(self, obj):
        return bool(
            obj.tipo == GrupoPacientes.Tipo.TEMPORAL
            and obj.vigente_hasta
            and obj.vigente_hasta < date.today()
        )

    def get_total_actividades(self, obj):
        return obj.actividades.count()

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Ingresa un nombre para el grupo.")
        return value

    def validate(self, attrs):
        tipo = attrs.get("tipo", getattr(self.instance, "tipo", GrupoPacientes.Tipo.PERMANENTE))
        vigente = attrs.get("vigente_hasta", getattr(self.instance, "vigente_hasta", None))
        if tipo == GrupoPacientes.Tipo.TEMPORAL and not vigente:
            raise serializers.ValidationError({"vigente_hasta": "Indica hasta qué fecha dura el grupo temporal."})
        if tipo == GrupoPacientes.Tipo.PERMANENTE:
            attrs["vigente_hasta"] = None
        if "paciente_ids" in attrs:
            attrs["paciente_ids"] = validar_pacientes_para_grupo(
                attrs["paciente_ids"], self.context.get("request"), permitir_vacio=True
            )
        return attrs

    @staticmethod
    def guardar_miembros(grupo, ids, reemplazar=True):
        actuales = set(grupo.miembros.values_list("paciente_id", flat=True))
        nuevos = set(ids)
        if reemplazar:
            grupo.miembros.filter(paciente_id__in=actuales - nuevos).delete()
        MiembroGrupo.objects.bulk_create(
            [MiembroGrupo(grupo=grupo, paciente_id=pid) for pid in nuevos - actuales]
        )

    def create(self, validated_data):
        ids = validated_data.pop("paciente_ids", [])
        grupo = GrupoPacientes.objects.create(**validated_data)
        self.guardar_miembros(grupo, ids)
        return grupo

    def update(self, instance, validated_data):
        ids = validated_data.pop("paciente_ids", None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if ids is not None:
            self.guardar_miembros(instance, ids)
        return instance


class MiembrosGrupoSerializer(serializers.Serializer):
    paciente_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class ObservacionPacienteSerializer(serializers.ModelSerializer):
    tipo_label = serializers.CharField(source="get_tipo_display", read_only=True)
    autor_nombre = serializers.CharField(source="autor.nombre", read_only=True, default=None)
    puede_editar = serializers.SerializerMethodField()

    class Meta:
        model = ObservacionPaciente
        fields = (
            "id", "paciente", "tipo", "tipo_label", "texto", "fijada",
            "autor", "autor_nombre", "creado_en", "actualizado_en", "puede_editar",
        )
        read_only_fields = ("id", "autor", "autor_nombre", "creado_en", "actualizado_en", "puede_editar")

    def validate_paciente(self, valor):
        # Una observación no cambia de paciente: se borra y se crea en el otro.
        if self.instance is not None and valor.pk != self.instance.paciente_id:
            raise serializers.ValidationError("No se puede mover una observación a otro paciente.")
        return valor

    def validate_texto(self, valor):
        valor = (valor or "").strip()
        if not valor:
            raise serializers.ValidationError("La observación no puede quedar vacía.")
        return valor

    def get_puede_editar(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and puede_editar_observacion(request.user, obj))
