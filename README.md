# Lista de Espera CCR

Sistema web para gestion operativa de lista de espera, pacientes, calendario de citas, contactabilidad, importaciones mensuales y usuarios.

## Alcance del sistema

ListaEsperaCCR es una herramienta interna de apoyo operativo para la gestion de lista de espera, contactabilidad, asignacion, seguimiento y reportes del CCR. No reemplaza Trak ni la ficha clinica institucional.

- `RESCATE`: estado previo al ingreso para pacientes con primer contacto sin respuesta.
- `EGRESO_ADMINISTRATIVO`: cierre operativo previo al ingreso cuando un paciente en `RESCATE` vuelve a no contestar. Requiere observacion obligatoria.
- `ABANDONO`: cierre posterior al ingreso cuando el equipo evalua que el paciente abandono el proceso. No corresponde usarlo desde `PENDIENTE` ni desde `RESCATE`.
- Historial de contactos: registro operativo de cada contacto, separado del contador de intentos de contacto.
- Historial de acciones: linea de tiempo operativa que une cambios de estado, contactos e inasistencias.
- Inasistencias: registro de ausencias a sesiones de pacientes `INGRESADOS`; dos inasistencias no justificadas generan alerta para evaluar `ABANDONO`, sin cambiar el estado automaticamente.
- Ficha operativa: vista consolidada para seguimiento CCR con datos generales, derivacion, contacto, gestion, movimientos, contactos e inasistencias.

## V1 Demo

La V1 incluye lista de espera, ficha operativa, responsable CCR, contactabilidad, inasistencias, Trabajo de hoy, alertas operativas, importacion mensual, revision de errores/recurrentes, historial mensual, reportes, exportacion Excel e impresion.

No reemplaza Trak ni la ficha clinica institucional. Es una herramienta interna para apoyo operativo del CCR.

Flujo principal de demo:

1. Importar derivaciones desde una planilla demo `.xlsx`.
2. Revisar la previsualizacion antes de guardar.
3. Confirmar la importacion.
4. Ver los pacientes en lista de espera.
5. Asignar responsable CCR.
6. Registrar contacto.
7. Ingresar paciente cuando confirma asistencia.
8. Registrar inasistencia si ya esta `INGRESADO`.
9. Cerrar o egresar con observacion operativa cuando corresponda.
10. Revisar reportes mensuales y por responsable.
11. Exportar Excel o imprimir ficha/lista de contactabilidad.

Para correr localmente:

```bash
cd backend
python manage.py migrate
python manage.py generar_usuarios_demo
python manage.py runserver

cd ../frontend
npm install
npm run dev
```

Usuarios demo locales:

- `66666666K` ADMIN
- `55555555K` ADMINISTRATIVO
- `11111111K`, `22222222K`, `33333333K`, `44444444K` KINE
- Password demo: `Ccr2025*`

Usa solo datos ficticios en la demo. No subas datos reales, Excel reales, bases locales ni archivos exportados al repositorio.

## Trabajo de hoy y alertas operativas

La seccion Trabajo de hoy orienta la gestion diaria del CCR mostrando pacientes que requieren accion, como altas sin responsable, rescates activos, esperas prolongadas, ingresados sin proxima atencion o posibles abandonos. Es una ayuda operativa para priorizar trabajo y no reemplaza el criterio clinico, Trak ni la ficha clinica institucional.

## Reportes operativos

Los reportes operativos permiten revisar un resumen mensual del corte de derivaciones, la actividad ocurrida durante el mes, la carga por responsable y una tendencia anual de derivaciones, ingresos y egresos.

- Resumen mensual: muestra el estado actual de los pacientes derivados en el mes consultado.
- Actividad del mes: cuenta ingresos y egresos ocurridos durante el periodo, separados del corte mensual.
- Reporte por responsable: resume asignados, pendientes, rescates, ingresos y egresos por responsable CCR, manteniendo compatibilidad tecnica con `kine_asignado`.
- Tendencia anual: compara derivaciones, ingresos y egresos por mes para apoyar la gestion.

Estos reportes son apoyo operativo del CCR y no reemplazan Trak, la ficha clinica institucional ni el criterio clinico del equipo.

## Importación mensual y revisión

La importación mensual permite previsualizar una planilla Excel antes de guardar datos. La previsualización separa registros nuevos, recurrentes y errores para que el equipo revise el corte antes de confirmar.

- Nuevos: registros válidos que crearán pacientes en lista de espera.
- Recurrentes: pacientes que ya existen según la regla operativa vigente y quedan como observación de revisión.
- Errores: registros incompletos o inconsistentes que no crean ficha hasta ser revisados.
- Revisión de importación: bandeja para marcar observaciones como resueltas o descartadas, dejando resolución y usuario.
- Historial mensual: vista de cortes cargados, importados, recurrentes, errores y estado actual de pacientes del periodo.

