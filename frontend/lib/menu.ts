import type { IconType } from "react-icons";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiGrid,
  FiLayers,
  FiGitCommit,
  FiClipboard,
  FiPhone,
  FiUpload,
  FiUsers,
  FiUser,
  FiUserX,
} from "react-icons/fi";
import type { Rol } from "@/lib/types";

export type CountKey =
  | "total"
  | "mios"
  | "rescates"
  | "cola"
  | "egresos"
  | "agendaHoy"
  | "revision";
export type Section = "principal" | "carga" | "atencion" | "seguimiento" | "analisis" | "admin";

export interface Item {
  href: string;
  label: string;
  icon: IconType;
  section: Section;
  tone: string;
  countKey?: CountKey;
}

// El menú sigue el orden del flujo de trabajo:
// panel -> carga de derivaciones -> atención (espera, llamados, agenda, ingresados)
// -> seguimiento (inasistencias, riesgo, egresos, historial) -> análisis -> administración.
export const ITEM = {
  inicio: { href: "/inicio", label: "Inicio", icon: FiGrid, section: "principal", tone: "text-blue-700" },
  importar: { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "carga", tone: "text-cyan-700" },
  revision: { href: "/importar/revision", label: "Revisión de carga", icon: FiAlertTriangle, section: "carga", tone: "text-amber-700", countKey: "revision" },
  cortes: { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "carga", tone: "text-indigo-700" },
  listaEspera: { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "atencion", tone: "text-cyan-700", countKey: "total" },
  llamados: { href: "/llamados", label: "Llamados", icon: FiPhone, section: "atencion", tone: "text-blue-700", countKey: "cola" },
  agenda: { href: "/calendario", label: "Agenda", icon: FiCalendar, section: "atencion", tone: "text-indigo-700", countKey: "agendaHoy" },
  ingresados: { href: "/mis-pacientes", label: "Ingresados", icon: FiUsers, section: "atencion", tone: "text-sky-700", countKey: "mios" },
  grupos: { href: "/grupos", label: "Grupos", icon: FiLayers, section: "atencion", tone: "text-sky-700" },
  inasistencias: { href: "/inasistencias", label: "Inasistencias", icon: FiUserX, section: "seguimiento", tone: "text-rose-700" },
  riesgo: { href: "/riesgo-abandono", label: "Riesgo de abandono", icon: FiAlertTriangle, section: "seguimiento", tone: "text-rose-700" },
  egresos: { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "seguimiento", tone: "text-indigo-700", countKey: "egresos" },
  lineaTiempo: { href: "/linea-tiempo", label: "Línea de tiempo", icon: FiGitCommit, section: "seguimiento", tone: "text-indigo-700" },
  estadisticas: { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  usuarios: { href: "/usuarios", label: "Usuarios", icon: FiUser, section: "admin", tone: "text-slate-700" },
} satisfies Record<string, Item>;

const ITEMS_ATENCION_Y_SEGUIMIENTO: Item[] = [
  ITEM.listaEspera,
  ITEM.llamados,
  ITEM.agenda,
  ITEM.ingresados,
  ITEM.grupos,
  ITEM.inasistencias,
  ITEM.riesgo,
  ITEM.egresos,
  ITEM.lineaTiempo,
  ITEM.estadisticas,
];

export const BASE_ITEMS: Record<Rol, Item[]> = {
  KINE: [ITEM.inicio, ...ITEMS_ATENCION_Y_SEGUIMIENTO],
  // Médico: solo carga y verifica derivaciones de TrakCare (ver lib/roles.ts).
  MEDICO: [ITEM.inicio, ITEM.importar, ITEM.cortes],
  ADMIN: [
    ITEM.inicio,
    ITEM.importar,
    ITEM.revision,
    ITEM.cortes,
    ...ITEMS_ATENCION_Y_SEGUIMIENTO,
    ITEM.usuarios,
  ],
};

export const SECTION_LABELS: Record<Section, string> = {
  principal: "Principal",
  carga: "Carga de derivaciones",
  atencion: "Atención",
  seguimiento: "Seguimiento",
  analisis: "Análisis",
  admin: "Administración",
};

// El profesional encargado también carga derivaciones, ve los cortes y resuelve la revisión.
const ITEMS_ENCARGADO: Item[] = [ITEM.importar, ITEM.revision, ITEM.cortes];

export function itemsConEncargado(base: Item[]): Item[] {
  const sinRepetidos = ITEMS_ENCARGADO.filter((extra) => !base.some((item) => item.href === extra.href));
  const despuesDe = base.findIndex((item) => item.href === ITEM.inicio.href);
  if (despuesDe < 0) return [...base, ...sinRepetidos];
  return [...base.slice(0, despuesDe + 1), ...sinRepetidos, ...base.slice(despuesDe + 1)];
}


export const ORDEN_SECCIONES: Section[] = ["principal", "carga", "atencion", "seguimiento", "analisis", "admin"];

/** Entradas del menú lateral para un rol, en el orden del flujo de trabajo. */
export function menuParaUsuario(rol: Rol, encargado: boolean): Item[] {
  return encargado ? itemsConEncargado(BASE_ITEMS[rol]) : BASE_ITEMS[rol];
}
