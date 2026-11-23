# Despliegue a producción — checklist

Guía operativa para el primer despliegue (Docker Compose `docker-compose.prod.yml`,
o Coolify/Railway con sus variables). Los valores de ejemplo están en
`.env.production.example`. Nunca se versionan secretos reales.

## 1. Antes de desplegar

- [ ] CI en verde en `main` (backend SQLite, backend PostgreSQL, lint, build).
- [ ] `.env.production` creado fuera del repositorio con **todas** estas variables:
  - `DJANGO_SECRET_KEY`: aleatoria, **mínimo 32 caracteres**. El backend se niega a
    arrancar en producción con un valor corto o de ejemplo (`replace-me`,
    `dev-only-change-me`).
  - `POSTGRES_PASSWORD` (o `DATABASE_URL`): propia. En producción el backend se
    niega a arrancar con `postgres` o `change-me-local-only`.
  - `DJANGO_ALLOWED_HOSTS` y `DJANGO_CSRF_TRUSTED_ORIGINS` con el dominio real (https).
  - `DJANGO_DEBUG=false`, `DJANGO_ENABLE_ADMIN=false`.
  - `NEXT_PUBLIC_DEMO_MODE=false` (o ausente): oculta los accesos rápidos del login.
- [ ] Certificados TLS en `nginx/certs/` (el compose los monta de solo lectura).
- [ ] Base de datos **limpia**: no ejecutar `make loaddata` en producción.
  `backend/fixtures/initial_data.json` trae 5 usuarios de ensayo (incluido un
  superusuario administrador); es solo para desarrollo.
- [ ] Usuarios reales creados desde la pantalla de Usuarios, y usuarios demo
  desactivados o eliminados (ver más abajo "Usuarios demo").

## 2. Primer arranque

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

El backend ejecuta `migrate` y `collectstatic` al iniciar. Comprobar:

- [ ] `docker compose -f docker-compose.prod.yml ps`: todos los servicios `healthy`/`running`.
- [ ] Login con el administrador real; cambiar la contraseña inicial.
- [ ] Una carga de prueba pequeña (previsualizar y revertir dentro de 10 minutos).
- [ ] Descargar un Excel (lista de espera) y abrir una ficha de paciente.

## 3. Respaldos

Hay que respaldar **dos** cosas: la base de datos y los archivos subidos
(`backend_media`, con las planillas Excel de cada carga).

Base de datos (PostgreSQL), manual o desde un cron en el servidor:

```powershell
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > respaldo_ccr.dump
```

Restauración sobre una base vacía:

```powershell
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < respaldo_ccr.dump
```

- [ ] Programar el respaldo diario y conservar al menos 14 días, en un lugar
  distinto al servidor.
- [ ] **Probar una restauración** en un entorno aparte antes del estreno: un
  respaldo no probado no cuenta.
- [ ] Respaldar `backend_media` (volumen Docker) junto con la base.
- Los respaldos contienen datos de pacientes: cifrarlos o guardarlos con acceso
  restringido. Las carpetas locales `respaldos/` y los `*.sqlite3` están en
  `.gitignore` y nunca deben subirse al repositorio.

## 4. Rollback

Las migraciones nuevas de esta versión (`pacientes 0017–0019`, `importar 0005–0006`,
`usuarios 0003–0004`) agregan columnas y tablas y convierten datos (el rol
`ADMINISTRATIVO` pasa a `MEDICO`; las observaciones pasan a una lista). Por eso:

1. **Antes de cada despliegue**: respaldo de la base (sección 3) y anotar el
   commit actual (`git rev-parse HEAD`).
2. Si falla algo **sin** haber migrado datos nuevos: volver al commit anterior y
   reconstruir (`up -d --build`).
3. Si ya se aplicaron las migraciones y hay que volver atrás: restaurar el
   respaldo previo al despliegue y volver al commit anterior. No intentar
   revertir migraciones a mano en producción.
4. Documentar la decisión y el motivo en el canal del equipo.

## 5. Límites y operación

- **Subida de archivos**: `client_max_body_size 20M` en Nginx. El backend no valida
  el tamaño aparte; una planilla mayor a 20 MB recibe 413 de Nginx.
- **Reversión de cargas**: ventana de 10 minutos (`MINUTOS_REVERSION` en
  `backend/apps/importar/reversion.py`). Pasado ese tiempo solo el Administrador
  puede limpiar un corte.
- **Throttling de la API**: `DRF_THROTTLE_*` en el entorno (el ejemplo fija login en 10/min).
- **Sesiones**: `JWT_ACCESS_MINUTES=20`, `JWT_REFRESH_DAYS=7` recomendados.

## 6. Monitoreo y logs

- Logs: `docker compose -f docker-compose.prod.yml logs -f backend nginx frontend`.
  Gunicorn escribe acceso y errores en la salida estándar.
- [ ] Definir quién revisa los logs y con qué frecuencia las primeras semanas.
- [ ] Revisar el espacio en disco (volúmenes de PostgreSQL y media crecen con cada carga).
- [ ] Opcional: un monitor externo de disponibilidad sobre la URL pública.

## 7. Usuarios demo

Los perfiles demo y su contraseña conocida (`Ccr2025*`) existen para ensayo. Mientras
sigan en la base y `NEXT_PUBLIC_DEMO_MODE=true`, cualquiera puede entrar como
administrador. Antes de operar con pacientes reales:

- [ ] `NEXT_PUBLIC_DEMO_MODE=false` en producción.
- [ ] Desactivar o eliminar los usuarios demo (`generar_usuarios_demo` los crea) y
  cambiar la contraseña de cualquier cuenta que se conserve.
