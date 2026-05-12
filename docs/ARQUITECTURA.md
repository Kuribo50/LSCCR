# Arquitectura LSCCR

LSCCR es una aplicacion web para gestionar la Lista de Espera CCR del CESFAM Dr.
Alberto Reyes / DISAM Tome. El sistema separa backend, frontend e
infraestructura, pero ambos lados comparten el mismo vocabulario operativo:
pacientes, responsables CCR, llamados, rescate, ingresos, agenda, egresos,
importaciones y reportes.

## Estructura general

- `backend/`: API Django + DRF.
- `frontend/`: aplicacion Next.js + React.
- `docker-compose.yml`: entorno completo con PostgreSQL, Redis, backend,
  frontend y Nginx.
- `nginx/`: proxy y archivos de configuracion HTTP.
- `docs/`: documentacion para desarrollo, operacion y pendientes.

## Backend

El backend expone endpoints bajo `/api/`.

Apps principales:

- `apps.pacientes`: modelo central, estados, lista de espera, llamados, agenda,
  inasistencias, egresos, exportacion Excel e historial.
- `apps.importar`: carga mensual de derivaciones, previsualizacion,
  observaciones de revision y gestion de cortes.
- `apps.reportes`: resumen mensual, reportes por responsable y exportaciones.
- `apps.usuarios`: usuario por RUT, roles y autenticacion.

La regla mas importante es que las transiciones de estado viven en
`backend/apps/pacientes/services.py`. No duplicar esa matriz en otra app.

## Frontend

El frontend usa Next.js App Router.

- `frontend/app/(auth)/login`: inicio de sesion.
- `frontend/app/(dashboard)`: rutas protegidas.
- `frontend/components`: componentes compartidos.
- `frontend/lib/api.ts`: cliente API con refresh automatico de JWT.
- `frontend/lib/auth-context.tsx`: estado de sesion en React.
- `frontend/app/actions.ts`: server actions para cookies httpOnly.
- `frontend/middleware.ts`: proteccion de rutas antes de renderizar.

Las tablas operativas usan TanStack Table, filtros tipo Excel y persistencia de
preferencias en `localStorage`.

## Base de datos

En desarrollo puede usarse SQLite si `DJANGO_DB_ENGINE=sqlite`. En Docker y
produccion debe usarse PostgreSQL.

Modelos clave:

- `Paciente`: ficha operativa principal.
- `MovimientoPaciente`: bitacora de cambios de estado.
- `LlamadoPaciente`: intentos de contacto.
- `InasistenciaPaciente`: inasistencias clinico-operativas.
- `RegistroAgendaPaciente`: historial de agenda.
- `ImportacionMensual`: corte mensual importado.
- `Usuario`: usuario autenticado por RUT.

## Docker Compose

El entorno completo levanta:

- `postgres`: base de datos.
- `redis`: cache/sesiones cuando se configura.
- `backend`: Django + DRF.
- `frontend`: Next.js.
- `nginx`: punto de entrada HTTP.

El backend debe ejecutar migraciones antes de operar. No borrar migraciones ni
fixtures sin revisar el flujo de arranque.

## Comunicacion frontend/backend

El frontend llama rutas `/api/...`. En desarrollo Next puede proxyear esas rutas
al backend. En Docker/Nginx el proxy centraliza el acceso.

`frontend/lib/api.ts` maneja:

- timeout de requests;
- header `Authorization: Bearer <access>`;
- refresh automatico si el access vence;
- evento `ccr:refresh-sidebar` despues de mutaciones.

## Autenticacion JWT

El login usa `/api/auth/login/` con RUT y password. El backend entrega access y
refresh tokens.

El frontend guarda tokens en cookies httpOnly mediante `frontend/app/actions.ts`.
El access tambien se copia a memoria para requests cliente. El refresh token no
se expone a JavaScript del navegador.

`frontend/middleware.ts` protege las rutas del dashboard: si el access expiro y
existe refresh, intenta renovar; si falla, redirige a `/login`.

## Rutas principales

- `/login`
- `/inicio`
- `/lista-espera`
- `/mis-pacientes`
- `/llamados`
- `/calendario`
- `/importar`
- `/importar/revision`
- `/historial-mensual`
- `/egresos`
- `/analisis/estadisticas`
- `/usuarios`
- `/paciente/[rut]`
