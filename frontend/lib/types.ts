// Respuesta paginada DRF: el backend puede devolver un array plano (legacy) o
// un objeto { count, next, previous, results }. Los hooks SWR normalizan ambos.
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type Rol = "KINE" | "MEDICO" | "ADMIN";
export type Prioridad = "ALTA" | "MEDIANA" | "MODERADA" | "LICENCIA_MEDICA";
export type Categoria =
  | "BORRADOR"
  | "MAS65"
  | "OA_MENOS65"
  | "HOMBROS"
  | "LUMBAGOS"
  | "SDNT"
  | "SDT"
  | "OTROS_NEUROS"
  | "AATT"
  | "DUPLA";
export type Estado =
  // Debe mantenerse alineado con Paciente.Estado en backend/apps/pacientes/models.py.
  | "PENDIENTE"
  | "INGRESADO"
  | "RESCATE"
  | "ABANDONO"
  | "ALTA_MEDICA"
  | "EGRESO_VOLUNTARIO"
  | "EGRESO_ADMINISTRATIVO"
  | "DERIVADO";

export interface Usuario {
  id: number;
  rut: string;
  nombre: string;
  rol: Rol;
  is_active: boolean;
  date_joined: string;
  requiere_cambio_password: boolean;
  /** Profesional encargado: corrige datos y resuelve la Revisión de carga. */
  es_encargado?: boolean;
}

export interface Paciente {
  // Contrato principal que usa la mayoria de pantallas. Si backend agrega un
  // campo visible en tabla/exportacion, agregarlo aqui antes de usarlo en UI.
  id: number;
  id_ccr: string;
  fecha_derivacion: string;
  percapita_desde: string;
  sector_oficial: string;
  sector_cesfam: string;
  asignado_historico: boolean;
  nombre: string;
  rut: string;
  edad: number;
  diagnostico: string;
  profesional: string;
  prioridad: Prioridad;
  categoria: Categoria;
  categoria_label?: string;
  mayor_60: boolean;
  kine_asignado: number | null;
  kine_asignado_nombre: string | null;
  responsable_asignado?: number | null;
  responsable_nombre?: string | null;
  estado: Estado;
  fecha_cambio_estado: string | null;
  n_intentos_contacto: number;
  n_inasistencias: number;
  fecha_ultima_inasistencia: string | null;
  motivo_ultima_inasistencia: string;
  n_meses_espera: number;
  /** Observación o incongruencia a revisar; se muestra como chip azul. */
  alerta?: string;
  observaciones: string;
  dias_en_lista: number;
  llamados_count?: number;
  inasistencias_count?: number;
  ultimo_llamado?: LlamadoPaciente | null;
  ultima_inasistencia?: InasistenciaPaciente | null;
  // Contacto y seguimiento
  fecha_nacimiento: string | null;
  telefono: string;
  telefono_recados: string;
  email: string;
  fecha_ingreso: string | null;
  fecha_siguiente_cita: string | null;
  proxima_atencion: string | null;
  /** Cuando el paciente pidio que lo llamen otro dia. */
  proximo_llamado?: string | null;
  /** Llamados sin respuesta en el estado actual. */
  intentos_estado?: number;
  /** Intentos sin respuesta que cambian el estado (null si no aplica). */
  intentos_umbral?: number | null;
  fecha_egreso: string | null;
  creado_en: string;
}

export interface MovimientoPaciente {
  id: number;
  paciente: number;
  usuario: number | null;
  usuario_nombre: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  fecha: string;
  notas: string;
}

export type ResultadoLlamado =
  | "CONTESTA_CONFIRMADO"
  | "NO_CONTESTA"
  | "NUMERO_EQUIVOCADO"
  | "REAGENDAR_LLAMADO"
  | "RECHAZA_ATENCION"
  | "YA_RESUELTO"
  | "OTRO";

export interface LlamadoPaciente {
  id: number;
  paciente: number;
  usuario: number | null;
  usuario_nombre: string | null;
  fecha: string;
  telefono_usado: string;
  resultado: ResultadoLlamado;
  resultado_label: string;
  notas: string;
  proxima_accion: string;
  volver_a_llamar?: string | null;
}

