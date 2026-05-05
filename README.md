# Lista de Espera CCR

Sistema web para gestion de lista de espera, pacientes, calendario de citas, llamados, importaciones mensuales y usuarios.

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
