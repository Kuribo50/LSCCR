from django.core.management.base import BaseCommand

from apps.importar.parser import KINES_ACTIVOS_CCR, normalizar_texto
from apps.usuarios.models import Usuario


class Command(BaseCommand):
    help = "Verifica que existan usuarios KINE activos para asignación CCR."

    def handle(self, *args, **options):
        usuarios = list(Usuario.objects.filter(rol=Usuario.Rol.KINE, is_active=True))
        activos = {normalizar_texto(usuario.nombre): usuario for usuario in usuarios}
        self.stdout.write("Usuarios CCR requeridos:")
        faltantes = 0
        for nombre, aliases in KINES_ACTIVOS_CCR.items():
            posibles = {normalizar_texto(nombre), *{normalizar_texto(alias) for alias in aliases}}
            usuario = next((activos[posible] for posible in posibles if posible in activos), None)
            if usuario:
                self.stdout.write(self.style.SUCCESS(f"- OK: {nombre} -> {usuario.nombre} ({usuario.rut})"))
            else:
                faltantes += 1
                self.stdout.write(self.style.WARNING(f"- Falta: {nombre}"))

        if faltantes:
            self.stdout.write(
                "No se crean usuarios productivos automáticamente porque Usuario exige RUT único. "
                "Cree los usuarios con RUT real desde el módulo Usuarios."
            )
        else:
            self.stdout.write(self.style.SUCCESS("Todos los usuarios CCR activos están disponibles."))
