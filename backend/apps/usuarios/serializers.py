from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Usuario


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
        fields = ("id", "rut", "nombre", "rol", "is_active", "date_joined")
        read_only_fields = ("id", "date_joined")


class UsuarioCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Usuario
        fields = ("id", "rut", "nombre", "rol", "password", "is_active")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = Usuario.objects.create_user(password=password, **validated_data)
        return user


class UsuarioPatchSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)

    class Meta:
        model = Usuario
        fields = ("nombre", "rol", "is_active", "password")

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
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

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

        if new_password == current_password:
            raise serializers.ValidationError(
                {"new_password": ["La nueva contraseña debe ser distinta a la actual."]}
            )

        validate_password(new_password, user=user)
        return attrs
