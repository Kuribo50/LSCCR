from datetime import date, datetime

from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.usuarios.models import Usuario

from .models import InasistenciaPaciente, LlamadoPaciente, MovimientoPaciente, Paciente
from .permissions import (
    PuedeAsignarPaciente,
    PuedeCambiarEstado,
    PuedeProgramarAtencion,
    PuedeRegistrarLlamado,
)
from .serializers import (
    CambiarEstadoSerializer,
    InasistenciaPacienteSerializer,
    LlamadoPacienteSerializer,
    MovimientoPacienteSerializer,
    PacienteCreateSerializer,
    PacienteSerializer,
    ProgramarAtencionSerializer,
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
                Paciente.Estado.ABANDONO
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
            nombre_kine = paciente.kine_asignado.nombre if paciente.kine_asignado else "otro kinesiólogo"
            return Response(
                {"detail": f"Este paciente ya fue tomado por {nombre_kine}. No puede asignarse dos veces."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paciente.kine_asignado = request.user

        # Ensure state transitions to PENDIENTE when kine takes the patient
        campos = ["kine_asignado", "actualizado_en"]
        if paciente.estado not in {
            Paciente.Estado.PENDIENTE,
            Paciente.Estado.RESCATE,
            Paciente.Estado.INGRESADO,
        }:
            paciente._movimiento_usuario = request.user
            paciente._movimiento_notas = "Asignado por kinesiólogo. Pasa a seguimiento."
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
        notas = serializer.validated_data["notas"]

        if request.user.rol == Usuario.Rol.ADMINISTRATIVO:
            if estado_nuevo not in {Paciente.Estado.INGRESADO, Paciente.Estado.RESCATE}:
                return Response(
                    {"detail": "Administrativo no puede cambiar a estados clínicos."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if estado_nuevo == Paciente.Estado.INGRESADO and paciente.kine_asignado_id is None:
                return Response(
                    {"detail": "No puede confirmar asistencia sin kinesiólogo asignado."},
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
                {"detail": "Debe existir un kinesiólogo asignado antes del llamado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if paciente.estado not in {Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE}:
            return Response(
                {"detail": "Solo se puede registrar llamado en estado PENDIENTE o RESCATE."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RegistrarLlamadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contesto = serializer.validated_data["contesto"]
        notas = serializer.validated_data["notas"]
        telefono_usado = serializer.validated_data.get("telefono_usado", "")
        proxima_accion = serializer.validated_data.get("proxima_accion", "")

        with transaction.atomic():
            LlamadoPaciente.objects.create(
                paciente=paciente,
                usuario=request.user,
                telefono_usado=telefono_usado or paciente.telefono,
                resultado=(
                    LlamadoPaciente.Resultado.CONTESTA_CONFIRMADO
                    if contesto
                    else LlamadoPaciente.Resultado.NO_CONTESTA
                ),
                notas=notas,
                proxima_accion=proxima_accion,
            )

            paciente._movimiento_usuario = request.user
            paciente._movimiento_notas = notas

            if contesto:
                paciente.estado = Paciente.Estado.INGRESADO
                paciente.fecha_cambio_estado = timezone.now()
                campos = ["estado", "fecha_cambio_estado", "actualizado_en"]
                if paciente.fecha_ingreso is None:
                    paciente.fecha_ingreso = timezone.localdate()
                    campos.append("fecha_ingreso")
            else:
                paciente.n_intentos_contacto += 1
                campos = ["n_intentos_contacto", "actualizado_en"]
                if paciente.n_intentos_contacto >= 2:
                    paciente.estado = Paciente.Estado.RESCATE
                    paciente.fecha_cambio_estado = timezone.now()
                    campos.extend(["estado", "fecha_cambio_estado"])

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

    @action(detail=True, methods=["get"], url_path="historial-completo")
    def historial_completo(self, request, pk=None):
        paciente = self.get_object()
        movimientos = MovimientoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        llamados = LlamadoPaciente.objects.filter(paciente=paciente).select_related("usuario")
        inasistencias = InasistenciaPaciente.objects.filter(paciente=paciente).select_related("usuario")
        return Response(
            {
                "paciente": PacienteSerializer(paciente, context=self.get_serializer_context()).data,
                "movimientos": MovimientoPacienteSerializer(movimientos, many=True).data,
                "llamados": LlamadoPacienteSerializer(llamados, many=True).data,
                "inasistencias": InasistenciaPacienteSerializer(inasistencias, many=True).data,
            }
        )

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
