"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import AlertaChip from "@/components/AlertaChip";
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
import {
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiFilter,
  FiMinus,
  FiRefreshCw,
  FiSearch,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { TONO_CATEGORIA } from "@/components/AgendaGrid";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import SectorBadge from "@/components/SectorBadge";
import BadgePrioridad from "@/components/BadgePrioridad";
import LoaderKine from "@/components/LoaderKine";
import EmptyState from "@/components/EmptyState";
import FilterPopover, {
  type ColumnMeta,
  type FilterPopoverPosition,
  PRIORIDAD_ORDER,
  getColumnMeta,
  sortFilterValues,
} from "@/components/FilterPopover";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatearRut } from "@/lib/rut";
import { sectorColorClasses } from "@/lib/sectores";
import { useAPI, unwrapResults } from "@/lib/swr";
import { usePersistentTableState } from "@/lib/tables/usePersistentTableState";
import type { Categoria, Paciente, PaginatedResponse, Prioridad } from "@/lib/types";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import {
  calcularDiasDesde,
  dateSortValue,
  formatDateDisplay,
  getResponsableLabel,
  multiSelectFilter as multiSelectFilterBase,
  normalizeRut,
  normalizeSearchText,
  toCapitalizedWords,
} from "@/lib/utils";

const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });
const CrearPacienteModal = dynamic(() => import("@/components/CrearPacienteModal"), { ssr: false });
const ProximaAtencionModal = dynamic(() => import("@/components/ProximaAtencionModal"), { ssr: false });
const ActividadesGrupalesModal = dynamic(() => import("@/components/ActividadesGrupalesModal"), { ssr: false });
const GrupoModal = dynamic(() => import("@/components/GruposPacientesVistas").then((m) => m.GrupoModal), { ssr: false });
type AccionSeleccion = "actividad" | "agregar";

// =============================================================================
// Tipos, constantes y helpers de tabla
// =============================================================================

type MyPatientRow = {
  patient: Paciente;
  nombre: string;
  rut: string;
  rutRaw: string;
  edad: number;
  kine: string;
  sector_cesfam: string;
  sector_oficial: string;
  diagnostico: string;
  fecha_ingreso: string | null;
  dias_ingreso: number;
  prioridad: Prioridad;
  prioridadLabel: string;
  categoria: Categoria;
  categoriaLabel: string;
  proxima_atencion: string | null;
  agendaLabel: string;
  searchIndex: string;
};

type FilterDraftState = Record<string, string[]>;
type FilterQueryState = Record<string, string>;
type QuickFilterState = {
  // Cada filtro acepta varios valores; vacio = sin filtrar.
  prioridad: Prioridad[];
  categoria: Categoria[];
  sector_cesfam: string[];
  sector_oficial: string[];
  responsable: string[];
  agenda: string[];
};

const FILTROS_VACIOS: QuickFilterState = {
  prioridad: [],
  categoria: [],
  sector_cesfam: [],
  sector_oficial: [],
  responsable: [],
  agenda: [],
};

function fueraDeFiltro<T>(valores: T[], valor: T) {
  return valores.length > 0 && !valores.includes(valor);
}

function claveResponsable(paciente: Paciente) {
  return paciente.kine_asignado ? String(paciente.kine_asignado) : "SIN_RESPONSABLE";
}

function claveAgenda(paciente: Paciente) {
  return paciente.proxima_atencion ? "AGENDADO" : "SIN_AGENDA";
}

/** "Hoy 10:30", "Mañana 09:00" o "lun 18 nov · 11:00". */
function textoProximaSesion(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "-";
  const hora = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
  const hoy = new Date();
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicio(fecha) - inicio(hoy)) / 86_400_000);
  if (dias === 0) return `Hoy ${hora}`;
  if (dias === 1) return `Mañana ${hora}`;
  const dia = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short" }).format(fecha).replace(/[.,]/g, "");
  return `${dia} · ${hora}`;
}

const multiSelectFilter = multiSelectFilterBase as FilterFn<MyPatientRow>;
const columnHelper = createColumnHelper<MyPatientRow>();

const BASE_COLUMN_VISIBILITY: VisibilityState = {
  seleccion: true,
  kine: true,
  nombre: true,
  edad: true,
  categoriaLabel: true,
  prioridadLabel: true,
  proxima_atencion: true,
  dias_ingreso: true,
  fecha_ingreso: true,
  sector_cesfam: true,
  diagnostico: true,
  sector_oficial: false,
  agendar: true,
};

