"""Datos 100 % ficticios, con volumen razonable, para la demo pública.

Crea cuatro cortes mensuales (los últimos cuatro meses) con ~100 pacientes
inventados en todos los estados (en espera, rescate, ingresados y egresados),
con sus llamados, citas, movimientos y una bandeja de revisión de carga.

Nada sale de la base real: nombres, RUT y teléfonos son inventados. Los RUT
caen en el rango 90.000.000-99.999.999, que en Chile corresponde a empresas
(no existen personas con esos números).

Es idempotente: si ya hay cortes demo no hace nada (usar --rehacer para
borrarlos y volver a generarlos).
"""

import random
import uuid
from datetime import date, datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.importar.models import ImportacionMensual
from apps.importar.views import _build_observacion_revision
from apps.pacientes.diagnosticos import registrar_diagnosticos
from apps.pacientes.models import (
    DiagnosticoCatalogo,
    InasistenciaPaciente,
    LlamadoPaciente,
    MovimientoPaciente,
    Paciente,
    RegistroAgendaPaciente,
)
from apps.usuarios.models import Usuario

PREFIJO_CORTE = "demo_corte_"
MARCA = "Paciente ficticio de demostración."
INSTITUCION = "CESFAM Dr. Alberto Reyes"
MESES = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]

NOMBRES = [
    "María", "José", "Juan", "Carmen", "Luis", "Ana", "Pedro", "Rosa", "Carlos", "Patricia",
    "Jorge", "Sandra", "Manuel", "Claudia", "Hugo", "Verónica", "Mario", "Gloria", "Ricardo", "Marcela",
    "Sergio", "Paola", "Raúl", "Lorena", "Óscar", "Teresa", "Felipe", "Isabel", "Mauricio", "Elena",
]
APELLIDOS = [
    "González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda",
    "Morales", "Rodríguez", "López", "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza", "Valenzuela",
    "Castillo", "Tapia", "Gutiérrez", "Castro", "Pizarro", "Vargas", "Vera", "Cortés", "Figueroa", "Salazar",
]

DIAGNOSTICOS = {
    "LUMBAGOS": ["LUMBAGO", "LUMBAGO MECANICO", "LUMBOCIATICA"],
    "HOMBROS": ["HOMBRO DOLOROSO", "SD MANGUITO ROTADOR", "TENDINITIS DE HOMBRO"],
    "OA_MENOS65": ["GONARTROSIS", "COXARTROSIS", "ARTROSIS DE MANO"],
    "MAS65": ["ARTROSIS DE CADERA", "GONARTROSIS", "LUMBAGO", "ARTROSIS DE HOMBRO"],
    "SDNT": ["SD DOLOROSO NO TRAUMATICO", "FASCITIS PLANTAR", "EPICONDILITIS"],
    "SDT": ["ESGUINCE DE TOBILLO", "SD DOLOROSO TRAUMATICO", "FRACTURA CONSOLIDADA"],
    "OTROS_NEUROS": ["SECUELA ACV", "PARKINSON", "POLINEUROPATIA"],
}
PESOS_CATEGORIA = [("LUMBAGOS", 25), ("HOMBROS", 18), ("OA_MENOS65", 22), ("SDNT", 13), ("SDT", 10), ("OTROS_NEUROS", 12)]
PESOS_PRIORIDAD = [("ALTA", 25), ("MEDIANA", 35), ("MODERADA", 35), ("LICENCIA_MEDICA", 5)]
SECTORES = ["AZUL", "ROJO", "VERDE", "AMARILLO", "NARANJO", "MORADO", "CELESTE", "ROSADO"]
PROFESIONALES = ["MEDICO GENERAL", "KINESIOLOGO", "MEDICO FAMILIAR"]

E = Paciente.Estado
# Pacientes por corte, del más antiguo al más reciente: cuanto más viejo el corte,
# más pacientes ya ingresados o egresados.
CANTIDADES = [22, 26, 28, 24]
ESTADOS_POR_CORTE = [
    [(E.PENDIENTE, 25), (E.RESCATE, 10), (E.INGRESADO, 30), (E.ALTA_MEDICA, 18), (E.EGRESO_VOLUNTARIO, 7), (E.ABANDONO, 6), (E.DERIVADO, 4)],
    [(E.PENDIENTE, 40), (E.RESCATE, 12), (E.INGRESADO, 33), (E.ALTA_MEDICA, 8), (E.EGRESO_VOLUNTARIO, 4), (E.ABANDONO, 3)],
    [(E.PENDIENTE, 62), (E.RESCATE, 12), (E.INGRESADO, 22), (E.ALTA_MEDICA, 4)],
    [(E.PENDIENTE, 90), (E.RESCATE, 5), (E.INGRESADO, 5)],
]
EGRESADOS = {E.ALTA_MEDICA, E.EGRESO_VOLUNTARIO, E.ABANDONO, E.DERIVADO}


