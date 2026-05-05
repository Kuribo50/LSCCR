from datetime import date, timedelta

from django.db.models import Count
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.pacientes.models import Paciente
from apps.usuarios.models import Usuario


MESES = {
    1: "Enero",
    2: "Febrero",
    3: "Marzo",
    4: "Abril",
    5: "Mayo",
    6: "Junio",
    7: "Julio",
    8: "Agosto",
    9: "Septiembre",
    10: "Octubre",
    11: "Noviembre",
    12: "Diciembre",
}

ESTADOS_FINALES = {
    Paciente.Estado.ALTA_MEDICA,
    Paciente.Estado.EGRESO_VOLUNTARIO,
    Paciente.Estado.ABANDONO,
    Paciente.Estado.DERIVADO,
}

ESTADOS_ACTIVOS = {
    Paciente.Estado.PENDIENTE,
    Paciente.Estado.RESCATE,
    Paciente.Estado.INGRESADO,
}


def obtener_mes_anio(request):
    hoy = date.today()
    try:
        mes = int(request.query_params.get("mes", hoy.month))
        anio = int(request.query_params.get("año", request.query_params.get("anio", hoy.year)))
    except ValueError:
        mes = hoy.month
        anio = hoy.year

    if mes < 1 or mes > 12:
        mes = hoy.month
    return mes, anio


def obtener_anio(request):
    hoy = date.today()
    try:
        return int(request.query_params.get("anio", hoy.year))
    except ValueError:
        return hoy.year


def periodo_label(mes, anio):
    return f"{MESES[mes]} {anio}"


def filtrar_mes(queryset, campo, mes, anio):
    return queryset.filter(**{f"{campo}__month": mes, f"{campo}__year": anio})


def promedio_dias(pacientes, inicio_attr, fin_attr):
    dias = []
    for paciente in pacientes:
        inicio = getattr(paciente, inicio_attr)
        fin = getattr(paciente, fin_attr)
        if inicio and fin:
            dias.append((fin - inicio).days)
    if not dias:
        return 0
    return round(sum(dias) / len(dias), 1)


def promedio_dias_desde_derivacion(pacientes, hoy=None):
    hoy = hoy or date.today()
    dias = [(hoy - paciente.fecha_derivacion).days for paciente in pacientes]
    if not dias:
        return 0
    return round(sum(dias) / len(dias), 1)


def conteo_estado(queryset, estado):
    return queryset.filter(estado=estado).count()


def resumen_corte(corte, hoy=None):
    hoy = hoy or date.today()
    activos = corte.filter(estado__in=ESTADOS_ACTIVOS)
    return {
        "total_derivados": corte.count(),
        "pendientes": conteo_estado(corte, Paciente.Estado.PENDIENTE),
        "rescate": conteo_estado(corte, Paciente.Estado.RESCATE),
        "ingresados_actuales": conteo_estado(corte, Paciente.Estado.INGRESADO),
        "altas_medicas": conteo_estado(corte, Paciente.Estado.ALTA_MEDICA),
        "egresos_voluntarios": conteo_estado(corte, Paciente.Estado.EGRESO_VOLUNTARIO),
        "abandonos": conteo_estado(corte, Paciente.Estado.ABANDONO),
        "derivados": conteo_estado(corte, Paciente.Estado.DERIVADO),
        "sin_responsable": corte.filter(kine_asignado__isnull=True).count(),
        "con_responsable": corte.filter(kine_asignado__isnull=False).count(),
        "sobre_90_dias": corte.filter(
            estado__in=[Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE],
            fecha_derivacion__lt=hoy - timedelta(days=90),
        ).count(),
        "promedio_dias_en_lista_actual": promedio_dias_desde_derivacion(activos, hoy),
    }


def resumen_actividad_mes(mes, anio, queryset=None):
    if queryset is None:
        queryset = Paciente.objects.all()
    ingresos = filtrar_mes(queryset.exclude(fecha_ingreso__isnull=True), "fecha_ingreso", mes, anio)
    egresos = filtrar_mes(
        queryset.filter(estado__in=ESTADOS_FINALES).exclude(fecha_egreso__isnull=True),
        "fecha_egreso",
        mes,
        anio,
    )
    return {
        "ingresos": ingresos.count(),
        "egresos_total": egresos.count(),
        "altas_medicas": conteo_estado(egresos, Paciente.Estado.ALTA_MEDICA),
        "egresos_voluntarios": conteo_estado(egresos, Paciente.Estado.EGRESO_VOLUNTARIO),
        "abandonos": conteo_estado(egresos, Paciente.Estado.ABANDONO),
        "derivados": conteo_estado(egresos, Paciente.Estado.DERIVADO),
        "promedio_dias_hasta_ingreso": promedio_dias(ingresos, "fecha_derivacion", "fecha_ingreso"),
    }


def distribucion_por_choice(queryset, campo, choices, key):
    conteos = {
        item[campo]: item["total"]
        for item in queryset.values(campo).annotate(total=Count("id"))
    }
    return [
        {key: valor, "label": label, "total": conteos.get(valor, 0)}
        for valor, label in choices
    ]


class ResumenReporteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mes, anio = obtener_mes_anio(request)
        hoy = date.today()
        corte = Paciente.objects.filter(fecha_derivacion__month=mes, fecha_derivacion__year=anio)
        return Response(
            {
                "mes": mes,
                "anio": anio,
                "periodo_label": periodo_label(mes, anio),
                "corte": resumen_corte(corte, hoy),
                "actividad_mes": resumen_actividad_mes(mes, anio),
                "por_estado": distribucion_por_choice(
                    corte, "estado", Paciente.Estado.choices, "estado"
                ),
                "por_prioridad": distribucion_por_choice(
                    corte, "prioridad", Paciente.Prioridad.choices, "prioridad"
                ),
                "por_categoria": distribucion_por_choice(
                    corte, "categoria", Paciente.Categoria.choices, "categoria"
                ),
            }
        )


class PorKineReporteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        mes, anio = obtener_mes_anio(request)
        hoy = date.today()
        corte = Paciente.objects.filter(fecha_derivacion__month=mes, fecha_derivacion__year=anio)
        responsables = []

        for kine in Usuario.objects.filter(rol=Usuario.Rol.KINE).order_by("nombre"):
            corte_kine = corte.filter(kine_asignado=kine)
            ingresos_mes = filtrar_mes(
                Paciente.objects.filter(kine_asignado=kine).exclude(fecha_ingreso__isnull=True),
                "fecha_ingreso",
                mes,
                anio,
            )
            egresos_mes = filtrar_mes(
                Paciente.objects.filter(kine_asignado=kine, estado__in=ESTADOS_FINALES).exclude(
                    fecha_egreso__isnull=True
                ),
                "fecha_egreso",
                mes,
                anio,
            )
            activos_corte = corte_kine.filter(estado__in=ESTADOS_ACTIVOS)
            responsables.append(
                {
                    "responsable_id": kine.id,
                    "responsable_nombre": kine.nombre,
                    "kine_asignado": kine.id,
                    "kine_asignado__nombre": kine.nombre,
                    "total_asignados_corte": corte_kine.count(),
                    "total": corte_kine.count(),
                    "pendientes": conteo_estado(corte_kine, Paciente.Estado.PENDIENTE),
                    "rescate": conteo_estado(corte_kine, Paciente.Estado.RESCATE),
                    "ingresados_actuales": conteo_estado(corte_kine, Paciente.Estado.INGRESADO),
                    "ingresados": conteo_estado(corte_kine, Paciente.Estado.INGRESADO),
                    "ingresos_mes": ingresos_mes.count(),
                    "egresos_mes": egresos_mes.count(),
                    "altas_medicas_mes": conteo_estado(egresos_mes, Paciente.Estado.ALTA_MEDICA),
                    "altas": conteo_estado(corte_kine, Paciente.Estado.ALTA_MEDICA),
                    "egresos_voluntarios_mes": conteo_estado(
                        egresos_mes, Paciente.Estado.EGRESO_VOLUNTARIO
                    ),
                    "abandonos_mes": conteo_estado(egresos_mes, Paciente.Estado.ABANDONO),
                    "derivados_mes": conteo_estado(egresos_mes, Paciente.Estado.DERIVADO),
                    "promedio_dias_hasta_ingreso": promedio_dias(
                        ingresos_mes, "fecha_derivacion", "fecha_ingreso"
                    ),
                    "promedio_dias_en_lista_actual": promedio_dias_desde_derivacion(
                        activos_corte, hoy
                    ),
                }
            )

        sin_responsable = corte.filter(kine_asignado__isnull=True)
        return Response(
            {
                "mes": mes,
                "anio": anio,
                "periodo_label": periodo_label(mes, anio),
                "responsables": responsables,
                "kines": responsables,
                "sin_responsable": {
                    "total_corte": sin_responsable.count(),
                    "pendientes": conteo_estado(sin_responsable, Paciente.Estado.PENDIENTE),
                    "rescate": conteo_estado(sin_responsable, Paciente.Estado.RESCATE),
                    "sobre_90_dias": sin_responsable.filter(
                        estado__in=[Paciente.Estado.PENDIENTE, Paciente.Estado.RESCATE],
                        fecha_derivacion__lt=hoy - timedelta(days=90),
                    ).count(),
                },
            }
        )


class SerieMensualReporteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        anio = obtener_anio(request)
        meses = []
        for mes in range(1, 13):
            corte = Paciente.objects.filter(fecha_derivacion__month=mes, fecha_derivacion__year=anio)
            actividad = resumen_actividad_mes(mes, anio)
            meses.append(
                {
                    "mes": mes,
                    "periodo_label": periodo_label(mes, anio),
                    "total_derivados": corte.count(),
                    "ingresos": actividad["ingresos"],
                    "egresos_total": actividad["egresos_total"],
                    "rescates_actuales": conteo_estado(corte, Paciente.Estado.RESCATE),
                    "abandonos": actividad["abandonos"],
                    "altas_medicas": actividad["altas_medicas"],
                    "egresos_voluntarios": actividad["egresos_voluntarios"],
                    "derivados": actividad["derivados"],
                }
            )
        return Response({"anio": anio, "meses": meses})
