from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.usuarios.models import Usuario

from .exports import crear_excel_pacientes, excel_response, fecha_archivo_hoy
from .models import (
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)
from .permissions import (
    PuedeAsignarPaciente,
    PuedeCambiarEstado,
    PuedeProgramarAtencion,
    PuedeRegistrarLlamado,
)
from .serializers import (
    CambiarEstadoSerializer,
    AgendaFechaSerializer,
    InasistenciaPacienteSerializer,
    LlamadoPacienteSerializer,
    MovimientoPacienteSerializer,
    PacienteCreateSerializer,
    PacienteSerializer,
    ProgramarAtencionSerializer,
    ReagendarAtencionSerializer,
    RegistrarInasistenciaAgendaSerializer,
    RegistroAgendaPacienteSerializer,
    RegistrarInasistenciaSerializer,
    RegistrarLlamadoSerializer,
)
from .services import (
    ESTADOS_FINALES,
    categoria_por_diagnostico,
    estado_requiere_nota,
    prioridad_normalizada,
    validar_transicion_estado,
)


ORDEN_PRIORIDAD = Case(
    When(prioridad=Paciente.Prioridad.ALTA, then=Value(0)),
    When(prioridad=Paciente.Prioridad.MEDIANA, then=Value(1)),
    When(prioridad=Paciente.Prioridad.MODERADA, then=Value(2)),
    When(prioridad=Paciente.Prioridad.LICENCIA_MEDICA, then=Value(3)),
    default=Value(4),
    output_field=IntegerField(),
)

ALERTAS_OPERATIVAS = (
    "alta_sin_responsable",
    "sobre_90_dias",
    "pendientes_con_1_intento",
    "rescates_activos",
    "ingresados_sin_proxima_atencion",
    "posible_abandono",
    "telefonos_incompletos",
)

AGENDA_MOVIMIENTO_NOTAS = {
    "Paciente asistió a atención programada.",
    "No asiste a atención programada.",
    "Atención reagendada.",
    "Cita eliminada desde calendario.",
}