function getResponsiveColumnVisibility(width: number): VisibilityState {
  if (width < 768) {
    return {
      ...BASE_COLUMN_VISIBILITY,
      kine: false,
      edad: false,
      categoriaLabel: false,
      prioridadLabel: false,
      dias_ingreso: false,
      fecha_ingreso: false,
      sector_cesfam: false,
      diagnostico: false,
    };
  }
  if (width < 1200) {
    return { ...BASE_COLUMN_VISIBILITY, fecha_ingreso: false, diagnostico: false, sector_cesfam: false };
  }
  if (width < 1500) {
    return { ...BASE_COLUMN_VISIBILITY, fecha_ingreso: false };
  }
  return BASE_COLUMN_VISIBILITY;
}

const COLUMN_SIZING: Record<string, number> = {
  seleccion: 44,
  kine: 140,
  nombre: 230,
  edad: 68,
  categoriaLabel: 140,
  prioridadLabel: 104,
  proxima_atencion: 150,
  dias_ingreso: 92,
  fecha_ingreso: 100,
  sector_cesfam: 160,
  diagnostico: 170,
  sector_oficial: 150,
  agendar: 128,
};

const COLUMN_ORDER = [
  "seleccion",
  "kine",
  "nombre",
  "edad",
  "categoriaLabel",
  "prioridadLabel",
  "proxima_atencion",
  "dias_ingreso",
  "fecha_ingreso",
  "sector_cesfam",
  "diagnostico",
  "sector_oficial",
  "agendar",
];

// =============================================================================
// Componente principal
// =============================================================================

