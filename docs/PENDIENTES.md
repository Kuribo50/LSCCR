# Pendientes LSCCR

Fecha de auditoria: 2026-05-11.

Este documento separa pendientes detectados durante la limpieza conservadora del
repositorio. No se eliminaron archivos, rutas o endpoints cuando existia duda
razonable de uso funcional.

## Criticos antes de estreno

- Verificar manualmente los flujos principales con datos reales o de ensayo:
  login, lista de espera, toma/asignacion, llamados, ingreso, agenda,
  inasistencias, egresos, importacion y reportes.
- Confirmar que el fixture `backend/fixtures/initial_data.json` contiene solo
  datos aceptables para una primera presentacion.
- Revisar el estado Git antes de abrir PR para confirmar que el alcance del
  cambio queda limitado a limpieza, documentacion y correcciones seguras.
- Validar el despliegue Docker Compose completo con base de datos limpia.
- Confirmar que `DJANGO_SECRET_KEY`, hosts, CSRF y credenciales locales esten
  configuradas fuera del repositorio.

## Mejoras recomendadas

- Extraer helpers repetidos de frontend (`normalizeSearchText`,
  `normalizeRut`, formateo de fechas y capitalizacion) a modulos compartidos.
- Dividir pantallas grandes como `lista-espera`, `mis-pacientes`, `importar` y
  `llamados` en componentes mas pequenos cuando se estabilice el estreno.
- Consolidar tablas operativas para reducir duplicacion entre lista de espera,
  ingresados y egresos.
- `/gestion/derivaciones` quedo como alias legacy: redirige a `/importar` para no
  romper enlaces o favoritos viejos. Se puede eliminar cuando ya no se use.
- `ColaDeLlamados` sigue siendo la vista "Cola" de `/pacientes` (se activa con el
  selector Tabla/Cola). Duplica en parte a `/llamados`; decidir si se retira esa
  vista antes de eliminar el componente.
- Revisar endpoints administrativos de borrado de importaciones. Existen en el
  backend y no deben eliminarse sin decidir primero la politica operativa.
- Evaluar archivado logico de cortes de importacion para conservar trazabilidad
  sin borrar datos fisicos cuando se limpia un periodo.
- Agregar pruebas frontend de humo para rutas principales.
- ~~Agregar CI con `check`, migraciones dry-run, tests, lint y build~~: hecho
  (`.github/workflows/ci.yml`, incluye PostgreSQL).

## Pendientes para produccion

Checklist operativo (variables, respaldos, rollback, limites y monitoreo):
[DESPLIEGUE_PRODUCCION.md](DESPLIEGUE_PRODUCCION.md).

- Definir variables de entorno de produccion y rotar secretos.
- Configurar `DJANGO_PRODUCTION=true`, `DJANGO_DEBUG=false`,
  `DJANGO_ALLOWED_HOSTS` y `DJANGO_CSRF_TRUSTED_ORIGINS`.
- Confirmar persistencia de volumenes PostgreSQL, media y staticfiles.
- Configurar backup de base de datos y procedimiento de restauracion.
- Revisar politicas de retencion para importaciones mensuales y registros de
  contacto.
- Revisar limites de subida y tamano de archivos Excel.
- Revisar permisos de `MEDICO`, profesional encargado y `ADMIN` en acciones
  sensibles (ver "Roles y permisos" en `FLUJO_OPERATIVO.md`). El rol
  `ADMINISTRATIVO` se reemplazo por `MEDICO`.
- Revisar monitoreo de errores y logs de Nginx/backend/frontend.
- Preparar checklist de rollback para el primer despliegue.

## Pendientes que NO se tocaron ahora

- Retirar u ocultar accesos demo del login.
- Revisar credenciales demo.
- Endurecer datos iniciales/fixtures para produccion.
- No se borraron migraciones Django existentes.
- No se borraron fixtures.
- No se cambiaron nombres de rutas publicas ya consumidas por frontend.
- No se cambiaron reglas clinicas/operativas de estados.
- No se redisenaron pantallas completas.
- No se eliminaron documentos de despliegue ni archivos completos dudosos.

## Legacy o deuda detectada

- Hay helpers de busqueda y fechas duplicados entre varias pantallas.
- Existen componentes y rutas con posible caracter legacy, pero con referencias
  vigentes. Se dejaron documentados para revision posterior.
