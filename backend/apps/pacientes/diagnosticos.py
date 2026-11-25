"""Catálogo de diagnósticos: listar (todos), crear, corregir y borrar (Administrador o encargado)."""

import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher

from django.db import transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.usuarios.permissions import IsAdminOrEncargado

from .models import Diagnostico, Paciente


def _normalizar(nombre) -> str:
    return " ".join(str(nombre or "").split()).upper()


def registrar_diagnosticos(texto: str) -> None:
    """Suma al catálogo los diagnósticos de una ficha recién guardada (uno por línea)."""
    for linea in str(texto or "").splitlines():
        nombre = _normalizar(linea)
        if nombre and len(nombre) <= 255:
            Diagnostico.objects.get_or_create(nombre=nombre)


def _usos() -> Counter:
    """Cuántos pacientes tienen cada diagnóstico (un paciente puede tener varios, uno por línea)."""
    conteo: Counter = Counter()
    for texto in Paciente.objects.exclude(diagnostico="").values_list("diagnostico", flat=True):
        for nombre in {_normalizar(linea) for linea in str(texto).splitlines()}:
            if nombre:
                conteo[nombre] += 1
    return conteo


# --- Posibles duplicados -------------------------------------------------------

_PALABRAS_VACIAS = {"DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "EN", "POR", "CON"}
_NEGACIONES = {"NO", "SIN"}
UMBRAL_PARECIDO = 0.9


def _clave(nombre: str) -> str:
    """Forma comparable: sin tildes ni signos, sin palabras vacías y sin plural simple."""
    texto = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().upper()
    texto = re.sub(r"[^A-Z0-9 ]", " ", texto)
    palabras = [p[:-1] if len(p) > 4 and p.endswith("S") else p for p in texto.split() if p not in _PALABRAS_VACIAS]
    return " ".join(palabras)


def _parecidos(a: str, b: str) -> bool:
    # "NO TRAUMÁTICO" y "TRAUMÁTICO" dicen lo contrario: nunca se unen.
    if bool(_NEGACIONES & set(a.split())) != bool(_NEGACIONES & set(b.split())):
        return False
    return a == b or SequenceMatcher(None, a, b).ratio() >= UMBRAL_PARECIDO


def grupos_duplicados(diagnosticos: list[Diagnostico], usos: Counter) -> list[dict]:
    """Agrupa nombres parecidos. Sugiere conservar el más usado (y, si empatan, el más completo)."""
    claves = [_clave(d.nombre) for d in diagnosticos]
    padre = list(range(len(diagnosticos)))

    def raiz(i: int) -> int:
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    for i in range(len(diagnosticos)):
        for j in range(i + 1, len(diagnosticos)):
            if _parecidos(claves[i], claves[j]):
                padre[raiz(j)] = raiz(i)

    grupos: dict[int, list[Diagnostico]] = {}
    for i, d in enumerate(diagnosticos):
        grupos.setdefault(raiz(i), []).append(d)
    resultado = []
    for miembros in grupos.values():
        if len(miembros) < 2:
            continue
        miembros.sort(key=lambda d: (-usos.get(d.nombre, 0), -len(d.nombre), d.nombre))
        resultado.append(
            {
                "sugerido": miembros[0].id,
                "diagnosticos": [{"id": d.id, "nombre": d.nombre, "usos": usos.get(d.nombre, 0)} for d in miembros],
            }
        )
    resultado.sort(key=lambda g: g["diagnosticos"][0]["nombre"])
    return resultado


def _renombrar_en_pacientes(anterior: str, nuevo: str) -> int:
    """Cambia la línea `anterior` por `nuevo` en el diagnóstico de cada paciente que la tenga."""
    actualizados = []
    for paciente in Paciente.objects.filter(diagnostico__icontains=anterior).only("id", "diagnostico"):
        lineas = str(paciente.diagnostico).splitlines()
        cambiadas = [nuevo if _normalizar(linea) == anterior else linea for linea in lineas]
        if cambiadas != lineas:
            # Si el nuevo ya estaba en otra línea, no se repite.
            vistas, unicas = set(), []
            for linea in cambiadas:
                clave = _normalizar(linea)
                if clave not in vistas:
                    vistas.add(clave)
                    unicas.append(linea)
            paciente.diagnostico = "\n".join(unicas)
            actualizados.append(paciente)
    Paciente.objects.bulk_update(actualizados, ["diagnostico"], batch_size=200)
    return len(actualizados)


class DiagnosticoSerializer(serializers.ModelSerializer):
    usos = serializers.SerializerMethodField()

    class Meta:
        model = Diagnostico
        fields = ["id", "nombre", "usos"]

    def get_usos(self, obj) -> int:
        return self.context.get("usos", Counter()).get(obj.nombre, 0)

    def validate_nombre(self, valor):
        nombre = _normalizar(valor)
        if not nombre:
            raise serializers.ValidationError("Escribe el diagnóstico.")
        return nombre


class DiagnosticoViewSet(viewsets.ModelViewSet):
    queryset = Diagnostico.objects.all()
    serializer_class = DiagnosticoSerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdminOrEncargado()]

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        if self.action == "list":
            contexto["usos"] = _usos()
        return contexto

    def create(self, request, *args, **kwargs):
        nombre = _normalizar(request.data.get("nombre"))
        if not nombre:
            return Response({"nombre": ["Escribe el diagnóstico."]}, status=status.HTTP_400_BAD_REQUEST)
        # Si ya existe, se devuelve el existente en vez de fallar.
        diagnostico, creado = Diagnostico.objects.get_or_create(nombre=nombre)
        return Response(
            self.get_serializer(diagnostico).data,
            status=status.HTTP_201_CREATED if creado else status.HTTP_200_OK,
        )

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        diagnostico = self.get_object()
        nuevo = _normalizar(request.data.get("nombre"))
        if not nuevo:
            return Response({"nombre": ["Escribe el diagnóstico."]}, status=status.HTTP_400_BAD_REQUEST)
        anterior = diagnostico.nombre
        if nuevo == anterior:
            return Response({**self.get_serializer(diagnostico).data, "pacientes_actualizados": 0})

        pacientes = _renombrar_en_pacientes(anterior, nuevo)
        existente = Diagnostico.objects.filter(nombre=nuevo).exclude(pk=diagnostico.pk).first()
        if existente:
            # Corregir hacia un nombre que ya existe = unir los dos.
            diagnostico.delete()
            diagnostico = existente
        else:
            diagnostico.nombre = nuevo
            diagnostico.save(update_fields=["nombre"])
        return Response(
            {**self.get_serializer(diagnostico).data, "pacientes_actualizados": pacientes, "unido": bool(existente)}
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def duplicados(self, request):
        """Grupos de nombres parecidos (errores de tipeo, "DE" de más, plural, tildes) para unirlos."""
        return Response(grupos_duplicados(list(Diagnostico.objects.all()), _usos()))
