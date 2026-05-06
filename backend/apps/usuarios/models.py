from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def _normalizar_rut(self, rut: str) -> str:
        return (rut or "").replace(".", "").replace("-", "").upper().strip()

    def _create_user(self, rut: str, password: str | None, **extra_fields):
        if not rut:
            raise ValueError("El RUT es obligatorio.")
        rut = self._normalizar_rut(rut)
        user = self.model(rut=rut, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, rut: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(rut, password, **extra_fields)

    def create_superuser(self, rut: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("rol", Usuario.Rol.ADMIN)
        if not extra_fields.get("is_staff"):
            raise ValueError("Superuser debe tener is_staff=True.")
        if not extra_fields.get("is_superuser"):
            raise ValueError("Superuser debe tener is_superuser=True.")
        return self._create_user(rut, password, **extra_fields)


class Usuario(AbstractUser):
    class Rol(models.TextChoices):
        KINE = "KINE", "Kinesiólogo"
        ADMINISTRATIVO = "ADMINISTRATIVO", "Administrativo"
        ADMIN = "ADMIN", "Administrador"

    username = None
    first_name = None
    last_name = None
    email = None

    rut = models.CharField(max_length=12, unique=True, db_index=True)
    nombre = models.CharField(max_length=150)
    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.KINE)
    requiere_cambio_password = models.BooleanField(default=False)

    USERNAME_FIELD = "rut"
    REQUIRED_FIELDS = ["nombre"]

    objects = UsuarioManager()

    def save(self, *args, **kwargs):
        self.rut = self.rut.replace(".", "").replace("-", "").upper().strip()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.nombre} ({self.rut})"
