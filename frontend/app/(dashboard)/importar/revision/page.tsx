"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiAlertTriangle,
  FiEdit2,
  FiPlus,
  FiArrowLeft,
  FiLink,
  FiChevronDown,
  FiChevronUp,
  FiFilter,
  FiCheckCircle,
  FiDatabase,
  FiExternalLink,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
  FiSidebar,
  FiTrash2,
  FiUserCheck,
  FiX,
  FiZap,
  FiCheck,
  FiLogIn,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import MenuAcciones from "@/components/MenuAcciones";
import CampoFecha, { fechaHoyKey } from "@/components/CampoFecha";
import LoaderKine from "@/components/LoaderKine";
import BadgePrioridad from "@/components/BadgePrioridad";
import SectorBadge from "@/components/SectorBadge";
import { TONO_CATEGORIA } from "@/components/AgendaGrid";
import { formatDateDisplay, sinAcentos, fechaDDMMAAAA } from "@/lib/utils";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import type { Categoria, Paciente, Prioridad } from "@/lib/types";
import type {
  ImportacionRevisionActionResultado,
  ImportacionRevisionAlerta,
  ImportacionRevisionEstado,
  ImportacionRevisionItem,
  ImportacionRevisionResultado,
  ImportacionRevisionTipo,
} from "@/lib/types";
import { formatearRut, limpiarRut } from "@/lib/rut";
import { puedeRevisarCarga } from "@/lib/roles";
import CompletarTelefonos from "@/components/CompletarTelefonos";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import FiltroPildoras from "@/components/FiltroPildoras";
import Autocompletar from "@/components/Autocompletar";
import AdministrarDiagnosticos, { type Diagnostico } from "@/components/AdministrarDiagnosticos";
import { useAPI } from "@/lib/swr";
import { useEntradaFilas } from "@/lib/useEntradaFilas";

const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });

// =============================================================================
// Filtros, tipos y helpers
// =============================================================================

const TIPOS: Array<{ label: string; value: "TODOS" | ImportacionRevisionTipo }> = [
  { label: "Todos", value: "TODOS" },
  { label: "Errores", value: "ERROR" },
  { label: "Por revisar", value: "ADVERTENCIA" },
  { label: "Recurrentes", value: "RECURRENTE" },
];

const ESTADOS: Array<{ label: string; value: "TODOS" | ImportacionRevisionEstado }> = [
  { label: "Pendientes", value: "PENDIENTE" },
  { label: "Resueltos", value: "RESUELTO" },
  { label: "Descartados", value: "DESCARTADO" },
  { label: "Todos", value: "TODOS" },
];

const PAGINA = 100;

// Sectores que atiende el CCR. Cualquier otro (Bellavista, Dichato, Hospital,
// no identificable...) queda marcado para revisar.
const SECTORES_VALIDOS = ["AZUL", "ROJO", "VERDE", "CECOSF CERRO ESTANQUE", "CECOSF EL SANTO"];

// Sector territorial (barrio) según la sectorización del CESFAM, agrupado por sector.
const TERRITORIALES: Record<string, string[]> = {
  AZUL: [
    "CARLOS MAHNS", "OTROS AZULES", "CENTRO", "CENTENARIO", "CERRO NAVIDAD", "CERRO SAN JUAN", "FRUTILLARES",
    "CERRO ALEGRE CAR", "POBLACION EL COLO", "ALBERGUE MUNICIPAL", "VILLA LAS ARAUCARIAS", "LOS BOLDOS", "HOGAR SAN JOSE",
  ],
  ROJO: [
    "LOS BLOQUES", "MILADE ASFURA", "POBLACION 18 SEPTIEMBRE", "VILLA ALEMANIA", "LOS LAGOS", "COCHOLGUE",
    "OTROS ROJOS", "POBLACION EL MIRADOR", "DICHATO CAR", "COLIUMO CAR",
  ],
  VERDE: [
    "EL SANTO", "CERRO ESTANQUE", "OTROS VERDES", "HOGAR VILLA NAZARETH", "NACHUR - RAFAEL", "FRUTILLAR ALTO",
    "HOGAR NAZARETH", "EXTRACOMUNA", "CECOSF EL SANTO", "CECOSF CERRO ESTANQUE",
  ],
};

/** Zona (AZUL/ROJO/VERDE) a la que pertenece un sector. Los CECOSF son parte de la zona verde. */
function zonaDeSector(valor?: string): string {
  const v = normalizarSector(valor);
  if (v === "AZUL" || v === "ROJO" || v === "VERDE") return v;
  if (v.startsWith("CECOSF")) return "VERDE";
  return "";
}

/** Zona a la que pertenece un sector territorial (barrio); "" si no se conoce. */
function zonaDeTerritorial(valor?: string): string {
  const v = normalizarTerritorial(valor);
  for (const [zona, lista] of Object.entries(TERRITORIALES)) if (lista.includes(v)) return zona;
  return "";
}

const ETIQUETA_SECTOR: Record<string, string> = {
  AZUL: "Azul",
  ROJO: "Rojo",
  VERDE: "Verde",
  "CECOSF CERRO ESTANQUE": "CECOSF Cerro Estanque",
  "CECOSF EL SANTO": "CECOSF El Santo",
};

const DOT_SECTOR: Record<string, string> = {
  AZUL: "bg-blue-500",
  ROJO: "bg-red-500",
  VERDE: "bg-emerald-500",
  "CECOSF CERRO ESTANQUE": "bg-teal-500",
  "CECOSF EL SANTO": "bg-lime-500",
};

const DOT_PRIORIDAD: Record<string, string> = {
  ALTA: "bg-red-500",
  MEDIANA: "bg-amber-400",
  MODERADA: "bg-emerald-500",
  LICENCIA_MEDICA: "bg-slate-400",
};

const ALIAS_TERRITORIAL: Record<string, string> = {
  "EL SANTO": "CECOSF EL SANTO",
  "CERRO ESTANQUE": "CECOSF CERRO ESTANQUE",
};

function normalizarTerritorial(valor?: string) {
  const v = normalizarSector(valor);
  return ALIAS_TERRITORIAL[v] ?? v;
}

function normalizarSector(valor?: string) {
  return sinAcentos(valor ?? "").toUpperCase().trim();
}

function sectorValido(valor?: string) {
  return SECTORES_VALIDOS.includes(normalizarSector(valor));
}

type CampoForm = keyof RevisionForm;
type Problema = { campo: CampoForm | "general"; texto: string; grave: boolean; sugerenciaRut?: string };

/** Traduce el motivo del Excel y el cruce automático a problemas concretos por campo. */
function detectarProblemas(item: ImportacionRevisionItem, form: RevisionForm): Problema[] {
  const motivo = textoMotivo(item);
  const grave = item.tipo === "ERROR";
  const lista: Problema[] = [];
  const agregar = (campo: Problema["campo"], texto: string, extra: Partial<Problema> = {}) => {
    if (!lista.some((p) => p.campo === campo && p.texto === texto)) lista.push({ campo, texto, grave, ...extra });
  };

  if (/rut vac/i.test(motivo)) {
    const sug = motivo.match(/rut encontrado[^:]*:\s*([\dkK.\-]+)/i)?.[1];
    agregar("rut", "El RUT viene vacío en la planilla.", sug ? { sugerenciaRut: sug } : {});
  } else if (/rut (inv[aá]lid|incorrect|mal)/i.test(motivo)) {
    agregar("rut", "El RUT no es válido.");
  }
  // Los faltantes de la planilla dejan de contar en cuanto el campo se completa en el formulario.
  if (/diagn[oó]stico vac/i.test(motivo) && !form.diagnostico.trim()) agregar("diagnostico", "Falta el diagnóstico.");
  if (/fecha de derivaci/i.test(motivo) && !form.fecha_derivacion) agregar("fecha_derivacion", "Falta o no es válida la fecha de derivación.");
  if (/nombre vac/i.test(motivo) && !form.nombre.trim()) agregar("nombre", "Falta el nombre.");
  if (/edad/i.test(motivo)) agregar("edad", "Revisa la edad.");
  const edadNac = edadDesde(form.fecha_nacimiento);
  if (edadNac !== null && form.edad && Number(form.edad) !== edadNac) {
    agregar("edad", `No coincide con la fecha de nacimiento (${edadNac} años).`, { grave: false });
  }
  if (/sector territorial vac/i.test(motivo)) agregar("sector_oficial", "Falta el sector territorial.", { grave: false });
  if (/repetid|duplicad/i.test(motivo)) agregar("general", "El paciente ya aparece en otro corte (registro repetido).", { grave: false });

  if (!form.sector_cesfam) agregar("sector_cesfam", "Falta el sector.", { grave: false });
  else if (!sectorValido(form.sector_cesfam))
    agregar("sector_cesfam", `${form.sector_cesfam} no es un sector del CCR: revisar.`, { grave: false });

  const zonaSector = zonaDeSector(form.sector_cesfam);
  const zonaBarrio = zonaDeTerritorial(form.sector_oficial);
  if (zonaSector && zonaBarrio && zonaSector !== zonaBarrio) {
    agregar(
      "sector_oficial",
      `${form.sector_oficial} es de la zona ${zonaBarrio.toLowerCase()}, no de la ${zonaSector.toLowerCase()}: no pueden ir juntos.`,
      { grave: true },
    );
  }

  const h = item.historico;
  if (h?.encontrado) {
    if (h.fallecido) agregar("general", `Figura como fallecido el ${fechaDDMMAAAA(h.fecha_fallecimiento)}.`, { grave: true });
    if (h.otra_comuna) agregar("general", `Inscrito en otra comuna: ${h.comuna}.`, { grave: false });
    if (h.nombre_coincide === false) agregar("nombre", "No coincide con el nombre de la carga automática.", { grave: false });
    if (h.edad_coincide === false) agregar("edad", "No coincide con la edad de la carga automática.", { grave: false });
  }

  // Motivo que no se reconoce: se muestra tal cual. Si se reconoció y ya se corrigió, no queda nada pendiente.
  const motivoConocido =
    /rut vac|rut (inv[aá]lid|incorrect|mal)|diagn[oó]stico vac|fecha de derivaci|nombre vac|edad|sector territorial vac|repetid|duplicad/i.test(motivo);
  if (lista.length === 0 && !motivoConocido) agregar("general", motivo || item.tipo_label);
  return lista;
}

