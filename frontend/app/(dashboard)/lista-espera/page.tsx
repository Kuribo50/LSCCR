"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import AlertaChip from "@/components/AlertaChip";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Column, FilterFn, VisibilityState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntradaFilas } from "@/lib/useEntradaFilas";
import { FiChevronDown, FiChevronUp, FiDownload, FiFilter, FiLink, FiMail, FiPhone, FiPhoneCall, FiUpload, FiRefreshCw, FiSearch, FiUser, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import { TONO_CATEGORIA } from "@/components/AgendaGrid";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import MenuAcciones from "@/components/MenuAcciones";
import { formatearRut } from "@/lib/rut";
import { sectorColorClasses } from "@/lib/sectores";
import SectorBadge from "@/components/SectorBadge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { usePersistentTableState } from "@/lib/tables/usePersistentTableState";
import { useAPI, unwrapResults } from "@/lib/swr";
import type { Categoria, Estado, Paciente, PaginatedResponse, Prioridad } from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import {
  normalizeRut,
  normalizeSearchText,
  toCapitalizedWords,
  formatDateDisplay,
  dateSortValue,
  getResponsableLabel,
  descargarBlob,
  multiSelectFilter as multiSelectFilterBase,
} from "@/lib/utils";
import FilterPopover, {
  type ColumnMeta,
  type FilterPopoverPosition,
  PRIORIDAD_ORDER,
  getColumnMeta,
  sortFilterValues,
} from "@/components/FilterPopover";
import dynamic from "next/dynamic";
import BadgePrioridad from "@/components/BadgePrioridad";
import BadgeDias from "@/components/BadgeDias";
import LoaderKine from "@/components/LoaderKine";
import EmptyState from "@/components/EmptyState";

// Heavy components not needed on initial render — lazy-loaded to reduce bundle.
const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), {
  ssr: false,
});
const ConfirmDialog = dynamic(() => import("@/components/ConfirmDialog"), {
  ssr: false,
});

// =============================================================================
// Tipos, constantes y helpers de tabla
// =============================================================================

const LISTA_ESPERA_ESTADOS: Estado[] = ["PENDIENTE", "RESCATE"];

type WaitlistRow = {
  patient: Paciente;
  nombre: string;
  rut: string;
  rutRaw: string;
  edad: number;
  sector_oficial: string;
  sector_cesfam: string;
  diagnostico: string;
  responsable: string;
  fecha_ingreso: string | null;
  prioridad: Prioridad;
  prioridadLabel: string;
  categoria: Categoria;
  categoriaLabel: string;
  estado: Estado;
  estadoLabel: string;
  dias_en_lista: number;
  diasLabel: string;
  searchIndex: string;
};

type FilterDraftState = Record<string, string[]>;
type FilterQueryState = Record<string, string>;
type AssignContactDraft = {
  telefono: string;
  telefono_recados: string;
  email: string;
  observaciones: string;
};
type QuickFilterState = {
  // Cada filtro acepta varios valores; vacio = sin filtrar.
  estado: Estado[];
  prioridad: Prioridad[];
  categoria: Categoria[];
  sector_cesfam: string[];
  sector_oficial: string[];
  responsable: string[];
};

/** true si hay valores elegidos y el del paciente no esta entre ellos. */
function fueraDeFiltro<T>(valores: T[], valor: T) {
  return valores.length > 0 && !valores.includes(valor);
}

/** Valor del filtro Profesional: id del kine o SIN_RESPONSABLE. */
function claveResponsable(paciente: Paciente) {
  return paciente.kine_asignado ? String(paciente.kine_asignado) : "SIN_RESPONSABLE";
}

const multiSelectFilter = multiSelectFilterBase as FilterFn<WaitlistRow>;

const columnHelper = createColumnHelper<WaitlistRow>();

const BASE_COLUMN_VISIBILITY: VisibilityState = {
  responsable: true,
  nombre: true,
  rut: false,
  edad: true,
  sector_cesfam: true,
  sector_oficial: false,
  diagnostico: true,
  fecha_ingreso: true,
  prioridadLabel: true,
  categoriaLabel: true,
  dias_en_lista: true,
  acciones: true,
};

const ALERTA_LABELS: Record<string, string> = {
  alta_sin_responsable: "Alta sin responsable",
  sobre_90_dias: "Más de 90 días",
  pendientes_con_1_intento: "Pendientes con 1 intento",
  rescates_activos: "Rescates activos",
  ingresados_sin_proxima_atencion: "Ingresados sin próxima atención",
  posible_abandono: "Posible abandono",
  telefonos_incompletos: "Teléfonos incompletos",
};

function getResponsiveColumnVisibility(width: number): VisibilityState {
  if (width < 768) {
    return {
      ...BASE_COLUMN_VISIBILITY,
      responsable: false,
      edad: false,
      diagnostico: false,
      fecha_ingreso: false,
      prioridadLabel: false,
      categoriaLabel: false,
    };
  }

  if (width < 1200) {
    return {
      ...BASE_COLUMN_VISIBILITY,
      responsable: false,
      diagnostico: false,
      fecha_ingreso: false,
      categoriaLabel: false,
    };
  }

  // Pantallas medianas: se oculta la fecha de ingreso para que la tabla entre completa.
  if (width < 1500) {
    return { ...BASE_COLUMN_VISIBILITY, fecha_ingreso: false };
  }

  return BASE_COLUMN_VISIBILITY;
}

function getCompactColumnSizing(isAdmin: boolean): Record<string, number> {
  return {
    acciones: isAdmin ? 48 : 92,
    responsable: 132,
    nombre: 210,
    rut: 112,
    edad: 68,
    sector_cesfam: 140,
    sector_oficial: 150,
    diagnostico: 150,
    fecha_ingreso: 96,
    prioridadLabel: 100,
    categoriaLabel: 128,
    dias_en_lista: 76,
  };
}

// =============================================================================
// Componente principal
// =============================================================================

