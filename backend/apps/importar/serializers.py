from rest_framework import serializers

from .models import ImportacionMensual


class ImportacionDerivacionesSerializer(serializers.Serializer):
    archivo = serializers.FileField()
    mes = serializers.IntegerField(min_value=1, max_value=12, required=False)
    anio = serializers.IntegerField(min_value=2000, max_value=2100, required=False)

    def validate_archivo(self, archivo):
        nombre = (archivo.name or "").lower()
        if not nombre.endswith(".xlsx"):
            raise serializers.ValidationError("Solo se permiten archivos Excel .xlsx.")
        limite_mb = 10
        if archivo.size and archivo.size > limite_mb * 1024 * 1024:
            raise serializers.ValidationError(f"El archivo no puede superar {limite_mb} MB.")
        return archivo


class ImportacionMensualSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportacionMensual
        fields = "__all__"