// Datos automáticos de la carga que ya están en los campos del formulario:
// no se repiten como observación.
const CLAVES_DATOS_CARGA = new Set([
  "sectorcesfam", "sector", "sector oficial", "sector territorial", "categoria", "estado sugerido",
  "estado sugerido invalido", "responsable detectado", "kine no confirmado detectado", "revision",
  "edad", "prioridad", "diagnostico",
]);

/** Separa el texto de observaciones de la planilla y deja solo las notas reales. */
function separarObservaciones(texto: string): string[] {
  return (texto || "")
    .split(/\s+\|\s+|\n+|\.\s+(?=[A-Za-zÁÉÍÓÚáéíóú][^:.]{0,30}:)/)
    .map((t) => t.replace(/^Observaci[oó]n original:\s*/i, "").replace(/\.$/, "").trim())
    .filter((t) => {
      if (!t) return false;
      const clave = t.match(/^([^:]{1,32}):/)?.[1];
      if (!clave) return true;
      const norm = sinAcentos(clave).toLowerCase().trim();
      return !CLAVES_DATOS_CARGA.has(norm);
    })
    // Sin repetidas (la planilla a veces trae la misma nota dos veces).
    .filter((t, i, lista) => lista.findIndex((x) => x.toUpperCase() === t.toUpperCase()) === i);
}

/** Campo del formulario con mensaje de problema debajo. */
function Campo({
  label,
  problemas,
  nota,
  sugerencia,
  accion,
  className = "",
  children,
}: {
  label: string;
  problemas: Problema[];
  /** Acción chica a la derecha de la etiqueta (por ejemplo, "Administrar"). */
  accion?: React.ReactNode;
  nota?: string;
  /** Valor distinto que trae la carga automática, con un botón para usarlo. */
  sugerencia?: { texto: string; onUsar: () => void } | null;
  className?: string;
  children: React.ReactNode;
}) {
  const grave = problemas.some((p) => p.grave);
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold ${problemas.length ? (grave ? "text-red-600" : "text-amber-700") : "text-slate-500 dark:text-ink-black-300"}`}>
          {label}
        </span>
        {accion}
      </div>
      <div
        className={`mt-1 rounded-lg ${
          problemas.length ? (grave ? "ring-2 ring-red-300 dark:ring-red-500/50" : "ring-2 ring-amber-300 dark:ring-amber-400/50") : ""
        }`}
      >
        {children}
      </div>
      {problemas.map((p) => (
        <p key={p.texto} className={`mt-1 text-[11px] font-semibold ${p.grave ? "text-red-600 dark:text-red-300" : "text-amber-700 dark:text-amber-200"}`}>
          {p.texto}
        </p>
      ))}
      {nota && !problemas.length && <p className="mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-300">{nota}</p>}
      {sugerencia && (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
          <FiDatabase size={10} aria-hidden="true" />
          La carga dice <span className="font-bold text-slate-700 dark:text-ink-black-100">{sugerencia.texto}</span>
          <button type="button" onClick={sugerencia.onUsar} className="font-bold text-blue-600 hover:underline dark:text-blue-300">
            Usar
          </button>
        </p>
      )}
    </div>
  );
}

/** Edad cumplida a partir de una fecha YYYY-MM-DD; null si la fecha no es válida. */
function edadDesde(fecha: string): number | null {
  const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - Number(m[1]);
  if (hoy.getMonth() + 1 < Number(m[2]) || (hoy.getMonth() + 1 === Number(m[2]) && hoy.getDate() < Number(m[3]))) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

/** Bloque del panel lateral que se puede cerrar y abrir. */
function PanelPlegable({
  titulo,
  icono,
  abierto,
  onToggle,
  children,
}: {
  titulo: string;
  icono?: React.ReactNode;
  abierto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-[var(--bg-elevated)] dark:border-ink-black-600">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {icono}
          {titulo}
        </span>
        <FiChevronDown size={14} className={`text-slate-500 dark:text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {/* El contenido se despliega y pliega con altura animada. */}
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-subtle)] px-3 pb-3 pt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 sm:col-span-6">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</span>
      <span className="h-px flex-1 bg-slate-100 dark:bg-ink-black-700" />
    </div>
  );
}

type RevisionForm = {
  nombre: string;
  rut: string;
  fecha_derivacion: string;
  edad: string;
  diagnostico: string;
  prioridad: string;
  sector_oficial: string;
  sector_cesfam: string;
  categoria: string;
  profesional: string;
  observaciones: string;
  fecha_nacimiento: string;
  email: string;
  telefono: string;
  telefono_recados: string;
  percapita_desde: string;
};

function tipoEtiqueta(item: ImportacionRevisionItem) {
  if (item.estado_revision === "RESUELTO") return "Resuelto";
  if (item.estado_revision === "DESCARTADO") return "Descartado";
  if (item.tipo === "ERROR") return item.requiere_revision ? "Error" : "Vinculado";
  if (item.tipo === "ADVERTENCIA") return "Por revisar";
  return "Recurrente";
}

function tipoClase(item: ImportacionRevisionItem) {
  if (item.estado_revision === "RESUELTO") return "ccr-preview-status ccr-preview-status-ok";
  if (item.estado_revision === "DESCARTADO")
    return "ccr-preview-status !border-slate-200 !bg-slate-100 !text-slate-500";
  if (item.tipo === "ERROR") return "ccr-preview-status ccr-preview-status-error";
  if (item.tipo === "ADVERTENCIA") return "ccr-preview-status ccr-preview-status-duplicate";
  return "ccr-preview-status ccr-preview-status-ok";
}

