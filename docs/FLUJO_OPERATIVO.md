# Flujo operativo LSCCR

Este documento explica el flujo de negocio para entender por que existen los
estados y acciones principales.

## Lista de espera

La lista de espera corresponde a pacientes `PENDIENTE` y `RESCATE`.

- `PENDIENTE`: persona derivada que aun no confirma ingreso.
- `RESCATE`: persona con primer contacto fallido o pendiente de segundo intento.

La vista `/lista-espera` muestra ambos estados de forma global. Los filtros por
responsable, sector, categoria o prioridad solo acotan esa vista.

## Llamados

La pantalla `/llamados` tiene dos secciones, ambas solo con pacientes que ya
tienen responsable CCR (un KINE ve solo su cartera):

- **Por contactar**: pacientes `PENDIENTE` y `RESCATE`.
- **Ingresados por citar**: `INGRESADO` sin `proxima_atencion`.

Cada seccion se agrupa en "Para llamar", "Reprogramados" (pidieron que los
llamen otro dia, `Paciente.proximo_llamado`) y "Sin telefono". Los datos vienen
de `GET /pacientes/cola-llamados/`.

Cada llamado registra su resultado real (`LlamadoPaciente.Resultado`). Reglas
(en `apps/pacientes/llamados.py`):

- **Contesta y agenda**: un `PENDIENTE`/`RESCATE` pasa a `INGRESADO` y queda
  citado en el mismo paso; un ingresado queda citado (fecha obligatoria).
- **No contesta**: suma un intento. Con `CCR_INTENTOS_PARA_RESCATE` (3) intentos
  en `PENDIENTE` pasa a `RESCATE`; con `CCR_INTENTOS_RESCATE_PARA_EGRESO` (2)
  intentos en `RESCATE` pasa a `EGRESO_ADMINISTRATIVO` con observacion
  obligatoria. Los intentos se cuentan desde que entro a su estado actual. En
  ingresados solo se registra.
- **Volver a llamar**: guarda la fecha en `proximo_llamado`; no cuenta como
  intento. Cualquier otro resultado limpia esa fecha.
- **Numero equivocado**: solo se registra; hay que corregir el telefono.
- **Rechaza la atencion**: `EGRESO_VOLUNTARIO`, con observacion.
- **Ya lo resolvio** (solo lista de espera): `EGRESO_ADMINISTRATIVO`, con
  observacion.
- **Otro**: solo se registra, con observacion.

Quien registro un llamado puede deshacerlo durante 10 minutos
(`POST /pacientes/{id}/deshacer-llamado/`): se restaura el paciente y se borran
el llamado y el movimiento de estado que genero.

## Rescate

`RESCATE` representa un segundo intento documentado. No es un egreso. Sirve para
mantener visible al paciente y registrar una decision posterior.

Desde `RESCATE` se puede:

- ingresar si confirma atencion;
- volver a pendiente si corresponde retomar seguimiento;
- egresar administrativamente si no hay respuesta y existe observacion.

## Ingreso

`INGRESADO` significa que el paciente ya entro al seguimiento CCR.

Puede ocurrir por:

- cambio manual de estado;
- llamado contestado;
- asistencia a una cita programada estando pendiente/rescate.

Al ingresar se completa `fecha_ingreso` si estaba vacia.

## Agenda

La agenda se basa en `proxima_atencion` y `fecha_siguiente_cita` del paciente.
Cada accion historica queda en `RegistroAgendaPaciente`.

Acciones:

- programar atencion;
- registrar asistencia;
- registrar no asistencia;
- reagendar;
- eliminar cita.

KINE solo gestiona su cartera. ADMIN puede gestionar globalmente.

## Inasistencias

Una no asistencia desde agenda genera `InasistenciaPaciente` solo si el paciente
esta `INGRESADO`. Esto evita contar inasistencias clinicas en personas que aun no
han ingresado.

Las inasistencias no justificadas suman a `n_inasistencias`. Con dos o mas, la
UI muestra alerta para evaluar `ABANDONO`.

`ABANDONO` solo debe registrarse desde `INGRESADO`.

## Egresos

Estados finales:

- `ABANDONO`
- `ALTA_MEDICA`
- `EGRESO_VOLUNTARIO`
- `EGRESO_ADMINISTRATIVO`
- `DERIVADO`

Los estados finales requieren nota/observacion. Al cerrar se completa
`fecha_egreso` si estaba vacia.

## Importacion mensual

La importacion mensual permite cargar derivaciones desde Excel o desde filas
pegadas.

Pasos:

1. Previsualizar: valida formato, muestra conteos y no crea pacientes.
2. Confirmar importacion: crea pacientes, detecta recurrentes y guarda
   observaciones de revision.
3. Revisar observaciones: administrativo/admin puede completar o descartar
   registros con datos incompletos, recurrentes o advertencias.

Las observaciones viven en `ImportacionMensual.observaciones_revision`.

## Reportes

Los reportes separan:

- corte mensual por fecha de derivacion;
- actividad del mes por fecha de ingreso/egreso;
- distribuciones por estado, prioridad, categoria, sector y diagnostico;
- reporte por responsable CCR.
