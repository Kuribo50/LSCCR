from django.core.management.base import BaseCommand

from apps.usuarios.models import Usuario


USUARIOS_DEMO = [
    {
        "rut": "11111111K",
        "nombre": "Sebastián Salgado",
        "rol": Usuario.Rol.KINE,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "rut": "22222222K",
        "nombre": "Sebastián Campos",
        "rol": Usuario.Rol.KINE,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "rut": "33333333K",
        "nombre": "Mane Sáez",
        "rol": Usuario.Rol.KINE,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "rut": "77777777K",
        "nombre": "Pilar Alarcón",
        "rol": Usuario.Rol.KINE,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "rut": "88888888K",
        "nombre": "Karen Torres",
        "rol": Usuario.Rol.KINE,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": False,
        "is_superuser": False,
    },
    {
        "rut": "66666666K",
        "nombre": "Administrador CCR",
        "rol": Usuario.Rol.ADMIN,
        "password": "Ccr2025*",
        "is_active": True,
        "is_staff": True,
        "is_superuser": True,
    },
]

RUTS_DEMO_KINE_OBSOLETOS = ["44444444K", "55555555K"]


class Command(BaseCommand):
    help = "Crea o actualiza usuarios demo para desarrollo local."

    def handle(self, *args, **options):
        creados = 0
        actualizados = 0
        desactivados_obsoletos = 0

        for item in USUARIOS_DEMO:
            rut = item["rut"]
            user, created = Usuario.objects.get_or_create(
                rut=rut,
                defaults={
                    "nombre": item["nombre"],
                    "rol": item["rol"],
                    "is_active": item.get("is_active", True),
                    "is_staff": item["is_staff"],
                    "is_superuser": item["is_superuser"],
                },
            )

            user.nombre = item["nombre"]
            user.rol = item["rol"]
            user.is_active = item.get("is_active", True)
            user.is_staff = item["is_staff"]
            user.is_superuser = item["is_superuser"]
            user.set_password(item["password"])
            user.save()

            if created:
                creados += 1
            else:
                actualizados += 1

        # Desactiva accesos KINE demo antiguos que ya no forman parte de la preorden oficial.
        desactivados_obsoletos = Usuario.objects.filter(
            rut__in=RUTS_DEMO_KINE_OBSOLETOS,
            rol=Usuario.Rol.KINE,
            is_active=True,
        ).update(is_active=False)

        self.stdout.write(self.style.SUCCESS("Usuarios demo listos."))
        self.stdout.write(f"Creados: {creados} | Actualizados: {actualizados}")
        self.stdout.write(f"Demo KINE obsoletos desactivados: {desactivados_obsoletos}")
        self.stdout.write("Credenciales de prueba: password = Ccr2025*")
        for item in USUARIOS_DEMO:
            self.stdout.write(f"- {item['rut']} ({item['rol']})")
