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

## Configuracion

Ver `.env.example` para variables disponibles. En produccion revisar
especialmente secretos, hosts, CSRF, base de datos, Redis y URL interna del
backend.

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

## Documentacion para continuar

- `docs/ARQUITECTURA.md`: estructura del sistema y comunicacion entre capas.
- `docs/FLUJO_OPERATIVO.md`: estados y procesos CCR.
- `docs/GUIA_DESARROLLADOR_JUNIOR.md`: guia practica para modificar el proyecto.
- `docs/MAPA_CODIGO.md`: ubicacion de carpetas y archivos clave.
- `docs/PENDIENTES.md`: deuda tecnica y pendientes antes de produccion.