export default function MisPacientesPage() {
  const { user } = useAuth();
  const esKine = user?.rol === "KINE";
  const verTodos = !!user && !esKine;
  const puedeAgendar = user?.rol === "KINE" || user?.rol === "ADMIN";

  const [seleccionado, setSeleccionado] = useState<Paciente | null>(null);
  const [creando, setCreando] = useState(false);
  const [agendando, setAgendando] = useState<Paciente | null>(null);
  const [grupos, setGrupos] = useState<{ preseleccion?: number[]; accion?: AccionSeleccion } | null>(null);
  const [marcados, setMarcados] = useState<number[]>([]);
  // "Guardar como grupo" crea el grupo aqui mismo y luego lleva a /grupos.
  const [nuevoGrupo, setNuevoGrupo] = useState<number[] | null>(null);
  const router = useRouter();
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterDraftState>({});
  const [filterQueries, setFilterQueries] = useState<FilterQueryState>({});
  const [filterPosition, setFilterPosition] = useState<FilterPopoverPosition | null>(null);
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>(FILTROS_VACIOS);
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const [isPending, startTransition] = useTransition();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const initialTableState = useMemo(
    () => ({
      globalSearch: "",
      sorting: [{ id: "proxima_atencion", desc: false as const }],
      columnFilters: [],
      columnSizing: COLUMN_SIZING,
      columnOrder: COLUMN_ORDER,
      columnVisibility: { sector_oficial: false },
    }),
    [],
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
    storageKey: "table-prefs:mis-pacientes:v3",
    initialState: initialTableState,
  });
  const deferredSearch = useDeferredValue(tableState.globalSearch);

  // KINE: solo su cartera. Admin y administrativo: todos los ingresados de cada kine.
  const swrPath = user
    ? esKine
      ? "/pacientes/?estado=INGRESADO&solo_mios=1"
      : "/pacientes/?estado=INGRESADO"
    : null;
  const { data: swrData, error: swrError, isLoading: loading, mutate } = useAPI<Paciente[] | PaginatedResponse<Paciente>>(swrPath);
  const pacientes = useMemo(
    () => unwrapResults(swrData).filter((p) => p.estado === "INGRESADO"),
    [swrData],
  );
  const error = swrError ? "No se pudieron cargar los pacientes ingresados." : "";

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") return;
    function aplicar() {
      const next = getResponsiveColumnVisibility(window.innerWidth);
      if (!verTodos) next.kine = false;
      setColumnVisibility((prev) => {
        const entries = Object.entries(next);
        const igual = entries.every(([k, v]) => prev[k] === v) && Object.keys(prev).length === entries.length;
        return igual ? prev : next;
      });
    }
    aplicar();
    window.addEventListener("resize", aplicar);
    return () => window.removeEventListener("resize", aplicar);
  }, [hasHydrated, setColumnVisibility, verTodos]);

  useEffect(() => {
    if (!hasHydrated) return;
    setColumnSizing((prev) => {
      const cambio = Object.entries(COLUMN_SIZING).some(([k, v]) => prev[k] !== v);
      return cambio ? { ...prev, ...COLUMN_SIZING } : prev;
    });
    setColumnOrder((prev) => (prev.length === COLUMN_ORDER.length && prev.every((id, i) => id === COLUMN_ORDER[i]) ? prev : COLUMN_ORDER));
  }, [hasHydrated, setColumnSizing, setColumnOrder]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!openFilter) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.closest("[data-filter-root]")) return;
      setOpenFilter(null);
      setFilterPosition(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openFilter]);

  useEffect(() => {
    if (!openFilter) return;
    function cerrar(event: Event) {
      // El scroll de la lista de valores dentro del propio filtro no debe cerrarlo.
      if (event.target instanceof Element && event.target.closest(".ccr-filter-popover")) return;
      setOpenFilter(null);
      setFilterPosition(null);
    }
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [openFilter]);

  // Si un paciente deja de estar en la lista, se quita de la seleccion.
  useEffect(() => {
    setMarcados((prev) => {
      const ids = new Set(pacientes.map((p) => p.id));
      const next = prev.filter((id) => ids.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [pacientes]);

  const quickFilterOptions = useMemo(() => {
    const responsables = new Map<string, string>();
    const sectoresCesfam = new Set<string>();
    const sectoresOficiales = new Set<string>();
    let sinResponsable = false;
    pacientes.forEach((p) => {
      if (p.sector_cesfam) sectoresCesfam.add(p.sector_cesfam);
      if (p.sector_oficial) sectoresOficiales.add(p.sector_oficial);
      if (p.kine_asignado) responsables.set(String(p.kine_asignado), getResponsableLabel(p));
      else sinResponsable = true;
    });
    return {
      prioridades: (Object.keys(PRIORIDAD_LABELS) as Prioridad[]).filter((pr) => pacientes.some((p) => p.prioridad === pr)),
      sectoresCesfam: Array.from(sectoresCesfam).sort((a, b) => a.localeCompare(b, "es")),
      sectoresOficiales: Array.from(sectoresOficiales).sort((a, b) => a.localeCompare(b, "es")),
      responsables: [
        ...(sinResponsable ? [{ value: "SIN_RESPONSABLE", label: "Sin responsable" }] : []),
        ...Array.from(responsables.entries())
          .map(([value, label]) => ({ value, label: toCapitalizedWords(label) }))
          .sort((a, b) => a.label.localeCompare(b.label, "es")),
      ],
    };
  }, [pacientes]);

  const quickFilterCount = Object.values(quickFilters).filter((v) => v.length > 0).length;

  const rowsData = useMemo<MyPatientRow[]>(
    () =>
      pacientes
        .filter((p) => {
          if (fueraDeFiltro(quickFilters.prioridad, p.prioridad)) return false;
          if (fueraDeFiltro(quickFilters.categoria, p.categoria)) return false;
          if (fueraDeFiltro(quickFilters.sector_cesfam, p.sector_cesfam)) return false;
          if (fueraDeFiltro(quickFilters.sector_oficial, p.sector_oficial)) return false;
          if (fueraDeFiltro(quickFilters.responsable, claveResponsable(p))) return false;
          if (fueraDeFiltro(quickFilters.agenda, claveAgenda(p))) return false;
          return true;
        })
        .map((patient) => {
          const rutRaw = normalizeRut(patient.rut);
          const kine = patient.kine_asignado ? toCapitalizedWords(getResponsableLabel(patient)) : "";
          const prioridadLabel = PRIORIDAD_LABELS[patient.prioridad] ?? patient.prioridad;
          const categoriaLabel = CATEGORIA_LABELS[patient.categoria] ?? patient.categoria;
          const fechaIngreso = patient.fecha_ingreso ?? patient.fecha_cambio_estado ?? null;
          return {
            patient,
            nombre: toCapitalizedWords(patient.nombre),
            rut: formatearRut(patient.rut),
            rutRaw,
            edad: patient.edad,
            kine,
            sector_cesfam: patient.sector_cesfam || "-",
            sector_oficial: patient.sector_oficial || "-",
            diagnostico: toCapitalizedWords(patient.diagnostico),
            fecha_ingreso: fechaIngreso,
            dias_ingreso: calcularDiasDesde(fechaIngreso) ?? 0,
            prioridad: patient.prioridad,
            prioridadLabel: toCapitalizedWords(prioridadLabel),
            categoria: patient.categoria,
            categoriaLabel,
            proxima_atencion: patient.proxima_atencion,
            agendaLabel: patient.proxima_atencion ? "Agendado" : "Sin agendar",
            searchIndex: [
              patient.id_ccr,
              patient.nombre,
              rutRaw,
              patient.diagnostico,
              kine,
              prioridadLabel,
              categoriaLabel,
              patient.sector_cesfam,
              patient.sector_oficial,
              patient.telefono,
            ]
              .map((v) => normalizeSearchText(String(v ?? "")))
              .join(" "),
          };
        }),
    [pacientes, quickFilters],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor("kine", {
        header: "Profesional",
        filterFn: multiSelectFilter,
        meta: { label: "Profesional", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <span className={`block truncate ${info.getValue() ? "font-semibold text-slate-800 dark:text-ink-black-100" : "font-medium text-slate-400"}`}>
            {info.getValue() || "Sin asignar"}
          </span>
        ),
      }),
      columnHelper.accessor("nombre", {
        header: "Paciente",
        filterFn: multiSelectFilter,
        meta: { label: "Paciente", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div className="min-w-0 leading-tight" title={info.getValue()}>
            <p className="truncate text-[13px] font-bold text-slate-950 dark:text-white">{info.getValue()}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-medium tabular-nums text-slate-500">
              <span className="truncate">{info.row.original.rut}</span>
              <AlertaChip alerta={info.row.original.patient.alerta} />
            </p>
          </div>
        ),
      }),
      columnHelper.accessor("edad", {
        header: "Edad",
        filterFn: multiSelectFilter,
        meta: { label: "Edad", filterable: true, kind: "number" } satisfies ColumnMeta,
        cell: (info) =>
          info.getValue() ? (
            <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{info.getValue()}</span>
          ) : (
            <span className="text-[11px] font-medium text-slate-400">Sin dato</span>
          ),
      }),
      columnHelper.accessor("categoriaLabel", {
        header: "Categoría",
        filterFn: multiSelectFilter,
        meta: { label: "Categoría", filterable: true } satisfies ColumnMeta,
        cell: (info) => {
          const tono = TONO_CATEGORIA[info.row.original.categoria];
          return (
            <span className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:text-ink-black-100 ${tono?.bg ?? ""} ${tono?.border ?? "border-slate-200"}`}>
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tono?.dot ?? "bg-slate-400"}`} />
              <span className="truncate">{info.getValue()}</span>
            </span>
          );
        },
      }),
      columnHelper.accessor("prioridadLabel", {
        header: "Prioridad",
        filterFn: multiSelectFilter,
        sortingFn: (a, b) => PRIORIDAD_ORDER[a.original.prioridad] - PRIORIDAD_ORDER[b.original.prioridad],
        meta: { label: "Prioridad", filterable: true } satisfies ColumnMeta,
        cell: (info) => <BadgePrioridad prioridad={info.row.original.prioridad} />,
      }),
      columnHelper.accessor("proxima_atencion", {
        header: "Próxima sesión",
        enableColumnFilter: false,
        // Sin agendar va al final al ordenar de la mas cercana a la mas lejana.
        sortingFn: (a, b) =>
          (a.original.proxima_atencion ? dateSortValue(a.original.proxima_atencion) : Number.MAX_SAFE_INTEGER) -
          (b.original.proxima_atencion ? dateSortValue(b.original.proxima_atencion) : Number.MAX_SAFE_INTEGER),
        meta: { label: "Próxima sesión" } satisfies ColumnMeta,
        cell: (info) =>
          info.getValue() ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold text-blue-700 dark:text-blue-200">
              <FiCalendar size={12} aria-hidden="true" />
              {textoProximaSesion(info.getValue() as string)}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              Sin agendar
            </span>
          ),
      }),
      columnHelper.accessor("dias_ingreso", {
        header: "En tratamiento",
        filterFn: multiSelectFilter,
        meta: { label: "Días en tratamiento", filterable: true, kind: "number" } satisfies ColumnMeta,
        cell: (info) => <span className="font-semibold tabular-nums text-slate-700 dark:text-ink-black-100">{info.getValue()} días</span>,
      }),
      columnHelper.accessor("fecha_ingreso", {
        header: "Ingreso",
        enableColumnFilter: false,
        sortingFn: (a, b) => dateSortValue(a.original.fecha_ingreso) - dateSortValue(b.original.fecha_ingreso),
        meta: { label: "Fecha ingreso" } satisfies ColumnMeta,
        cell: (info) => <span className="whitespace-nowrap text-gray-600">{formatDateDisplay(info.getValue())}</span>,
      }),
      columnHelper.accessor("sector_cesfam", {
        header: "Sector",
        filterFn: multiSelectFilter,
        meta: { label: "Sector", filterable: true } satisfies ColumnMeta,
        cell: (info) => <SectorBadge sector={info.getValue()} />,
      }),
      columnHelper.accessor("diagnostico", {
        header: "Diagnóstico",
        filterFn: multiSelectFilter,
        meta: { label: "Diagnóstico", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div className="truncate text-gray-600" title={info.getValue()}>
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor("sector_oficial", {
        header: "Sector territorial",
        filterFn: multiSelectFilter,
        meta: { label: "Sector territorial", filterable: true } satisfies ColumnMeta,
        cell: (info) => <span className="block truncate text-gray-600">{info.getValue()}</span>,
      }),
      columnHelper.display({
        id: "agendar",
        header: "",
        enableResizing: false,
        enableSorting: false,
        meta: { label: "Agendar" } satisfies ColumnMeta,
        cell: () => null,
      }),
    ],
    [],
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
    globalFilterFn: (row, _columnId, filterValue) => {
      const raw = String(filterValue ?? "").trim();
      if (!raw) return true;
      const rutQuery = normalizeRut(raw);
      return row.original.searchIndex.includes(normalizeSearchText(raw)) || (!!rutQuery && row.original.rutRaw.includes(rutQuery));
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

  const tableRows = table.getRowModel().rows;
  const filteredRows = table.getFilteredRowModel().rows.length;
  const sinAgendar = pacientes.filter((p) => !p.proxima_atencion).length;
  const categoriasConConteo = Array.from(
    pacientes.reduce((m, p) => m.set(p.categoria, (m.get(p.categoria) ?? 0) + 1), new Map<Categoria, number>()),
  ).sort((a, b) => b[1] - a[1]);
  const conteo = (campo: "prioridad" | "sector_cesfam" | "sector_oficial" | "responsable" | "agenda", valor: string) =>
    pacientes.filter((p) =>
      (campo === "responsable" ? claveResponsable(p) : campo === "agenda" ? claveAgenda(p) : p[campo]) === valor,
    ).length;
  const activeFilterCount = tableState.columnFilters.length + quickFilterCount + (tableState.globalSearch.trim() ? 1 : 0);

  const idsVisibles = tableRows.map((r) => r.original.patient.id);
  const todosVisiblesMarcados = idsVisibles.length > 0 && idsVisibles.every((id) => marcados.includes(id));
  const algunoVisibleMarcado = idsVisibles.some((id) => marcados.includes(id));

  function alternarMarcado(id: number) {
    setMarcados((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function alternarTodosVisibles() {
    setMarcados((prev) =>
      todosVisiblesMarcados ? prev.filter((id) => !idsVisibles.includes(id)) : Array.from(new Set([...prev, ...idsVisibles])),
    );
  }

  const columnTemplate = table
    .getVisibleLeafColumns()
    .map((c) => (c.id === "diagnostico" ? `minmax(${c.getSize()}px, 1fr)` : `${c.getSize()}px`))
    .join(" ");
  const tableMinWidth = table.getVisibleLeafColumns().reduce((t, c) => t + c.getSize(), 0);

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });
  // Entrada escalonada de las primeras filas al cargar (como Grupos).
  const entradaFila = useEntradaFilas(!loading && tableRows.length > 0);

  function getColumnOptions(column: Column<MyPatientRow>) {
    const values = Array.from(column.getFacetedUniqueValues().keys())
      .map((v) => String(v))
      .filter(Boolean);
    return sortFilterValues(column.id, values);
  }

  function openColumnFilter(column: Column<MyPatientRow>, anchor: HTMLElement) {
    const options = getColumnOptions(column);
    const current = column.getFilterValue();
    const selected = Array.isArray(current) ? current : undefined;
    const rect = anchor.getBoundingClientRect();
    const ancho = Math.min(320, window.innerWidth - 24);
    const alto = Math.min(430, window.innerHeight - 24);
    setFilterPosition({
      top: rect.bottom + 8 + alto <= window.innerHeight ? rect.bottom + 8 : Math.max(12, window.innerHeight - alto - 12),
      left: Math.min(Math.max(12, rect.left), window.innerWidth - ancho - 12),
    });
    setDraftFilters((prev) => ({ ...prev, [column.id]: selected?.length ? [...selected] : options }));
    setFilterQueries((prev) => ({ ...prev, [column.id]: "" }));
    setOpenFilter(column.id);
  }

  function applyColumnFilter(column: Column<MyPatientRow>, override?: string[]) {
    const options = getColumnOptions(column);
    const selected = Array.from(new Set(override ?? draftFilters[column.id] ?? options));
    startTransition(() => {
      column.setFilterValue(selected.length === 0 || selected.length === options.length ? undefined : selected);
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
      setQuickFilters(FILTROS_VACIOS);
    });
  }

  if (!user) return null;

  function celdaEspecial(columnId: string, row: MyPatientRow) {
    if (columnId === "seleccion") {
      const marcado = marcados.includes(row.patient.id);
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={marcado}
          aria-label={`Seleccionar a ${row.nombre}`}
          onClick={(e) => {
            e.stopPropagation();
            alternarMarcado(row.patient.id);
          }}
          className="flex h-full w-full items-center justify-center outline-none"
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors ${
              marcado ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white hover:border-blue-400 dark:border-ink-black-500 dark:bg-ink-black-900"
            }`}
          >
            {marcado && <FiCheck size={11} strokeWidth={3} />}
          </span>
        </button>
      );
    }
    if (columnId === "agendar") {
      const p = row.patient;
      const permitido = puedeAgendar && !!p.kine_asignado && (!esKine || p.kine_asignado === user?.id);
      if (!permitido) return null;
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAgendando(p);
          }}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
            p.proxima_atencion
              ? "border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-100"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          <FiCalendar size={12} aria-hidden="true" />
          {p.proxima_atencion ? "Reagendar" : "Agendar sesión"}
        </button>
      );
    }
    return undefined;
  }

  return (
    <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-1.5rem))] flex-col overflow-hidden border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800 sm:h-[max(520px,calc(100dvh-64px-2rem))]">
      <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-ink-black-600 dark:bg-ink-black-800">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-950 dark:text-white">{esKine ? "Mis pacientes" : "Pacientes ingresados"}</h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
                <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{pacientes.length}</span>{" "}
                {pacientes.length === 1 ? "paciente" : "pacientes"} {esKine ? "en tu cartera" : "en tratamiento"}
                {sinAgendar > 0 && (
                  <>
                    {" · "}
                    <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">{sinAgendar}</span> sin sesión agendada
                  </>
                )}
                {filteredRows !== pacientes.length && (
                  <>
                    {" · "}mostrando <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{filteredRows}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void mutate()} className="ccr-control-button" title="Volver a cargar">
                <FiRefreshCw size={13} aria-hidden="true" />
                Actualizar
              </button>
              <button type="button" onClick={() => setCreando(true)} className="ccr-control-button">
                <FiUserPlus size={13} aria-hidden="true" />
                Agregar paciente
              </button>
              <button type="button" onClick={() => setGrupos({})} className="ccr-control-button-primary">
                <FiUsers size={13} aria-hidden="true" />
                Actividades grupales
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            <div className="relative order-1 min-w-0 flex-1 sm:max-w-sm">
              <FiSearch className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={15} aria-hidden="true" />
              <input
                type="text"
                value={tableState.globalSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  startTransition(() => setGlobalSearch(value));
                }}
                className="ccr-control-input w-full pl-9 pr-3"
                placeholder="Buscar nombre, RUT o diagnóstico"
                aria-label="Buscar pacientes"
              />
            </div>
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
                  onChange={(v) => setQuickFilters((prev) => ({ ...prev, categoria: v as Categoria[] }))}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowQuickFilters((prev) => !prev)}
              className="ccr-control-button order-2 ml-auto"
              aria-expanded={showQuickFilters}
              aria-controls="mis-pacientes-quick-filters"
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
          </div>

          {showQuickFilters && (
            <motion.div
              id="mis-pacientes-quick-filters"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-ink-black-700 sm:grid-cols-2 lg:grid-cols-3 ${verTodos ? "2xl:grid-cols-5" : "2xl:grid-cols-4"}`}
            >
              <MultiSelectFiltro
                anchoCompleto
                label="Agenda"
                values={quickFilters.agenda}
                opciones={[
                  { value: "SIN_AGENDA", label: "Sin sesión agendada", total: conteo("agenda", "SIN_AGENDA") },
                  { value: "AGENDADO", label: "Con sesión agendada", total: conteo("agenda", "AGENDADO") },
                ]}
                onChange={(v) => setQuickFilters((prev) => ({ ...prev, agenda: v }))}
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
              {verTodos && (
                <MultiSelectFiltro
                  anchoCompleto
                  label="Profesional"
                  textoTodos
                  values={quickFilters.responsable}
                  opciones={quickFilterOptions.responsables.map((r) => ({ value: r.value, label: r.label, total: conteo("responsable", r.value) }))}
                  onChange={(v) => setQuickFilters((prev) => ({ ...prev, responsable: v }))}
                />
              )}
            </motion.div>
          )}
        </div>
      </header>

      {marcados.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-5 py-2 dark:border-blue-500/30 dark:bg-blue-500/10">
          <p className="text-xs font-bold text-blue-800 dark:text-blue-100">
            {marcados.length} paciente{marcados.length !== 1 ? "s" : ""} seleccionado{marcados.length !== 1 ? "s" : ""}
          </p>
          <button type="button" onClick={() => setNuevoGrupo(marcados)} className="ccr-control-button ml-auto">
            <FiUsers size={13} aria-hidden="true" />
            Guardar como grupo
          </button>
          <button type="button" onClick={() => setGrupos({ preseleccion: marcados, accion: "agregar" })} className="ccr-control-button">
            <FiUserPlus size={13} aria-hidden="true" />
            Agregar a un grupo
          </button>
          <button type="button" onClick={() => setGrupos({ preseleccion: marcados, accion: "actividad" })} className="ccr-control-button-primary">
            <FiCalendar size={13} aria-hidden="true" />
            Citar a actividad
          </button>
          <button type="button" onClick={() => setMarcados([])} className="ccr-control-button">
            Quitar selección
          </button>
        </div>
      )}

      {error ? (
        <EmptyState variant="error" compact message={error} />
      ) : (
        <section className="ccr-data-table ccr-operational-table relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-ink-black-800">
          {(loading || isPending || !hasHydrated) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/80 backdrop-blur-[1px] dark:bg-[#151515]/75">
              <LoaderKine enLinea retrasoMs={0} />
            </div>
          )}

          <div
            ref={tableScrollRef}
            onScroll={() => {
              if (openFilter) {
                setOpenFilter(null);
                setFilterPosition(null);
              }
            }}
            className="ccr-table-scroll min-h-0 flex-1 overflow-auto border-b border-gray-100 [scrollbar-gutter:stable] dark:border-[#262626]"
          >
            <div className="w-full min-w-max bg-white dark:bg-ink-black-800" style={{ minWidth: tableMinWidth }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <div
                  key={headerGroup.id}
                  className="ccr-table-head sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-900"
                  style={{ gridTemplateColumns: columnTemplate }}
                >
                  {headerGroup.headers.map((header) => {
                    if (header.column.id === "seleccion") {
                      return (
                        <div key={header.id} className="flex h-11 items-center justify-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={todosVisiblesMarcados ? true : algunoVisibleMarcado ? "mixed" : false}
                            aria-label="Seleccionar todos los pacientes visibles"
                            onClick={alternarTodosVisibles}
                            className={`inline-flex h-4 w-4 items-center justify-center rounded border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                              algunoVisibleMarcado ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white hover:border-blue-400 dark:border-ink-black-500 dark:bg-ink-black-900"
                            }`}
                          >
                            {todosVisiblesMarcados ? <FiCheck size={11} strokeWidth={3} /> : algunoVisibleMarcado ? <FiMinus size={11} strokeWidth={3} /> : null}
                          </button>
                        </div>
                      );
                    }
                    const meta = getColumnMeta(header.column);
                    const isSorted = header.column.getIsSorted();
                    const currentFilter = header.column.getFilterValue();
                    const isFilterActive = Array.isArray(currentFilter) && currentFilter.length > 0;
                    return (
                      <div key={header.id} className="group relative flex h-11 items-center px-2.5">
                        <div className="flex w-full min-w-0 items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              if (!header.column.getCanSort()) return;
                              startTransition(() => header.column.toggleSorting(undefined, event.shiftKey));
                            }}
                            className="ccr-table-sort-button flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-bold text-slate-500 outline-none hover:text-slate-950 focus-visible:text-slate-950 dark:text-ink-black-300"
                          >
                            <span className="truncate whitespace-nowrap">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                            {isSorted && (
                              <span className="inline-flex shrink-0 items-center text-blue-600">
                                {isSorted === "asc" ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                              </span>
                            )}
                          </button>
                          {meta.filterable && (
                            <div
                              data-filter-root
                              className={`absolute right-1 top-1/2 -translate-y-1/2 ${isFilterActive || openFilter === header.column.id ? "" : "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"}`}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (openFilter === header.column.id) {
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                    return;
                                  }
                                  openColumnFilter(header.column, event.currentTarget);
                                }}
                                className={
                                  isFilterActive
                                    ? "ccr-table-filter-button is-active inline-flex h-6 w-6 items-center justify-center rounded-md"
                                    : `ccr-table-filter-button inline-flex h-6 w-6 items-center justify-center rounded-md !bg-slate-50 transition-opacity focus-visible:opacity-100 ${openFilter === header.column.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
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
                                  selectedValues={draftFilters[header.column.id] ?? getColumnOptions(header.column)}
                                  onSortAsc={() => {
                                    startTransition(() => header.column.toggleSorting(false, true));
                                    setOpenFilter(null);
                                  }}
                                  onSortDesc={() => {
                                    startTransition(() => header.column.toggleSorting(true, true));
                                    setOpenFilter(null);
                                  }}
                                  onClearSort={() => {
                                    startTransition(() => header.column.clearSorting());
                                    setOpenFilter(null);
                                  }}
                                  onQueryChange={(value) => setFilterQueries((prev) => ({ ...prev, [header.column.id]: value }))}
                                  onSelectionChange={(values) => setDraftFilters((prev) => ({ ...prev, [header.column.id]: values }))}
                                  onCancel={() => {
                                    setOpenFilter(null);
                                    setFilterPosition(null);
                                  }}
                                  onApply={(override) => applyColumnFilter(header.column, override)}
                                />
                              )}
                            </div>
                          )}
                        </div>
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
                  message={pacientes.length === 0 ? (esKine ? "Aún no tienes pacientes ingresados." : "No hay pacientes ingresados.") : "Sin pacientes con los filtros seleccionados."}
                />
              ) : (
                <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = tableRows[virtualRow.index];
                    const marcado = marcados.includes(row.original.patient.id);
                    const entrada = entradaFila(virtualRow.index);
                    return (
                      <div
                        key={row.id}
                        className={`ccr-table-row absolute left-0 top-0 grid w-full cursor-pointer border-b border-slate-100 transition-colors dark:border-ink-black-700 ${
                          marcado ? "bg-blue-50/70 dark:bg-blue-500/10" : "bg-white hover:bg-blue-50/60 dark:bg-ink-black-800 dark:hover:bg-blue-500/10"
                        } ${entrada.className}`}
                        style={{ ...entrada.style, gridTemplateColumns: columnTemplate, transform: `translateY(${virtualRow.start}px)` }}
                        onClick={() => setSeleccionado(row.original.patient)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const especial = celdaEspecial(cell.column.id, row.original);
                          return (
                            <div
                              key={cell.id}
                              className={`flex h-[52px] items-center overflow-hidden text-xs text-slate-700 dark:text-ink-black-200 ${cell.column.id === "seleccion" ? "" : "px-2 sm:px-3"}`}
                            >
                              {especial !== undefined ? especial : flexRender(cell.column.columnDef.cell, cell.getContext())}
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
              {filteredRows} paciente{filteredRows !== 1 ? "s" : ""} ingresado{filteredRows !== 1 ? "s" : ""}
            </p>
            <p className="text-gray-400">
              Mostrando {filteredRows} de {pacientes.length}
            </p>
          </div>
        </section>
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
        />
      )}

      {agendando && (
        <ProximaAtencionModal
          paciente={agendando}
          agenda={pacientes}
          onClose={() => setAgendando(null)}
          onConfirm={async (fechaHora, observacion) => {
            if (agendando.proxima_atencion) {
              await api.post<Paciente>(`/pacientes/${agendando.id}/reagendar-atencion/`, {
                fecha_programada: agendando.proxima_atencion,
                nueva_fecha: fechaHora,
                observacion: observacion || "Sesión reagendada desde Mis pacientes.",
              });
            } else {
              await api.post<Paciente>(`/pacientes/${agendando.id}/programar-atencion/`, { fecha_hora: fechaHora });
            }
            await mutate();
            setAgendando(null);
          }}
          onClear={
            agendando.proxima_atencion
              ? async () => {
                  await api.post<Paciente>(`/pacientes/${agendando.id}/eliminar-cita/`, {
                    fecha_programada: agendando.proxima_atencion,
                    observacion: "Sesión eliminada desde Mis pacientes.",
                  });
                  await mutate();
                  setAgendando(null);
                }
              : undefined
          }
          successMessage={agendando.proxima_atencion ? "Sesión reagendada correctamente." : "Sesión agendada correctamente."}
          clearSuccessMessage="Sesión eliminada."
        />
      )}

      {grupos && (
        <ActividadesGrupalesModal
          usuario={user}
          pacientesDisponibles={pacientes.filter((p) => !esKine || p.kine_asignado === user.id)}
          preseleccion={grupos.preseleccion}
          accionSeleccion={grupos.accion}
          onClose={() => setGrupos(null)}
          onCambio={() => {
            if (grupos.preseleccion) setMarcados([]);
          }}
        />
      )}

      {nuevoGrupo && (
        <GrupoModal
          usuario={user}
          candidatos={pacientes
            .filter((p) => p.estado === "INGRESADO" && (!esKine || p.kine_asignado === user.id))
            .map((p) => ({ id: p.id, nombre: p.nombre, rut: p.rut, categoria: p.categoria }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))}
          preseleccion={nuevoGrupo}
          onClose={() => setNuevoGrupo(null)}
          onGuardado={(guardado) => {
            setNuevoGrupo(null);
            setMarcados([]);
            router.push(`/grupos?id=${guardado.id}`);
          }}
        />
      )}

      <CrearPacienteModal isOpen={creando} onOpenChange={setCreando} onSuccess={() => void mutate()} />
    </div>
  );
}
