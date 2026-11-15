import logging
from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.usuarios.models import Usuario

from .exports import crear_excel_pacientes, excel_response, fecha_archivo_hoy
from .models import (
    ActividadGrupal,
    GrupoPacientes,
    MovimientoGrupo,
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    ParticipanteActividad,
    RegistroAgendaPaciente,
)
from .permissions import (
    PuedeAsignarPaciente,
    PuedeCambiarEstado,
    PuedeGestionarActividadGrupal,
    PuedeProgramarAtencion,
    PuedeRegistrarLlamado,
)
from .serializers import (
    ActividadGrupalSerializer,
    AsistenciaActividadSerializer,
    GrupoPacientesSerializer,
    MiembrosGrupoSerializer,
    validar_pacientes_para_grupo,
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
    DeshacerLlamadoSerializer,
)
from .llamados import ESTADOS_EN_COLA, deshacer_llamado, registrar_llamado as registrar_llamado_servicio
from .services import (
    ESTADOS_FINALES,
    categoria_por_diagnostico,
    estado_requiere_nota,
    prioridad_normalizada,
    validar_transicion_estado,
)
from .utils import normalizar_rut

logger = logging.getLogger(__name__)


ORDEN_PRIORIDAD = Case(
    When(prioridad=Paciente.Prioridad.ALTA, then=Value(0)),
    When(prioridad=Paciente.Prioridad.MEDIANA, then=Value(1)),
    When(prioridad=Paciente.Prioridad.MODERADA, then=Value(2)),
    When(prioridad=Paciente.Prioridad.LICENCIA_MEDICA, then=Value(3)),
    default=Value(4),
    output_field=IntegerField(),
)

# Alertas que alimentan el dashboard y links rapidos del frontend. El nombre de
# cada item tambien viaja como query param `alerta`, por eso no debe cambiarse
# sin actualizar la UI.
ALERTAS_OPERATIVAS = (
    "alta_sin_responsable",
    "sobre_90_dias",
    "pendientes_con_1_intento",
    "rescates_activos",
    "ingresados_sin_proxima_atencion",
    "posible_abandono",
    "telefonos_incompletos",
)

ESTADOS_LISTA_ESPERA = [
    Paciente.Estado.PENDIENTE,
    Paciente.Estado.RESCATE,
]

# Notas generadas por agenda para no duplicar esos eventos en el timeline
# cuando ya existe un RegistroAgendaPaciente equivalente.
AGENDA_MOVIMIENTO_NOTAS = {
    "Paciente asistió a atención programada.",
    "No asiste a atención programada.",
    "Atención reagendada.",
    "Cita eliminada desde calendario.",
}



def _q_iexact_varios(campo, valor):
    """Filtro sin distinguir mayusculas que acepta varios valores separados por coma."""
    filtro = Q()
    for item in (v.strip() for v in valor.split(",")):
        if item:
            filtro |= Q(**{f"{campo}__iexact": item})
    return filtro