export default function ListaEsperaPage() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mutationError, setMutationError] = useState("");
  const [seleccionado, setSeleccionado] = useState<Paciente | null>(null);
  const [asignando, setAsignando] = useState<number | null>(null);
  const [asignarPaciente, setAsignarPaciente] = useState<Paciente | null>(null);
  const [asignarContacto, setAsignarContacto] = useState<AssignContactDraft>({
    telefono: "",
    telefono_recados: "",
    email: "",
    observaciones: "",
  });
  const [asignarError, setAsignarError] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterDraftState>({});
  const [filterQueries, setFilterQueries] = useState<FilterQueryState>({});
  const [filterPosition, setFilterPosition] = useState<FilterPopoverPosition | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; nombre: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>({
    estado: [],
    prioridad: [],
    categoria: [],
    sector_cesfam: [],
    sector_oficial: [],
    responsable: [],
  });
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef(0);
  const searchUrlAplicadoRef = useRef<string | null>(null);
  const initialTableState = useMemo(
    () => ({
      globalSearch: "",
      sorting: [{ id: "rut", desc: false as const }],
      columnFilters: [],
      columnSizing: getCompactColumnSizing(user?.rol === "ADMIN"),
      columnOrder: [
        "nombre",
        "edad",
        "categoriaLabel",
        "prioridadLabel",
        "dias_en_lista",
        "responsable",
        "sector_cesfam",
        "fecha_ingreso",
        "diagnostico",
        "sector_oficial",
        "rut",
      ],
      // El RUT ya se muestra bajo el nombre; la columna queda disponible pero oculta.
      columnVisibility: { rut: false, sector_oficial: false },
    }),
    [user?.rol],
  );
  const {
    state: tableState,
    hasHydrated,
    setGlobalSearch,
    setSorting,
    setColumnFilters,
    setColumnSizing,
    setColumnOrder,
    setColumnVisibility,
    resetTableState,
  } = usePersistentTableState({
    storageKey: "table-prefs:lista-espera:v6",
    initialState: initialTableState,
  });
  const deferredSearch = useDeferredValue(tableState.globalSearch);

  const mes = searchParams.get("mes");
  const anio = searchParams.get("anio");
  const importacionId = searchParams.get("importacion");
  const alertaParam = searchParams.get("alerta");
  const searchParam = searchParams.get("search") ?? "";
  const alertaActiva = alertaParam && ALERTA_LABELS[alertaParam] ? alertaParam : null;
  const alertaActivaLabel = alertaActiva ? ALERTA_LABELS[alertaActiva] : null;

  const swrPath = useMemo(() => {
    const params = new URLSearchParams();
    if (alertaActiva) {
      params.set("alerta", alertaActiva);
    } else {
      params.set("estado", LISTA_ESPERA_ESTADOS.join(","));
    }
    if (mes) params.set("mes", mes);
    if (anio) params.set("anio", anio);
    if (importacionId) params.set("importacion", importacionId);
    return `/pacientes/?${params.toString()}`;
  }, [alertaActiva, mes, anio, importacionId]);

  const {
    data: swrData,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useAPI<Paciente[] | PaginatedResponse<Paciente>>(swrPath);
  const pacientes = unwrapResults(swrData);

  // Actualizar de verdad: vuelve a pedir los datos y muestra el loader mientras llegan.
  async function actualizarLista() {
    setRefrescando(true);
    try {
      await Promise.all([mutate(), new Promise((r) => setTimeout(r, 400))]);
    } finally {
      setRefrescando(false);
    }
  }
  const error = mutationError || (swrError ? getErrorMessage(swrError, "No se pudo cargar la lista de espera.") : "");

  useEffect(() => {
    if (!hasHydrated || !searchParam) return;
    if (searchUrlAplicadoRef.current === searchParam) return;
    searchUrlAplicadoRef.current = searchParam;
    startTransition(() => setGlobalSearch(searchParam));
  }, [hasHydrated, searchParam, setGlobalSearch]);

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") return;

    function applyResponsiveVisibility() {
      const nextVisibility = getResponsiveColumnVisibility(window.innerWidth);
      setColumnVisibility((prev) => {
        const nextEntries = Object.entries(nextVisibility);
        const hasSameValues = nextEntries.every(
          ([key, value]) => prev[key] === value,
        );
        const hasSameLength = Object.keys(prev).length === nextEntries.length;
        if (hasSameValues && hasSameLength) return prev;
        return nextVisibility;
      });
    }

    applyResponsiveVisibility();
    window.addEventListener("resize", applyResponsiveVisibility);
    return () => window.removeEventListener("resize", applyResponsiveVisibility);
  }, [hasHydrated, setColumnVisibility]);

  useEffect(() => {
    if (!hasHydrated) return;

    const compactSizing = getCompactColumnSizing(user?.rol === "ADMIN");
    setColumnSizing((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [columnId, width] of Object.entries(compactSizing)) {
        if (next[columnId] !== width) {
          next[columnId] = width;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hasHydrated, setColumnSizing, user?.rol]);

  useEffect(() => {
    if (!hasHydrated) return;

    setColumnOrder((prev) => {
      if (!prev.length) return prev;
      // Las acciones viven en la ficha del paciente; la tabla no tiene esa columna.
      if (!prev.includes("acciones")) return prev;
      return prev.filter((id) => id !== "acciones");
    });
  }, [hasHydrated, setColumnOrder]);

  const handleEliminar = useCallback((id: number, nombre: string) => {
    if (user?.rol !== "ADMIN") return;
    setDeleteTarget({ id, nombre });
  }, [user?.rol]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/pacientes/${deleteTarget.id}/`);
      toastSuccess(`Paciente "${deleteTarget.nombre}" eliminado correctamente.`);
      setDeleteTarget(null);
      void mutate();
    } catch (error) {
      toastError(getErrorMessage(error, "No se pudo eliminar el paciente."));
    } finally {
      setDeleting(false);
    }
  }

  async function exportarExcel() {
    setExportando(true);
    try {
      toastInfo("Exportación de lista de espera iniciada.");
      const params = new URLSearchParams();
      if (alertaActiva) {
        params.set("alerta", alertaActiva);
      }
      if (quickFilters.estado.length > 0) {
        params.set("estado", quickFilters.estado.join(","));
      } else if (!alertaActiva) {
        // Alcance base de lista de espera: pendientes y rescates, sin limitar
        // por responsable. Los filtros rapidos solo acotan esa vista.
        params.set("estado", LISTA_ESPERA_ESTADOS.join(","));
      }
      if (mes) params.set("mes", mes);
      if (anio) params.set("anio", anio);
      if (importacionId) params.set("importacion", importacionId);
      if (tableState.globalSearch.trim()) {
        params.set("search", tableState.globalSearch.trim());
      }
      if (quickFilters.prioridad.length > 0) params.set("prioridad", quickFilters.prioridad.join(","));
      if (quickFilters.categoria.length > 0) params.set("categoria", quickFilters.categoria.join(","));
      if (quickFilters.sector_cesfam.length > 0) params.set("sector_cesfam", quickFilters.sector_cesfam.join(","));
      if (quickFilters.sector_oficial.length > 0) params.set("sector_oficial", quickFilters.sector_oficial.join(","));
      if (quickFilters.responsable.length > 0) {
        params.set(
          "kine",
          quickFilters.responsable.map((r) => (r === "SIN_RESPONSABLE" ? "SIN_ASIGNAR" : r)).join(","),
        );
      }
      const blob = await api.getBlob(`/pacientes/exportar/?${params.toString()}`);
      descargarBlob(blob, `lista-espera-ccr-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`);
      toastSuccess("Lista de espera exportada correctamente.");
    } catch (error) {
      toastError(getErrorMessage(error, "No se pudo exportar la lista de espera."));
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!openFilter) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-filter-root]")) return;
      setOpenFilter(null);
      setFilterPosition(null);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openFilter]);

  useEffect(() => {
    if (!openFilter) return;

    function closeOnScrollOrResize(event: Event) {
      // El scroll de la lista de valores dentro del propio filtro no debe cerrarlo.
      if (event.target instanceof Element && event.target.closest(".ccr-filter-popover")) return;
      setOpenFilter(null);
      setFilterPosition(null);
    }

    const scrollElement = tableScrollRef.current;
    window.addEventListener("resize", closeOnScrollOrResize);
    window.addEventListener("scroll", closeOnScrollOrResize, true);
    scrollElement?.addEventListener("scroll", closeOnScrollOrResize, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", closeOnScrollOrResize);
      window.removeEventListener("scroll", closeOnScrollOrResize, true);
      scrollElement?.removeEventListener("scroll", closeOnScrollOrResize);
    };
  }, [openFilter]);

  const quickFilterOptions = useMemo(() => {
    // Filtros rapidos: se construyen desde la data visible para acotar por
    // dimensiones operativas. Son distintos a filtros por columna tipo Excel.
    const responsables = new Map<string, string>();
    const sectoresCesfam = new Set<string>();
    const sectoresOficiales = new Set<string>();
    let tieneSinResponsable = false;

    pacientes.forEach((paciente) => {
      if (paciente.sector_cesfam) sectoresCesfam.add(paciente.sector_cesfam);
      if (paciente.sector_oficial) sectoresOficiales.add(paciente.sector_oficial);
      if (paciente.kine_asignado) {
        responsables.set(String(paciente.kine_asignado), getResponsableLabel(paciente));
      } else {
        tieneSinResponsable = true;
      }
    });

    return {
      estados: (Object.keys(ESTADO_LABELS) as Estado[]).filter((estado) =>
        pacientes.some((paciente) => paciente.estado === estado),
      ),
      prioridades: (Object.keys(PRIORIDAD_LABELS) as Prioridad[]).filter(
        (prioridad) => pacientes.some((paciente) => paciente.prioridad === prioridad),
      ),
      categorias: (Object.keys(CATEGORIA_LABELS) as Categoria[]).filter(
        (categoria) => pacientes.some((paciente) => paciente.categoria === categoria),
      ),
      sectoresCesfam: Array.from(sectoresCesfam).sort((a, b) => a.localeCompare(b, "es")),
      sectoresOficiales: Array.from(sectoresOficiales).sort((a, b) => a.localeCompare(b, "es")),
      responsables: [
        ...(tieneSinResponsable
          ? [{ value: "SIN_RESPONSABLE", label: "Sin responsable" }]
          : []),
        ...Array.from(responsables.entries())
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label, "es")),
      ],
    };
  }, [pacientes]);

  const quickFilterCount = useMemo(
    () =>
      [
        quickFilters.estado.length > 0,
        quickFilters.prioridad.length > 0,
        quickFilters.categoria.length > 0,
        quickFilters.sector_cesfam.length > 0,
        quickFilters.sector_oficial.length > 0,
        quickFilters.responsable.length > 0,
      ].filter(Boolean).length,
    [quickFilters],
  );

  const pacientesFiltradosRapidos = useMemo(
    () =>
      pacientes.filter((paciente) => {
        // Primero se aplican filtros rapidos de negocio; luego React Table
        // aplica busqueda global, filtros por columna, orden y visibilidad.
        if (fueraDeFiltro(quickFilters.estado, paciente.estado)) return false;
        if (fueraDeFiltro(quickFilters.prioridad, paciente.prioridad)) return false;
        if (fueraDeFiltro(quickFilters.categoria, paciente.categoria)) return false;
        if (fueraDeFiltro(quickFilters.sector_cesfam, paciente.sector_cesfam)) return false;
        if (fueraDeFiltro(quickFilters.sector_oficial, paciente.sector_oficial)) return false;
        if (fueraDeFiltro(quickFilters.responsable, claveResponsable(paciente))) return false;
        return true;
      }),
    [pacientes, quickFilters],
  );

  const rowsData = useMemo<WaitlistRow[]>(
    () =>
      pacientesFiltradosRapidos.map((patient) => {
        // `searchIndex` alimenta la busqueda global cliente. Debe mantenerse
        // alineado con el search amplio del backend para evitar resultados raros.
        const rut = formatearRut(patient.rut);
        const rutRaw = normalizeRut(patient.rut);
        const nombreNormalizado = normalizeSearchText(patient.nombre);
        const diagnosticoNormalizado = normalizeSearchText(patient.diagnostico);
        const responsable = getResponsableLabel(patient);
        const estadoLabel = ESTADO_LABELS[patient.estado] ?? patient.estado;
        const prioridadLabel = PRIORIDAD_LABELS[patient.prioridad] ?? patient.prioridad;
        const categoriaLabel = CATEGORIA_LABELS[patient.categoria] ?? patient.categoria;
        return {
          patient,
          nombre: toCapitalizedWords(patient.nombre),
          rut,
          rutRaw,
          edad: patient.edad,
          sector_oficial: patient.sector_oficial || "-",
          sector_cesfam: patient.sector_cesfam || "-",
          diagnostico: toCapitalizedWords(patient.diagnostico),
          responsable: toCapitalizedWords(responsable),
          fecha_ingreso: patient.fecha_ingreso ?? patient.fecha_derivacion ?? null,
          prioridad: patient.prioridad,
          prioridadLabel: toCapitalizedWords(prioridadLabel),
          categoria: patient.categoria,
          categoriaLabel: toCapitalizedWords(categoriaLabel),
          estado: patient.estado,
          estadoLabel: toCapitalizedWords(estadoLabel),
          dias_en_lista: patient.dias_en_lista,
          diasLabel: `${patient.dias_en_lista}d`,
          searchIndex: [
            patient.id_ccr,
            nombreNormalizado,
            rutRaw,
            diagnosticoNormalizado,
            responsable,
            estadoLabel,
            prioridadLabel,
            patient.prioridad,
            categoriaLabel,
            patient.categoria,
            patient.sector_cesfam,
            patient.sector_oficial,
            patient.profesional,
            patient.percapita_desde,
            patient.observaciones,
          ].map((value) => normalizeSearchText(String(value ?? ""))).join(" "),
        };
      }),
    [pacientesFiltradosRapidos],
  );

  const columns = useMemo(
    () => [
      ...(user?.rol === "ADMIN"
        ? [
            columnHelper.accessor("responsable", {
              header: "Profesional",
              enableColumnFilter: true,
              filterFn: multiSelectFilter,
              enableResizing: true,
              size: 132,
              minSize: 108,
              meta: { label: "Profesional", filterable: true } satisfies ColumnMeta,
              cell: (info) => (
                <div
                  className={`truncate ${info.getValue() ? "font-semibold text-slate-800 dark:text-ink-black-100" : "font-medium text-slate-500"}`}
                  title={info.getValue() || "Sin responsable"}
                >
                  {info.getValue() || "Sin asignar"}
                </div>
              ),
            }),
          ]
        : []),
      columnHelper.accessor("nombre", {
        header: "Paciente",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 240,
        minSize: 180,
        meta: { label: "Paciente", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div className="min-w-0 leading-tight" title={info.getValue()}>
            <p className="truncate text-[13px] font-bold text-slate-950 dark:text-white">
              {info.getValue().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium tabular-nums text-slate-500">
              <span className="truncate">{info.row.original.rut}</span>
              <AlertaChip alerta={info.row.original.patient.alerta} />
            </p>
          </div>
        ),
      }),
      columnHelper.accessor("rut", {
        header: "RUT",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 126,
        minSize: 102,
        // Orden numerico por el cuerpo del RUT (sin digito verificador).
        sortingFn: (a, b) =>
          (Number.parseInt(a.original.rutRaw.slice(0, -1), 10) || 0) -
          (Number.parseInt(b.original.rutRaw.slice(0, -1), 10) || 0),
        meta: { label: "RUT", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div className="font-mono text-gray-600">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("edad", {
        header: "Edad",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 70,
        minSize: 60,
        // Edad 0 significa que la planilla de derivacion no traia la edad.
        cell: (info) =>
          info.getValue() ? (
            <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{info.getValue()}</span>
          ) : (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400" title="La planilla de derivación no trae la edad">
              Sin dato
            </span>
          ),
        meta: {
          label: "Edad",
          filterable: true,
          kind: "number",
        } satisfies ColumnMeta,
      }),
      columnHelper.accessor("sector_cesfam", {
        header: "Sector",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 170,
        minSize: 140,
        meta: { label: "Sector", filterable: true } satisfies ColumnMeta,
        cell: (info) => <SectorBadge sector={info.getValue()} />,
      }),
      columnHelper.accessor("sector_oficial", {
        header: "Sector territorial",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 170,
        minSize: 140,
        meta: { label: "Sector territorial", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <span className="block truncate text-gray-600" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("diagnostico", {
        header: "Diagnóstico",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 230,
        minSize: 180,
        meta: { label: "Diagnóstico", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div className="truncate text-gray-600" title={info.getValue()}>
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor("fecha_ingreso", {
        header: "Ingreso",
        enableColumnFilter: false,
        enableResizing: true,
        size: 112,
        minSize: 104,
        sortingFn: (a, b) =>
          dateSortValue(a.original.fecha_ingreso) -
          dateSortValue(b.original.fecha_ingreso),
        meta: { label: "Fecha ingreso" } satisfies ColumnMeta,
        cell: (info) => (
          <span className="whitespace-nowrap text-gray-600">
            {formatDateDisplay(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("prioridadLabel", {
        header: "Prioridad",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 104,
        minSize: 92,
        sortingFn: (a, b) =>
          PRIORIDAD_ORDER[a.original.prioridad] -
          PRIORIDAD_ORDER[b.original.prioridad],
        meta: { label: "Prioridad", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <BadgePrioridad prioridad={info.row.original.prioridad} />
        ),
      }),
      columnHelper.accessor("categoriaLabel", {
        header: "Categoría",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 150,
        minSize: 120,
        meta: { label: "Categoría", filterable: true } satisfies ColumnMeta,
        cell: (info) => {
          const tono = TONO_CATEGORIA[info.row.original.patient.categoria];
          return (
            <span
              className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:text-ink-black-100 ${tono?.bg ?? ""} ${tono?.border ?? "border-slate-200"}`}
            >
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tono?.dot ?? "bg-slate-400"}`} />
              <span className="truncate">{CATEGORIA_LABELS[info.row.original.patient.categoria] ?? info.getValue()}</span>
            </span>
          );
        },
      }),
      columnHelper.accessor("dias_en_lista", {
        header: "Espera",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 88,
        minSize: 76,
        meta: {
          label: "Días de espera",
          filterable: true,
          kind: "number",
        } satisfies ColumnMeta,
        cell: (info) => <BadgeDias days={info.getValue()} />,
      }),
    ],
    [user?.rol],
  );

  const table = useReactTable({
    data: rowsData,
    columns,
    state: {
      sorting: tableState.sorting,
      columnFilters: tableState.columnFilters,
      columnSizing: tableState.columnSizing,
      columnOrder: tableState.columnOrder,
      columnVisibility: tableState.columnVisibility,
      globalFilter: deferredSearch.trim(),
    },
    filterFns: {
      multiValue: multiSelectFilter,
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const rawQuery = String(filterValue ?? "").trim();
      if (!rawQuery) return true;
      const query = normalizeSearchText(rawQuery);
      const rutQuery = normalizeRut(rawQuery);
      return (
        row.original.searchIndex.includes(query) ||
        (!!rutQuery && row.original.rutRaw.includes(rutQuery))
      );
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableMultiSort: true,
    columnResizeMode: "onChange",
    getRowId: (row) => String(row.patient.id),
  });

  const filteredRows = table.getFilteredRowModel().rows.length;
  const categoriasConConteo = Array.from(
    pacientes.reduce((mapa, p) => mapa.set(p.categoria, (mapa.get(p.categoria) ?? 0) + 1), new Map<Categoria, number>()),
  ).sort((a, b) => b[1] - a[1]);
  // Cantidad de pacientes por valor, para mostrar en los desplegables de filtro.
  const conteo = (campo: "estado" | "prioridad" | "sector_cesfam" | "sector_oficial" | "responsable", valor: string) =>
    pacientes.filter((p) => (campo === "responsable" ? claveResponsable(p) : p[campo]) === valor).length;
  const tableRows = table.getRowModel().rows;
  const activeFilterCount =
    tableState.columnFilters.length +
    quickFilterCount +
    (tableState.globalSearch.trim() ? 1 : 0) +
    (alertaActiva ? 1 : 0);
  // Anchos de columna fijos en px (estilo Excel): header y filas comparten el mismo
  // template exacto, asi las columnas no se reajustan al filtrar ni cuando aparece/
  // desaparece la barra de scroll. Antes el minmax(...,1fr) las estiraba y deformaba.
  // Solo el diagnostico se estira para ocupar el ancho libre: el resto mantiene
  // su ancho exacto, asi la tabla llena la pantalla sin deformar columnas.
  const columnTemplate = table
    .getVisibleLeafColumns()
    .map((column) =>
      column.id === "diagnostico" ? `minmax(${column.getSize()}px, 1fr)` : `${column.getSize()}px`,
    )
    .join(" ");
  const tableMinWidth = table
    .getVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0);

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });
  // Entrada escalonada de las primeras filas al cargar (como Grupos).
  const entradaFila = useEntradaFilas(!loading && tableRows.length > 0);

  useEffect(() => {
    const scrollElement = tableScrollRef.current;
    if (!scrollElement) return;

    if (
      horizontalScrollRef.current > 0 &&
      scrollElement.scrollTop > 0 &&
      scrollElement.scrollLeft === 0
    ) {
      scrollElement.scrollLeft = horizontalScrollRef.current;
    }
  }, [columnTemplate, tableRows.length]);

  function abrirAsignacionConContacto(p: Paciente) {
    setAsignarPaciente(p);
    setAsignarContacto({
      telefono: p.telefono ?? "",
      telefono_recados: p.telefono_recados ?? "",
      email: p.email ?? "",
      observaciones: "",
    });
    setAsignarError("");
  }

  async function confirmarAsignacionConContacto() {
    if (!asignarPaciente) return;

    const telefono = asignarContacto.telefono.trim();
    const telefonoRecados = asignarContacto.telefono_recados.trim();
    const email = asignarContacto.email.trim();
    const observacionExtra = asignarContacto.observaciones.trim();

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      const message = "El email no tiene un formato válido.";
      setAsignarError(message);
      toastInfo(message);
      return;
    }

    const nombrePaciente = asignarPaciente.nombre;
    setAsignando(asignarPaciente.id);
    setAsignarError("");
    setMutationError("");
    try {
      const payload: Partial<Paciente> & {
        telefono: string;
        telefono_recados: string;
        email: string;
      } = {
        telefono,
        telefono_recados: telefonoRecados,
        email,
      };

      await api.patch<Paciente>(`/pacientes/${asignarPaciente.id}/`, payload);
      // La observación entra a la lista de observaciones (cualquier profesional puede
      // agregarla); el campo `observaciones` del paciente solo lo corrige el encargado.
      if (observacionExtra) {
        await api.post("/observaciones-paciente/", {
          paciente: asignarPaciente.id,
          texto: observacionExtra,
          tipo: "GENERAL",
        });
      }
      await api.post(`/pacientes/${asignarPaciente.id}/asignar/`);
      setAsignarPaciente(null);
      toastSuccess(`Paciente "${nombrePaciente}" asignado a tu cartera.`);
      await mutate();
      window.dispatchEvent(new Event("ccr:refresh-sidebar"));
    } catch (e: unknown) {
      const detail = getErrorMessage(e, "No se pudo asignar.");
      setAsignarError(detail);
      setMutationError(detail);
      toastError(detail);
    } finally {
      setAsignando(null);
    }
  }

  function getColumnOptions(column: Column<WaitlistRow>) {
    const values = Array.from(column.getFacetedUniqueValues().keys())
      .map((value) => String(value))
      .filter(Boolean);

    return sortFilterValues(column.id, values);
  }

  function openColumnFilter(column: Column<WaitlistRow>, anchor?: HTMLElement) {
    const options = getColumnOptions(column);
    const current = column.getFilterValue();
    const selected = Array.isArray(current) ? current : undefined;
    if (anchor && typeof window !== "undefined") {
      const rect = anchor.getBoundingClientRect();
      const popoverWidth = Math.min(320, window.innerWidth - 24);
      const estimatedHeight = Math.min(430, window.innerHeight - 24);
      const opensBelow = rect.bottom + 8 + estimatedHeight <= window.innerHeight;
      setFilterPosition({
        top: opensBelow
          ? rect.bottom + 8
          : Math.max(12, window.innerHeight - estimatedHeight - 12),
        left: Math.min(
          Math.max(12, rect.left),
          window.innerWidth - popoverWidth - 12,
        ),
      });
    }
    setDraftFilters((prev) => ({
      ...prev,
      [column.id]: selected?.length ? [...selected] : options,
    }));
    setFilterQueries((prev) => ({ ...prev, [column.id]: "" }));
    setOpenFilter(column.id);
  }

  function applyColumnFilter(
    column: Column<WaitlistRow>,
    selectedOverride?: string[],
  ) {
    const options = getColumnOptions(column);
    const selected = Array.from(
      new Set(selectedOverride ?? draftFilters[column.id] ?? options),
    );
    startTransition(() => {
      column.setFilterValue(
        selected.length === 0 || selected.length === options.length
          ? undefined
          : selected,
      );
      setOpenFilter(null);
      setFilterPosition(null);
    });
  }

  function clearAllFilters() {
    startTransition(() => {
      resetTableState();
      setOpenFilter(null);
      setFilterPosition(null);
      setDraftFilters({});
      setFilterQueries({});
      setQuickFilters({
        estado: [],
        prioridad: [],
        categoria: [],
        sector_cesfam: [],
        sector_oficial: [],
        responsable: [],
      });
    });
  }

  if (!user) return null;

  return (
    <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-1.5rem))] flex-col overflow-hidden sm:h-[max(520px,calc(100dvh-64px-2rem))] border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800">
      <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-ink-black-600 dark:bg-ink-black-800">
        <div className="space-y-3">
          <h1 className="sr-only">Lista de espera</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            <div className="relative order-1 min-w-0 flex-1 sm:max-w-sm">
              <FiSearch
                className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={15}
                aria-hidden="true"
              />
              <input
                type="text"
                value={tableState.globalSearch}
                onChange={(event) => {
                  const value = event.target.value;
                  startTransition(() => setGlobalSearch(value));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                className="ccr-control-input w-full pl-9 pr-3"
                placeholder="Buscar nombre o RUT"
                aria-label="Buscar pacientes"
              />
            </div>
            {/* Filtro rapido por categoria: multiseleccion */}
            {categoriasConConteo.length > 0 && (
              <div className="order-1">
                <MultiSelectFiltro
                  label="Categoría"
                  values={quickFilters.categoria}
                  opciones={categoriasConConteo.map(([cat, total]) => ({
                    value: cat,
                    label: CATEGORIA_LABELS[cat],
                    dot: TONO_CATEGORIA[cat]?.dot,
                    total,
                  }))}
                  onChange={(valores) => setQuickFilters((prev) => ({ ...prev, categoria: valores as Categoria[] }))}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowQuickFilters((prev) => !prev)}
              className="ccr-control-button order-2 ml-auto"
              aria-expanded={showQuickFilters}
              aria-controls="lista-espera-quick-filters"
            >
              <FiFilter size={13} aria-hidden="true" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">{activeFilterCount}</span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
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
                    detalle: "Vuelve a cargar la lista",
                    tono: "azul",
                    icon: <FiRefreshCw size={13} aria-hidden="true" />,
                    onClick: () => void actualizarLista(),
                  },
                  {
                    label: exportando ? "Exportando…" : "Exportar Excel",
                    detalle: "Descarga lo que ves en la tabla",
                    tono: "verde",
                    icon: <FiDownload size={13} aria-hidden="true" />,
                    onClick: () => void exportarExcel(),
                    disabled: exportando,
                  },
                  {
                    label: "Copiar enlace",
                    detalle: "De esta vista con sus filtros",
                    tono: "gris",
                    icon: <FiLink size={13} aria-hidden="true" />,
                    onClick: () => {
                      void navigator.clipboard?.writeText(window.location.href).then(() => toastInfo("Enlace copiado."));
                    },
                  },
                  {
                    label: "Ir a Llamados",
                    detalle: "Pacientes por contactar",
                    tono: "gris",
                    icon: <FiPhoneCall size={13} aria-hidden="true" />,
                    onClick: () => router.push("/llamados"),
                  },
                  {
                    label: "Importar carga",
                    detalle: "Subir una nueva planilla",
                    tono: "gris",
                    icon: <FiUpload size={13} aria-hidden="true" />,
                    onClick: () => router.push("/importar"),
                  },
                ]}
              />
            </div>
          </div>


          {showQuickFilters && (
            <motion.div
              id="lista-espera-quick-filters"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-ink-black-700 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
            >
              <MultiSelectFiltro
                anchoCompleto
                label="Estado"
                textoTodos
                values={quickFilters.estado}
                opciones={quickFilterOptions.estados.map((e) => ({ value: e, label: ESTADO_LABELS[e], total: conteo("estado", e) }))}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, estado: v as Estado[] }))}
              />
              <MultiSelectFiltro
                anchoCompleto
                label="Prioridad"
                values={quickFilters.prioridad}
                opciones={quickFilterOptions.prioridades.map((pr) => ({ value: pr, label: PRIORIDAD_LABELS[pr], total: conteo("prioridad", pr) }))}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, prioridad: v as Prioridad[] }))}
              />
              <MultiSelectFiltro
                anchoCompleto
                label="Sector"
                textoTodos
                values={quickFilters.sector_cesfam}
                opciones={quickFilterOptions.sectoresCesfam.map((sec) => ({
                  value: sec,
                  label: sec,
                  dot: sectorColorClasses(sec).dot,
                  total: conteo("sector_cesfam", sec),
                }))}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, sector_cesfam: v }))}
              />
              <MultiSelectFiltro
                anchoCompleto
                label="Sector territorial"
                textoTodos
                values={quickFilters.sector_oficial}
                opciones={quickFilterOptions.sectoresOficiales.map((sec) => ({ value: sec, label: sec, total: conteo("sector_oficial", sec) }))}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, sector_oficial: v }))}
              />
              <MultiSelectFiltro
                anchoCompleto
                label="Profesional"
                textoTodos
                values={quickFilters.responsable}
                opciones={quickFilterOptions.responsables.map((r) => ({ value: r.value, label: r.label, total: conteo("responsable", r.value) }))}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, responsable: v }))}
              />
            </motion.div>
          )}

          {alertaActivaLabel && (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-blue-700">
                Filtro activo: {alertaActivaLabel}
              </p>
              <button
                type="button"
                onClick={() => router.push("/lista-espera")}
                className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
              >
                Limpiar filtro
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <EmptyState variant="error" compact message={error} />
      )}

      {!error && (
        <section className="ccr-data-table ccr-operational-table relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-ink-black-800">
          {(loading || refrescando || isPending || !hasHydrated) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px] dark:bg-[#151515]/75">
              <LoaderKine enLinea retrasoMs={0} />
            </div>
          )}

        <div
          ref={tableScrollRef}
          onScroll={(event) => {
            horizontalScrollRef.current = event.currentTarget.scrollLeft;
            if (openFilter) {
              setOpenFilter(null);
              setFilterPosition(null);
            }
          }}
          className="ccr-table-scroll min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]"
        >
          <div
            className="w-full min-w-max bg-white dark:bg-ink-black-800"
            style={{ minWidth: tableMinWidth }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                key={headerGroup.id}
                className="ccr-table-head sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-900"
                style={{ gridTemplateColumns: columnTemplate }}
              >
                {headerGroup.headers.map((header) => {
                  const meta = getColumnMeta(header.column);
                  const isSorted = header.column.getIsSorted();
                  const sortIndex = table
                    .getState()
                    .sorting.findIndex((item) => item.id === header.column.id);
                  const currentFilter = header.column.getFilterValue();
                  const isFilterActive = Array.isArray(currentFilter)
                    ? currentFilter.length > 0
                    : typeof currentFilter === "string"
                      ? currentFilter.trim().length > 0
                      : false;

                  return (
                    <div
                      key={header.id}
                      className="group relative flex h-11 items-center px-2.5"
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex w-full min-w-0 items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              if (!header.column.getCanSort()) return;
                              startTransition(() => {
                                header.column.toggleSorting(
                                  undefined,
                                  event.shiftKey,
                                );
                              });
                            }}
                            className="ccr-table-sort-button flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-bold text-slate-500 outline-none hover:text-slate-950 focus-visible:text-slate-950 dark:text-ink-black-300"
                            title={header.column.getCanSort() ? "Ordenar" : undefined}
                          >
                            <span className="truncate whitespace-nowrap">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            {isSorted && (
                              <span className="inline-flex shrink-0 items-center text-blue-600" aria-label={isSorted === "asc" ? "orden ascendente" : "orden descendente"}>
                                {isSorted === "asc" ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                                {sortIndex >= 0 && table.getState().sorting.length > 1 ? (
                                  <span className="text-[10px] font-bold">{sortIndex + 1}</span>
                                ) : null}
                              </span>
                            )}
                          </button>

                          {meta.filterable && (
                            <div data-filter-root className={`absolute right-1 top-1/2 -translate-y-1/2 ${isFilterActive || openFilter === header.column.id ? "" : "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"}`}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (openFilter === header.column.id) {
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                    return;
                                  }
                                  openColumnFilter(
                                    header.column,
                                    event.currentTarget,
                                  );
                                }}
                                className={
                                  isFilterActive
                                    ? "ccr-table-filter-button is-active inline-flex h-6 w-6 items-center justify-center rounded-md"
                                    : `ccr-table-filter-button inline-flex h-6 w-6 items-center justify-center rounded-md !bg-slate-50 transition-opacity focus-visible:opacity-100 ${
                                        openFilter === header.column.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                      }`
                                }
                                aria-label={`Filtrar ${meta.label}`}
                              >
                                <FiFilter size={11} />
                              </button>

                              {openFilter === header.column.id && filterPosition && (
                                <FilterPopover
                                  column={header.column}
                                  position={filterPosition}
                                  sortState={header.column.getIsSorted()}
                                  query={filterQueries[header.column.id] ?? ""}
                                  selectedValues={
                                    draftFilters[header.column.id] ??
                                    getColumnOptions(header.column)
                                  }
                                  onSortAsc={() => {
                                    startTransition(() =>
                                      header.column.toggleSorting(false, true),
                                    );
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                  }}
                                  onSortDesc={() => {
                                    startTransition(() =>
                                      header.column.toggleSorting(true, true),
                                    );
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                  }}
                                  onClearSort={() => {
                                    startTransition(() =>
                                      header.column.clearSorting(),
                                    );
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                  }}
                                  onQueryChange={(value) =>
                                    setFilterQueries((prev) => ({
                                      ...prev,
                                      [header.column.id]: value,
                                    }))
                                  }
                                  onSelectionChange={(values) =>
                                    setDraftFilters((prev) => ({
                                      ...prev,
                                      [header.column.id]: values,
                                    }))
                                  }
                                  onCancel={() => {
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                  }}
                                  onApply={(selectedValuesOverride) =>
                                    applyColumnFilter(
                                      header.column,
                                      selectedValuesOverride,
                                    )
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {header.column.getCanResize() && (
                        <button
                          type="button"
                          onDoubleClick={() => header.column.resetSize()}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={`ccr-column-resizer absolute right-0 top-0 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none bg-transparent transition hover:bg-blue-200/50 ${header.column.getIsResizing() ? "bg-blue-300/60" : ""}`}
                          aria-label={`Redimensionar columna ${meta.label}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {tableRows.length === 0 ? (
              <EmptyState
                variant="search"
                compact
                message="Sin pacientes en espera con los filtros seleccionados."
              />
            ) : (
              <div
                className="relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  const entrada = entradaFila(virtualRow.index);
                  return (
                    <div
                      key={row.id}
                      className={`ccr-table-row absolute left-0 top-0 grid w-full cursor-pointer border-b border-slate-100 bg-white transition-colors hover:bg-blue-50/60 dark:border-ink-black-700 dark:bg-ink-black-800 dark:hover:bg-blue-500/10 ${entrada.className}`}
                      style={{
                        ...entrada.style,
                        gridTemplateColumns: columnTemplate,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onClick={() => setSeleccionado(row.original.patient)}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = getColumnMeta(cell.column);
                        const alignment =
                          meta.align === "right"
                            ? "text-right"
                            : meta.align === "center"
                              ? "text-center"
                              : "text-left";

                        return (
                          <div
                            key={cell.id}
                            className={`flex h-[52px] items-center overflow-hidden px-2 text-xs text-slate-700 dark:text-ink-black-200 sm:px-3 ${alignment}`}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-gray-200 bg-gray-50/50 px-5 py-3 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-ink-black-200 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {filteredRows} paciente{filteredRows !== 1 ? "s" : ""} en espera
          </p>
          <p className="text-slate-500 dark:text-[color:var(--text-muted)]">
            Mostrando {filteredRows} de {rowsData.length}
          </p>
        </div>
      </section>
      )}

      {asignarPaciente && (
        <AsignarContactoModal
          paciente={asignarPaciente}
          loading={asignando === asignarPaciente.id}
          draft={asignarContacto}
          error={asignarError}
          onClose={() => {
            if (asignando === asignarPaciente.id) return;
            setAsignarPaciente(null);
            setAsignarError("");
          }}
          onChange={(field, value) => {
            setAsignarContacto((prev) => ({ ...prev, [field]: value }));
          }}
          onConfirm={() => void confirmarAsignacionConContacto()}
        />
      )}

      {seleccionado && (
        <FichaPaciente
          paciente={seleccionado}
          usuario={user}
          onClose={() => setSeleccionado(null)}
          onRefresh={() => {
            void mutate();
            setSeleccionado(null);
          }}
          onTomar={
            user?.rol === "KINE" && !seleccionado.kine_asignado
              ? () => {
                  const paciente = seleccionado;
                  setSeleccionado(null);
                  abrirAsignacionConContacto(paciente);
                }
              : undefined
          }
          onEliminar={
            user?.rol === "ADMIN"
              ? () => {
                  const paciente = seleccionado;
                  setSeleccionado(null);
                  handleEliminar(paciente.id, paciente.nombre);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        variant="danger"
        title="Eliminar paciente"
        message={
          deleteTarget
            ? `¿Eliminar permanentemente a "${deleteTarget.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar permanentemente"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <style jsx>{`
        @keyframes tableFadeIn {
          from {
            opacity: 0.72;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

type AsignarContactoModalProps = {
  paciente: Paciente;
  draft: AssignContactDraft;
  loading: boolean;
  error: string;
  onClose: () => void;
  onChange: (field: keyof AssignContactDraft, value: string) => void;
  onConfirm: () => void;
};

function AsignarContactoModal({
  paciente,
  draft,
  loading,
  error,
  onClose,
  onChange,
  onConfirm,
}: AsignarContactoModalProps) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[3px] dark:bg-black/75"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_34px_80px_-32px_rgba(15,23,42,0.55)] dark:border-[#2a2a2a] dark:bg-[#111111]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#dbe7ff] bg-gradient-to-br from-[#f4f8ff] via-white to-blue-50 px-5 py-5 dark:border-[#2a2a2a] dark:from-[#151515] dark:via-[#111111] dark:to-[#151515] sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-500 dark:text-ink-black-300">
                Asignación
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                Completar contacto para asignar
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-[#a3a3a3]">
                Puedes asignar de inmediato y completar contacto u observación si corresponde.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-60 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-ink-black-50 dark:hover:bg-[#242424]"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex max-w-full items-center gap-3 rounded-xl border border-[#dbe7ff] bg-white/95 px-3.5 py-2.5 text-[12px] text-slate-700 shadow-sm dark:border-[#2a2a2a] dark:bg-[#111111] dark:text-ink-black-50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#cddcff] bg-blue-50 text-blue-500 dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:text-ink-black-300">
              <FiUser size={16} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">
                {toCapitalizedWords(paciente.nombre)}
              </p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-[#a3a3a3]">
                {formatearRut(paciente.rut)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 bg-white px-5 py-5 dark:bg-[#111111] sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[12px] text-slate-600 dark:border-[#2a2a2a] dark:bg-[#181818] dark:text-ink-black-200">
            Campos opcionales: teléfono principal, recados, correo y observación.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
                Teléfono principal
              </label>
              <div className="relative">
                <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} />
                <input
                  type="tel"
                  value={draft.telefono}
                  onChange={(event) => onChange("telefono", event.target.value)}
                  placeholder="+56 9 1234 5678"
                  className="ccr-control-input w-full px-9 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
                Teléfono recados
              </label>
              <div className="relative">
                <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} />
                <input
                  type="tel"
                  value={draft.telefono_recados}
                  onChange={(event) =>
                    onChange("telefono_recados", event.target.value)
                  }
                  placeholder="+56 9 9876 5432"
                  className="ccr-control-input w-full px-9 py-2.5 text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
              Email
            </label>
            <div className="relative">
              <FiMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} />
              <input
                type="email"
                value={draft.email}
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="nombre@correo.cl"
                className="ccr-control-input w-full px-9 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
              Observación
            </label>
            <textarea
              value={draft.observaciones}
              onChange={(event) => onChange("observaciones", event.target.value)}
              placeholder="Ej: paciente solicita llamado en la tarde."
              rows={3}
              className="ccr-control-input w-full resize-none px-3 py-2.5 text-sm"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4 dark:border-[#2a2a2a] dark:bg-[#181818] sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="ccr-control-button rounded-xl px-5 py-2.5 text-sm disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-14px_rgba(51,95,219,0.9)] transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Asignando..." : "Guardar y tomar"}
          </button>
        </div>
      </div>
    </div>
  );
}

