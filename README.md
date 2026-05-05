# Lista de Espera CCR

Sistema web para gestion de lista de espera, pacientes, calendario de citas, llamados, importaciones mensuales y usuarios.

## Alcance del sistema

ListaEsperaCCR es una herramienta interna de apoyo operativo para la gestion de lista de espera, contactabilidad, asignacion, seguimiento y reportes del CCR. No reemplaza Trak ni la ficha clinica institucional.

- `RESCATE`: estado previo al ingreso para pacientes con contactabilidad fallida, por ejemplo dos llamados sin respuesta antes de confirmar asistencia.
- `ABANDONO`: cierre posterior al ingreso cuando el equipo evalua que el paciente abandono el proceso. No corresponde usarlo desde `PENDIENTE` ni desde `RESCATE`.
- Historial de llamados: registro operativo de cada contacto telefonico, separado del contador de intentos de contacto.
- Inasistencias: registro de ausencias a sesiones de pacientes `INGRESADOS`; dos inasistencias no justificadas generan alerta para evaluar `ABANDONO`, sin cambiar el estado automaticamente.
- Ficha operativa: vista consolidada para seguimiento CCR con datos generales, derivacion, contacto, gestion, movimientos, llamados e inasistencias.

## Trabajo de hoy y alertas operativas

La seccion Trabajo de hoy orienta la gestion diaria del CCR mostrando pacientes que requieren accion, como altas sin responsable, rescates activos, esperas prolongadas, ingresados sin proxima atencion o posibles abandonos. Es una ayuda operativa para priorizar trabajo y no reemplaza el criterio clinico, Trak ni la ficha clinica institucional.

## Reportes operativos

Los reportes operativos permiten revisar un resumen mensual del corte de derivaciones, la actividad ocurrida durante el mes, la carga por responsable y una tendencia anual de derivaciones, ingresos y egresos.

- Resumen mensual: muestra el estado actual de los pacientes derivados en el mes consultado.
- Actividad del mes: cuenta ingresos y egresos ocurridos durante el periodo, separados del corte mensual.
- Reporte por responsable: resume asignados, pendientes, rescates, ingresos y egresos por kinesiólogo responsable, manteniendo compatibilidad con `kine_asignado`.
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