class PacienteViewSet(viewsets.ModelViewSet):
    """API principal de pacientes.

    Este ViewSet concentra lista de espera, busqueda, asignacion, cambios de
    estado, contactabilidad, agenda, exportacion e historial. Evitar cambiar
    rutas `url_path` porque el frontend las consume directamente.
    """

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

    @action(detail=False, methods=["get"], url_path="dashboard-resumen")
    def dashboard_resumen(self, request):
        estados_activos = [
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        ]
        base = Paciente.objects.all()
        visible = (
            base.filter(kine_asignado=request.user)
            if request.user.rol == Usuario.Rol.KINE
            else base
        )
        activos_asignados = Q(kine_asignado__isnull=False) & ~Q(
            estado__in=ESTADOS_FINALES
        )
        activos_mios = Q(kine_asignado=request.user) & ~Q(estado__in=ESTADOS_FINALES)
        cola_base = Q(estado__in=ESTADOS_LISTA_ESPERA)
        responsable_cola = (
            Q(kine_asignado=request.user)
            if request.user.rol == Usuario.Rol.KINE
            else Q(kine_asignado__isnull=False)
        )
        cola_filtro = cola_base & responsable_cola
        por_citar_filtro = (
            Q(estado=Paciente.Estado.INGRESADO, proxima_atencion__isnull=True) & responsable_cola
        )

        resumen_visible = visible.aggregate(
            lista_activa=Count("id", filter=Q(estado__in=estados_activos)),
            pendientes=Count("id", filter=Q(estado=Paciente.Estado.PENDIENTE)),
            rescate=Count("id", filter=Q(estado=Paciente.Estado.RESCATE)),
            ingresados=Count("id", filter=Q(estado=Paciente.Estado.INGRESADO)),
            egresados=Count("id", filter=Q(estado__in=ESTADOS_FINALES)),
            agenda_hoy=Count(
                "id",
                filter=Q(
                    estado__in=estados_activos,
                    proxima_atencion__date=timezone.localdate(),
                ),
            ),
        )
        resumen_global = base.aggregate(
            lista_espera_global=Count("id", filter=cola_base),
            sin_asignar=Count("id", filter=Q(kine_asignado__isnull=True)),
            asignados_activos=Count("id", filter=activos_asignados),
            mios_activos=Count("id", filter=activos_mios),
            rescates_globales=Count("id", filter=Q(estado=Paciente.Estado.RESCATE)),
            cola_llamados=Count("id", filter=cola_filtro),
            por_citar=Count("id", filter=por_citar_filtro),
        )

        return Response({**resumen_visible, **resumen_global})

    @action(detail=False, methods=["get"], url_path="agenda-resumen")
    def agenda_resumen(self, request):
        mes_param = request.query_params.get("mes")
        try:
            if mes_param:
                inicio = datetime.strptime(mes_param, "%Y-%m").date().replace(day=1)
            else:
                hoy = timezone.localdate()
                inicio = date(hoy.year, hoy.month, 1)
        except ValueError:
            logger.warning("agenda_resumen: formato de mes invalido — %s", mes_param)
            return Response(
                {"detail": "El mes debe tener formato YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fin = (
            date(inicio.year + 1, 1, 1)
            if inicio.month == 12
            else date(inicio.year, inicio.month + 1, 1)
        )
        estados_visibles = [
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        ]
        queryset = Paciente.objects.filter(
            estado__in=estados_visibles,
            proxima_atencion__date__gte=inicio,
            proxima_atencion__date__lt=fin,
        )
        if request.user.rol == Usuario.Rol.KINE:
            queryset = queryset.filter(kine_asignado=request.user)

        dias = (
            queryset.annotate(fecha=TruncDate("proxima_atencion"))
            .values("fecha")
            .annotate(total=Count("id"))
            .order_by("fecha")
        )

        return Response(
            [
                {"fecha": item["fecha"].isoformat(), "total": item["total"]}
                for item in dias
            ]
        )

    def destroy(self, request, *args, **kwargs):
        if request.user.rol != Usuario.Rol.ADMIN:
            return Response(
                {"error": "Solo los administradores pueden eliminar pacientes."},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    def filter_queryset(self, queryset):
        """Aplica filtros usados por tablas, buscador global, exportacion y reportes.

        `estado` acepta un valor o una lista separada por coma, por ejemplo
        `PENDIENTE,RESCATE`, que es el alcance operativo de lista de espera.
        """
        queryset = super().filter_queryset(queryset)
        params = self.request.query_params
        categoria = params.get("categoria")
        sector_cesfam = params.get("sector_cesfam")
        sector_oficial = params.get("sector_oficial")
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
            # Acepta una categoria o varias separadas por coma (multiseleccion).
            categorias = [item.strip() for item in categoria.split(",") if item.strip()]
            queryset = queryset.filter(categoria__in=categorias)
        if sector_cesfam:
            queryset = queryset.filter(_q_iexact_varios("sector_cesfam", sector_cesfam))
        if sector_oficial:
            queryset = queryset.filter(_q_iexact_varios("sector_oficial", sector_oficial))
        if prioridad:
            prioridades = [item.strip() for item in prioridad.split(",") if item.strip()]
            queryset = queryset.filter(prioridad__in=prioridades)
        if estado:
            estados = [item.strip() for item in estado.split(",") if item.strip()]
            if len(estados) > 1:
                queryset = queryset.filter(estado__in=estados)
            else:
                queryset = queryset.filter(estado=estados[0])
        if kine:
            # Varios kines separados por coma; "SIN_ASIGNAR" incluye a los sin responsable.
            valores = [item.strip() for item in kine.split(",") if item.strip()]
            ids = [v for v in valores if v.isdigit()]
            filtro_kine = Q(kine_asignado_id__in=ids)
            if "SIN_ASIGNAR" in valores:
                filtro_kine |= Q(kine_asignado__isnull=True)
            queryset = queryset.filter(filtro_kine)
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
            # Busqueda amplia compartida por listado y buscador global:
            # permite encontrar por identidad, diagnostico, sectores,
            # responsable CCR, procedencia y observaciones.
            search_clean = normalizar_rut(search)
            prioridad_matches = [
                value
                for value, label in Paciente.Prioridad.choices
                if search.lower() in value.lower() or search.lower() in label.lower()
            ]
            categoria_matches = [
                value
                for value, label in Paciente.Categoria.choices
                if search.lower() in value.lower() or search.lower() in label.lower()
            ]
            estado_matches = [
                value
                for value, label in Paciente.Estado.choices
                if search.lower() in value.lower() or search.lower() in label.lower()
            ]
            search_filter = (
                Q(nombre__icontains=search)
                | Q(rut__icontains=search)
                | Q(rut__icontains=search_clean)
                | Q(id_ccr__icontains=search)
                | Q(diagnostico__icontains=search)
                | Q(sector_cesfam__icontains=search)
                | Q(sector_oficial__icontains=search)
                | Q(kine_asignado__nombre__icontains=search)
                | Q(profesional__icontains=search)
                | Q(percapita_desde__icontains=search)
                | Q(observaciones__icontains=search)
            )
            if prioridad_matches:
                search_filter |= Q(prioridad__in=prioridad_matches)
            if categoria_matches:
                search_filter |= Q(categoria__in=categoria_matches)
            if estado_matches:
                search_filter |= Q(estado__in=estado_matches)
            queryset = queryset.filter(search_filter)
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

        # El administrativo participa en contacto/rescate, pero no debe cerrar
        # estados clinicos salvo egreso administrativo documentado.
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

        # Estos atributos temporales son leidos por señales/modelos para dejar
        # una bitacora de MovimientoPaciente junto al cambio de estado.
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
        serializer = RegistrarLlamadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        registrar_llamado_servicio(paciente, request.user, serializer.validated_data)
        # Se vuelve a leer para que ultimo_llamado e intentos reflejen el llamado nuevo.
        actualizado = self.get_queryset().get(pk=paciente.pk)
        return Response(PacienteSerializer(actualizado, context=self.get_serializer_context()).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="deshacer-llamado",
        permission_classes=[PuedeRegistrarLlamado],
    )
    def deshacer_llamado(self, request, pk=None):
        paciente = self.get_object()
        serializer = DeshacerLlamadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deshacer_llamado(paciente, request.user, serializer.validated_data["llamado_id"])
        actualizado = self.get_queryset().get(pk=paciente.pk)
        return Response(PacienteSerializer(actualizado, context=self.get_serializer_context()).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="cola-llamados",
        permission_classes=[PuedeRegistrarLlamado],
    )
    def cola_llamados(self, request):
        """Pacientes a llamar, sin paginar: lista de espera y ingresados sin cita.

        Solo pacientes con responsable; un KINE ve solo su cartera.
        """
        base = self.get_queryset().filter(kine_asignado__isnull=False)
        if request.user.rol == Usuario.Rol.KINE:
            base = base.filter(kine_asignado=request.user)
        orden = base.annotate(orden_prioridad=ORDEN_PRIORIDAD).order_by("orden_prioridad", "fecha_derivacion")
        contexto = self.get_serializer_context()
        return Response(
            {
                "por_contactar": PacienteSerializer(
                    orden.filter(estado__in=ESTADOS_EN_COLA), many=True, context=contexto
                ).data,
                "por_citar": PacienteSerializer(
                    orden.filter(estado=Paciente.Estado.INGRESADO, proxima_atencion__isnull=True),
                    many=True,
                    context=contexto,
                ).data,
            }
        )

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
            # Solo las no justificadas suman para la alerta de posible abandono.
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
            # Una asistencia a cita programada confirma ingreso aunque el
            # paciente estuviera pendiente o en rescate.
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
            # Para pacientes aun no ingresados, se registra el evento de agenda
            # pero no se suma inasistencia clinica.
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

        fechas_inasistencia_agenda = {
            registro.fecha_programada.date()
            for registro in registros_agenda
            if registro.resultado == RegistroAgendaPaciente.Resultado.NO_ASISTIO
        }
        for inasistencia in inasistencias:
            if inasistencia.fecha in fechas_inasistencia_agenda:
                continue
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

        participaciones = ParticipanteActividad.objects.filter(
            paciente=paciente
        ).select_related("actividad", "actividad__responsable")
        for participacion in participaciones:
            actividad = participacion.actividad
            detalle = [f"Asistencia: {participacion.get_asistencia_display()}"]
            if actividad.estado == ActividadGrupal.Estado.CANCELADA:
                detalle = ["Actividad cancelada"]
            if actividad.lugar:
                detalle.append(actividad.lugar)
            acciones.append(
                {
                    "tipo": "ACTIVIDAD_GRUPAL",
                    "fecha": actividad.fecha_hora,
                    "usuario_nombre": actividad.responsable.nombre if actividad.responsable else None,
                    "titulo": actividad.nombre,
                    "descripcion": " · ".join(detalle),
                    "observacion": actividad.descripcion,
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

    @action(detail=False, methods=["get"], url_path="riesgo-abandono")
    def riesgo_abandono(self, request):
        """Score heuristico (0-100) de riesgo de abandono por paciente activo.

        Combina inasistencias, intentos de contacto, estado de rescate, telefono
        incompleto, meses en espera y antiguedad (>90 dias). KINE ve solo su
        cartera; admin/administrativo ven a todos. Sin ML.
        """
        hoy = timezone.localdate()
        estados_activos = [
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        ]
        qs = self.get_queryset().filter(estado__in=estados_activos)
        if request.user.rol == Usuario.Rol.KINE:
            qs = qs.filter(kine_asignado=request.user)

        conteo = {"ALTO": 0, "MEDIO": 0, "BAJO": 0}
        evaluados = []
        for paciente in qs:
            score = 0
            factores = []

            if paciente.n_inasistencias:
                score += min(paciente.n_inasistencias, 5) * 14
                factores.append(
                    f"{paciente.n_inasistencias} inasistencia"
                    f"{'s' if paciente.n_inasistencias != 1 else ''}"
                )
            if paciente.n_intentos_contacto:
                score += min(paciente.n_intentos_contacto, 4) * 7
                factores.append(
                    f"{paciente.n_intentos_contacto} intento"
                    f"{'s' if paciente.n_intentos_contacto != 1 else ''} de contacto"
                )
            if paciente.estado == Paciente.Estado.RESCATE:
                score += 18
                factores.append("En rescate")
            if not (paciente.telefono or paciente.telefono_recados):
                score += 14
                factores.append("Sin teléfono")
            if paciente.n_meses_espera and paciente.n_meses_espera > 1:
                score += min(paciente.n_meses_espera, 6) * 3
                factores.append(f"{paciente.n_meses_espera} meses en espera")
            if paciente.fecha_derivacion:
                dias_lista = (hoy - paciente.fecha_derivacion).days
                if dias_lista > 0:
                    # Antiguedad continua: a mas tiempo esperando, mas riesgo.
                    score += min(dias_lista // 12, 40)
                    if dias_lista >= 90:
                        factores.append(f"{dias_lista} días en lista")

            score = min(score, 100)
            if score >= 50:
                nivel = "ALTO"
            elif score >= 28:
                nivel = "MEDIO"
            else:
                nivel = "BAJO"
            conteo[nivel] += 1
            evaluados.append((score, nivel, factores, paciente))

        evaluados.sort(key=lambda item: item[0], reverse=True)

        contexto = self.get_serializer_context()
        pacientes_data = []
        for score, nivel, factores, paciente in evaluados[:120]:
            data = PacienteSerializer(paciente, context=contexto).data
            data["riesgo_score"] = score
            data["riesgo_nivel"] = nivel
            data["riesgo_factores"] = factores
            pacientes_data.append(data)

        return Response(
            {
                "resumen": {
                    "alto": conteo["ALTO"],
                    "medio": conteo["MEDIO"],
                    "bajo": conteo["BAJO"],
                    "total": len(evaluados),
                },
                "pacientes": pacientes_data,
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
                "sector_cesfam",
                "sector_oficial",
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

        MAX_BATCH_SIZE = 500
        if len(data) > MAX_BATCH_SIZE:
            return Response(
                {"detail": f"El máximo de registros por lote es {MAX_BATCH_SIZE}. Se recibieron {len(data)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            "ingreso_masivo: usuario=%s inicia lote de %d registros",
            request.user.username,
            len(data),
        )

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
                rut = normalizar_rut(str(item.get("rut", "")))
                nombre = str(item.get("nombre", "")).strip()
                fecha_str = str(item.get("fecha_derivacion", "")).strip()
                edad = int(item.get("edad", 0) or 0)
                diagnostico = str(item.get("diagnostico", "")).strip()
                prioridad_raw = str(item.get("prioridad", "")).strip()
                desde = str(item.get("percapita_desde", "")).strip()
                sector_oficial = str(item.get("sector_oficial", "")).strip().upper()
                sector_cesfam = str(item.get("sector_cesfam", "")).strip().upper()
                asignado_historico = str(item.get("asignado_historico", "")).strip().upper() in {
                    "SI",
                    "S",
                    "1",
                    "TRUE",
                    "X",
                }
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
                        sector_oficial=sector_oficial,
                        sector_cesfam=sector_cesfam,
                        asignado_historico=asignado_historico,
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
                logger.warning(
                    "ingreso_masivo: fila %d fallo — %s", i + 1, exc,
                )
                errores.append({"fila": i + 1, "motivo": str(exc)})

        importados = 0
        if creados:
            nuevos = Paciente.objects.bulk_create(creados, batch_size=200)
            for paciente in nuevos:
                Paciente.objects.filter(pk=paciente.pk).update(id_ccr=f"CCR-{paciente.pk:04d}")
            importados = len(nuevos)

        logger.info(
            "ingreso_masivo: completado — %d importados, %d duplicados, %d errores de %d total",
            importados,
            duplicados,
            len(errores),
            len(data),
        )

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
        rut = normalizar_rut(rut)
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
            "sector_oficial": latest.sector_oficial,
            "sector_cesfam": latest.sector_cesfam,
            "mayor_60": latest.mayor_60,
            "derivaciones": derivaciones_data
        })



class ActividadGrupalViewSet(viewsets.ModelViewSet):
    """Actividades grupales: una fecha y hora a la que asisten varios pacientes.

    Filtros: `desde` y `hasta` (YYYY-MM-DD), `paciente` (id) y `estado`
    (uno o varios separados por coma). Un KINE ve las actividades que dirige o
    donde participa alguno de sus pacientes.
    """

    serializer_class = ActividadGrupalSerializer
    permission_classes = [PuedeGestionarActividadGrupal]

    def get_queryset(self):
        qs = ActividadGrupal.objects.select_related("responsable", "creado_por", "grupo").prefetch_related(
            "participantes__paciente"
        )
        user = self.request.user
        if user.rol == Usuario.Rol.KINE:
            qs = qs.filter(
                Q(responsable=user) | Q(creado_por=user) | Q(participantes__paciente__kine_asignado=user)
            ).distinct()
        params = self.request.query_params
        desde = params.get("desde")
        hasta = params.get("hasta")
        paciente = params.get("paciente")
        estado = params.get("estado")
        try:
            if desde:
                qs = qs.filter(fecha_hora__date__gte=date.fromisoformat(desde))
            if hasta:
                qs = qs.filter(fecha_hora__date__lte=date.fromisoformat(hasta))
        except ValueError:
            pass
        if paciente and paciente.isdigit():
            qs = qs.filter(participantes__paciente_id=paciente)
        if estado:
            qs = qs.filter(estado__in=[e.strip() for e in estado.split(",") if e.strip()])
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        responsable = serializer.validated_data.get("responsable")
        if user.rol == Usuario.Rol.KINE or responsable is None:
            responsable = user
        actividad = serializer.save(creado_por=user, responsable=responsable)
        if actividad.grupo_id:
            fecha = timezone.localtime(actividad.fecha_hora)
            registrar_movimiento_grupo(
                actividad.grupo,
                user,
                MovimientoGrupo.Tipo.CITADO,
                f"{actividad.nombre} · {fecha:%d-%m-%Y %H:%M} · {actividad.participantes.count()} pacientes",
            )

    def perform_update(self, serializer):
        if self.request.user.rol == Usuario.Rol.KINE:
            serializer.save(responsable=serializer.instance.responsable)
        else:
            serializer.save()

    @action(detail=True, methods=["post"], url_path="asistencia")
    def asistencia(self, request, pk=None):
        actividad = self.get_object()
        serializer = AsistenciaActividadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        participante = actividad.participantes.filter(
            paciente_id=serializer.validated_data["paciente_id"]
        ).first()
        if participante is None:
            return Response(
                {"error": "El paciente no participa en esta actividad."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participante.asistencia = serializer.validated_data["asistencia"]
        participante.save(update_fields=["asistencia"])
        actividad = self.get_queryset().get(pk=actividad.pk)
        return Response(self.get_serializer(actividad).data)



def registrar_movimiento_grupo(grupo, usuario, tipo, descripcion=""):
    MovimientoGrupo.objects.create(grupo=grupo, usuario=usuario, tipo=tipo, descripcion=descripcion)


def _nombres_pacientes(ids):
    nombres = list(Paciente.objects.filter(id__in=ids).order_by("nombre").values_list("nombre", flat=True))
    texto = ", ".join(n.title() for n in nombres[:4])
    return f"{texto} y {len(nombres) - 4} más" if len(nombres) > 4 else texto


class GrupoPacientesViewSet(viewsets.ModelViewSet):
    """Grupos guardados de pacientes para citarlos juntos.

    Por defecto lista solo grupos activos; `?incluir_inactivos=1` muestra
    tambien los archivados. Un KINE ve los grupos que dirige o creo.
    """

    serializer_class = GrupoPacientesSerializer
    permission_classes = [PuedeGestionarActividadGrupal]

    def get_queryset(self):
        qs = GrupoPacientes.objects.select_related("responsable").prefetch_related(
            "miembros__paciente__kine_asignado"
        )
        user = self.request.user
        if user.rol == Usuario.Rol.KINE:
            qs = qs.filter(Q(responsable=user) | Q(creado_por=user))
        params = self.request.query_params
        if self.action == "list" and params.get("incluir_inactivos") not in {"1", "true"}:
            qs = qs.filter(activo=True)
        paciente = params.get("paciente")
        if paciente and paciente.isdigit():
            # Un paciente puede estar en varios grupos a la vez.
            qs = qs.filter(miembros__paciente_id=paciente).distinct()
        return qs

    def perform_create(self, serializer):
        user = self.request.user
        responsable = serializer.validated_data.get("responsable")
        if user.rol == Usuario.Rol.KINE or responsable is None:
            responsable = user
        grupo = serializer.save(creado_por=user, responsable=responsable)
        total = grupo.miembros.count()
        registrar_movimiento_grupo(
            grupo, user, MovimientoGrupo.Tipo.CREADO,
            f"{grupo.get_tipo_display()} con {total} paciente{'s' if total != 1 else ''}",
        )

    def perform_update(self, serializer):
        user = self.request.user
        grupo = serializer.instance
        antes = {
            "nombre": grupo.nombre,
            "descripcion": grupo.descripcion,
            "tipo": grupo.get_tipo_display(),
            "vigente_hasta": grupo.vigente_hasta,
            "responsable": grupo.responsable.nombre if grupo.responsable else None,
            "activo": grupo.activo,
            "miembros": set(grupo.miembros.values_list("paciente_id", flat=True)),
        }
        if user.rol == Usuario.Rol.KINE:
            grupo = serializer.save(responsable=grupo.responsable)
        else:
            grupo = serializer.save()

        cambios = []
        if antes["nombre"] != grupo.nombre:
            cambios.append(f"nombre: {antes['nombre']} → {grupo.nombre}")
        if antes["descripcion"] != grupo.descripcion:
            cambios.append("descripción actualizada")
        if antes["tipo"] != grupo.get_tipo_display():
            cambios.append(f"tipo: {antes['tipo']} → {grupo.get_tipo_display()}")
        if antes["vigente_hasta"] != grupo.vigente_hasta and grupo.vigente_hasta:
            cambios.append(f"vigente hasta {grupo.vigente_hasta:%d-%m-%Y}")
        responsable = grupo.responsable.nombre if grupo.responsable else None
        if antes["responsable"] != responsable:
            cambios.append(f"responsable: {responsable or 'sin responsable'}")
        if cambios:
            registrar_movimiento_grupo(grupo, user, MovimientoGrupo.Tipo.EDITADO, (lambda t: t[:1].upper() + t[1:])("; ".join(cambios)))

        if antes["activo"] != grupo.activo:
            registrar_movimiento_grupo(
                grupo, user, MovimientoGrupo.Tipo.REACTIVADO if grupo.activo else MovimientoGrupo.Tipo.ARCHIVADO
            )

        despues = set(grupo.miembros.values_list("paciente_id", flat=True))
        if despues - antes["miembros"]:
            registrar_movimiento_grupo(
                grupo, user, MovimientoGrupo.Tipo.MIEMBROS_AGREGADOS, _nombres_pacientes(despues - antes["miembros"])
            )
        if antes["miembros"] - despues:
            registrar_movimiento_grupo(
                grupo, user, MovimientoGrupo.Tipo.MIEMBROS_QUITADOS, _nombres_pacientes(antes["miembros"] - despues)
            )

    def _respuesta(self, grupo):
        grupo = self.get_queryset().model.objects.prefetch_related(
            "miembros__paciente__kine_asignado"
        ).select_related("responsable").get(pk=grupo.pk)
        return Response(self.get_serializer(grupo).data)

    @action(detail=True, methods=["post"], url_path="agregar")
    def agregar(self, request, pk=None):
        grupo = self.get_object()
        serializer = MiembrosGrupoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = validar_pacientes_para_grupo(serializer.validated_data["paciente_ids"], request)
        nuevos = set(ids) - set(grupo.miembros.values_list("paciente_id", flat=True))
        GrupoPacientesSerializer.guardar_miembros(grupo, ids, reemplazar=False)
        if nuevos:
            registrar_movimiento_grupo(grupo, request.user, MovimientoGrupo.Tipo.MIEMBROS_AGREGADOS, _nombres_pacientes(nuevos))
        return self._respuesta(grupo)

    @action(detail=True, methods=["post"], url_path="quitar")
    def quitar(self, request, pk=None):
        grupo = self.get_object()
        serializer = MiembrosGrupoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quitar = grupo.miembros.filter(paciente_id__in=serializer.validated_data["paciente_ids"])
        ids = list(quitar.values_list("paciente_id", flat=True))
        quitar.delete()
        if ids:
            registrar_movimiento_grupo(grupo, request.user, MovimientoGrupo.Tipo.MIEMBROS_QUITADOS, _nombres_pacientes(ids))
        return self._respuesta(grupo)

    @action(detail=True, methods=["get"], url_path="historial")
    def historial(self, request, pk=None):
        """Movimientos del grupo y actividades a las que fue citado (con asistencia)."""
        grupo = self.get_object()
        movimientos = [
            {
                "tipo": m.tipo,
                "titulo": m.get_tipo_display(),
                "descripcion": m.descripcion,
                "usuario_nombre": m.usuario.nombre if m.usuario else None,
                "fecha": m.fecha,
            }
            for m in grupo.movimientos.select_related("usuario")
        ]
        actividades = ActividadGrupal.objects.filter(grupo=grupo).select_related("responsable").prefetch_related(
            "participantes__paciente"
        ).order_by("-fecha_hora")
        return Response(
            {
                "movimientos": movimientos,
                "actividades": ActividadGrupalSerializer(actividades, many=True, context=self.get_serializer_context()).data,
            }
        )
