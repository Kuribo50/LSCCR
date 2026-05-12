# LSCCR

Sistema de Lista de Espera CCR para CESFAM Dr. Alberto Reyes / DISAM Tome.

LSCCR gestiona derivaciones, lista de espera, asignacion a responsables CCR,
contactabilidad, rescate, ingresos, agenda, inasistencias, egresos,
importaciones mensuales, reportes operativos y usuarios.

## Stack

- Backend: Django 5, Django REST Framework, SimpleJWT.
- Frontend: Next.js, React, TypeScript, Tailwind CSS.
- Datos y runtime: PostgreSQL, Redis, Docker Compose, Nginx.
- Exportacion e importacion: openpyxl y endpoints DRF.

## Requisitos

- Docker y Docker Compose para levantar el entorno completo.
- Node.js y npm para desarrollo frontend local.
- Python 3.11+ para desarrollo backend local.

## Levantar con Docker Compose

1. Copiar variables de entorno:

```bash
cp .env.example .env
```

2. Ajustar los valores locales de `.env`.

3. Levantar servicios:

```bash
docker-compose up -d --build
```

4. Abrir:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/
- Nginx local: http://localhost

El servicio backend ejecuta migraciones y carga `backend/fixtures/initial_data.json`
si esta disponible. No borrar ese fixture si se necesita levantar el sistema con
usuarios y datos iniciales.

## Variables principales

Ver `.env.example` para el detalle completo. Las variables minimas son:

- `DJANGO_ENV`
- `DJANGO_PRODUCTION`
- `DJANGO_DEBUG`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DJANGO_DB_ENGINE`
- `DJANGO_CACHE_BACKEND`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `REDIS_HOST`
- `REDIS_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_API_PROXY_TARGET`
- `BACKEND_INTERNAL_URL`

## Rutas principales

- `/login`: acceso al sistema. Los accesos demo se mantienen por ahora.
- `/inicio`: dashboard operativo.
- `/lista-espera`: pacientes pendientes y rescate.
- `/mis-pacientes`: ingresados/asignados.
- `/llamados`: cola de contactabilidad.
- `/calendario`: agenda e inasistencias.
- `/importar`: importacion mensual.
- `/importar/revision`: revision de observaciones de importacion.
- `/historial-mensual`: cortes e historial de importaciones.
- `/egresos`: lista de egresados.
- `/analisis/estadisticas`: reportes operativos.
- `/usuarios`: administracion de usuarios.
- `/paciente/[rut]`: perfil longitudinal por RUT.

## Roles

- `ADMIN`: administracion completa, usuarios, reportes, importaciones y vistas globales.
- `ADMINISTRATIVO`: gestion operativa, importaciones y contactabilidad segun permisos.
- `KINE`: gestion de su cartera, ingresos, agenda y seguimiento clinico operativo.

## Flujo operativo basico

1. Importar derivaciones mensuales o crear pacientes manualmente.
2. Revisar lista de espera y priorizacion.
3. Asignar responsable CCR o tomar paciente.
4. Registrar llamados y rescates cuando corresponda.
5. Ingresar paciente y agendar atenciones.
6. Registrar inasistencias y movimientos.
7. Egresar con motivo valido y observacion obligatoria cuando aplique.
8. Revisar reportes mensuales y exportaciones.

## Comandos utiles

Backend:

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test apps.pacientes apps.importar apps.reportes apps.usuarios
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Docker:

```bash
docker-compose up -d --build
docker-compose logs -f
docker-compose down
```

## Estado actual

El proyecto esta en preparacion para estreno. La limpieza actual fue conservadora:
se quitaron artefactos generados, imports/variables sin uso y documentacion
faltante, sin cambiar reglas de negocio ni accesos demo.

Ver `docs/PENDIENTES.md` para el listado de pendientes antes de estreno y
produccion.
