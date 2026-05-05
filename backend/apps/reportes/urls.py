from django.urls import re_path

from .views import (
    PorKineReporteView,
    PorResponsableExportarView,
    ResumenReporteView,
    SerieMensualReporteView,
)


urlpatterns = [
    re_path(r"^reportes/resumen/?$", ResumenReporteView.as_view(), name="reportes-resumen"),
    re_path(r"^reportes/por-kine/?$", PorKineReporteView.as_view(), name="reportes-por-kine"),
    re_path(
        r"^reportes/por-responsable/exportar/?$",
        PorResponsableExportarView.as_view(),
        name="reportes-por-responsable-exportar",
    ),
    re_path(
        r"^reportes/por-responsable/?$",
        PorKineReporteView.as_view(),
        name="reportes-por-responsable",
    ),
    re_path(
        r"^reportes/serie-mensual/?$",
        SerieMensualReporteView.as_view(),
        name="reportes-serie-mensual",
    ),
]