def _dv(cuerpo: int) -> str:
    suma, factor = 0, 2
    for digito in reversed(str(cuerpo)):
        suma += int(digito) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - suma % 11
    return "0" if resto == 11 else "K" if resto == 10 else str(resto)


def _dt(dia, hora=10, minuto=0):
    return timezone.make_aware(datetime.combine(dia, time(hora, minuto)))


def _con_fecha(objeto, **campos):
    """Reescribe campos auto_now_add para que el historial quede en las fechas simuladas."""
    type(objeto).objects.filter(pk=objeto.pk).update(**campos)


def _elegir(rng, pesos):
    valores, ponderaciones = zip(*pesos)
    return rng.choices(valores, weights=ponderaciones, k=1)[0]


def _ultimos_meses(hoy, cantidad):
    """(año, mes) de los últimos `cantidad` meses, el actual al final."""
    periodos = []
    anio, mes = hoy.year, hoy.month
    for _ in range(cantidad):
        periodos.append((anio, mes))
        mes -= 1
        if mes == 0:
            anio, mes = anio - 1, 12
    return list(reversed(periodos))


class Command(BaseCommand):
    help = "Genera cortes y pacientes ficticios a escala para la demo pública (idempotente)."

    def add_arguments(self, parser):
        parser.add_argument("--rehacer", action="store_true", help="Borra los datos demo a escala y los regenera.")

    def handle(self, *args, **options):
        if options["rehacer"]:
            pacientes, _ = Paciente.objects.filter(
                importacion_origen__archivo_nombre__startswith=PREFIJO_CORTE
            ).delete()
            ImportacionMensual.objects.filter(archivo_nombre__startswith=PREFIJO_CORTE).delete()
            self.stdout.write(f"Datos demo a escala eliminados ({pacientes} filas).")
        elif ImportacionMensual.objects.filter(archivo_nombre__startswith=PREFIJO_CORTE).exists():
            self.stdout.write("Datos demo a escala ya cargados (use --rehacer para regenerarlos).")
            return

        usuarios = {u.rut: u for u in Usuario.objects.filter(is_active=True)}
        kines = [u for u in usuarios.values() if u.rol == Usuario.Rol.KINE]
        if not kines:
            raise CommandError("Faltan los usuarios demo: ejecute generar_usuarios_demo primero.")
        subidor = usuarios.get("99999999K") or kines[0]

        with transaction.atomic():
            totales = self._generar(subidor, kines)
        self.stdout.write(self.style.SUCCESS(
            f"Demo a escala lista: {totales['cortes']} cortes, {totales['pacientes']} pacientes, "
            f"{totales['observaciones']} observaciones en Revisión de carga."
        ))

    # ------------------------------------------------------------------

    def _generar(self, subidor, kines):
        rng = random.Random(2026)
        hoy = timezone.localdate()
        periodos = _ultimos_meses(hoy, len(CANTIDADES))
        usados: set[int] = set()
        contador = 0
        por_corte: list[tuple[ImportacionMensual, list[Paciente]]] = []

        for indice, (anio, mes) in enumerate(periodos):
            nombre_archivo = f"{PREFIJO_CORTE}{anio}_{mes:02d}.xlsx"
            # Se "subió" a los pocos días de terminar el mes de los datos.
            siguiente = date(anio + (mes == 12), 1 if mes == 12 else mes + 1, 1)
            subida = min(_dt(siguiente + timedelta(days=2), 9, 30), _dt(hoy - timedelta(days=1), 9, 30))
            corte = ImportacionMensual.objects.create(
                archivo=f"importaciones/demo/{nombre_archivo}",
                archivo_nombre=nombre_archivo,
                mes=subida.month,
                anio=subida.year,
                mes_datos=mes,
                anio_datos=anio,
                usuario=subidor,
                estado=ImportacionMensual.Estado.COMPLETADO,
                lote=uuid.uuid4().hex,
            )
            # Que no figure como una carga recién subida (ventana de reversión).
            _con_fecha(corte, fecha_subida=subida)

            pacientes = []
            for _ in range(CANTIDADES[indice]):
                contador += 1
                forzar_sin_sector = indice == len(periodos) - 1 and len(pacientes) < 2
                pacientes.append(
                    self._paciente(rng, corte, anio, mes, indice, contador, kines, hoy, usados, forzar_sin_sector)
                )
            corte.registros_importados = len(pacientes)
            corte.total_registros = len(pacientes)
            corte.save(update_fields=["registros_importados", "total_registros"])
            por_corte.append((corte, pacientes))

        observaciones = self._bandeja_revision(rng, por_corte, hoy, usados)
        self._catalogos(por_corte)
        return {
            "cortes": len(por_corte),
            "pacientes": sum(len(p) for _, p in por_corte),
            "observaciones": observaciones,
        }

    def _paciente(self, rng, corte, anio, mes, indice, contador, kines, hoy, usados, sin_sector):
        # --- datos personales (todos inventados) ---
        while True:
            cuerpo = rng.randint(90_000_000, 99_999_999)
            if cuerpo not in usados:
                usados.add(cuerpo)
                break
        rut = f"{cuerpo}{_dv(cuerpo)}"
        nombre = " ".join(
            filter(None, [rng.choice(NOMBRES), rng.choice(NOMBRES) if rng.random() < 0.5 else "", rng.choice(APELLIDOS), rng.choice(APELLIDOS)])
        ).upper()
        edad = int(rng.triangular(18, 88, 58))
        categoria = "MAS65" if edad >= 65 and rng.random() < 0.7 else _elegir(rng, PESOS_CATEGORIA)
        diagnosticos = [rng.choice(DIAGNOSTICOS[categoria])]
        if rng.random() < 0.1:
            otra = rng.choice(DIAGNOSTICOS[_elegir(rng, PESOS_CATEGORIA)])
            if otra not in diagnosticos:
                diagnosticos.append(otra)

        # --- fechas y estado ---
        tope_dia = 24 if (anio, mes) != (hoy.year, hoy.month) else max(1, min(24, hoy.day - 1))
        derivacion = date(anio, mes, rng.randint(1, tope_dia))
        estado = E.PENDIENTE if sin_sector else _elegir(rng, ESTADOS_POR_CORTE[indice])
        ingreso = egreso = None
        if estado in {E.INGRESADO, *EGRESADOS}:
            ingreso = max(derivacion, min(derivacion + timedelta(days=rng.randint(12, 45)), hoy - timedelta(days=1)))
        if estado in EGRESADOS:
            egreso = min(ingreso + timedelta(days=rng.randint(15, 60)), hoy - timedelta(days=1))
            if (egreso - ingreso).days < 5:
                estado, egreso = E.INGRESADO, None
        asignado = kines[rng.randrange(len(kines))] if estado != E.PENDIENTE else None
        sector = "" if sin_sector else rng.choice(SECTORES)
        intentos = rng.randint(1, 3) if estado == E.RESCATE else 0
        cita = hoy + timedelta(days=rng.randint(2, 21)) if estado == E.INGRESADO else None

        paciente = Paciente(
            fecha_derivacion=derivacion,
            percapita_desde=INSTITUCION,
            sector_oficial=sector,
            sector_cesfam=sector,
            nombre=nombre,
            rut=rut,
            edad=edad,
            fecha_nacimiento=hoy - timedelta(days=edad * 365 + rng.randint(0, 364)),
            diagnostico="\n".join(diagnosticos),
            profesional=rng.choice(PROFESIONALES),
            prioridad=_elegir(rng, PESOS_PRIORIDAD),
            categoria=categoria,
            kine_asignado=asignado,
            estado=estado,
            n_intentos_contacto=intentos,
            n_meses_espera=(hoy.year - anio) * 12 + hoy.month - mes + 1,
            observaciones=MARCA,
            telefono=f"+5690000{contador:04d}",
            email=f"paciente{contador}@ejemplo.invalid" if rng.random() < 0.2 else "",
            fecha_ingreso=ingreso,
            fecha_egreso=egreso,
            fecha_siguiente_cita=cita,
            proxima_atencion=_dt(cita, rng.randint(9, 16), rng.choice([0, 30])) if cita else None,
            importacion_origen=corte,
        )
        paciente.save()

        # --- historial: movimientos, llamados, citas e inasistencias ---
        cambio = None

        def movimiento(anterior, nuevo, cuando, usuario):
            registro = MovimientoPaciente.objects.create(
                paciente=paciente, usuario=usuario, estado_anterior=anterior, estado_nuevo=nuevo,
                notas="Movimiento de demostración.",
            )
            _con_fecha(registro, fecha=cuando)
            return cuando

        if estado == E.RESCATE:
            for veces in range(intentos):
                cuando = _dt(hoy - timedelta(days=rng.randint(2, 20)), rng.randint(9, 16))
                llamado = LlamadoPaciente.objects.create(
                    paciente=paciente, usuario=asignado, resultado=LlamadoPaciente.Resultado.NO_CONTESTA,
                    telefono_usado=paciente.telefono, notas="Sin respuesta (demostración).",
                )
                _con_fecha(llamado, fecha=cuando)
                cambio = max(cambio, cuando) if cambio else cuando
            movimiento(E.PENDIENTE, E.RESCATE, cambio, asignado)
        if ingreso:
            cambio = movimiento(E.PENDIENTE, E.INGRESADO, _dt(ingreso, 10), asignado)
            RegistroAgendaPaciente.objects.create(
                paciente=paciente, usuario=asignado, fecha_programada=_dt(ingreso, 10, 30),
                resultado=RegistroAgendaPaciente.Resultado.ASISTIO, observacion="Primera sesión (demostración).",
            )
            if estado == E.INGRESADO and rng.random() < 0.12:
                falta = min(ingreso + timedelta(days=rng.randint(5, 20)), hoy - timedelta(days=1))
                InasistenciaPaciente.objects.create(
                    paciente=paciente, usuario=asignado, fecha=falta, justificada=False,
                    motivo="No asistió sin aviso (demostración).",
                )
                paciente.n_inasistencias = 1
                paciente.fecha_ultima_inasistencia = falta
        if egreso:
            cambio = movimiento(E.INGRESADO, estado, _dt(egreso, 12), asignado)
        if cambio:
            paciente.fecha_cambio_estado = cambio
            paciente.save(update_fields=["fecha_cambio_estado", "n_inasistencias", "fecha_ultima_inasistencia"])
        return paciente

    # ------------------------------------------------------------------

    def _bandeja_revision(self, rng, por_corte, hoy, usados):
        """Deja una bandeja de Revisión de carga pequeña y variada en el corte más reciente."""
        corte, recientes = por_corte[-1]
        anteriores = [p for _, lista in por_corte[:-1] for p in lista]
        hoja = MESES[corte.mes_datos]

        def registro(p, motivo, fila, **extra):
            return {
                "hoja": hoja, "fila": fila, "nombre": p.nombre, "rut": p.rut,
                "fecha_derivacion": p.fecha_derivacion.strftime("%d/%m/%Y"), "edad": p.edad,
                "diagnostico": p.diagnostico.splitlines()[0], "prioridad": p.prioridad,
                "percapita_desde": INSTITUCION, "profesional": p.profesional,
                "sector_oficial": p.sector_oficial, "motivo": motivo, **extra,
            }

        observaciones = []
        fila = 2
        # Sector vacío: pacientes nuevos del corte sin sector.
        for paciente in [p for p in recientes if not p.sector_oficial]:
            observaciones.append(_build_observacion_revision(
                registro=registro(paciente, "Sector territorial vacío.", fila), tipo="ADVERTENCIA",
                importacion=corte, paciente=paciente))
            fila += 1
        # Recurrentes: pacientes que ya estaban en cortes anteriores y vuelven a aparecer.
        en_lista = [p for p in anteriores if p.estado in {E.PENDIENTE, E.RESCATE}]
        ingresados = [p for p in anteriores if p.estado == E.INGRESADO]
        for paciente in rng.sample(en_lista, 3) + rng.sample(ingresados, 1):
            nueva = hoy - timedelta(days=rng.randint(3, 20))
            observaciones.append(_build_observacion_revision(
                registro=registro(paciente, "Registro repetido en el sistema.", fila,
                                  fecha_derivacion=nueva.strftime("%d/%m/%Y")),
                tipo="RECURRENTE", importacion=corte, paciente=paciente))
            fila += 1
        # Errores: filas incompletas que no crearon ficha.
        for motivo, extra in [
            ("Diagnóstico vacío", {"rut": f"{91_000_001}{_dv(91_000_001)}", "diagnostico": ""}),
            ("RUT vacío. Falta fecha de derivación.", {"rut": "", "fecha_derivacion": ""}),
        ]:
            observaciones.append(_build_observacion_revision(
                registro={
                    "hoja": hoja, "fila": fila, "nombre": "PACIENTE DE PRUEBA", "edad": 50, "diagnostico": "LUMBAGO",
                    "prioridad": "MODERADA", "percapita_desde": INSTITUCION, "profesional": "MEDICO GENERAL",
                    "motivo": motivo, **extra,
                },
                tipo="ERROR", importacion=corte, paciente=None))
            fila += 1

        corte.observaciones_revision = observaciones
        corte.duplicados = sum(1 for o in observaciones if o["tipo"] == "RECURRENTE")
        corte.total_registros = corte.registros_importados + len(observaciones) - len(
            [o for o in observaciones if o["tipo"] == "ADVERTENCIA"]
        )
        corte.save(update_fields=["observaciones_revision", "duplicados", "total_registros"])
        return len(observaciones)

    def _catalogos(self, por_corte):
        """Los diagnósticos usados quedan en el catálogo editable y en el de categorías."""
        for categoria, nombres in DIAGNOSTICOS.items():
            for nombre in nombres:
                DiagnosticoCatalogo.objects.get_or_create(diagnostico=nombre, defaults={"categoria": categoria})
        for _, pacientes in por_corte:
            for paciente in pacientes:
                registrar_diagnosticos(paciente.diagnostico)