export interface InasistenciaPaciente {
  id: number;
  paciente: number;
  usuario: number | null;
  usuario_nombre: string | null;
  fecha: string;
  justificada: boolean;
  motivo: string;
  creado_en: string;
}

export type ResultadoAgenda =
  | "ASISTIO"
  | "NO_ASISTIO"
  | "REAGENDADO"
  | "CANCELADO";

export interface RegistroAgendaPaciente {
  id: number;
  paciente: number;
  usuario: number | null;
  usuario_nombre: string | null;
  fecha_programada: string;
  resultado: ResultadoAgenda;
  resultado_label: string;
  observacion: string;
  nueva_fecha: string | null;
  creado_en: string;
}

export interface HistorialCompletoPaciente {
  paciente: Paciente;
  movimientos: MovimientoPaciente[];
  llamados: LlamadoPaciente[];
  inasistencias: InasistenciaPaciente[];
  registros_agenda?: RegistroAgendaPaciente[];
}

export type HistorialAccionTipo =
  | "CAMBIO_ESTADO"
  | "CONTACTO"
  | "INASISTENCIA"
  | "AGENDA_ASISTIO"
  | "AGENDA_NO_ASISTIO"
  | "AGENDA_REAGENDADO"
  | "AGENDA_CANCELADO"
  | "ACTIVIDAD_GRUPAL";

export interface HistorialAccionPaciente {
  tipo: HistorialAccionTipo;
  fecha: string;
  usuario_nombre: string | null;
  actividad_id?: number;
  titulo: string;
  descripcion: string;
  observacion: string;
  estado_anterior: Estado | null;
  estado_nuevo: Estado | null;
  fecha_programada?: string | null;
  nueva_fecha?: string | null;
}

/** Un evento de la actividad reciente del equipo (de cualquier paciente). */
export interface ActividadEquipoEvento {
  tipo: HistorialAccionTipo;
  fecha: string;
  usuario_id: number | null;
  usuario_nombre: string | null;
  /** Solo en las actividades grupales: para abrir su detalle. */
  actividad_id?: number;
  /** Nulo en las actividades grupales, que no son de un solo paciente. */
  paciente_id: number | null;
  paciente_nombre: string | null;
  paciente_rut: string | null;
  paciente_id_ccr: string | null;
  titulo: string;
  descripcion: string;
  observacion: string;
  estado_anterior?: Estado | null;
  estado_nuevo?: Estado | null;
  fecha_programada?: string | null;
  nueva_fecha?: string | null;
}

export interface ActividadEquipoRespuesta {
  desde: string;
  hasta: string;
  total: number;
  por_tipo: Partial<Record<HistorialAccionTipo, number>>;
  usuarios: { id: number; nombre: string | null; total: number }[];
  acciones: ActividadEquipoEvento[];
}

export interface HistorialAccionesPaciente {
  paciente: Paciente;
  acciones: HistorialAccionPaciente[];
}

export type RiesgoNivel = "ALTO" | "MEDIO" | "BAJO";

export interface PacienteRiesgo extends Paciente {
  riesgo_score: number;
  riesgo_nivel: RiesgoNivel;
  riesgo_factores: string[];
}

export interface RiesgoAbandonoResponse {
  resumen: { alto: number; medio: number; bajo: number; total: number };
  pacientes: PacienteRiesgo[];
}

export interface AlertaOperativaGrupo {
  total: number;
  pacientes: Paciente[];
}

export interface AlertasOperativas {
  alta_sin_responsable: AlertaOperativaGrupo;
  sobre_90_dias: AlertaOperativaGrupo;
  pendientes_con_1_intento: AlertaOperativaGrupo;
  rescates_activos: AlertaOperativaGrupo;
  ingresados_sin_proxima_atencion: AlertaOperativaGrupo;
  posible_abandono: AlertaOperativaGrupo;
  telefonos_incompletos: AlertaOperativaGrupo;
}

