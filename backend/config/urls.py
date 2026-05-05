from django.contrib import admin
from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path


def healthcheck(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/health/", healthcheck, name="healthcheck"),
    path("api/auth/", include("apps.usuarios.auth_urls")),
    path("api/", include("apps.pacientes.urls")),
    path("api/", include("apps.reportes.urls")),
    path("api/", include("apps.importar.urls")),
    path("api/", include("apps.usuarios.urls")),
]

if settings.ENABLE_DJANGO_ADMIN:
    urlpatterns.insert(0, path("admin/", admin.site.urls))
