from datetime import date
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError

from apps.importar.models import ImportacionMensual
from apps.importar.parser import (
    _normalizar_rut,
    _parsear_fecha,
    _resolver_kine,
    _usuarios_activos_kine_por_canonico,
)
from apps.importar.views import _procesar_importacion_archivo
from openpyxl import load_workbook
from apps.pacientes.models import Paciente
from apps.usuarios.models import Usuario


class _ImportRequest:
    def __init__(self, user):
        self.user = user
        self.data = {}


def _aplicar_hoja_asignados(path: Path) -> int:
    """Completa kines desde la hoja ASIGNADOS (fecha col 2, RUT col 5, kine col 13)."""
    wb = load_workbook(filename=path, data_only=True)
    if "ASIGNADOS" not in wb.sheetnames:
        return 0
    ws = wb["ASIGNADOS"]
    usuarios_kine = _usuarios_activos_kine_por_canonico()
    actualizados = 0
    for row_idx in range(2, ws.max_row + 1):
        rut = _normalizar_rut(str(ws.cell(row_idx, 5).value or ""))
        kine_raw = str(ws.cell(row_idx, 13).value or "").strip()
        if not rut or not kine_raw:
            continue
        kine_info = _resolver_kine(
            valores_explicitos=[("ASIGNADOS", kine_raw)],
            usuarios_kine=usuarios_kine,
        )
        if not kine_info["usuario"]:
            continue
        # Cruce por RUT + fecha de derivacion: un mismo RUT puede tener una
        # derivacion antigua ya asignada y otra nueva todavia pendiente.
        fecha = _parsear_fecha(ws.cell(row_idx, 2).value)
        if not fecha:
            continue
        updated = Paciente.objects.filter(rut=rut, fecha_derivacion=fecha).update(
            kine_asignado=kine_info["usuario"]
        )
        actualizados += updated
    return actualizados


class Command(BaseCommand):
    help = "Importa pacientes desde un Excel CCR (misma lógica que /api/importar/)."

    def add_arguments(self, parser):
        parser.add_argument("archivo", type=str, help="Ruta al archivo .xlsx")
        parser.add_argument(
            "--limpiar",
            action="store_true",
            help="Elimina pacientes e importaciones previas antes de importar.",
        )
        parser.add_argument(
            "--forzar-reemplazo",
            action="store_true",
            help="Reemplaza importaciones previas si hay conflicto de periodo.",
        )
        parser.add_argument("--mes", type=int, default=None, help="Mes objetivo opcional (1-12)")
        parser.add_argument("--anio", type=int, default=None, help="Año fallback (default: año actual)")

    def handle(self, *args, **options):
        path = Path(options["archivo"]).expanduser().resolve()
        if not path.exists():
            raise CommandError(f"No existe el archivo: {path}")
        if path.suffix.lower() not in {".xlsx", ".xlsm"}:
            raise CommandError("Solo se admiten archivos .xlsx o .xlsm")

        admin = Usuario.objects.filter(rol=Usuario.Rol.ADMIN, is_active=True).first()
        if not admin:
            raise CommandError("No hay usuario ADMIN activo. Ejecute generar_usuarios_demo primero.")

        if options["limpiar"]:
            pacientes, _ = Paciente.objects.all().delete()
            importaciones, _ = ImportacionMensual.objects.all().delete()
            self.stdout.write(f"Eliminados {pacientes} pacientes y {importaciones} importaciones.")

        contenido = path.read_bytes()
        archivo = SimpleUploadedFile(
            name=path.name,
            content=contenido,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        anio_fallback = options["anio"] or date.today().year
        response = _procesar_importacion_archivo(
            request=_ImportRequest(admin),
            archivo=archivo,
            mes_solicitado=options["mes"],
            anio_fallback=anio_fallback,
            forzar_reemplazo=options["forzar_reemplazo"],
            modo_suplementar=False,
        )

        if response.status_code >= 400:
            raise CommandError(str(response.data))

        asignados = _aplicar_hoja_asignados(path)
        if asignados:
            self.stdout.write(f"Kines completados desde hoja ASIGNADOS: {asignados}")

        data = response.data
        self.stdout.write(self.style.SUCCESS("Importación completada."))
        self.stdout.write(f"Total filas leídas: {data.get('total', 0)}")
        self.stdout.write(f"Pacientes importados: {data.get('importados', 0)}")
        self.stdout.write(f"Duplicados/recurrentes: {data.get('duplicados', 0)}")
        self.stdout.write(f"Errores: {data.get('errores_count', 0)}")
        self.stdout.write(f"Pacientes en BD: {Paciente.objects.count()}")
        con_kine = Paciente.objects.filter(kine_asignado__isnull=False).count()
        self.stdout.write(f"Con kine asignado: {con_kine}")