export interface DashboardResumenOperativo {
  // Badges del sidebar y dashboard. `lista_espera_global` es el conteo nuevo de
  // PENDIENTE + RESCATE global; `sin_asignar` queda como fallback legacy.
  lista_activa: number;
  pendientes: number;
  rescate: number;
  ingresados: number;
  lista_espera_global?: number;
  sin_asignar: number;
  asignados_activos: number;
  mios_activos: number;
  rescates_globales: number;
  cola_llamados: number;
  /** Ingresados sin cita, que tambien se llaman desde la cola. */
  por_citar?: number;
  egresados: number;
  agenda_hoy: number;
}

export interface AgendaResumenDia {
  fecha: string;
  total: number;
}

export interface ResumenReporte {
  mes: number;
  anio: number;
  total_pacientes: number;
  por_estado: { estado: string; total: number }[];
  por_prioridad: { prioridad: string; total: number }[];
}

export interface KineReporte {
  kine_asignado: number | null;
  kine_asignado__nombre: string | null;
  total: number;
  pendientes: number;
  ingresados: number;
  rescate: number;
  altas: number;
}

export type ReporteResponsable = KineReporte;

export interface ReporteResumenMensual {
  mes: number;
  anio: number;
  periodo_label: string;
  corte: {
    total_derivados: number;
    pendientes: number;
    rescate: number;
    ingresados_actuales: number;
    altas_medicas: number;
    egresos_voluntarios: number;
    egresos_administrativos?: number;
    abandonos: number;
    derivados: number;
    sin_responsable: number;
    con_responsable: number;
    sobre_90_dias: number;
    promedio_dias_en_lista_actual: number;
  };
  actividad_mes: {
    ingresos: number;
    egresos_total: number;
    altas_medicas: number;
    egresos_voluntarios: number;
    egresos_administrativos?: number;
    abandonos: number;
    derivados: number;
    promedio_dias_hasta_ingreso: number;
  };
  por_estado: { estado: string; label: string; total: number }[];
  por_prioridad: { prioridad: string; label: string; total: number }[];
  por_categoria: { categoria: string; label: string; total: number }[];
  por_sector_cesfam?: { sector_cesfam: string; label: string; total: number }[];
  por_sector_oficial?: { sector_oficial: string; label: string; total: number }[];
  por_diagnostico?: { diagnostico: string; label: string; total: number }[];
}

export interface ReporteResponsableItem {
  responsable_id: number | null;
  responsable_nombre: string | null;
  total_asignados_corte: number;
  pendientes: number;
  rescate: number;
  ingresados_actuales: number;
  ingresos_mes: number;
  egresos_mes: number;
  altas_medicas_mes: number;
  egresos_voluntarios_mes: number;
  egresos_administrativos_mes?: number;
  abandonos_mes: number;
  derivados_mes: number;
  promedio_dias_hasta_ingreso: number;
  promedio_dias_en_lista_actual: number;
}

export interface ReportePorResponsable {
  mes: number;
  anio: number;
  periodo_label: string;
  responsables: ReporteResponsableItem[];
  sin_responsable: {
    total_corte: number;
    pendientes: number;
    rescate: number;
    sobre_90_dias: number;
  };
}

export interface ReporteSerieMensualItem {
  mes: number;
  periodo_label: string;
  total_derivados: number;
  ingresos: number;
  egresos_total: number;
  rescates_actuales: number;
  abandonos: number;
  altas_medicas: number;
  egresos_voluntarios: number;
  egresos_administrativos?: number;
  derivados: number;
}

export interface ReporteSerieMensual {
  anio: number;
  meses: ReporteSerieMensualItem[];
}

export interface ImportacionResultado {
  total: number;
  importados: number;
  nuevos?: number;
  duplicados: number;
  recurrentes?: number;
  errores_count?: number;
  errores: { hoja?: string; fila: number; motivo: string }[];
  meses_detectados?: Record<string, number>;
  periodos_detectados?: Record<string, number>;
  con_kine_asignado?: number;
  sin_kine_asignado?: number;
  ingresados?: number;
  pendientes?: number;
  asignado_historico?: number;
  /** Pacientes ya registrados a los que la planilla les completó el teléfono. */
  telefonos_completados?: number;
  /** Cortes creados por esta subida; se pueden revertir hasta `revertible_hasta`. */
  lote?: string;
  importaciones?: { id: number; periodo_label: string }[];
  revertible_hasta?: string;
  /** Por qué esta carga no se puede revertir (p. ej. sobrescribió un mes). */
  no_revertible_motivo?: string;
}

