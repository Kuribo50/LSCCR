# Mapa de codigo LSCCR

## Raiz

- `README.md`: introduccion y comandos principales.
- `docs/`: documentacion de arquitectura, flujo y pendientes.
- `docker-compose.yml`: entorno completo.
- `.env.example`: variables esperadas.

## Backend

- `backend/manage.py`: entrada Django.
- `backend/config/settings.py`: configuracion por entorno.
- `backend/config/urls.py`: rutas raiz `/api/`.
- `backend/fixtures/`: datos iniciales. No borrar sin revisar arranque.

### `apps.pacientes`

- `models.py`: paciente, movimientos, llamados, inasistencias, agenda y catalogo.
- `services.py`: reglas de estados, estados finales y categorizacion.
- `views.py`: API principal de lista de espera, agenda, llamados, egresos,
  exportacion e historial.
- `serializers.py`: contrato JSON que consume el frontend.
- `permissions.py`: permisos por rol y cartera.
- `exports.py`: generacion Excel de pacientes.
- `signals.py`: crea movimientos cuando cambia estado.

### `apps.importar`

- `parser.py`: lee Excel/planillas pegadas y arma previsualizacion.
- `views.py`: endpoints de previsualizacion, importacion, historial,
  observaciones y plantilla.
- `models.py`: `ImportacionMensual` y observaciones de revision.
- `management/commands/`: utilidades de reparacion/limpieza de importaciones.

### `apps.reportes`

- `views.py`: reportes mensuales, por responsable y Excel.
- `urls.py`: rutas de reportes.

### `apps.usuarios`

- `models.py`: usuario con RUT como identificador.
- `auth_views.py`: login/refresh JWT.
- `views.py`: perfil, cambio de password y administracion de usuarios.
- `permissions.py`: permisos de roles.

## Frontend

- `frontend/app/(auth)/login/page.tsx`: login y accesos demo.
- `frontend/app/(dashboard)/layout.tsx`: layout protegido y cambio obligatorio de clave.
- `frontend/app/(dashboard)/inicio/page.tsx`: dashboard operativo.
- `frontend/app/(dashboard)/lista-espera/page.tsx`: tabla principal con filtros.
- `frontend/app/(dashboard)/mis-pacientes/page.tsx`: cartera del KINE.
- `frontend/app/(dashboard)/llamados/page.tsx`: cola de contactabilidad.
- `frontend/app/(dashboard)/calendario/page.tsx`: agenda.
- `frontend/app/(dashboard)/importar/page.tsx`: carga mensual.
- `frontend/app/(dashboard)/importar/revision/page.tsx`: bandeja de revision.
- `frontend/app/(dashboard)/analisis/estadisticas/page.tsx`: reportes.
- `frontend/app/actions.ts`: cookies httpOnly y refresh JWT desde server.
- `frontend/middleware.ts`: proteccion de rutas.

## Componentes frontend

- `Sidebar.tsx` y `Navbar.tsx`: navegacion principal.
- `PacienteSearchBox.tsx`: buscador global agrupado por seccion operativa.
- `FichaPaciente.tsx`: ficha lateral del paciente.
- `CambiarEstadoModal.tsx`: cambio de estado con notas.
- `ProximaAtencionModal.tsx`: programacion de agenda.
- `RegistrarContactoModal.tsx`: contacto.
- `RegistrarInasistenciaModal.tsx`: inasistencias.
- `Skeleton.tsx` y `EmptyState.tsx`: estados de carga/vacio.

## Librerias frontend internas

- `lib/api.ts`: cliente HTTP y refresh automatico.
- `lib/auth-context.tsx`: sesion React.
- `lib/types.ts`: tipos compartidos con API.
- `lib/rut.ts`: formato/limpieza de RUT.
- `lib/tables/usePersistentTableState.ts`: preferencias de tablas.
- `lib/errors.ts`: mensajes de error legibles.