No subas Excel reales al repositorio. Los archivos de carga deben tratarse como datos sensibles y mantenerse fuera de Git.

## Exportación e impresión

El sistema permite sacar respaldos operativos sin volver al Excel manual.

- Exportar lista filtrada: descarga la lista de espera respetando filtros operativos como alerta, mes, año, importación y búsqueda.
- Exportar corte mensual: descarga los pacientes derivados en un mes/año con su estado actual e importación de origen.
- Exportar reporte por responsable: descarga la tabla mensual de carga, ingresos y egresos por responsable.
- Imprimir ficha operativa: genera una version legible con datos operativos principales, sin historial de acciones ni controles de pantalla.
- Imprimir lista de contactabilidad: imprime la lista visible de pacientes pendientes o en rescate.

Las exportaciones `.xlsx` y archivos impresos son material operativo. No subas exportaciones reales al repositorio.

## Estructura

- `backend/`: API Django + Django REST Framework.
- `frontend/`: panel Next.js.
- `docker-compose.yml`: entorno local con PostgreSQL, Redis, backend, frontend y Nginx.

## Archivos que no deben subirse

El repositorio esta preparado para no subir datos reales ni credenciales:

- `.env` y cualquier variable local real.
- `backend/db.sqlite3` y cualquier base SQLite local.
- `backend/media/`, cargas Excel y archivos importados.
- archivos `.xlsx`, `.xls`, `.csv`, `.tsv` y exportaciones locales.
- caches, builds, logs, certificados y volumenes Docker.

Antes de subir a GitHub, revisa:

```bash
git status --short
git check-ignore -v .env backend/db.sqlite3 backend/media
```

## Convención de comentarios

Los comentarios nuevos del codigo deben estar en español, con explicaciones simples y orientadas a mantener claras las reglas operativas del CCR.

## Convención de nombres

- Responsable CCR: persona del equipo que toma el seguimiento operativo del paciente.
- Kinesiólogo: cargo profesional del usuario; no debe usarse como nombre visible de asignación operativa.
- Contactabilidad: módulo operativo para registrar contactos e intentos previos al ingreso.
- Ficha operativa: vista interna de seguimiento; no es ficha clínica institucional.
- Observación operativa: nota interna de gestión; no es evolución clínica oficial.
- Los nombres internos antiguos, como `kine_asignado`, pueden mantenerse en código por compatibilidad técnica.

## Convención visual

- Azul: acciones generales, edición, filtros, guardar, aceptar y confirmar.
- Verde: acceso a ficha operativa y exportaciones Excel.
- Amarillo o naranjo: alertas operativas suaves.
- Rojo: acciones destructivas o alertas críticas.

## Ajustes fase 2 inicial

- Contactabilidad: primer contacto sin respuesta pasa a `RESCATE`; segundo contacto sin respuesta desde `RESCATE` pasa a `EGRESO_ADMINISTRATIVO` con observacion obligatoria.
- `ABANDONO` sigue reservado para pacientes ya `INGRESADOS`, asociado a inasistencias o abandono del tratamiento.
- La categoria interna `BORRADOR` se muestra al usuario como "No categorizado" y puede editarse desde la ficha operativa.
- La ficha operativa muestra un Historial de acciones unificado para leer cambios de estado, contactos e inasistencias en una sola linea de tiempo.
- El dashboard Inicio queda enfocado en Trabajo de hoy, acciones prioritarias y resumen rapido; las estadisticas detalladas viven en Estadisticas CCR.

## Desarrollo local

### Backend

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
copy .env.example .env
python backend/manage.py migrate
python backend/manage.py runserver 8000
```

Para crear usuarios demo locales, ejecuta solo si los necesitas:

```bash
python backend/manage.py generar_usuarios_demo
```

Esto crea usuarios de acceso, no pacientes reales.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend local usa `/api` y en desarrollo proxea al backend en `http://localhost:8000`.

## Demo limpia en Railway

Railway debe crear una base PostgreSQL nueva. No subas `db.sqlite3`, `media/` ni archivos Excel al repositorio.

Servicios recomendados:

- Backend: root directory `backend`, Dockerfile `backend/Dockerfile`.
- Frontend: root directory `frontend`, Dockerfile `frontend/Dockerfile`.
- PostgreSQL: servicio administrado de Railway.

Variables:

- Usa `.env.railway.example` como plantilla.
- Carga las variables del bloque backend solo en el servicio backend.
- Carga las variables del bloque frontend solo en el servicio frontend.
- Usa `DATABASE_URL` del PostgreSQL de Railway en el backend.

El backend ejecuta migraciones al iniciar. No carga pacientes ni importaciones automaticamente.

Si quieres una demo vacia pero con login, corre una vez en Railway:

```bash
python manage.py generar_usuarios_demo
```

Si quieres una base completamente vacia, no ejecutes ese comando y crea usuarios manualmente despues.

Mas detalle: ver `RAILWAY_DEPLOY.md`.
