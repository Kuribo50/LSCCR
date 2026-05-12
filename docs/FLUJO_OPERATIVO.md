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

La cola de llamados trabaja con pacientes `PENDIENTE` y `RESCATE` que ya tienen
responsable CCR.

Reglas:

- Si un `PENDIENTE` contesta, pasa a `INGRESADO`.
- Si un `PENDIENTE` no contesta, pasa a `RESCATE`.
- Si un `RESCATE` no contesta, puede pasar a `EGRESO_ADMINISTRATIVO` con
  observacion obligatoria.

Los llamados quedan guardados en `LlamadoPaciente`.

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
