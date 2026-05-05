# Checklist demo V1 ListaEsperaCCR

Usar solo datos ficticios. No cargar Excel reales, RUT reales, bases locales ni exportaciones reales al repositorio.

## Preparación

1. Crear o actualizar usuarios demo:
   ```bash
   cd backend
   python manage.py generar_usuarios_demo
   ```
2. Verificar login con usuario ADMIN: `66666666K`.
3. Verificar login con usuario KINE: `11111111K`.
4. Verificar login con usuario ADMINISTRATIVO: `55555555K`.
5. Cargar archivo demo `.xlsx` o crear pacientes manuales con datos ficticios.

## Flujo operativo

1. Abrir Inicio y confirmar que carga Trabajo de hoy.
2. Abrir Lista de espera y probar filtros generales.
3. Probar filtro por alerta desde Trabajo de hoy.
4. Abrir ficha operativa de un paciente.
5. Asignar responsable CCR a un paciente pendiente.
6. Registrar contacto con resultado contestó y confirmar que pasa a `INGRESADO`.
7. Registrar contacto no contestó desde `PENDIENTE` y confirmar que pasa a `RESCATE`.
8. Registrar segundo contacto no contestó desde `RESCATE` sin observación y confirmar que falla.
9. Registrar segundo contacto no contestó desde `RESCATE` con observación y confirmar que pasa a `EGRESO_ADMINISTRATIVO`.
10. Registrar inasistencia en paciente `INGRESADO`.
11. Registrar dos inasistencias no justificadas y confirmar alerta de posible `ABANDONO`.
12. Cambiar estado a `ALTA_MEDICA`, `EGRESO_VOLUNTARIO`, `DERIVADO` o `ABANDONO` con observación operativa.
13. Confirmar que `ABANDONO` solo se permite desde `INGRESADO`.

## Importación y revisión

1. Previsualizar una planilla demo y confirmar que no crea pacientes.
2. Confirmar importación y verificar `id_ccr` con formato `CCR-XXXX`.
3. Abrir Revisión importación.
4. Marcar una observación como resuelta.
5. Marcar una observación como descartada.
6. Abrir Historial de cortes y revisar el detalle mensual.

## Reportes y salidas

1. Abrir Estadísticas CCR.
2. Cambiar mes/año y actualizar.
3. Revisar reporte por responsable.
4. Exportar lista de espera a Excel.
5. Exportar corte mensual.
6. Exportar reporte por responsable.
7. Imprimir ficha operativa.
8. Imprimir lista de contactabilidad.

## Seguridad visual

1. Verificar que Usuarios solo aparezca para ADMIN.
2. Verificar que acciones peligrosas pidan confirmación.
3. Verificar que no se muestren trazas técnicas ante errores.
4. Revisar `git status --short` antes de cerrar la demo.