export type ResultadoTelefono = "ACTUALIZADO" | "SIN_CAMBIOS" | "CONFLICTO" | "NO_ENCONTRADO" | "INVALIDO";

export interface CompletarTelefonosResultado {
  total: number;
  actualizados: number;
  sin_cambios: number;
  conflictos: number;
  no_encontrados: number;
  invalidos: number;
  aplicado: boolean;
  detalle: {
    fila: number | null;
    rut: string;
    nombre?: string;
    telefono?: string;
    telefono_recados?: string;
    resultado: ResultadoTelefono;
    motivo: string;
  }[];
}

export interface ImportacionErrorDetalle {
  hoja?: string;
  fila: number;
  motivo: string;
  nombre?: string;
  rut?: string;
  fecha_derivacion?: string;
  diagnostico?: string;
  prioridad?: string;
  categoria?: string;
}

export type ImportacionPreviewEstado = "OK" | "DUPLICADO" | "ERROR" | "REVISION";

export interface ImportacionPreviewRegistro {
  hoja?: string;
  fila: number;
  nombre: string;
  rut: string;
  fecha_derivacion: string;
  edad: number;
  diagnostico: string;
  prioridad: string;
  percapita_desde: string;
  sector_oficial?: string;
  sector_cesfam?: string;
  profesional: string;
  observaciones: string;
  mayor_60: boolean;
  categoria: string;
  kine_asignado?: string;
  estado_sugerido?: Estado | string;
  recepcion_original?: string;
  asignado_historico?: boolean;
  motivo_revision?: string;
  advertencias?: string[];
  es_duplicado: boolean;
  estado: ImportacionPreviewEstado;
  error?: string;
  tipo_revision?: ImportacionRevisionTipo | "";
}

export interface ImportacionPreviewResultado {
  total: number;
  validos: number;
  nuevos: number;
  duplicados: number;
  recurrentes: number;
  errores_count: number;
  errores: ImportacionErrorDetalle[];
  registros: ImportacionPreviewRegistro[];
  meses_detectados: Record<string, number>;
  periodos_detectados?: Record<string, number>;
  con_kine_asignado?: number;
  sin_kine_asignado?: number;
  ingresados?: number;
  pendientes?: number;
  asignado_historico?: number;
  conteo_sector_cesfam?: Record<string, number>;
  conteo_categoria?: Record<string, number>;
  conteo_kine_asignado?: Record<string, number>;
}

export type ImportacionHistorialEstado =
  | "COMPLETADO"
  | "CON_ERRORES"
  | "REEMPLAZADO"
  | "PROCESANDO";

export interface ImportacionHistorialItem extends EstadoReversion {
  id: number;
  archivo_nombre: string;
  mes: number;
  anio: number;
  mes_datos: number | null;
  anio_datos: number | null;
  mes_label: string;
  periodo_label: string;
  usuario_id: number | null;
  usuario_nombre: string | null;
  fecha_subida: string;
  estado: ImportacionHistorialEstado;
  estado_label: string;
  total_registros: number;
  registros_importados: number;
  duplicados: number;
  errores: ImportacionErrorDetalle[];
  errores_count: number;
  observaciones_revision: ImportacionRevisionItem[];
  observaciones_revision_count: number;
  observaciones_pendientes_count: number;
  pacientes_actuales_del_corte?: {
    pendientes: number;
    rescate: number;
    ingresados: number;
    egresados_total: number;
  };
  reemplazada_por: number | null;
}

/** Ventana de 10 minutos para revertir una carga (apps/importar/reversion.py). */
export interface EstadoReversion {
  lote?: string;
  revertible: boolean;
  revertible_hasta: string;
  en_ventana: boolean;
  motivo_no_revertible: string;
}

