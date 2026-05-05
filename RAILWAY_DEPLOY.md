# Despliegue Railway

Guia breve para publicar una demo limpia desde GitHub.

## 1. Preparar GitHub

No subas datos locales. Deben quedar fuera por `.gitignore`:

- `.env`
- `backend/db.sqlite3`
- `backend/media/`
- archivos Excel/CSV/TSV importados
- logs, builds, caches y certificados

Comprueba antes de hacer commit:

```bash
git status --short
git check-ignore -v .env backend/db.sqlite3 backend/media
```

## 2. Crear servicios en Railway

Crea tres servicios:

- `ccr-backend`: desde el repo, root directory `backend`.
- `ccr-frontend`: desde el repo, root directory `frontend`.
- `ccr-postgres`: PostgreSQL administrado de Railway.

Los dos servicios de aplicacion usan Dockerfile.

## 3. Variables del backend

Usa el bloque backend de `.env.railway.example`.

Minimo necesario:

```bash
DJANGO_ENV=production
DJANGO_PRODUCTION=true
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<secret-largo-y-random>
DJANGO_DB_ENGINE=postgres
DATABASE_URL=<railway-postgres-database-url>
DJANGO_CACHE_BACKEND=locmem
DJANGO_ENABLE_ADMIN=false
DJANGO_SECURE_SSL_REDIRECT=true
DJANGO_SESSION_COOKIE_SECURE=true
DJANGO_CSRF_COOKIE_SECURE=true
DJANGO_ALLOWED_HOSTS=<backend-service>.up.railway.app
DJANGO_CSRF_TRUSTED_ORIGINS=https://<backend-service>.up.railway.app,https://<frontend-service>.up.railway.app
```

Si Railway define `RAILWAY_PUBLIC_DOMAIN`, el backend tambien lo usa para completar hosts/origins por defecto.

## 4. Variables del frontend

Usa el bloque frontend de `.env.railway.example`.

```bash
NEXT_OUTPUT_MODE=standalone
NEXT_PUBLIC_API_PROXY=1
NEXT_API_PROXY_TARGET=https://<backend-service>.up.railway.app
BACKEND_INTERNAL_URL=https://<backend-service>.up.railway.app
NEXT_PUBLIC_API_BASE_URL=/api
```

`NEXT_PUBLIC_API_PROXY=1` hace que Next reenvie `/api/*` al backend, evitando exponer rutas distintas en el navegador.

## 5. Base vacia

El backend corre:

```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

No importa pacientes, cortes ni archivos.

Para login demo sin pacientes:

```bash
python manage.py generar_usuarios_demo
```

Para una base totalmente vacia, no ejecutes ese comando.

## 6. Healthcheck

Backend:

```text
/api/health/
```

Frontend:

```text
/login
```
