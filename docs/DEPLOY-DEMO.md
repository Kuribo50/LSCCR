# Demo gratuita: Vercel + Render + Supabase

Versión de la app para presentar y mostrar, **con datos ficticios** (nunca la base real).

| Pieza | Dónde | Plan gratuito |
|---|---|---|
| Base de datos | Supabase | 500 MB. Se pausa tras 7 días sin uso (se reactiva desde su panel). |
| Backend (Django) | Render | Se duerme tras 15 min sin uso; la primera visita tarda ~1 min en despertar. |
| Frontend (Next.js) | Vercel | Siempre activo. |

El orden importa: primero la base, luego el backend y al final el frontend.

## 1. Supabase (base de datos)

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (región São Paulo). Guarda la contraseña de la base.
2. En el proyecto: botón **Connect** → pestaña **Session pooler**. Copia la URL; se ve así:
   `postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
3. Reemplaza `[YOUR-PASSWORD]` por tu contraseña. Si la contraseña tiene símbolos (`@`, `#`, `/`…), mejor crea una solo con letras y números.

> Usa la del **Session pooler**, no la "Direct connection": Render no llega a la conexión directa.

## 2. Render (backend)

1. Entra a [render.com](https://render.com) con tu cuenta de GitHub.
2. **New → Blueprint** y elige el repositorio `LSCCR`. Render lee `render.yaml` y propone el servicio `lista-espera-ccr-api`.
3. Te pedirá dos valores:
   - `DATABASE_URL`: la URL de Supabase del paso 1.
   - `FRONTEND_PUBLIC_URL`: déjalo vacío por ahora (lo completas en el paso 4).
4. **Apply**. El primer despliegue tarda unos 5 minutos. Al arrancar crea las tablas y carga los datos ficticios.
5. Copia la URL del servicio (algo como `https://lista-espera-ccr-api.onrender.com`) y comprueba que
   `https://…onrender.com/api/health/` responda.

## 3. Vercel (frontend)

1. Entra a [vercel.com](https://vercel.com) con GitHub → **Add New → Project** → elige `LSCCR`.
2. **Root Directory**: `frontend`. El resto lo detecta solo (Next.js).
3. En **Environment Variables** agrega (con la URL de Render del paso 2, sin `/` al final):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_PROXY` | `1` |
   | `NEXT_API_PROXY_TARGET` | `https://lista-espera-ccr-api.onrender.com` |
   | `BACKEND_INTERNAL_URL` | `https://lista-espera-ccr-api.onrender.com` |

4. **Deploy**. Al terminar te da la URL pública (`https://xxx.vercel.app`).

## 4. Cerrar el círculo

En Render → servicio → **Environment**, pon `FRONTEND_PUBLIC_URL` = la URL de Vercel y guarda (se redepliega solo).

## Entrar

| Rol | RUT | Clave |
|---|---|---|
| Administrador | 66666666K | Ccr2025* |
| Encargada (kine) | 33333333K | Ccr2025* |
| Kine | 11111111K | Ccr2025* |
| Médico | 99999999K | Ccr2025* |

Son claves públicas de demostración: no cargues datos reales en esta versión.

## Antes de presentar

- Abre `https://…onrender.com/api/health/` unos minutos antes para despertar el backend.
- Si Supabase lleva más de 7 días sin uso, entra a su panel y pulsa **Restore project**.
- Cada `git push` a `main` vuelve a desplegar Render y Vercel solos.