export interface CargaReciente extends EstadoReversion {
  id: number;
  archivo_nombre: string;
  periodo_label: string;
  fecha_subida: string;
  usuario_nombre: string | null;
  registros_importados: number;
  duplicados: number;
  errores_count: number;
  estado: string;
  estado_label: string;
}

export interface ResumenCargas {
  mes_label: string;
  derivaciones_mes: number;
  cargas_mes: number;
  pendientes_telefono: number;
  ventana_minutos: number;
  ahora: string;
  recientes: CargaReciente[];
}

export interface ImportacionHistorialDetalle {
  mes: number;
  anio: number;
  mes_label: string;
  periodo_label?: string;
  pacientes_actuales_del_corte?: {
    pendientes: number;
    rescate: number;
    ingresados: number;
    egresados_total: number;
  };
  pacientes: ImportacionHistorialPaciente[];
  items: ImportacionHistorialItem[];
}

export interface ImportacionHistorialPaciente {
  id: number;
  id_ccr: string;
  nombre: string;
  rut: string;
  fecha_derivacion: string;
  edad: number;
  sector_oficial: string;
  sector_cesfam: string;
  diagnostico: string;
  prioridad: string;
  categoria: string;
  estado: string;
  estado_label: string;
  kine_asignado_nombre: string | null;
}

export interface ImportacionConflictoMes {
  hoja: string;
  mes: number;
  anio: number;
  importados_previos: number;
  fecha_subida_previa: string;
  importacion_id: number;
}

export interface ImportacionConflictoResponse {
  tipo: "conflicto_mes";
  mensaje: string;
  conflictos: ImportacionConflictoMes[];
  pregunta: string;
}

export interface ImportacionDeletePeriodoResultado {
  mes: number;
  anio: number;
  pacientes_eliminados: number;
  importaciones_eliminadas: number;
  archivos_eliminados: number;
}

export type ImportacionRevisionTipo = "ERROR" | "RECURRENTE" | "ADVERTENCIA";
export type ImportacionRevisionEstado = "PENDIENTE" | "RESUELTO" | "DESCARTADO";

export interface ImportacionRevisionItem {
  id: string;
  tipo: ImportacionRevisionTipo;
  tipo_label: string;
  importacion_id: number;
  revision_index: number;
  fecha_subida: string;
  usuario_nombre: string | null;
  mes: number;
  anio: number;
  mes_label: string;
  periodo_label: string;
  archivo_nombre: string;
  hoja: string;
  fila: number | null;
  motivo: string;
  accion: string;
  nombre: string;
  rut: string;
  fecha_derivacion: string;
  fecha_original: string;
  edad: number;
  diagnostico: string;
  prioridad: string;
  percapita_desde: string;
  sector_oficial: string;
  sector_cesfam: string;
  profesional: string;
  categoria: string;
  observaciones: string;
  kine_detectado?: string;
  estado_sugerido?: Estado | string;
  recepcion_original?: string;
  asignado_historico?: boolean;
  paciente_id: number | null;
  paciente_rut: string | null;
  paciente_nombre: string | null;
  paciente_estado: Estado | null;
  paciente_id_ccr: string | null;
  kine_asignado_nombre: string | null;
  requiere_revision: boolean;
  estado_revision: ImportacionRevisionEstado;
  resolucion: string;
  resuelto_en: string | null;
  resuelto_por_id: number | null;
  resuelto_por_nombre: string | null;
  /** Lo que el histórico de Tomé sabe de este RUT (solo en observaciones pendientes). */
  historico?: ImportacionRevisionHistorico;
  auto_resoluble?: boolean;
  auto_motivo?: string;
  /** Recurrente cuya ficha está egresada: puede volver a la lista con esta derivación. */
  egresado?: boolean;
  egresado_estado?: string;
  /** Agrupa una acción de revisión para poder deshacerla completa. */
  lote_resolucion?: string;
}

export interface ImportacionRevisionHistorico {
  encontrado: boolean;
  nombre?: string;
  edad?: number | null;
  fecha_nacimiento?: string;
  sector_oficial?: string;
  sector_cesfam?: string;
  telefono?: string;
  telefono_recados?: string;
  comuna?: string;
  centro_inscripcion?: string;
  fallecido?: boolean;
  fecha_fallecimiento?: string;
  otra_comuna?: boolean;
  nombre_coincide?: boolean | null;
  edad_coincide?: boolean | null;
}

