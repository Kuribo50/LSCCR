from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import Usuario


def normalizar_rut_usuario(rut: str) -> str:
    return (rut or "").replace(".", "").replace("-", "").upper().strip()


def validar_rut_usuario(rut: str, instance: Usuario | None = None) -> str:
    rut_normalizado = normalizar_rut_usuario(rut)
    if not rut_normalizado:
        raise serializers.ValidationError("El RUT es obligatorio.")
    if len(rut_normalizado) < 2:
        raise serializers.ValidationError("El RUT no tiene un formato válido.")

    queryset = Usuario.objects.filter(rut=rut_normalizado)
    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)
    if queryset.exists():
        raise serializers.ValidationError("Ya existe un usuario con este RUT.")

    return rut_normalizado


class LoginSerializer(serializers.Serializer):
    rut = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        rut = attrs.get("rut")
        password = attrs.get("password")
        request = self.context.get("request")
        user = authenticate(request=request, rut=rut, password=password)
        if not user:
            raise serializers.ValidationError("Credenciales inválidas.")
        if not user.is_active:
            raise serializers.ValidationError("Usuario inactivo.")
        attrs["user"] = user
        return attrs


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = (
            "id",
            "rut",
            "nombre",
            "rol",
            "is_active",
            "date_joined",
            "requiere_cambio_password",
        )
        read_only_fields = ("id", "date_joined")


class UsuarioCreateSerializer(serializers.ModelSerializer):
    rut = serializers.CharField(allow_blank=True)
    nombre = serializers.CharField(required=True, allow_blank=False)
    rol = serializers.ChoiceField(choices=Usuario.Rol.choices, required=True)
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Usuario
        fields = ("id", "rut", "nombre", "rol", "password", "is_active")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = Usuario.objects.create_user(password=password, **validated_data)
        return user

    def validate_rut(self, value):
        return validar_rut_usuario(value)


class UsuarioPatchSerializer(serializers.ModelSerializer):
    rut = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = Usuario
        fields = ("rut", "nombre", "rol", "is_active", "password")

    def validate_rut(self, value):
        return validar_rut_usuario(value, self.instance)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)
    confirm_password = serializers.CharField(write_only=True, min_length=6)

    def validate(self, attrs):
        user: Usuario = self.context["request"].user
        current_password = attrs.get("current_password", "")
        new_password = attrs.get("new_password", "")
        confirm_password = attrs.get("confirm_password", "")

        if not user.check_password(current_password):
            raise serializers.ValidationError(
                {"current_password": ["La contraseña actual es incorrecta."]}
            )

        if new_password != confirm_password:
            raise serializers.ValidationError(
                {"confirm_password": ["La confirmación no coincide."]}
            )

        return attrs
