from django.urls import re_path

from .views import (
    ExportarHistorialImportacionesMesView,
    HistorialImportacionesMesView,
    HistorialImportacionesView,
    ImportacionMensualDetalleView,
    ImportarDerivacionesView,
    ObservacionRevisionDetalleView,
    ObservacionesRevisionImportacionView,
    PlantillaImportacionView,
    PrevisualizarDerivacionesView,
    ResetPoblacionView,
)


urlpatterns = [
    re_path(r"^importar/previsualizar/?$", PrevisualizarDerivacionesView.as_view(), name="importar-previsualizar"),
    re_path(r"^importar/derivaciones/?$", ImportarDerivacionesView.as_view(), name="importar-derivaciones"),
    re_path(r"^importar/revision/?$", ObservacionesRevisionImportacionView.as_view(), name="importar-revision"),
    re_path(r"^importar/revision/(?P<importacion_id>\d+)/(?P<index>\d+)/?$", ObservacionRevisionDetalleView.as_view(), name="importar-revision-detalle"),
    re_path(r"^importar/historial/?$", HistorialImportacionesView.as_view(), name="importar-historial"),
    re_path(r"^importar/historial/(?P<mes>\d{1,2})/(?P<anio>\d{4})/exportar/?$", ExportarHistorialImportacionesMesView.as_view(), name="importar-historial-exportar"),
    re_path(r"^importar/historial/(?P<mes>\d{1,2})/(?P<anio>\d{4})/?$", HistorialImportacionesMesView.as_view(), name="importar-historial-detalle"),
    re_path(r"^importar/historial/corte/(?P<pk>\d+)/?$", ImportacionMensualDetalleView.as_view(), name="importar-historial-corte"),
    re_path(r"^importar/plantilla/?$", PlantillaImportacionView.as_view(), name="importar-plantilla"),
    re_path(r"^importar/reset/?$", ResetPoblacionView.as_view(), name="importar-reset"),
]