export interface ImportacionRevisionResumen {
  por_tipo: Record<ImportacionRevisionTipo, number>;
  auto_resolubles: number;
  auto_por_tipo?: { ADVERTENCIA: number; RECURRENTE: number };
  fallecidos: number;
  otra_comuna: number;
  con_historico: number;
}

export type ImportacionRevisionAlerta = "FALLECIDO" | "OTRA_COMUNA" | "AUTO" | "DATOS_DISTINTOS";

export interface ImportacionRevisionResultado {
  total: number;
  pendientes: number;
  resueltos: number;
  descartados: number;
  resumen?: ImportacionRevisionResumen;
  items: ImportacionRevisionItem[];
}

export interface ImportacionRevisionActionResultado {
  item: ImportacionRevisionItem;
}

export const ROL_LABELS: Record<Rol, string> = {
  KINE: "Profesional",
  MEDICO: "Médico/a",
  ADMIN: "Administrador/a",
};

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  BORRADOR: "No categorizado",
  MAS65: "Mayor 65",
  OA_MENOS65: "OA <65",
  HOMBROS: "Hombros",
  LUMBAGOS: "Lumbagos",
  SDNT: "SDNT",
  SDT: "SDT",
  OTROS_NEUROS: "Otros Neuros",
  AATT: "AATT",
  DUPLA: "Dupla",
};

export const ESTADO_LABELS: Record<Estado, string> = {
  PENDIENTE: "Pendiente",
  INGRESADO: "Ingresado",
  RESCATE: "Rescate",
  ABANDONO: "Abandono",
  ALTA_MEDICA: "Alta Médica",
  EGRESO_VOLUNTARIO: "Egreso Voluntario",
  EGRESO_ADMINISTRATIVO: "Egreso administrativo",
  DERIVADO: "Derivado",
};

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  ALTA: "Alta",
  MEDIANA: "Mediana",
  MODERADA: "Moderada",
  LICENCIA_MEDICA: "Lic. Médica",
};

// Colores por responsable CCR (nombre -> color hex)
export const KINE_COLORES: Record<string, string> = {
  "Seba Salgado": "#2D6CDF",
  "Seba Campos": "#D63384",
  Mane: "#00838F",
  "M° Ignacia": "#6A1B9A",
};

export function getKineColor(nombre: string | null): string {
  if (!nombre) return "#9CA3AF";
  const normalizado = nombre.toLowerCase();
  for (const [key, color] of Object.entries(KINE_COLORES)) {
    if (normalizado.includes(key.toLowerCase())) return color;
  }
  return "#9CA3AF";
}

export const KINE_ROW_BACKGROUND: Record<string, string> = {
  "Seba Salgado": "#F8FBFF",
  "Seba Campos": "#FFF0F6",
  Mane: "#E0F7FA",
  "M° Ignacia": "#F3E5F5",
};

export function getKineRowBackground(nombre: string | null): string {
  if (!nombre) return "#FFFFFF";
  const normalizado = nombre.toLowerCase();
  for (const [key, color] of Object.entries(KINE_ROW_BACKGROUND)) {
    if (normalizado.includes(key.toLowerCase())) return color;
  }
  return "#FFFFFF";
}

export interface PacienteConMovimientos extends Paciente {
  movimientos: MovimientoPaciente[];
}

export interface PerfilPaciente {
  rut: string;
  nombre: string;
  edad: number;
  percapita_desde: string;
  sector_oficial?: string;
  sector_cesfam?: string;
  mayor_60: boolean;
  derivaciones: PacienteConMovimientos[];
}

export type ActividadGrupalEstado = "PROGRAMADA" | "REALIZADA" | "CANCELADA";
export type AsistenciaActividad = "PENDIENTE" | "ASISTIO" | "NO_ASISTIO";

export interface ParticipanteActividad {
  paciente_id: number;
  nombre: string;
  rut: string;
  id_ccr: string;
  categoria: Categoria;
  telefono: string;
  asistencia: AsistenciaActividad;
  asistencia_label: string;
}