function toInputDate(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formFromItem(item: ImportacionRevisionItem): RevisionForm {
  // Datos tal como venían en la planilla subida; la carga automática se aplica a mano.
  return {
    nombre: item.nombre || item.paciente_nombre || "",
    rut: formatearRut(item.rut || item.paciente_rut || ""),
    fecha_derivacion: toInputDate(item.fecha_derivacion || item.fecha_original),
    edad: item.edad ? String(item.edad) : "",
    diagnostico: item.diagnostico || "",
    prioridad: item.prioridad || "MODERADA",
    sector_oficial: item.sector_oficial || "",
    sector_cesfam: item.sector_cesfam || "",
    categoria: item.categoria || "",
    profesional: item.profesional || "",
    observaciones: item.observaciones || "",
    // Lo que la carga automática ya sabe se ofrece como punto de partida editable.
    fecha_nacimiento: item.historico?.encontrado ? item.historico.fecha_nacimiento || "" : "",
    email: "",
    telefono: item.historico?.encontrado ? item.historico.telefono || "" : "",
    telefono_recados: item.historico?.encontrado ? item.historico.telefono_recados || "" : "",
    percapita_desde: item.percapita_desde || "",
  };
}

function textoMotivo(item: ImportacionRevisionItem) {
  return (item.motivo || item.accion || "").replace(/hist[oó]rico de Tom[eé]/gi, "carga automática");
}

// Columnas: las mismas de Lista de espera + las propias de la revisión.
type ColumnaId =
  | "paciente"
  | "problema"
  | "rut"
  | "edad"
  | "sector"
  | "territorial"
  | "diagnostico"
  | "derivacion"
  | "prioridad"
  | "categoria"
  | "corte"
  | "carga";

const COLUMNAS_TABLA: Array<{ id: ColumnaId; label: string; ancho: number; ordenable?: boolean }> = [
  { id: "paciente", label: "Paciente", ancho: 240, ordenable: true },
  { id: "problema", label: "Problema", ancho: 320, ordenable: true },
  { id: "rut", label: "RUT", ancho: 126, ordenable: true },
  { id: "edad", label: "Edad", ancho: 70, ordenable: true },
  { id: "sector", label: "Sector", ancho: 170, ordenable: true },
  { id: "territorial", label: "Sector territorial", ancho: 170, ordenable: true },
  { id: "diagnostico", label: "Diagnóstico", ancho: 230, ordenable: true },
  { id: "derivacion", label: "Derivación", ancho: 112, ordenable: true },
  { id: "prioridad", label: "Prioridad", ancho: 104, ordenable: true },
  { id: "categoria", label: "Categoría", ancho: 150, ordenable: true },
  { id: "corte", label: "Corte", ancho: 140, ordenable: true },
  { id: "carga", label: "Carga automática", ancho: 150 },
];
const PLANTILLA_COLUMNAS = COLUMNAS_TABLA.map((c) => `${c.ancho}px`).join(" ");
const ANCHO_TABLA = COLUMNAS_TABLA.reduce((t, c) => t + c.ancho, 0);

const ORDEN_PRIORIDAD: Record<string, number> = { ALTA: 0, MEDIANA: 1, MODERADA: 2, LICENCIA_MEDICA: 3 };
const ORDEN_TIPO: Record<string, number> = { ERROR: 0, ADVERTENCIA: 1, RECURRENTE: 2 };

function nombreTitulo(valor: string) {
  return valor.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

function valorOrden(item: ImportacionRevisionItem, col: ColumnaId): string | number {
  switch (col) {
    case "paciente":
      return (item.paciente_nombre || item.nombre || "").toLowerCase();
    case "problema":
      return ORDEN_TIPO[item.tipo] ?? 9;
    case "rut":
      return Number.parseInt(limpiarRut(item.paciente_rut || item.rut || "").slice(0, -1), 10) || 0;
    case "edad":
      return item.edad || 0;
    case "sector":
      return item.sector_cesfam || "";
    case "territorial":
      return item.sector_oficial || "";
    case "diagnostico":
      return (item.diagnostico || "").toLowerCase();
    case "derivacion":
      return toInputDate(item.fecha_derivacion || item.fecha_original) || "";
    case "prioridad":
      return ORDEN_PRIORIDAD[item.prioridad] ?? 9;
    case "categoria":
      return item.categoria || "";
    case "corte":
      return item.periodo_label || "";
    default:
      return "";
  }
}

function Chip({ children, tono }: { children: React.ReactNode; tono: "rojo" | "ambar" | "azul" | "verde" }) {
  const clase = {
    rojo: "bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-100",
    ambar: "bg-amber-50 text-amber-800 dark:!bg-amber-400/15 dark:!text-amber-100",
    azul: "bg-blue-50 text-blue-800 dark:!bg-[#151b2e] dark:!text-ink-black-100",
    verde: "bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-100",
  }[tono];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${clase}`}>{children}</span>;
}

// =============================================================================
// Componente principal
// =============================================================================

// useSearchParams necesita un Suspense para el prerender de Next.
export default function RevisionImportacionPage() {
  return (
    <Suspense fallback={null}>
      <RevisionImportacion />
    </Suspense>
  );
}

function RevisionImportacion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: catalogoDiagnosticos, mutate: mutarDiagnosticos } = useAPI<Diagnostico[]>("/diagnosticos/");
  const [administrarDiagnosticos, setAdministrarDiagnosticos] = useState(false);
  // Escritos con "Agregar" y aún sin guardar (se guardan al completar la ficha).
  const [diagnosticosNuevos, setDiagnosticosNuevos] = useState<string[]>([]);
  const [fichaPaciente, setFichaPaciente] = useState<Paciente | null>(null);
  const [data, setData] = useState<ImportacionRevisionResultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | ImportacionRevisionTipo>("TODOS");
  const [estado, setEstado] = useState<"TODOS" | ImportacionRevisionEstado>("PENDIENTE");
  const [alerta, setAlerta] = useState<ImportacionRevisionAlerta | "">("");
  const [search, setSearch] = useState("");
  const [visibles, setVisibles] = useState(PAGINA);
  const [filtroCorte, setFiltroCorte] = useState<string[]>([]);
  const [filtroSector, setFiltroSector] = useState<string[]>([]);
  const [filtroHoja, setFiltroHoja] = useState<string[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroPrioridad, setFiltroPrioridad] = useState<string[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState<string[]>([]);
  const [filtroTerritorial, setFiltroTerritorial] = useState<string[]>([]);
  const [orden, setOrden] = useState<{ col: ColumnaId; desc: boolean } | null>(null);
  const [seleccionado, setSeleccionado] = useState<ImportacionRevisionItem | null>(null);
  const [form, setForm] = useState<RevisionForm | null>(null);
  // Formulario antes de "Usar estos datos", para poder volver atrás.
  const [formPrevio, setFormPrevio] = useState<RevisionForm | null>(null);
  const [resolucion, setResolucion] = useState("");
  const [modalError, setModalError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(false);
  // Última acción hecha en esta sesión, para ofrecer "Deshacer".
  const [ultimaAccion, setUltimaAccion] = useState<{ lote: string; texto: string } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [ocultarAuto, setOcultarAuto] = useState(false);
  const [cargaAbierta, setCargaAbierta] = useState(true);
  const [lateralAbierto, setLateralAbierto] = useState(true);
  const [problemasAbierto, setProblemasAbierto] = useState(true);
  const [origenAbierto, setOrigenAbierto] = useState(false);
  const [precargados, setPrecargados] = useState<CampoForm[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  const [notaNueva, setNotaNueva] = useState("");
  const [notaEditando, setNotaEditando] = useState<{ indice: number; texto: string } | null>(null);

  useEffect(() => {
    if (user && !puedeRevisarCarga(user)) router.replace("/inicio");
  }, [user, router]);

  // Al cambiar los filtros se vuelve a mostrar el estado de carga (ajuste durante el render).
  const filtrosClave = `${estado}|${tipo}|${alerta}`;
  const [filtrosCargados, setFiltrosCargados] = useState(filtrosClave);
  if (filtrosCargados !== filtrosClave) {
    setFiltrosCargados(filtrosClave);
    setLoading(true);
    setError("");
  }

  const traerRevision = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("estado", estado);
      if (tipo !== "TODOS") params.set("tipo", tipo);
      if (alerta) params.set("alerta", alerta);
      const response = await api.get<ImportacionRevisionResultado>(`/importar/revision/?${params.toString()}`);
      setData(response);
      setVisibles(PAGINA);
    } catch (e) {
      setData({ total: 0, pendientes: 0, resueltos: 0, descartados: 0, items: [] });
      const message = getErrorMessage(e, "No se pudo cargar la revisión de importaciones.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [alerta, estado, tipo, toast]);

  const cargarRevision = useCallback(async () => {
    setLoading(true);
    setError("");
    await traerRevision();
  }, [traerRevision]);

  useCargaAlMontar(traerRevision, Boolean(user && puedeRevisarCarga(user)));

  // La ficha necesita el paciente completo, no solo el resumen de la observación.
  async function abrirFicha(pacienteId: number) {
    try {
      setFichaPaciente(await api.get<Paciente>(`/pacientes/${pacienteId}/`));
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo abrir la ficha del paciente."));
    }
  }

  const opcionesFiltro = useMemo(() => {
    const contar = (valor: (i: ImportacionRevisionItem) => string | undefined) => {
      const mapa = new Map<string, number>();
      for (const item of data?.items ?? []) {
        const v = (valor(item) ?? "").trim();
        if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
      }
      return Array.from(mapa.entries())
        .sort((x, y) => x[0].localeCompare(y[0], "es"))
        .map(([value, total]) => ({ value, label: value, total }));
    };
    return {
      cortes: contar((i) => i.periodo_label),
      sectores: contar((i) => i.sector_cesfam),
      hojas: contar((i) => i.hoja),
      territoriales: contar((i) => i.sector_oficial),
      prioridades: contar((i) => i.prioridad).map((o) => ({
        ...o,
        label: PRIORIDAD_LABELS[o.value as Prioridad] ?? o.value,
      })),
      categorias: contar((i) => i.categoria).map((o) => ({
        ...o,
        label: CATEGORIA_LABELS[o.value as Categoria] ?? o.value,
        dot: TONO_CATEGORIA[o.value as Categoria]?.dot,
      })),
    };
  }, [data]);

  const itemsFiltrados = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filtroCorte.length && !filtroCorte.includes(item.periodo_label)) return false;
      if (filtroSector.length && !filtroSector.includes(item.sector_cesfam ?? "")) return false;
      if (filtroHoja.length && !filtroHoja.includes(item.hoja ?? "")) return false;
      if (filtroPrioridad.length && !filtroPrioridad.includes(item.prioridad)) return false;
      if (filtroCategoria.length && !filtroCategoria.includes(item.categoria)) return false;
      if (filtroTerritorial.length && !filtroTerritorial.includes(item.sector_oficial ?? "")) return false;
      if (!q) return true;
      return [item.nombre, item.paciente_nombre ?? "", item.rut, item.diagnostico, item.motivo, item.hoja, item.periodo_label]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, search, filtroCorte, filtroSector, filtroHoja, filtroPrioridad, filtroCategoria, filtroTerritorial]);

  const itemsOrdenados = useMemo(() => {
    if (!orden) return itemsFiltrados;
    const factor = orden.desc ? -1 : 1;
    return [...itemsFiltrados].sort((a, b) => {
      const va = valorOrden(a, orden.col);
      const vb = valorOrden(b, orden.col);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), "es") * factor;
    });
  }, [itemsFiltrados, orden]);

  const mostrados = itemsOrdenados.slice(0, visibles);
  const resumen = data?.resumen;
  const totalGestionadas = (data?.resueltos ?? 0) + (data?.descartados ?? 0);
  const totalTodas = totalGestionadas + (data?.pendientes ?? 0);
  const avance = totalTodas > 0 ? Math.round((totalGestionadas / totalTodas) * 100) : 0;

  function abrirRevision(item: ImportacionRevisionItem) {
    const base = formFromItem(item);
    const cargados: CampoForm[] = [];
    setPrecargados(cargados);
    setNotas(separarObservaciones(base.observaciones));
    setNotaNueva("");
    setNotaEditando(null);
    setSeleccionado(item);
    setForm(base);
    setFormPrevio(null);
    setResolucion(item.resolucion || "");
    setModalError("");
  }

  // Enlace directo desde el Historial (?corte=ID&obs=N): abre esa fila una vez cargada la bandeja.
  const [enlacePendiente, setEnlacePendiente] = useState(() => {
    const params = searchParams;
    if (!params) return null;
    const corte = Number(params.get("corte"));
    const obs = Number(params.get("obs"));
    return params.has("corte") && params.has("obs") && Number.isFinite(corte) && Number.isFinite(obs) ? { corte, obs } : null;
  });
  if (enlacePendiente && data) {
    setEnlacePendiente(null);
    const item = data.items.find((i) => i.importacion_id === enlacePendiente.corte && i.revision_index === enlacePendiente.obs);
    // Si ya se resolvió, simplemente se queda en la bandeja.
    if (item) abrirRevision(item);
  }
  // Quita ?corte=&obs= de la URL para que recargar no vuelva a abrir la fila.
  useEffect(() => {
    if (searchParams?.has("corte")) router.replace("/importar/revision", { scroll: false });
  }, [searchParams, router]);

  function cerrarRevision() {
    if (actionLoading) return;
    setSeleccionado(null);
    setForm(null);
    setResolucion("");
    setModalError("");
  }

  function usarDatosHistorico() {
    const h = seleccionado?.historico;
    if (!h?.encontrado || !form) return;
    setFormPrevio(form);
    // Sector y barrio se aplican juntos para que nunca queden de zonas distintas.
    const sectorNuevo = sectorValido(h.sector_cesfam) ? normalizarSector(h.sector_cesfam) : form.sector_cesfam;
    const barrioNuevo = h.sector_oficial ? normalizarTerritorial(h.sector_oficial) : form.sector_oficial;
    const zonaS = zonaDeSector(sectorNuevo);
    const zonaB = zonaDeTerritorial(barrioNuevo);
    const coherente = !zonaS || !zonaB || zonaS === zonaB;
    setForm({
      ...form,
      nombre: h.nombre || form.nombre,
      edad: h.edad ? String(h.edad) : form.edad,
      fecha_nacimiento: h.fecha_nacimiento || form.fecha_nacimiento,
      telefono: form.telefono || h.telefono || "",
      telefono_recados: form.telefono_recados || h.telefono_recados || "",
      sector_cesfam: coherente ? sectorNuevo : form.sector_cesfam,
      sector_oficial: coherente ? barrioNuevo : form.sector_oficial,
    });
    if (!coherente) toast.warning("El sector de la carga no calza con el de la planilla: se dejó el de la planilla. Revísalo.");
    toast.info("Datos de la carga automática aplicados. Pendiente de guardar.");
  }

  function deshacerDatosHistorico() {
    if (!formPrevio) return;
    setForm(formPrevio);
    setFormPrevio(null);
    toast.info("Cambios revertidos.");
  }

  async function enviarAccion(accion: "COMPLETAR" | "DESCARTAR" | "VOLVER_A_LISTA") {
    if (!seleccionado) return;
    setActionLoading(true);
    setModalError("");
    try {
      const res = await api.patch<ImportacionRevisionActionResultado>(
        `/importar/revision/${seleccionado.importacion_id}/${seleccionado.revision_index}/`,
        {
          accion,
          resolucion,
          paciente: form
            ? {
                ...form,
                rut: limpiarRut(form.rut),
                observaciones: notas.join(" | "),
                observaciones_lista: [...notas, notaNueva.trim()].filter(Boolean),
              }
            : undefined,
        },
      );
      const nombre = seleccionado.paciente_nombre || seleccionado.nombre || "la observación";
      if (res.item.lote_resolucion) {
        setUltimaAccion({
          lote: res.item.lote_resolucion,
          texto:
            accion === "VOLVER_A_LISTA"
              ? `${nombre} volvió a la lista.`
              : `${accion === "COMPLETAR" ? "Resolviste" : "Descartaste"} a ${nombre}.`,
        });
      }
      if (accion === "VOLVER_A_LISTA") toast.success(`${nombre} volvió a la lista.`);
      else if (accion === "COMPLETAR") {
        toast.success("Observación resuelta correctamente.");
        // El diagnóstico nuevo ya quedó en el catálogo: se recarga y deja de ser "pendiente".
        setDiagnosticosNuevos([]);
        void mutarDiagnosticos();
      }
      else toast.warning("Observación descartada.");
      cerrarRevision();
      await cargarRevision();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo actualizar la revisión.");
      setModalError(message);
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function autoresolver() {
    if (!autoConfirm) {
      setAutoConfirm(true);
      return;
    }
    setAutoLoading(true);
    setAutoConfirm(false);
    try {
      const res = await api.post<{
        lote: string;
        resueltas: number;
        advertencias: number;
        recurrentes: number;
        fichas_completadas: number;
        esperas_acumuladas: number;
      }>("/importar/revision/autoresolver/", {});
      const texto =
        `Se resolvieron ${res.resueltas} observaciones: ${res.advertencias} de sector ` +
        `(${res.fichas_completadas} fichas completadas) y ${res.recurrentes} recurrentes que siguen en lista ` +
        `(${res.esperas_acumuladas} con espera aumentada).`;
      if (res.resueltas > 0) setUltimaAccion({ lote: res.lote, texto });
      toast.success(texto);
      await cargarRevision();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo resolver automáticamente."));
    } finally {
      setAutoLoading(false);
    }
  }

  async function deshacer(payload: { lote: string } | { items: Array<{ importacion_id: number; index: number }> }) {
    setDeshaciendo(true);
    try {
      const res = await api.post<{ deshechas: number; fichas_restauradas: number; fichas_creadas_conservadas: number }>(
        "/importar/revision/deshacer/",
        payload,
      );
      toast.success(
        `${res.deshechas} observación${res.deshechas !== 1 ? "es" : ""} vuelve${res.deshechas !== 1 ? "n" : ""} a pendiente` +
          (res.fichas_restauradas ? `; ${res.fichas_restauradas} ficha(s) recuperaron sus datos previos.` : ".") +
          (res.fichas_creadas_conservadas
            ? ` ${res.fichas_creadas_conservadas} ficha(s) creada(s) desde la revisión se conservan.`
            : ""),
      );
      setUltimaAccion(null);
      await cargarRevision();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo deshacer."));
    } finally {
      setDeshaciendo(false);
    }
  }

  const entradaFila = useEntradaFilas(!loading && mostrados.length > 0);

  if (!user || !puedeRevisarCarga(user)) return null;

  const h = seleccionado?.historico;

  const filtrosActivos =
    (estado !== "PENDIENTE" ? 1 : 0) +
    filtroCorte.length +
    filtroSector.length +
    filtroHoja.length +
    filtroPrioridad.length +
    filtroCategoria.length +
    filtroTerritorial.length +
    (alerta ? 1 : 0);
  const hayFiltros = filtrosActivos > 0 || tipo !== "TODOS" || search.trim() !== "";
  const conteoTipo = (v: "TODOS" | ImportacionRevisionTipo) =>
    estado !== "PENDIENTE" || !resumen
      ? undefined
      : v === "TODOS"
        ? resumen.por_tipo.ERROR + resumen.por_tipo.ADVERTENCIA + resumen.por_tipo.RECURRENTE
        : resumen.por_tipo[v];

  function limpiarFiltros() {
    setAlerta("");
    setTipo("TODOS");
    setEstado("PENDIENTE");
    setSearch("");
    setFiltroCorte([]);
    setFiltroSector([]);
    setFiltroHoja([]);
    setFiltroPrioridad([]);
    setFiltroCategoria([]);
    setFiltroTerritorial([]);
  }

  function alternarOrden(col: ColumnaId) {
    setOrden((prev) => (!prev || prev.col !== col ? { col, desc: false } : !prev.desc ? { col, desc: true } : null));
  }

  // Filtros de un solo valor (los aplica el servidor) usando el mismo selector ovalado.
  const unico = <T extends string>(valores: string[], vacio: T) =>
    (valores.length ? valores[valores.length - 1] : vacio) as T;
  const etiquetaN = (label: string, n?: number) => ({ label, total: n });

  return (
    <div className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-2rem))] flex-col overflow-hidden border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800">
        <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-ink-black-600 dark:bg-ink-black-800">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="sr-only">Revisión de carga</h1>
                <p className="text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{data?.pendientes ?? 0}</span> observaciones pendientes
                  {itemsFiltrados.length !== (data?.items.length ?? 0) && (
                    <>
                      {" · "}mostrando <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{itemsFiltrados.length}</span>
                    </>
                  )}
                  {totalTodas > 0 && (
                    <>
                      {" · "}
                      <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{avance}%</span> gestionado
                    </>
                  )}
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
              <div className="relative order-1 min-w-0 flex-1 sm:max-w-sm">
                <FiSearch className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={15} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nombre, RUT o motivo"
                  aria-label="Buscar en la revisión"
                  className="ccr-control-input w-full pl-9 pr-3"
                />
              </div>
              <div className="order-1 w-40 shrink-0">
                <FiltroPildoras
                  ariaLabel="Filtrar por tipo de observación"
                  valor={tipo === "TODOS" ? "" : tipo}
                  onChange={(v) => setTipo((v || "TODOS") as "TODOS" | ImportacionRevisionTipo)}
                  opciones={TIPOS.map((t) => ({
                    value: t.value === "TODOS" ? "" : t.value,
                    label: t.label,
                    dot: t.value === "ERROR" ? "bg-red-500" : t.value === "ADVERTENCIA" ? "bg-amber-400" : t.value === "RECURRENTE" ? "bg-blue-500" : undefined,
                    total: conteoTipo(t.value),
                  }))}
                />
              </div>
              <button
                type="button"
                onClick={() => setMostrarFiltros((v) => !v)}
                className="ccr-control-button order-2 ml-auto"
                aria-expanded={mostrarFiltros}
                aria-controls="revision-filtros"
              >
                <FiFilter size={13} aria-hidden="true" />
                Filtros
                {filtrosActivos > 0 && (
                  <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">{filtrosActivos}</span>
                )}
              </button>
              {hayFiltros && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  aria-label="Quitar todos los filtros"
                  title="Quitar filtros"
                  className="order-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-900/60 dark:bg-transparent dark:text-red-300"
                >
                  <FiX size={15} aria-hidden="true" />
                </button>
              )}
              <div className="order-2">
                <MenuAcciones
                  acciones={[
                    {
                      label: "Actualizar",
                      detalle: "Vuelve a cargar la revisión",
                      tono: "azul",
                      icon: <FiRefreshCw size={13} aria-hidden="true" />,
                      onClick: () => void cargarRevision(),
                    },
                    {
                      label: "Volver a importar",
                      detalle: "Subir otra planilla",
                      tono: "verde",
                      icon: <FiArrowLeft size={13} aria-hidden="true" />,
                      onClick: () => router.push("/importar"),
                    },
                    {
                      label: "Copiar enlace",
                      detalle: "De esta vista",
                      tono: "gris",
                      icon: <FiLink size={13} aria-hidden="true" />,
                      onClick: () => {
                        void navigator.clipboard?.writeText(window.location.href).then(() => toast.info("Enlace copiado."));
                      },
                    },
                  ]}
                />
              </div>
            </div>

            {mostrarFiltros && (
              <div
                id="revision-filtros"
                className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-ink-black-700 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
              >
                <MultiSelectFiltro
                  sinAnimacion
                  anchoCompleto
                  textoTodos
                  label="Estado"
                  values={estado === "TODOS" ? [] : [estado]}
                  opciones={ESTADOS.filter((e) => e.value !== "TODOS").map((e) => ({
                    value: e.value,
                    ...etiquetaN(
                      e.label,
                      e.value === "PENDIENTE" ? data?.pendientes : e.value === "RESUELTO" ? data?.resueltos : data?.descartados,
                    ),
                  }))}
                  onChange={(v) => setEstado(unico<"TODOS" | ImportacionRevisionEstado>(v, "TODOS"))}
                />
                <MultiSelectFiltro sinAnimacion anchoCompleto textoTodos label="Corte" values={filtroCorte} opciones={opcionesFiltro.cortes} onChange={setFiltroCorte} />
                <MultiSelectFiltro sinAnimacion anchoCompleto label="Prioridad" values={filtroPrioridad} opciones={opcionesFiltro.prioridades} onChange={setFiltroPrioridad} />
                <MultiSelectFiltro sinAnimacion anchoCompleto label="Categoría" values={filtroCategoria} opciones={opcionesFiltro.categorias} onChange={setFiltroCategoria} />
                <MultiSelectFiltro sinAnimacion anchoCompleto textoTodos label="Sector" values={filtroSector} opciones={opcionesFiltro.sectores} onChange={setFiltroSector} />
                <MultiSelectFiltro sinAnimacion anchoCompleto textoTodos label="Sector territorial" values={filtroTerritorial} opciones={opcionesFiltro.territoriales} onChange={setFiltroTerritorial} />
                <MultiSelectFiltro sinAnimacion anchoCompleto label="Hoja" values={filtroHoja} opciones={opcionesFiltro.hojas} onChange={setFiltroHoja} />
                <MultiSelectFiltro
                  sinAnimacion
                  anchoCompleto
                  label="Carga automática"
                  values={alerta ? [alerta] : []}
                  opciones={[
                    { value: "FALLECIDO", ...etiquetaN("Fallecidos", resumen?.fallecidos) },
                    { value: "OTRA_COMUNA", ...etiquetaN("Otra comuna", resumen?.otra_comuna) },
                    { value: "DATOS_DISTINTOS", label: "Datos distintos" },
                    { value: "AUTO", ...etiquetaN("Se resuelven solas", resumen?.auto_resolubles) },
                  ]}
                  onChange={(v) => setAlerta(unico<ImportacionRevisionAlerta | "">(v, ""))}
                />
              </div>
            )}

            {ultimaAccion && (
              <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30 dark:bg-blue-500/10">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-100">{ultimaAccion.texto}</p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={deshaciendo}
                    onClick={() => void deshacer({ lote: ultimaAccion.lote })}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
                  >
                    <FiRotateCcw size={12} className={deshaciendo ? "animate-spin" : ""} />
                    {deshaciendo ? "Deshaciendo..." : "Deshacer"}
                  </button>
                  <button type="button" onClick={() => setUltimaAccion(null)} aria-label="Cerrar aviso" className="rounded-md px-2 py-1.5 text-blue-700 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-white/10">
                    <FiX size={14} />
                  </button>
                </div>
              </div>
            )}

            {resumen && resumen.auto_resolubles > 0 && estado === "PENDIENTE" && !ocultarAuto && (
              <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/30 dark:bg-blue-500/10">
                <p className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-100">
                  <FiZap size={13} />
                  {resumen.auto_resolubles} observaci{resumen.auto_resolubles !== 1 ? "ones se pueden" : "ón se puede"} resolver sola{resumen.auto_resolubles !== 1 ? "s" : ""} con la carga automática.
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAlerta("AUTO");
                      setTipo("TODOS");
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-50"
                  >
                    Ver cuáles
                  </button>
                  <button
                    type="button"
                    onClick={() => void autoresolver()}
                    disabled={autoLoading}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold text-white transition disabled:opacity-60 ${
                      autoConfirm ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    <FiCheckCircle size={12} />
                    {autoLoading ? "Resolviendo..." : autoConfirm ? `Confirmar (${resumen.auto_resolubles})` : "Resolver automáticamente"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOcultarAuto(true)}
                    aria-label="Ocultar aviso"
                    title="Ocultar"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-white/10"
                  >
                    <FiX size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{error}</div>
        )}

        <section className="ccr-data-table ccr-operational-table relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-ink-black-800">
          {loading ? (
            <div className="flex min-h-[320px] flex-1 items-center justify-center">
              <LoaderKine enLinea retrasoMs={0} />
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] text-blue-500">
                <FiCheckCircle size={22} />
              </span>
              <p className="mt-3 text-sm font-bold text-slate-700 dark:!text-white">Bandeja limpia</p>
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">No hay observaciones con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="ccr-table-scroll min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]">
              <div className="w-full bg-white dark:bg-ink-black-800" style={{ minWidth: ANCHO_TABLA }}>
                <div
                  className="ccr-table-head sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-900"
                  style={{ gridTemplateColumns: PLANTILLA_COLUMNAS }}
                >
                  {COLUMNAS_TABLA.map((col) => {
                    const activo = orden?.col === col.id;
                    return (
                      <div key={col.id} className="group relative flex h-11 items-center px-2.5">
                        <button
                          type="button"
                          disabled={!col.ordenable}
                          onClick={() => alternarOrden(col.id)}
                          className="ccr-table-sort-button flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-bold text-slate-500 outline-none hover:text-slate-950 focus-visible:text-slate-950 disabled:cursor-default disabled:hover:text-slate-500 dark:text-ink-black-300"
                          title={col.ordenable ? "Ordenar" : undefined}
                        >
                          <span className="truncate whitespace-nowrap">{col.label}</span>
                          {activo && (
                            <span className="inline-flex shrink-0 items-center text-blue-600">
                              {orden?.desc ? <FiChevronDown size={13} /> : <FiChevronUp size={13} />}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {mostrados.map((item, idx) => {
                  const hist = item.historico;
                  const gestionada = item.estado_revision !== "PENDIENTE";
                  const entrada = entradaFila(idx);
                  const nombre = item.paciente_nombre || item.nombre || "";
                  const rut = item.paciente_rut || item.rut || "";
                  const tono = TONO_CATEGORIA[item.categoria as Categoria];
                  const celda = "flex h-[52px] min-w-0 items-center overflow-hidden px-2 text-xs text-slate-700 dark:text-ink-black-200 sm:px-3";
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirRevision(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          abrirRevision(item);
                        }
                      }}
                      className={`ccr-table-row grid w-full cursor-pointer border-b border-slate-100 bg-white outline-none transition-colors hover:bg-blue-50/60 focus-visible:bg-blue-50/60 dark:border-ink-black-700 dark:bg-ink-black-800 dark:hover:bg-blue-500/10 ${
                        gestionada ? "opacity-70" : ""
                      } ${entrada.className}`}
                      style={{ ...entrada.style, gridTemplateColumns: PLANTILLA_COLUMNAS }}
                    >
                      {/* Paciente */}
                      <div className={celda}>
                        <div className="min-w-0 leading-tight" title={nombre}>
                          <p className="truncate text-[13px] font-bold text-slate-950 dark:text-white">
                            {nombre ? nombreTitulo(nombre) : <span className="font-medium text-slate-500 dark:text-slate-400">Sin nombre</span>}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-slate-500">
                            {rut ? formatearRut(rut) : "Sin RUT"}
                          </p>
                        </div>
                      </div>
                      {/* Problema */}
                      <div className={`${celda} gap-2`}>
                        <span className={`shrink-0 ${tipoClase(item)}`}>{tipoEtiqueta(item)}</span>
                        <span className="line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-ink-black-200" title={textoMotivo(item)}>
                          {textoMotivo(item)}
                        </span>
                      </div>
                      {/* RUT */}
                      <div className={celda}>
                        <span className="truncate font-mono text-gray-600">{rut ? formatearRut(rut) : <span className="font-sans text-[11px] text-slate-500">Sin RUT</span>}</span>
                      </div>
                      {/* Edad */}
                      <div className={celda}>
                        {item.edad ? (
                          <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{item.edad}</span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500">Sin dato</span>
                        )}
                      </div>
                      {/* Sector */}
                      <div className={celda}>
                        {item.sector_cesfam ? <SectorBadge sector={item.sector_cesfam} /> : <span className="text-[11px] text-slate-500">Sin sector</span>}
                      </div>
                      {/* Sector territorial */}
                      <div className={celda}>
                        <span className="block truncate text-gray-600" title={item.sector_oficial}>
                          {item.sector_oficial || <span className="text-[11px] text-slate-500">—</span>}
                        </span>
                      </div>
                      {/* Diagnóstico */}
                      <div className={celda}>
                        <span className="truncate text-gray-600" title={item.diagnostico}>
                          {item.diagnostico || <span className="text-[11px] text-slate-500">Sin diagnóstico</span>}
                        </span>
                      </div>
                      {/* Derivación */}
                      <div className={celda}>
                        <span className="whitespace-nowrap text-gray-600">
                          {formatDateDisplay(item.fecha_derivacion || item.fecha_original) || "—"}
                        </span>
                      </div>
                      {/* Prioridad */}
                      <div className={celda}>
                        {item.prioridad && PRIORIDAD_LABELS[item.prioridad as Prioridad] ? (
                          <BadgePrioridad prioridad={item.prioridad as Prioridad} />
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </div>
                      {/* Categoría */}
                      <div className={celda}>
                        {item.categoria ? (
                          <span
                            className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:text-ink-black-100 ${tono?.bg ?? ""} ${tono?.border ?? "border-slate-200"}`}
                          >
                            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tono?.dot ?? "bg-slate-400"}`} />
                            <span className="truncate">{CATEGORIA_LABELS[item.categoria as Categoria] ?? item.categoria}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </div>
                      {/* Corte */}
                      <div className={celda}>
                        <span className="truncate text-gray-600">{item.periodo_label}</span>
                      </div>
                      {/* Carga automática */}
                      <div className={`${celda} justify-between gap-1`}>
                        {item.egresado && !gestionada ? (
                          <span title={`${item.egresado_estado}: puede volver a la lista`}>
                            <Chip tono="ambar">
                              <FiLogIn size={10} /> Egresado
                            </Chip>
                          </span>
                        ) : !hist ? (
                          <span className="text-slate-500 dark:text-slate-400">—</span>
                        ) : !hist.encontrado ? (
                          gestionada ? <span className="text-slate-500 dark:text-slate-400">—</span> : <Chip tono="ambar">Sin datos</Chip>
                        ) : hist.fallecido ? (
                          <Chip tono="rojo">
                            <FiAlertTriangle size={10} /> Fallecido
                          </Chip>
                        ) : hist.otra_comuna ? (
                          <Chip tono="ambar">Otra comuna</Chip>
                        ) : hist.nombre_coincide === false || hist.edad_coincide === false ? (
                          <Chip tono="ambar">Datos distintos</Chip>
                        ) : item.auto_resoluble ? (
                          <span title={item.auto_motivo}>
                            <Chip tono="verde">
                              <FiZap size={10} /> Se resuelve sola
                            </Chip>
                          </span>
                        ) : (
                          <Chip tono="verde">
                            <FiUserCheck size={10} /> Coincide
                          </Chip>
                        )}
                        {gestionada && (
                          <button
                            type="button"
                            disabled={deshaciendo}
                            onClick={(e) => {
                              e.stopPropagation();
                              void deshacer({ items: [{ importacion_id: item.importacion_id, index: item.revision_index }] });
                            }}
                            aria-label="Deshacer"
                            title="Deshacer"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
                          >
                            <FiRotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50/50 px-5 py-3 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-ink-black-200">
          <p>
            {itemsFiltrados.length} observaci{itemsFiltrados.length !== 1 ? "ones" : "ón"} en la tabla
            <span className="text-slate-500 dark:text-[color:var(--text-muted)]"> · mostrando {mostrados.length}</span>
          </p>
          {itemsFiltrados.length > mostrados.length && (
            <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className="font-bold text-blue-700 hover:underline dark:text-ink-black-300">
              Mostrar {Math.min(PAGINA, itemsFiltrados.length - mostrados.length)} más
            </button>
          )}
        </div>
      </div>

      {/* Modal de revisión: entra y sale animado (AnimatePresence conserva el último contenido al cerrar). */}
      <AnimatePresence>
      {seleccionado && form && (() => {
        const problemas = detectarProblemas(seleccionado, form);
        const de = (campo: CampoForm) => problemas.filter((p) => p.campo === campo);
        const notaCarga = (campo: CampoForm) => (precargados.includes(campo) ? "Cargado desde la carga automática." : undefined);
        const pendiente = seleccionado.estado_revision === "PENDIENTE";
        // Solo los barrios de la zona del sector elegido; sin sector, todos.
        const zonaElegida = zonaDeSector(form.sector_cesfam);
        const barriosVisibles = zonaElegida
          ? (TERRITORIALES[zonaElegida] ?? [])
          : Object.values(TERRITORIALES).flat();
        const territorialConocido = zonaDeTerritorial(form.sector_oficial) !== "";
        const barrioFueraDeZona = form.sector_oficial !== "" && !barriosVisibles.includes(normalizarTerritorial(form.sector_oficial));
        const input = "ccr-control-input w-full px-3 py-2 text-sm";
        // Si la carga trae un valor distinto al del formulario, lo ofrece con un botón para usarlo.
        const sug = (
          carga: string | undefined,
          actual: string,
          aplicar: (valor: string) => void,
          formato: (valor: string) => string = (v) => v,
        ) =>
          pendiente && carga && normalizarSector(carga) !== normalizarSector(actual)
            ? { texto: formato(carga), onUsar: () => aplicar(carga) }
            : null;
        // Catálogo de diagnósticos (editable); si aún no carga, los de la bandeja.
        const opcionesDiagnostico = (
          Array.from(
            new Set([
              ...(catalogoDiagnosticos?.length
                ? catalogoDiagnosticos.map((d) => d.nombre)
                : (data?.items ?? []).map((i) => (i.diagnostico || "").trim().toUpperCase()).filter(Boolean)),
              ...diagnosticosNuevos,
            ]),
          )
        )
          .sort((a, b) => a.localeCompare(b, "es"))
          .map((d) => ({ value: d, label: d }));
        const opcionesCategoria = (Object.keys(CATEGORIA_LABELS) as Categoria[]).map((c) => ({
          value: c,
          label: CATEGORIA_LABELS[c],
          dot: TONO_CATEGORIA[c]?.dot,
        }));
        return (
          <motion.div
            key="revision-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
            onClick={cerrarRevision}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label={`Revisar ${seleccionado.paciente_nombre || seleccionado.nombre || "observación"}`}
              onClick={(e) => e.stopPropagation()}
              className="ccr-panel flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            >
              {/* Encabezado */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-slate-900 dark:!text-white">
                      {nombreTitulo(seleccionado.paciente_nombre || seleccionado.nombre || "Paciente sin nombre")}
                    </h2>
                    <span className={tipoClase(seleccionado)}>{tipoEtiqueta(seleccionado)}</span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">
                    {seleccionado.periodo_label} · hoja {seleccionado.hoja || "—"} · fila {seleccionado.fila ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLateralAbierto((v) => !v)}
                    aria-pressed={lateralAbierto}
                    title={lateralAbierto ? "Ocultar panel lateral" : "Mostrar panel lateral"}
                    className="ccr-control-button hidden items-center gap-1.5 px-2.5 py-2 text-[11px] lg:inline-flex"
                  >
                    <FiSidebar size={13} aria-hidden="true" />
                    {lateralAbierto ? "Ocultar panel" : "Ver panel"}
                    {!lateralAbierto && problemas.length > 0 && (
                      <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-4 text-white">{problemas.length}</span>
                    )}
                  </button>
                  <button type="button" onClick={cerrarRevision} aria-label="Cerrar" className="ccr-control-button p-2">
                    <FiX size={16} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className={`grid gap-5 ${lateralAbierto ? "lg:grid-cols-[290px_1fr]" : ""}`}>
                  {/* Panel lateral: cada bloque se puede cerrar */}
                  <AnimatePresence initial={false}>
                  {lateralAbierto && (
                    <motion.aside
                      key="panel-lateral"
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-3 lg:sticky lg:top-0 lg:self-start"
                    >
                      <PanelPlegable
                        titulo={`Por resolver · ${problemas.length}`}
                        abierto={problemasAbierto}
                        onToggle={() => setProblemasAbierto((v) => !v)}
                      >
                        {/* Cada problema se va con una animación apenas se corrige en el formulario. */}
                        <ul className="space-y-1.5">
                          <AnimatePresence initial={false}>
                            {problemas.map((p) => (
                              <motion.li
                                key={`${p.campo}-${p.texto}`}
                                layout
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 12, height: 0, marginTop: 0 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-start gap-2 overflow-hidden text-xs"
                              >
                                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.grave ? "bg-red-500" : "bg-amber-400"}`} aria-hidden="true" />
                                <span className="text-slate-700 dark:text-ink-black-100">{p.texto}</span>
                              </motion.li>
                            ))}
                          </AnimatePresence>
                          {problemas.length === 0 && (
                            <motion.li
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                            >
                              <FiCheck size={13} aria-hidden="true" /> Todo listo para completar.
                            </motion.li>
                          )}
                        </ul>
                      </PanelPlegable>

                      <PanelPlegable
                        icono={<FiDatabase size={12} />}
                        titulo="Carga automática"
                        abierto={cargaAbierta}
                        onToggle={() => setCargaAbierta((v) => !v)}
                      >
                        {!h ? (
                          <p className="text-xs font-medium text-[var(--text-muted)]">Sin información de cruce.</p>
                        ) : !h.encontrado ? (
                          <p className="text-xs font-semibold text-amber-700 dark:!text-amber-100">Este RUT no tiene datos en la carga automática.</p>
                        ) : (
                          <>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700 dark:!text-ink-black-200">
                              {(
                                [
                                  ["Nombre", h.nombre],
                                  ["Edad", h.edad ?? "—"],
                                  ["Nacimiento", fechaDDMMAAAA(h.fecha_nacimiento) || "—"],
                                  ["Sector", h.sector_cesfam || "—"],
                                  ["Territorial", h.sector_oficial || "—"],
                                  ["Teléfono", h.telefono || "—"],
                                  ["Comuna", h.comuna || "—"],
                                ] as Array<[string, string | number | undefined]>
                              ).map(([k, v]) => (
                                <div key={k} className="contents">
                                  <dt className="font-semibold text-slate-500">{k}</dt>
                                  <dd className="truncate" title={String(v ?? "")}>{v}</dd>
                                </div>
                              ))}
                            </dl>
                            {zonaDeSector(h.sector_cesfam) && zonaDeSector(form.sector_cesfam) && zonaDeSector(h.sector_cesfam) !== zonaDeSector(form.sector_cesfam) && (
                              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800 dark:!bg-amber-400/15 dark:!text-amber-100">
                                La carga ubica a este paciente en la zona {zonaDeSector(h.sector_cesfam).toLowerCase()} y la planilla en la {zonaDeSector(form.sector_cesfam).toLowerCase()}. Confirma cuál es la correcta.
                              </p>
                            )}
                            {pendiente &&
                              (formPrevio ? (
                                <button type="button" onClick={deshacerDatosHistorico} className="ccr-control-button mt-3 inline-flex w-full items-center justify-center gap-1 px-2.5 py-1.5 text-[11px]">
                                  <FiRotateCcw size={11} /> Deshacer datos aplicados
                                </button>
                              ) : (
                                <button type="button" onClick={usarDatosHistorico} className="ccr-control-button ccr-control-button-primary mt-3 w-full px-2.5 py-1.5 text-[11px]">
                                  Usar estos datos
                                </button>
                              ))}
                          </>
                        )}
                      </PanelPlegable>

                      <PanelPlegable titulo="Origen" abierto={origenAbierto} onToggle={() => setOrigenAbierto((v) => !v)}>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-700 dark:!text-ink-black-200">
                          {(
                            [
                              ["Ficha", seleccionado.paciente_id_ccr || "no vinculada"],
                              ["Responsable", seleccionado.kine_asignado_nombre || "sin responsable"],
                              ["Archivo", seleccionado.archivo_nombre],
                            ] as Array<[string, string]>
                          ).map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="font-semibold text-slate-500">{k}</dt>
                              <dd className="break-words" title={v}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </PanelPlegable>
                    </motion.aside>
                  )}
                  </AnimatePresence>

                  {/* Formulario */}
                  <div className="grid content-start gap-x-3 gap-y-3 sm:grid-cols-6">
                    <Seccion titulo="Paciente" />
                    <Campo
                      label="Nombre"
                      problemas={de("nombre")}
                      className="sm:col-span-4"
                      sugerencia={sug(h?.nombre, form.nombre, (v) => setForm({ ...form, nombre: v }))}
                    >
                      <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })} className={input} />
                    </Campo>
                    <Campo label="RUT" problemas={de("rut")} className="sm:col-span-2">
                      <input value={form.rut} onChange={(e) => setForm({ ...form, rut: formatearRut(e.target.value) })} className={input} />
                    </Campo>
                    {de("rut").find((p) => p.sugerenciaRut) && !limpiarRut(form.rut) && (
                      <div className="-mt-1 sm:col-span-6">
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, rut: formatearRut(de("rut").find((p) => p.sugerenciaRut)!.sugerenciaRut!) })}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200"
                        >
                          Usar RUT encontrado: {formatearRut(de("rut").find((p) => p.sugerenciaRut)!.sugerenciaRut!)}
                        </button>
                      </div>
                    )}
                    <Campo
                      label="Fecha de nacimiento"
                      problemas={[]}
                      className="sm:col-span-3"
                      sugerencia={sug(h?.fecha_nacimiento, form.fecha_nacimiento, (v) => {
                        const e = edadDesde(v);
                        setForm({ ...form, fecha_nacimiento: v, edad: e !== null ? String(e) : form.edad });
                      }, fechaDDMMAAAA)}
                    >
                      <CampoFecha
                        compacto
                        altoCompacto="h-9"
                        label="Fecha de nacimiento"
                        value={form.fecha_nacimiento}
                        max={fechaHoyKey()}
                        vistaVacia="anios"
                        onChange={(valor) => {
                          const e = edadDesde(valor);
                          setForm({ ...form, fecha_nacimiento: valor, edad: e !== null ? String(e) : form.edad });
                        }}
                      />
                    </Campo>
                    <Campo
                      label="Edad"
                      problemas={de("edad")}
                      className="sm:col-span-3"
                      nota={form.fecha_nacimiento ? "Se calcula con la fecha de nacimiento." : notaCarga("edad")}
                      sugerencia={sug(h?.edad ? String(h.edad) : "", form.edad, (v) => setForm({ ...form, edad: v }))}
                    >
                      <input type="number" min="0" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} className={input} />
                    </Campo>

                    <Seccion titulo="Contacto" />
                    <Campo
                      label="Teléfono"
                      problemas={[]}
                      className="sm:col-span-3"
                      sugerencia={sug(h?.telefono, form.telefono, (v) => setForm({ ...form, telefono: v }))}
                    >
                      <input
                        type="tel"
                        inputMode="tel"
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        placeholder="+56 9 1234 5678"
                        className={input}
                      />
                    </Campo>
                    <Campo
                      label="Teléfono de recados"
                      problemas={[]}
                      className="sm:col-span-3"
                      sugerencia={sug(h?.telefono_recados, form.telefono_recados, (v) => setForm({ ...form, telefono_recados: v }))}
                    >
                      <input
                        type="tel"
                        inputMode="tel"
                        value={form.telefono_recados}
                        onChange={(e) => setForm({ ...form, telefono_recados: e.target.value })}
                        placeholder="Opcional"
                        className={input}
                      />
                    </Campo>
                    <Campo label="Correo electrónico" problemas={[]} className="sm:col-span-6">
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value.trim() })}
                        placeholder="Opcional"
                        className={input}
                      />
                    </Campo>

                    <Seccion titulo="Derivación" />
                    <Campo label="Fecha derivación" problemas={de("fecha_derivacion")} className="sm:col-span-2">
                      <CampoFecha
                        compacto
                        altoCompacto="h-9"
                        label="Fecha de derivación"
                        value={form.fecha_derivacion}
                        max={fechaHoyKey()}
                        onChange={(valor) => setForm({ ...form, fecha_derivacion: valor })}
                      />
                    </Campo>
                    <Campo label="Prioridad" problemas={de("prioridad")} className="sm:col-span-2">
                      <Autocompletar
                        ariaLabel="Prioridad"
                        placeholder="Seleccionar prioridad"
                        value={form.prioridad}
                        opciones={(["ALTA", "MEDIANA", "MODERADA", "LICENCIA_MEDICA"] as Prioridad[]).map((p) => ({
                          value: p,
                          label: PRIORIDAD_LABELS[p] ?? p,
                          dot: DOT_PRIORIDAD[p],
                        }))}
                        onChange={(v) => setForm({ ...form, prioridad: v || form.prioridad })}
                      />
                    </Campo>
                    <Campo label="Categoría" problemas={de("categoria")} className="sm:col-span-2">
                      <Autocompletar
                        ariaLabel="Categoría"
                        placeholder="Buscar categoría"
                        value={form.categoria}
                        opciones={opcionesCategoria}
                        onChange={(v) => setForm({ ...form, categoria: v })}
                      />
                    </Campo>
                    <Campo
                      label="Diagnóstico"
                      problemas={de("diagnostico")}
                      className="sm:col-span-6"
                      accion={
                        <button
                          type="button"
                          onClick={() => setAdministrarDiagnosticos(true)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:underline dark:text-blue-300"
                        >
                          <FiEdit2 size={11} /> Administrar
                        </button>
                      }
                    >
                      <Autocompletar
                        permitirLibre
                        ariaLabel="Diagnóstico"
                        placeholder="Buscar o escribir diagnóstico"
                        value={form.diagnostico}
                        opciones={opcionesDiagnostico}
                        onChange={(v) => setForm({ ...form, diagnostico: v.toUpperCase() })}
                        // No se guarda aún: entra al catálogo al completar la ficha (lo hace el backend).
                        onAgregar={(texto) => {
                          const nombre = texto.trim().toUpperCase();
                          setDiagnosticosNuevos((actuales) => (actuales.includes(nombre) ? actuales : [...actuales, nombre]));
                          toast.info(`${nombre} se guardará al completar la ficha.`);
                        }}
                      />
                    </Campo>

                    <Seccion titulo="Ubicación" />
                    <Campo
                      label="Sector"
                      problemas={de("sector_cesfam")}
                      nota={notaCarga("sector_cesfam")}
                      className="sm:col-span-3"
                      sugerencia={sug(sectorValido(h?.sector_cesfam) ? h?.sector_cesfam : "", form.sector_cesfam, (v) => setForm({ ...form, sector_cesfam: normalizarSector(v) }), (v) => ETIQUETA_SECTOR[normalizarSector(v)] ?? v)}
                    >
                      <Autocompletar
                        ariaLabel="Sector"
                        placeholder="Buscar sector"
                        value={form.sector_cesfam}
                        opciones={[
                          ...(form.sector_cesfam && !sectorValido(form.sector_cesfam)
                            ? [{ value: form.sector_cesfam, label: form.sector_cesfam, detalle: "revisar", dot: "bg-amber-400" }]
                            : []),
                          ...SECTORES_VALIDOS.map((sec) => ({ value: sec, label: ETIQUETA_SECTOR[sec], dot: DOT_SECTOR[sec] })),
                        ]}
                        onChange={(nuevo) => setForm({ ...form, sector_cesfam: nuevo })}
                      />
                    </Campo>
                    <Campo
                      label="Sector territorial"
                      problemas={de("sector_oficial")}
                      nota={notaCarga("sector_oficial") ?? (zonaElegida ? `Barrios de la zona ${zonaElegida.toLowerCase()}.` : undefined)}
                      className="sm:col-span-3"
                      sugerencia={sug(h?.sector_oficial ? normalizarTerritorial(h.sector_oficial) : "", normalizarTerritorial(form.sector_oficial), (v) => setForm({ ...form, sector_oficial: v }))}
                    >
                      <Autocompletar
                        ariaLabel="Sector territorial"
                        placeholder="Buscar sector territorial"
                        value={form.sector_oficial}
                        opciones={[
                          ...(form.sector_oficial && (!territorialConocido || barrioFueraDeZona)
                            ? [{ value: form.sector_oficial, label: form.sector_oficial, detalle: "revisar", dot: "bg-amber-400" }]
                            : []),
                          ...barriosVisibles.map((t) => ({ value: t, label: t, dot: DOT_SECTOR[zonaDeTerritorial(t)] })),
                        ]}
                        onChange={(v) => setForm({ ...form, sector_oficial: v })}
                      />
                    </Campo>
                    <Campo label="Percápita desde" problemas={[]} className="sm:col-span-3">
                      <input
                        value={form.percapita_desde}
                        onChange={(e) => setForm({ ...form, percapita_desde: e.target.value })}
                        placeholder="Ej: 2019"
                        className={input}
                      />
                    </Campo>
                    <Seccion titulo="Observaciones" />
                    <div className="sm:col-span-6">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-ink-black-300">
                        Observaciones del paciente · {notas.length}
                      </span>
                      <ul
                        className={`mt-1 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-ink-black-700 dark:border-ink-black-600 ${
                          notas.length ? "" : "hidden"
                        }`}
                      >
                        {notas.map((nota, i) => (
                          <li key={`${i}-${nota}`} className="group flex items-start gap-2 bg-white px-3 py-2 dark:bg-ink-black-800">
                            {notaEditando?.indice === i ? (
                              <>
                                <textarea
                                  autoFocus
                                  rows={2}
                                  value={notaEditando.texto}
                                  onChange={(e) => setNotaEditando({ indice: i, texto: e.target.value })}
                                  className={`${input} flex-1`}
                                />
                                <div className="flex shrink-0 flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const t = notaEditando.texto.trim();
                                      setNotas((prev) => (t ? prev.map((n, j) => (j === i ? t : n)) : prev.filter((_, j) => j !== i)));
                                      setNotaEditando(null);
                                    }}
                                    className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-blue-700"
                                  >
                                    Guardar
                                  </button>
                                  <button type="button" onClick={() => setNotaEditando(null)} className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
                                    Cancelar
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] text-slate-700 dark:text-ink-black-100">{nota}</p>
                                <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                                  <button
                                    type="button"
                                    aria-label="Editar observación"
                                    title="Editar"
                                    onClick={() => setNotaEditando({ indice: i, texto: nota })}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10"
                                  >
                                    <FiEdit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Eliminar observación"
                                    title="Eliminar"
                                    onClick={() => setNotas((prev) => prev.filter((_, j) => j !== i))}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                  >
                                    <FiTrash2 size={12} />
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                      {/* Nueva observación: campo de texto visible + botón */}
                      <div className="mt-2 flex items-start gap-2">
                        <textarea
                          rows={2}
                          value={notaNueva}
                          onChange={(e) => setNotaNueva(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && notaNueva.trim()) {
                              e.preventDefault();
                              setNotas((prev) => [...prev, notaNueva.trim()]);
                              setNotaNueva("");
                            }
                          }}
                          placeholder="Escribe una observación nueva..."
                          aria-label="Nueva observación"
                          className={`${input} min-w-0 flex-1 resize-none`}
                        />
                        <button
                          type="button"
                          disabled={!notaNueva.trim()}
                          onClick={() => {
                            setNotas((prev) => [...prev, notaNueva.trim()]);
                            setNotaNueva("");
                          }}
                          className="ccr-control-button ccr-control-button-primary inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40"
                        >
                          <FiPlus size={13} /> Agregar
                        </button>
                      </div>
                    </div>
                    <Campo label="Resolución del funcionario" problemas={[]} className="sm:col-span-6">
                      <textarea
                        value={resolucion}
                        onChange={(e) => setResolucion(e.target.value)}
                        rows={2}
                        placeholder="Ej: se corrigió la fecha, se confirmó que ya existe, se descarta por no corresponder..."
                        className={input}
                      />
                    </Campo>
                    {modalError && (
                      <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:col-span-6 dark:!bg-red-500/15 dark:!text-red-100">{modalError}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
                {seleccionado.paciente_id && user?.rol !== "MEDICO" && (
                  <button
                    type="button"
                    onClick={() => void abrirFicha(seleccionado.paciente_id as number)}
                    className="ccr-control-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs sm:mr-auto"
                  >
                    <FiExternalLink size={13} /> Abrir ficha
                  </button>
                )}
                {pendiente ? (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => void enviarAccion("DESCARTAR")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:!bg-red-950 dark:!text-red-100"
                    >
                      <FiTrash2 size={13} /> Descartar
                    </button>
                    {seleccionado.egresado ? (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void enviarAccion("VOLVER_A_LISTA")}
                        title={`Hoy: ${seleccionado.egresado_estado}. Queda Pendiente con esta derivación.`}
                        className="ccr-control-button ccr-control-button-primary inline-flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"
                      >
                        <FiLogIn size={13} /> {actionLoading ? "Guardando..." : "Volver a lista"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => void enviarAccion("COMPLETAR")}
                        className="ccr-control-button ccr-control-button-primary px-4 py-2 text-xs disabled:opacity-50"
                      >
                        {actionLoading ? "Guardando..." : "Completar y crear ficha"}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={deshaciendo}
                    onClick={async () => {
                      const it = seleccionado;
                      cerrarRevision();
                      await deshacer({ items: [{ importacion_id: it.importacion_id, index: it.revision_index }] });
                    }}
                    className="ccr-control-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    <FiRotateCcw size={13} /> Deshacer resolución
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
      </AnimatePresence>

      {/* El encargado completa también los teléfonos que faltan (no entra a Importar). */}
      <CompletarTelefonos />

      {fichaPaciente && user && (
        <FichaPaciente
          paciente={fichaPaciente}
          usuario={user}
          onClose={() => setFichaPaciente(null)}
          onRefresh={() => void cargarRevision()}
        />
      )}

      <AdministrarDiagnosticos
        abierto={administrarDiagnosticos}
        onCerrar={() => setAdministrarDiagnosticos(false)}
        diagnosticos={catalogoDiagnosticos ?? []}
        onCambio={() => void mutarDiagnosticos()}
      />
    </div>
  );
}
