export type Rol = "KINE" | "ADMINISTRATIVO" | "ADMIN";
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
  | "PENDIENTE"
  | "INGRESADO"
  | "RESCATE"
  | "ABANDONO"
  | "ALTA_MEDICA"
  | "EGRESO_VOLUNTARIO"
  | "DERIVADO";

export interface Usuario {
  id: number;
  rut: string;
  nombre: string;
  rol: Rol;
  is_active: boolean;
  date_joined: string;
}

export interface Paciente {
  id: number;
  id_ccr: string;
  fecha_derivacion: string;
  percapita_desde: string;
  nombre: string;
  rut: string;
  edad: number;
  diagnostico: string;
  profesional: string;
  prioridad: Prioridad;
  categoria: Categoria;
  mayor_60: boolean;
  kine_asignado: number | null;
  kine_asignado_nombre: string | null;
  estado: Estado;
  fecha_cambio_estado: string | null;
  n_intentos_contacto: number;
  n_inasistencias: number;
  fecha_ultima_inasistencia: string | null;
  motivo_ultima_inasistencia: string;
  n_meses_espera: number;
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

export interface HistorialCompletoPaciente {
  paciente: Paciente;
  movimientos: MovimientoPaciente[];
  llamados: LlamadoPaciente[];
  inasistencias: InasistenciaPaciente[];
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

export interface ImportacionResultado {
  total: number;
  importados: number;
  duplicados: number;
  errores: { hoja?: string; fila: number; motivo: string }[];
}

export interface ImportacionErrorDetalle {
  hoja?: string;
  fila: number;
  motivo: string;
}

export type ImportacionPreviewEstado = "OK" | "DUPLICADO" | "ERROR";

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
  profesional: string;
  observaciones: string;
  mayor_60: boolean;
  categoria: string;
  es_duplicado: boolean;
  estado: ImportacionPreviewEstado;
  error?: string;
}

export interface ImportacionPreviewResultado {
  total: number;
  validos: number;
  duplicados: number;
  errores: ImportacionErrorDetalle[];
  registros: ImportacionPreviewRegistro[];
  meses_detectados: Record<string, number>;
}

export type ImportacionHistorialEstado =
  | "COMPLETADO"
  | "CON_ERRORES"
  | "REEMPLAZADO"
  | "PROCESANDO";

export interface ImportacionHistorialItem {
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
  observaciones_revision: ImportacionRevisionItem[];
  observaciones_revision_count: number;
  reemplazada_por: number | null;
}

export interface ImportacionHistorialDetalle {
  mes: number;
  anio: number;
  mes_label: string;
  items: ImportacionHistorialItem[];
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

export type ImportacionRevisionTipo = "ERROR" | "RECURRENTE";
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
  profesional: string;
  observaciones: string;
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
}

export interface ImportacionRevisionResultado {
  total: number;
  pendientes: number;
  resueltos: number;
  descartados: number;
  items: ImportacionRevisionItem[];
}

export interface ImportacionRevisionActionResultado {
  item: ImportacionRevisionItem;
}

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  BORRADOR: "Borrador",
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
  DERIVADO: "Derivado",
};

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  ALTA: "Alta",
  MEDIANA: "Mediana",
  MODERADA: "Moderada",
  LICENCIA_MEDICA: "Lic. Médica",
};

// Colores por kine (nombre → color hex)
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
  mayor_60: boolean;
  derivaciones: PacienteConMovimientos[];
}
