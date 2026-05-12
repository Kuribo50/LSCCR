# Guia para desarrollador junior

Esta guia apunta a entender y modificar LSCCR sin romper flujos existentes.

## Levantar el proyecto

Con Docker:

```bash
docker-compose up -d --build
```

Backend local:

```bash
cd backend
python manage.py check
python manage.py migrate
python manage.py runserver
```

Frontend local:

```bash
cd frontend
npm install
npm run dev
```

## Donde mirar primero

- Modelos de pacientes: `backend/apps/pacientes/models.py`
- Reglas de estados: `backend/apps/pacientes/services.py`
- Endpoints de pacientes: `backend/apps/pacientes/views.py`
- Serializers/API shape: `backend/apps/pacientes/serializers.py`
- Importaciones: `backend/apps/importar/parser.py` y
  `backend/apps/importar/views.py`
- Tipos frontend: `frontend/lib/types.ts`
- Cliente API frontend: `frontend/lib/api.ts`
- Rutas frontend: `frontend/app/`

## Como agregar un endpoint

1. Define o reutiliza serializer en `serializers.py`.
2. Agrega una accion DRF con `@action` en el ViewSet o una nueva `APIView`.
3. Registra la ruta en `urls.py` si no esta dentro de un router.
4. Agrega tipo TypeScript en `frontend/lib/types.ts` si el frontend lo consume.
5. Llama el endpoint desde `frontend/lib/api.ts` usando `api.get/post/patch`.
6. Ejecuta tests backend y `npm run lint`.

No cambies nombres de rutas existentes sin revisar todas las referencias con
`rg`.

## Como agregar una columna a una tabla

1. Confirma que backend expone el campo en el serializer.
2. Agrega el campo al tipo `Paciente` si corresponde.
3. En la pagina, agrega el dato al mapeo de filas local.
4. Agrega columna en TanStack Table.
5. Si debe filtrarse tipo Excel, incluye metadata y valores en filtros.
6. Si debe persistir ancho/orden, revisa `usePersistentTableState`.
7. Prueba desktop y ancho reducido.

## Como agregar un filtro

Filtro backend:

1. Agrega query param en `PacienteViewSet.filter_queryset`.
2. Reutiliza indices/campos existentes si aplica.
3. Si el filtro afecta exportacion, confirma que `exportar` usa el mismo
   `filter_queryset`.

Filtro frontend:

1. Decide si es filtro rapido de negocio o filtro por columna.
2. Los filtros rapidos acotan el conjunto antes de TanStack Table.
3. Los filtros por columna son tipo Excel y viven en estado persistente.
4. Mantener nombres claros para no confundir ambos niveles.

## Errores comunes

- Sesion expirada: revisar cookies `access-token` y `refresh-token`.
- 401 repetido: verificar `BACKEND_INTERNAL_URL` y endpoint `/api/auth/refresh/`.
- Tabla no muestra columna nueva: revisar serializer backend y `frontend/lib/types.ts`.
- Importacion no crea pacientes: revisar primero previsualizacion y
  `observaciones_revision`.
- KINE ve pacientes de otros en ingresados: revisar `solo_mios=1` y filtros por
  rol.
- Build cambia `frontend/next-env.d.ts`: es archivo generado por Next; no mezclar
  ese ruido si el contenido vuelve a su estado original.

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

Busqueda:

```bash
rg "texto_a_buscar"
rg --files
```

## Reglas que no debes cambiar sin revisar

- `PENDIENTE -> INGRESADO / RESCATE`
- `RESCATE -> INGRESADO / EGRESO_ADMINISTRATIVO / PENDIENTE`
- `INGRESADO -> ABANDONO / ALTA_MEDICA / EGRESO_VOLUNTARIO / DERIVADO`
- `ABANDONO` solo desde `INGRESADO`
- Estados finales requieren nota
- Demo login se mantiene hasta etapa final