/** Actividad o sesion grupal: varios pacientes asisten juntos en una fecha. */
export interface ActividadGrupal {
  id: number;
  nombre: string;
  descripcion: string;
  lugar: string;
  fecha_hora: string;
  duracion_minutos: number;
  estado: ActividadGrupalEstado;
  estado_label: string;
  responsable: number | null;
  responsable_nombre: string | null;
  /** Otros profesionales que dirigen la actividad junto al responsable. */
  profesionales: { id: number; nombre: string }[];
  creado_por_nombre: string | null;
  grupo: number | null;
  grupo_nombre: string | null;
  participantes: ParticipanteActividad[];
  total_participantes: number;
  total_asistentes: number;
  creado_en: string;
}

export interface MiembroGrupo {
  paciente_id: number;
  nombre: string;
  rut: string;
  categoria: Categoria;
  estado: Estado;
  telefono: string;
  edad: number;
  prioridad: Prioridad;
  proxima_atencion: string | null;
  kine_nombre: string | null;
  agregado_en: string;
}

/** Grupo guardado de pacientes (permanente o temporal) para citarlos juntos. */
export interface GrupoPacientes {
  id: number;
  nombre: string;
  descripcion: string;
  tipo: "PERMANENTE" | "TEMPORAL";
  tipo_label: string;
  vigente_hasta: string | null;
  vencido: boolean;
  activo: boolean;
  responsable: number | null;
  responsable_nombre: string | null;
  miembros: MiembroGrupo[];
  total_miembros: number;
  total_actividades: number;
  creado_en: string;
}

export type MovimientoGrupoTipo =
  | "CREADO"
  | "EDITADO"
  | "MIEMBROS_AGREGADOS"
  | "MIEMBROS_QUITADOS"
  | "ARCHIVADO"
  | "REACTIVADO"
  | "CITADO";

export interface MovimientoGrupo {
  tipo: MovimientoGrupoTipo;
  titulo: string;
  descripcion: string;
  usuario_nombre: string | null;
  fecha: string;
}

export interface HistorialGrupo {
  movimientos: MovimientoGrupo[];
  actividades: ActividadGrupal[];
}

/** Apartado de inasistencias: un paciente por fila (GET /pacientes/inasistencias-resumen/). */
export interface InasistenciaDetalle {
  id: number;
  fecha: string;
  justificada: boolean;
  motivo: string;
  usuario_nombre: string | null;
}

export interface InasistenciaPacienteResumen {
  paciente_id: number;
  id_ccr: string;
  nombre: string;
  rut: string;
  estado: Estado;
  estado_label: string;
  kine_nombre: string | null;
  telefono: string;
  total: number;
  no_justificadas: number;
  justificadas: number;
  ultima_fecha: string;
  ultimo_motivo: string;
  detalle: InasistenciaDetalle[];
}

export interface InasistenciasResumen {
  total_pacientes: number;
  total_inasistencias: number;
  no_justificadas: number;
  en_riesgo: number;
  items: InasistenciaPacienteResumen[];
}

/** Observación del paciente como entrada independiente (GET /observaciones-paciente/?paciente=id). */
export type TipoObservacion = "GENERAL" | "CLINICA" | "CONTACTO" | "ADMINISTRATIVA" | "IMPORTACION";

export interface ObservacionPaciente {
  id: number;
  paciente: number;
  tipo: TipoObservacion;
  tipo_label: string;
  texto: string;
  fijada: boolean;
  autor: number | null;
  autor_nombre: string | null;
  creado_en: string;
  actualizado_en: string;
  puede_editar: boolean;
}

/** Una subida de derivaciones que el usuario aún puede revertir (GET /importar/cargas-revertibles/). */
export interface CargaRevertible {
  lote: string;
  corte_id: number;
  archivo_nombre: string;
  periodos: string[];
  pacientes_creados: number;
  usuario_nombre: string | null;
  fecha_subida: string;
  revertible_hasta: string;
}

export interface CargasRevertiblesResultado {
  ahora: string;
  items: CargaRevertible[];
}