class PacienteViewSet(viewsets.ModelViewSet):
    queryset = (
        Paciente.objects.select_related("kine_asignado")
        .prefetch_related("llamados", "inasistencias")
        .all()
    )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["today"] = date.today()
        return context

    def get_serializer_class(self):
        if self.action == "create":
            return PacienteCreateSerializer
        return PacienteSerializer

    def _fecha_programada_agenda(self, paciente, serializer):
        return serializer.validated_data.get("fecha_programada") or paciente.proxima_atencion

    def _crear_movimiento_agenda(self, paciente, usuario, nota, estado_anterior=None):
        MovimientoPaciente.objects.create(
            paciente=paciente,
            usuario=usuario,
            estado_anterior=estado_anterior or paciente.estado,
            estado_nuevo=paciente.estado,
            notas=nota,
        )

    def _serializar_grupo_alerta(self, queryset):
        ordenado = queryset.annotate(orden_prioridad=ORDEN_PRIORIDAD).order_by(
            "orden_prioridad", "fecha_derivacion"
        )
        pacientes = list(ordenado[:8])
        return {
            "total": queryset.count(),
            "pacientes": PacienteSerializer(
                pacientes, many=True, context=self.get_serializer_context()
            ).data,
        }

    def _filtrar_alerta_operativa(self, queryset, alerta):
        hoy = timezone.localdate()
        corte_90_dias = hoy - timedelta(days=90)
        estados_activos = [
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        ]

        if alerta == "alta_sin_responsable":
            return queryset.filter(
                prioridad=Paciente.Prioridad.ALTA,
                kine_asignado__isnull=True,
                estado=Paciente.Estado.PENDIENTE,
            )
        if alerta == "sobre_90_dias":
            return queryset.filter(
                fecha_derivacion__lt=corte_90_dias,
                estado__in=[Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE],
            )
        if alerta == "pendientes_con_1_intento":
            return queryset.filter(
                estado=Paciente.Estado.PENDIENTE,
                n_intentos_contacto=1,
            )
        if alerta == "rescates_activos":
            return queryset.filter(estado=Paciente.Estado.RESCATE)
        if alerta == "ingresados_sin_proxima_atencion":
            return queryset.filter(
                estado=Paciente.Estado.INGRESADO,
                proxima_atencion__isnull=True,
            )
        if alerta == "posible_abandono":
            return queryset.filter(
                estado=Paciente.Estado.INGRESADO,
                n_inasistencias__gte=2,
            )
        if alerta == "telefonos_incompletos":
            return queryset.filter(
                estado__in=estados_activos,
                telefono="",
                telefono_recados="",
            )
        return queryset

    def destroy(self, request, *args, **kwargs):
        if request.user.rol != Usuario.Rol.ADMIN:
            return Response(
                {"error": "Solo los administradores pueden eliminar pacientes."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        params = self.request.query_params
        categoria = params.get("categoria")
        prioridad = params.get("prioridad")
        estado = params.get("estado")
        kine = params.get("kine")
        search = params.get("search")
        solo_mios = params.get("solo_mios")
        sin_asignar = params.get("sin_asignar")
        asignados = params.get("asignados")
        ordering = params.get("ordering")
        mes = params.get("mes")
        anio = params.get("anio")
        importacion = params.get("importacion")
        alerta = params.get("alerta")

        if categoria:
            queryset = queryset.filter(categoria=categoria)
        if prioridad:
            queryset = queryset.filter(prioridad=prioridad)
        if estado:
            queryset = queryset.filter(estado=estado)
        if kine:
            queryset = queryset.filter(kine_asignado_id=kine)
        if importacion:
            queryset = queryset.filter(importacion_origen_id=importacion)
        if alerta in ALERTAS_OPERATIVAS:
            queryset = self._filtrar_alerta_operativa(queryset, alerta)
        if mes:
            queryset = queryset.filter(fecha_derivacion__month=mes)
        if anio:
            queryset = queryset.filter(fecha_derivacion__year=anio)
        if sin_asignar in {"1", "true", "True"}:
            queryset = queryset.filter(kine_asignado__isnull=True)
        if asignados in {"1", "true", "True"}:
            queryset = queryset.filter(kine_asignado__isnull=False)
            
        is_egreso = params.get("is_egreso")
        if is_egreso in {"1", "true", "True"}:
            queryset = queryset.filter(estado__in=[
                Paciente.Estado.ALTA_MEDICA,
                Paciente.Estado.EGRESO_VOLUNTARIO,
                Paciente.Estado.EGRESO_ADMINISTRATIVO,
                Paciente.Estado.ABANDONO,
                Paciente.Estado.DERIVADO,
            ])
            
        if search:
            queryset = queryset.filter(
                Q(nombre__icontains=search)
                | Q(rut__icontains=search)
                | Q(id_ccr__icontains=search)
                | Q(diagnostico__icontains=search)
            )
        if solo_mios in {"1", "true", "True"} and self.request.user.rol == Usuario.Rol.KINE:
            queryset = queryset.filter(kine_asignado=self.request.user)

        if ordering == "dias":
            return queryset.order_by("fecha_derivacion")
        if ordering == "-dias":
            return queryset.order_by("-fecha_derivacion")

        return queryset.annotate(orden_prioridad=ORDEN_PRIORIDAD).order_by(
            "orden_prioridad", "fecha_derivacion"
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="asignar",
        permission_classes=[PuedeAsignarPaciente],
    )
    def asignar(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.kine_asignado_id is not None:
            nombre_responsable = paciente.kine_asignado.nombre if paciente.kine_asignado else "otro responsable CCR"
            return Response(
                {"detail": f"Este paciente ya fue tomado por {nombre_responsable}. No puede asignarse dos veces."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paciente.kine_asignado = request.user

        # Si se asigna desde un estado final, vuelve a PENDIENTE para retomar seguimiento.
        campos = ["kine_asignado", "actualizado_en"]
        if paciente.estado not in {
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        }:
            paciente._movimiento_usuario = request.user
            paciente._movimiento_notas = "Asignado por responsable CCR. Pasa a seguimiento."
            paciente.estado = Paciente.Estado.PENDIENTE
            paciente.fecha_cambio_estado = timezone.now()
            campos.extend(["estado", "fecha_cambio_estado"])
            
        paciente.save(update_fields=campos)
        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="cambiar-estado",
        permission_classes=[PuedeCambiarEstado],
    )
    def cambiar_estado(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        serializer = CambiarEstadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        estado_nuevo = serializer.validated_data["estado"]
        notas = serializer.validated_data["notas"].strip()

        if request.user.rol == Usuario.Rol.ADMINISTRATIVO:
            if estado_nuevo not in {
                Paciente.Estado.INGRESADO,
                Paciente.Estado.RESCATE,
                Paciente.Estado.EGRESO_ADMINISTRATIVO,
            }:
                return Response(
                    {"detail": "Administrativo no puede cambiar a estados de cierre operativo."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if estado_nuevo == Paciente.Estado.INGRESADO and paciente.kine_asignado_id is None:
                return Response(
                    {"detail": "No puede confirmar asistencia sin responsable CCR asignado."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not validar_transicion_estado(paciente.estado, estado_nuevo):
            return Response(
                {"detail": f"Transición inválida: {paciente.estado} -> {estado_nuevo}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if estado_nuevo == Paciente.Estado.ABANDONO and paciente.estado != Paciente.Estado.INGRESADO:
            return Response(
                {"detail": "ABANDONO solo puede registrarse desde INGRESADO."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (estado_requiere_nota(estado_nuevo) or paciente.estado in ESTADOS_FINALES) and not notas:
            return Response(
                {"detail": "Este cambio de estado requiere notas obligatorias."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paciente._movimiento_usuario = request.user
        paciente._movimiento_notas = notas
        paciente.estado = estado_nuevo
        paciente.fecha_cambio_estado = timezone.now()
        campos = ["estado", "fecha_cambio_estado", "actualizado_en"]
        if estado_nuevo == Paciente.Estado.INGRESADO and paciente.fecha_ingreso is None:
            paciente.fecha_ingreso = timezone.localdate()
            campos.append("fecha_ingreso")
        if estado_nuevo in ESTADOS_FINALES and paciente.fecha_egreso is None:
            paciente.fecha_egreso = timezone.localdate()
            campos.append("fecha_egreso")
        paciente.save(update_fields=campos)
        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="registrar-llamado",
        permission_classes=[PuedeRegistrarLlamado],
    )
    def registrar_llamado(self, request, pk=None):
        paciente = self.get_object()

        if paciente.kine_asignado_id is None:
            return Response(
                {"detail": "Debe existir un responsable CCR asignado antes del contacto."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if paciente.estado not in {Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE}:
            return Response(
                {"detail": "Solo se puede registrar contacto en estado PENDIENTE o RESCATE."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RegistrarLlamadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contesto = serializer.validated_data["contesto"]
        notas = serializer.validated_data["notas"]
        telefono_usado = serializer.validated_data.get("telefono_usado", "")
        proxima_accion = serializer.validated_data.get("proxima_accion", "")

        if not contesto and paciente.estado == Paciente.Estado.RESCATE and not notas:
            return Response(
                {"detail": "Debe registrar una observación para egreso administrativo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            estado_anterior = paciente.estado
            observacion = notas
            if not contesto and paciente.estado == Paciente.Estado.PENDIENTE and not observacion:
                observacion = "Primer contacto sin respuesta. Pasa a RESCATE."

            LlamadoPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                telefono_usado=telefono_usado or paciente.telefono,
                resultado=(
                    LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO
                    if contesto
                    else LlamadoPaciente.Resultado.NO_CONTESTA
                ),
                notas=observacion,
                proxima_accion=proxima_accion,
            )

            paciente._movimiento_usuario = request.user
            paciente._movimiento_notas = observacion

            if contesto:
                paciente.estado = Paciente.Estado.INGRESADO
                paciente.fecha_cambio_estado = timezone.now()
                campos = ["estado", "fecha_cambio_estado", "actualizado_en"]
                if paciente.fecha_ingreso is None:
                    paciente.fecha_ingreso = timezone.localdate()
                    campos.append("fecha_ingreso")
            else:
                paciente.n_intentos_contacto += 1
                paciente.fecha_cambio_estado = timezone.now()
                campos = ["n_intentos_contacto", "fecha_cambio_estado", "actualizado_en"]
                if estado_anterior == Paciente.Estado.PENDIENTE:
                    paciente.estado = Paciente.Estado.RESCATE
                    campos.append("estado")
                elif estado_anterior == Paciente.Estado.RESCATE:
                    paciente.estado = Paciente.Estado.EGRESO_ADMINISTRATIVO
                    campos.append("estado")
                    if paciente.fecha_egreso is None:
                        paciente.fecha_egreso = timezone.localdate()
                        campos.append("fecha_egreso")

            paciente.save(update_fields=campos)

        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="historial")
    def historial(self, request, pk=None):
        paciente = self.get_object()
        movimientos = MovimientoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        return Response(MovimientoPacienteSerializer(movimientos, many=True).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="registrar-inasistencia",
        permission_classes=[PuedeCambiarEstado],
    )
    def registrar_inasistencia(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.estado != Paciente.Estado.INGRESADO:
            return Response(
                {"detail": "Solo se pueden registrar inasistencias en pacientes INGRESADOS."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RegistrarInasistenciaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            inasistencia = InasistenciaPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                fecha=serializer.validated_data["fecha"],
                justificada=serializer.validated_data["justificada"],
                motivo=serializer.validated_data["motivo"],
            )
            paciente.fecha_ultima_inasistencia = inasistencia.fecha
            paciente.motivo_ultima_inasistencia = inasistencia.motivo
            campos = [
                "fecha_ultima_inasistencia",
                "motivo_ultima_inasistencia",
                "actualizado_en",
            ]
            if not inasistencia.justificada:
                paciente.n_inasistencias += 1
                campos.append("n_inasistencias")
            paciente.save(update_fields=campos)

        alerta_abandono = paciente.n_inasistencias >= 2
        return Response(
            {
                "inasistencia": InasistenciaPacienteSerializer(inasistencia).data,
                "paciente": PacienteSerializer(paciente, context=self.get_serializer_context()).data,
                "alerta_abandono": alerta_abandono,
                "mensaje": (
                    "Paciente tiene 2 inasistencias no justificadas. Evaluar marcar como ABANDONO."
                    if alerta_abandono
                    else ""
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="registrar-asistencia",
        permission_classes=[PuedeProgramarAtencion],
    )
    def registrar_asistencia(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.proxima_atencion is None:
            return Response(
                {"detail": "El paciente no tiene una atención programada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AgendaFechaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fecha_programada = self._fecha_programada_agenda(paciente, serializer)
        observacion = serializer.validated_data.get("observacion", "").strip()
        nota_movimiento = "Paciente asistió a atención programada."

        with transaction.atomic():
            estado_anterior = paciente.estado
            RegistroAgendaPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                fecha_programada=fecha_programada,
                resultado=RegistroAgendaPaciente.Resultado.ASISTIO,
                observacion=observacion,
            )

            campos = ["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"]
            if paciente.estado in {Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE}:
                paciente._movimiento_usuario = request.user
                paciente._movimiento_notas = nota_movimiento
                paciente.estado = Paciente.Estado.INGRESADO
                paciente.fecha_cambio_estado = timezone.now()
                campos.extend(["estado", "fecha_cambio_estado"])
                if paciente.fecha_ingreso is None:
                    paciente.fecha_ingreso = timezone.localdate()
                    campos.append("fecha_ingreso")

            paciente.proxima_atencion = None
            paciente.fecha_siguiente_cita = None
            paciente.save(update_fields=campos)

            if estado_anterior == paciente.estado:
                self._crear_movimiento_agenda(
                    paciente,
                    request.user,
                    nota_movimiento,
                    estado_anterior=estado_anterior,
                )

        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="registrar-inasistencia-agenda",
        permission_classes=[PuedeProgramarAtencion],
    )
    def registrar_inasistencia_agenda(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.proxima_atencion is None:
            return Response(
                {"detail": "El paciente no tiene una atención programada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RegistrarInasistenciaAgendaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fecha_programada = self._fecha_programada_agenda(paciente, serializer)
        motivo = serializer.validated_data.get("motivo", "").strip()
        justificada = serializer.validated_data["justificada"]
        inasistencia = None

        with transaction.atomic():
            RegistroAgendaPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                fecha_programada=fecha_programada,
                resultado=RegistroAgendaPaciente.Resultado.NO_ASISTIO,
                observacion=motivo,
            )

            campos = ["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"]
            if paciente.estado == Paciente.Estado.INGRESADO:
                inasistencia = InasistenciaPaciente.objects.create(
                    paciente=paciente,
                    usuario=request.user,
                    fecha=timezone.localdate(fecha_programada),
                    justificada=justificada,
                    motivo=motivo,
                )
                paciente.fecha_ultima_inasistencia = inasistencia.fecha
                paciente.motivo_ultima_inasistencia = inasistencia.motivo
                campos.extend(["fecha_ultima_inasistencia", "motivo_ultima_inasistencia"])
                if not justificada:
                    paciente.n_inasistencias += 1
                    campos.append("n_inasistencias")

            paciente.proxima_atencion = None
            paciente.fecha_siguiente_cita = None
            paciente.save(update_fields=campos)
            self._crear_movimiento_agenda(
                paciente,
                request.user,
                "No asiste a atención programada.",
            )

        alerta_abandono = paciente.estado == Paciente.Estado.INGRESADO and paciente.n_inasistencias >= 2
        payload = {
            "paciente": PacienteSerializer(paciente, context=self.get_serializer_context()).data,
            "alerta_abandono": alerta_abandono,
            "mensaje": (
                "Paciente tiene 2 inasistencias no justificadas. Evaluar marcar como ABANDONO."
                if alerta_abandono
                else ""
            ),
        }
        if inasistencia is not None:
            payload["inasistencia"] = InasistenciaPacienteSerializer(inasistencia).data
        return Response(payload, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path="reagendar-atencion",
        permission_classes=[PuedeProgramarAtencion],
    )
    def reagendar_atencion(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.proxima_atencion is None:
            return Response(
                {"detail": "El paciente no tiene una atención programada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReagendarAtencionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fecha_programada = self._fecha_programada_agenda(paciente, serializer)
        nueva_fecha = serializer.validated_data["nueva_fecha"]
        observacion = serializer.validated_data.get("observacion", "").strip()

        with transaction.atomic():
            RegistroAgendaPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                fecha_programada=fecha_programada,
                resultado=RegistroAgendaPaciente.Resultado.REAGENDADO,
                observacion=observacion,
                nueva_fecha=nueva_fecha,
            )
            paciente.proxima_atencion = nueva_fecha
            paciente.fecha_siguiente_cita = timezone.localdate(nueva_fecha)
            paciente.save(update_fields=["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"])
            self._crear_movimiento_agenda(
                paciente,
                request.user,
                "Atención reagendada.",
            )

        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="eliminar-cita",
        permission_classes=[PuedeProgramarAtencion],
    )
    def eliminar_cita(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if paciente.proxima_atencion is None:
            return Response(
                {"detail": "El paciente no tiene una atención programada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AgendaFechaSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fecha_programada = self._fecha_programada_agenda(paciente, serializer)
        observacion = serializer.validated_data.get("observacion", "").strip()

        with transaction.atomic():
            RegistroAgendaPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                fecha_programada=fecha_programada,
                resultado=RegistroAgendaPaciente.Resultado.CANCELADO,
                observacion=observacion,
            )
            paciente.proxima_atencion = None
            paciente.fecha_siguiente_cita = None
            paciente.save(update_fields=["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"])
            self._crear_movimiento_agenda(
                paciente,
                request.user,
                "Cita eliminada desde calendario.",
            )

        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="historial-completo")
    def historial_completo(self, request, pk=None):
        paciente = self.get_object()
        movimientos = MovimientoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        llamados = LlamadoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        inasistencias = InasistenciaPaciente.objects.filter(paciente=paciente).select_related("usuario")
        registros_agenda = RegistroAgendaPaciente.objects.filter(paciente=paciente).select_related("usuario")
        return Response(
            {
                "paciente": PacienteSerializer(paciente, context=self.get_serializer_context()).data,
                "movimientos": MovimientoPacienteSerializer(movimientos, many=True).data,
                "llamados": LlamadoPacienteSerializer(llamados, many=True).data,
                "inasistencias": InasistenciaPacienteSerializer(inasistencias, many=True).data,
                "registros_agenda": RegistroAgendaPacienteSerializer(registros_agenda, many=True).data,
            }
        )

    @action(detail=True, methods=["get"], url_path="historial-acciones")
    def historial_acciones(self, request, pk=None):
        paciente = self.get_object()
        movimientos = MovimientoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        llamados = LlamadoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        inasistencias = InasistenciaPaciente.objects.filter(paciente=paciente).select_related("usuario")
        registros_agenda = RegistroAgendaPaciente.objects.filter(paciente=paciente).select_related("usuario")
        acciones = []
        estado_labels = dict(Paciente.Estado.choices)

        for mov in movimientos:
            if mov.estado_anterior == mov.estado_nuevo and mov.notas in AGENDA_MOVIMIENTO_NOTAS:
                continue
            anterior = mov.estado_anterior
            nuevo = mov.estado_nuevo
            descripcion = (
                (
                    f"{estado_labels.get(anterior, 'Sin estado previo')} -> "
                    f"{estado_labels.get(nuevo, nuevo)}"
                )
                if anterior != nuevo
                else estado_labels.get(nuevo, nuevo)
            )
            acciones.append(
                {
                    "tipo": "CAMBIO_ESTADO",
                    "fecha": mov.fecha,
                    "usuario_nombre": mov.usuario.nombre if mov.usuario else None,
                    "titulo": "Cambio de estado",
                    "descripcion": descripcion,
                    "observacion": mov.notas,
                    "estado_anterior": anterior,
                    "estado_nuevo": nuevo,
                }
            )

        for llamado in llamados:
            titulo = (
                "Contacto confirmado"
                if llamado.resultado == LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO
                else "Contacto sin respuesta"
            )
            acciones.append(
                {
                    "tipo": "CONTACTO",
                    "fecha": llamado.fecha,
                    "usuario_nombre": llamado.usuario.nombre if llamado.usuario else None,
                    "titulo": titulo,
                    "descripcion": f"Resultado: {llamado.get_resultado_display()}",
                    "observacion": llamado.notas,
                    "estado_anterior": None,
                    "estado_nuevo": None,
                }
            )

        agenda_tipos = {
            RegistroAgendaPaciente.Resultado.ASISTIO: (
                "AGENDA_ASISTIO",
                "Asistió a atención",
                "Paciente asistió a la atención programada.",
            ),
            RegistroAgendaPaciente.Resultado.NO_ASISTIO: (
                "AGENDA_NO_ASISTIO",
                "No asistió a atención",
                "Paciente no asistió a la atención programada.",
            ),
            RegistroAgendaPaciente.Resultado.REAGENDADO: (
                "AGENDA_REAGENDADO",
                "Atención reagendada",
                "Se actualizó la fecha de atención.",
            ),
            RegistroAgendaPaciente.Resultado.CANCELADO: (
                "AGENDA_CANCELADO",
                "Cita eliminada",
                "Se eliminó la próxima atención programada.",
            ),
        }
        for registro in registros_agenda:
            tipo, titulo, descripcion = agenda_tipos[registro.resultado]
            acciones.append(
                {
                    "tipo": tipo,
                    "fecha": registro.creado_en,
                    "usuario_nombre": registro.usuario.nombre if registro.usuario else None,
                    "titulo": titulo,
                    "descripcion": descripcion,
                    "observacion": registro.observacion,
                    "estado_anterior": None,
                    "estado_nuevo": None,
                    "fecha_programada": registro.fecha_programada,
                    "nueva_fecha": registro.nueva_fecha,
                }
            )

        for inasistencia in inasistencias:
            fecha = timezone.make_aware(
                datetime.combine(inasistencia.fecha, datetime.min.time())
            )
            acciones.append(
                {
                    "tipo": "INASISTENCIA",
                    "fecha": fecha,
                    "usuario_nombre": inasistencia.usuario.nombre if inasistencia.usuario else None,
                    "titulo": "Inasistencia",
                    "descripcion": "Justificada" if inasistencia.justificada else "No justificada",
                    "observacion": inasistencia.motivo,
                    "estado_anterior": None,
                    "estado_nuevo": None,
                }
            )

        acciones.sort(key=lambda item: item["fecha"], reverse=True)
        return Response(
            {
                "paciente": PacienteSerializer(
                    paciente, context=self.get_serializer_context()
                ).data,
                "acciones": acciones,
            }
        )

    @action(detail=False, methods=["get"], url_path="alertas-operativas")
    def alertas_operativas(self, request):
        base = Paciente.objects.select_related("kine_asignado").prefetch_related(
            "llamados", "inasistencias"
        )
        grupos = {
            alerta: self._filtrar_alerta_operativa(base, alerta)
            for alerta in ALERTAS_OPERATIVAS
        }

        return Response(
            {
                nombre: self._serializar_grupo_alerta(queryset)
                for nombre, queryset in grupos.items()
            }
        )

    @action(detail=False, methods=["get"], url_path="exportar")
    def exportar(self, request):
        queryset = self.filter_queryset(self.get_queryset()).select_related(
            "kine_asignado", "importacion_origen"
        )
        filtros = {
            key: request.query_params.get(key, "")
            for key in [
                "categoria",
                "prioridad",
                "estado",
                "kine",
                "search",
                "mes",
                "anio",
                "importacion",
                "alerta",
                "sin_asignar",
                "asignados",
            ]
            if request.query_params.get(key)
        }
        workbook = crear_excel_pacientes(
            queryset,
            titulo="Listado operativo CCR",
            subtitulo="Exportación de lista de espera",
            filtros=filtros,
        )
        return excel_response(workbook, f"lista-espera-ccr-{fecha_archivo_hoy()}.xlsx")

    @action(
        detail=True,
        methods=["post", "delete"],
        url_path="programar-atencion",
        permission_classes=[PuedeProgramarAtencion],
    )
    def programar_atencion(self, request, pk=None):
        paciente = self.get_object()
        self.check_object_permissions(request, paciente)

        if request.method.lower() == "delete":
            paciente.proxima_atencion = None
            paciente.fecha_siguiente_cita = None
            paciente.save(update_fields=["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"])
            return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

        serializer = ProgramarAtencionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fecha_hora = serializer.validated_data["fecha_hora"]

        paciente.proxima_atencion = fecha_hora
        paciente.fecha_siguiente_cita = timezone.localdate(fecha_hora)
        paciente.save(update_fields=["proxima_atencion", "fecha_siguiente_cita", "actualizado_en"])
        return Response(PacienteSerializer(paciente, context=self.get_serializer_context()).data)

    @action(detail=False, methods=["post"], url_path="ingreso-masivo")
    def ingreso_masivo(self, request):
        if request.user.rol not in {
            Usuario.Rol.KINE,
            Usuario.Rol.ADMIN,
            Usuario.Rol.ADMINISTRATIVO,
        }:
            return Response({"detail": "Sin permiso."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data if isinstance(request.data, list) else request.data.get("pacientes", [])
        if not data:
            return Response({"detail": "Lista vacía."}, status=status.HTTP_400_BAD_REQUEST)

        creados: list[Paciente] = []
        errores: list[dict] = []
        duplicados = 0
        existentes = {
            (
                rut,
                fecha_derivacion,
                (diagnostico or "").upper().strip(),
            )
            for rut, fecha_derivacion, diagnostico in Paciente.objects.values_list(
                "rut", "fecha_derivacion", "diagnostico"
            )
        }

        for i, item in enumerate(data):
            try:
                rut = str(item.get("rut", "")).replace(".", "").replace("-", "").upper().strip()
                nombre = str(item.get("nombre", "")).strip()
                fecha_str = str(item.get("fecha_derivacion", "")).strip()
                edad = int(item.get("edad", 0) or 0)
                diagnostico = str(item.get("diagnostico", "")).strip()
                prioridad_raw = str(item.get("prioridad", "")).strip()
                desde = str(item.get("percapita_desde", "")).strip()
                profesional = str(item.get("profesional", "KINESIOLOGO")).strip()
                observaciones = str(item.get("observaciones", "")).strip()

                if not nombre or not rut or not fecha_str or not diagnostico:
                    raise ValueError(
                        "Campos obligatorios vacíos: nombre, rut, fecha, diagnóstico"
                    )

                fecha = None
                for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d"):
                    try:
                        fecha = datetime.strptime(fecha_str, fmt).date()
                        break
                    except ValueError:
                        continue
                if not fecha:
                    raise ValueError(f"Fecha inválida: {fecha_str}")

                prioridad = prioridad_normalizada(prioridad_raw)
                categoria = categoria_por_diagnostico(diagnostico, edad)
                mayor_60 = edad >= 60
                dup_key = (rut, fecha, diagnostico.upper().strip())

                if dup_key in existentes:
                    duplicados += 1
                    errores.append(
                        {"fila": i + 1, "motivo": f"Duplicado: {nombre} ({rut})"}
                    )
                    continue

                existentes.add(dup_key)
                creados.append(
                    Paciente(
                        id_ccr=f"TMP-{len(creados) + 1:07d}",
                        fecha_derivacion=fecha,
                        percapita_desde=desde,
                        nombre=nombre,
                        rut=rut,
                        edad=edad,
                        diagnostico=diagnostico,
                        profesional=profesional,
                        prioridad=prioridad,
                        categoria=categoria,
                        mayor_60=mayor_60,
                        observaciones=observaciones,
                    )
                )
            except Exception as exc:
                errores.append({"fila": i + 1, "motivo": str(exc)})

        importados = 0
        if creados:
            nuevos = Paciente.objects.bulk_create(creados, batch_size=200)
            for paciente in nuevos:
                Paciente.objects.filter(pk=paciente.pk).update(id_ccr=f"CCR-{paciente.pk:04d}")
            importados = len(nuevos)

        return Response(
            {
                "total": len(data),
                "importados": importados,
                "duplicados": duplicados,
                "errores": errores,
            }
        )

from rest_framework.views import APIView

class PerfilPacienteView(APIView):
    def get(self, request, rut):
        rut = rut.replace(".", "").replace("-", "").upper().strip()
        pacientes = Paciente.objects.filter(rut=rut).order_by("-fecha_derivacion")
        if not pacientes.exists():
            return Response({"detail": "Paciente no encontrado."}, status=status.HTTP_404_NOT_FOUND)
            
        latest = pacientes.first()
        today = timezone.now().date()
        
        derivaciones_data = []
        for p in pacientes:
            p_data = PacienteSerializer(p, context={"today": today}).data
            movimientos = MovimientoPaciente.objects.filter(paciente=p).select_related("usuario").order_by("-fecha")
            p_data["movimientos"] = MovimientoPacienteSerializer(movimientos, many=True).data
            derivaciones_data.append(p_data)
            
        return Response({
            "rut": latest.rut,
            "nombre": latest.nombre,
            "edad": latest.edad,
            "percapita_desde": latest.percapita_desde,
            "mayor_60": latest.mayor_60,
            "derivaciones": derivaciones_data
        })
