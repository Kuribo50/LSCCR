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
import { createPortal } from "react-dom";
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
import { FiFilter, FiRefreshCw, FiSearch, FiUserPlus } from "react-icons/fi";
import { formatearRut } from "@/lib/rut";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";
import { usePersistentTableState } from "@/lib/tables/usePersistentTableState";
import type { Categoria, Estado, Paciente, Prioridad } from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import BadgePrioridad from "@/components/BadgePrioridad";
import BadgeEstado from "@/components/BadgeEstado";
import BadgeDias from "@/components/BadgeDias";
import EditarPacienteModal from "@/components/EditarPacienteModal";
import CrearPacienteModal from "@/components/CrearPacienteModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

const PRIORIDAD_ORDER: Record<Prioridad, number> = {
  ALTA: 0,
  MEDIANA: 1,
  MODERADA: 2,
  LICENCIA_MEDICA: 3,
};

const ESTADO_ORDER: Record<Estado, number> = {
  PENDIENTE: 0,
  INGRESADO: 1,
  RESCATE: 2,
  DERIVADO: 3,
  ABANDONO: 4,
  ALTA_MEDICA: 5,
  EGRESO_VOLUNTARIO: 6,
};

type MyPatientRow = {
  patient: Paciente;
  nombre: string;
  rut: string;
  rutRaw: string;
  edad: number;
  diagnostico: string;
  prioridad: Prioridad;
  prioridadLabel: string;
  categoria: Categoria;
  categoriaLabel: string;
  estado: Estado;
  estadoLabel: string;
  proxima_atencion: string | null;
  dias_en_lista: number;
  dias_display: number;
  searchIndex: string;
};

type ColumnMeta = {
  label: string;
  kind?: "text" | "number";
  filterable?: boolean;
  align?: "left" | "center" | "right";
};

type FilterDraftState = Record<string, string[]>;
type FilterQueryState = Record<string, string>;
type FilterPopoverPosition = { top: number; left: number };
type PatientTab = "INGRESADOS" | "SELECCIONADOS" | "EGRESADOS";

const EGRESO_STATES: Estado[] = [
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "ABANDONO",
  "DERIVADO",
];

const TABS: Array<{ id: PatientTab; label: string }> = [
  { id: "INGRESADOS", label: "Ingresados" },
  { id: "SELECCIONADOS", label: "Seleccionados" },
  { id: "EGRESADOS", label: "Egresados" },
];

function normalizeRut(value: string) {
  return value.toLowerCase().replace(/[^0-9k]/g, "");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

function toCapitalizedWords(value: string) {
  const normalized = value
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL");
  return normalized.replace(/\p{L}+/gu, (word) => {
    const [first = "", ...rest] = Array.from(word);
    return `${first.toLocaleUpperCase("es-CL")}${rest.join("")}`;
  });
}

function calcularDiasDesde(fecha: string | null | undefined) {
  if (!fecha) return null;

  const inicio = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const diffMs = hoy.getTime() - inicio.getTime();
  if (diffMs < 0) return 0;

  return Math.floor(diffMs / 86400000);
}

const multiSelectFilter: FilterFn<MyPatientRow> = (
  row,
  columnId,
  filterValue,
) => {
  if (typeof filterValue === "string") {
    const query = filterValue.trim();
    if (!query) return true;

    const cellValue = String(row.getValue(columnId) ?? "");
    if (columnId === "rut") {
      return normalizeRut(cellValue).includes(normalizeRut(query));
    }

    return normalizeSearchText(cellValue).includes(normalizeSearchText(query));
  }

  const selected = Array.isArray(filterValue) ? filterValue : [];
  if (selected.length === 0) return true;
  return selected.includes(String(row.getValue(columnId)));
};

multiSelectFilter.autoRemove = (value) =>
  typeof value === "string"
    ? value.trim().length === 0
    : !Array.isArray(value) || value.length === 0;

const columnHelper = createColumnHelper<MyPatientRow>();

function getColumnMeta(column: Column<MyPatientRow>): ColumnMeta {
  return (column.columnDef.meta ?? { label: column.id }) as ColumnMeta;
}

function sortFilterValues(columnId: string, values: string[]) {
  if (columnId === "edad" || columnId === "dias_display") {
    return [...values].sort((a, b) => Number(a) - Number(b));
  }

  if (columnId === "prioridadLabel") {
    return [...values].sort((a, b) => {
      const aKey = Object.entries(PRIORIDAD_LABELS).find(
        ([, label]) => label === a,
      )?.[0] as Prioridad | undefined;
      const bKey = Object.entries(PRIORIDAD_LABELS).find(
        ([, label]) => label === b,
      )?.[0] as Prioridad | undefined;
      return (
        (aKey ? PRIORIDAD_ORDER[aKey] : 999) -
        (bKey ? PRIORIDAD_ORDER[bKey] : 999)
      );
    });
  }

  if (columnId === "estadoLabel") {
    return [...values].sort((a, b) => {
      const aKey = Object.entries(ESTADO_LABELS).find(
        ([, label]) => label === a,
      )?.[0] as Estado | undefined;
      const bKey = Object.entries(ESTADO_LABELS).find(
        ([, label]) => label === b,
      )?.[0] as Estado | undefined;
      return (
        (aKey ? ESTADO_ORDER[aKey] : 999) - (bKey ? ESTADO_ORDER[bKey] : 999)
      );
    });
  }

  return [...values].sort((a, b) => a.localeCompare(b, "es"));
}

function matchesFilterSearch(columnId: string, option: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  if (columnId === "rut") {
    return normalizeRut(option).includes(normalizeRut(trimmedQuery));
  }

  return normalizeSearchText(option).includes(normalizeSearchText(trimmedQuery));
}

const BASE_COLUMN_VISIBILITY: VisibilityState = {
  kine_asignado_nombre: true,
  nombre: true,
  rut: true,
  edad: true,
  diagnostico: true,
  prioridadLabel: true,
  categoriaLabel: true,
  estadoLabel: true,
  proximaAtencion: true,
  dias_display: true,
  acciones: true,
};

function getResponsiveColumnVisibility(width: number): VisibilityState {
  if (width < 768) {
    return {
      ...BASE_COLUMN_VISIBILITY,
      kine_asignado_nombre: false,
      edad: false,
      diagnostico: false,
      prioridadLabel: false,
      categoriaLabel: false,
      estadoLabel: false,
    };
  }

  if (width < 1200) {
    return {
      ...BASE_COLUMN_VISIBILITY,
      diagnostico: false,
      categoriaLabel: false,
    };
  }

  return BASE_COLUMN_VISIBILITY;
}

export default function MisPacientesPage() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState<Paciente | null>(null);
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [creando, setCreando] = useState(false);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<FilterDraftState>({});
  const [filterQueries, setFilterQueries] = useState<FilterQueryState>({});
  const [filterPosition, setFilterPosition] = useState<FilterPopoverPosition | null>(null);
  const [activeTab, setActiveTab] = useState<PatientTab>("INGRESADOS");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; nombre: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const initialTableState = useMemo(
    () => ({
      globalSearch: "",
      sorting: [{ id: "dias_display", desc: true as const }],
      columnFilters: [],
      columnSizing: {},
      columnOrder: [],
      columnVisibility: {},
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
    storageKey: "table-prefs:mis-pacientes",
    initialState: initialTableState,
  });

  const deferredSearch = useDeferredValue(tableState.globalSearch);

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const endpoint = user.rol === "ADMIN" ? "/pacientes/?asignados=1" : "/pacientes/?solo_mios=1";
      const data = await api.get<Paciente[]>(endpoint);
      setPacientes(data);
    } catch {
      setPacientes([]);
      setError("No se pudo cargar mi cartera.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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

    const defaultActionsWidth = user?.rol === "ADMIN" ? 278 : 232;
    setColumnSizing((prev) => {
      const current = prev.acciones;
      if (current === defaultActionsWidth) {
        return prev;
      }
      return { ...prev, acciones: defaultActionsWidth };
    });
  }, [hasHydrated, setColumnSizing, user?.rol]);

  async function handleEliminar(id: number, nombre: string) {
    if (user?.rol !== "ADMIN") return;
    setDeleteTarget({ id, nombre });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/pacientes/${deleteTarget.id}/`);
      toastSuccess(`Paciente "${deleteTarget.nombre}" eliminado correctamente.`);
      setDeleteTarget(null);
      void cargar();
    } catch {
      toastError("No se pudo eliminar el paciente.");
    } finally {
      setDeleting(false);
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

  const tabCounts = useMemo(
    () => ({
      SELECCIONADOS: pacientes.filter((p) => p.estado === "PENDIENTE").length,
      INGRESADOS: pacientes.filter((p) => ["INGRESADO", "RESCATE"].includes(p.estado)).length,
      EGRESADOS: pacientes.filter((p) => EGRESO_STATES.includes(p.estado))
        .length,
    }),
    [pacientes],
  );

  const pacientesPorTab = useMemo(() => {
    if (activeTab === "SELECCIONADOS")
      return pacientes.filter((p) => p.estado === "PENDIENTE");
    if (activeTab === "INGRESADOS")
      return pacientes.filter((p) => ["INGRESADO", "RESCATE"].includes(p.estado));
    return pacientes.filter((p) => EGRESO_STATES.includes(p.estado));
  }, [activeTab, pacientes]);

  const rowsData = useMemo<MyPatientRow[]>(
    () =>
      pacientesPorTab.map((patient) => {
        const rut = formatearRut(patient.rut);
        const rutRaw = normalizeRut(patient.rut);
        const nombreNormalizado = normalizeSearchText(patient.nombre);
        const diagnosticoNormalizado = normalizeSearchText(patient.diagnostico);
        const estadoLabel = toCapitalizedWords(
          ESTADO_LABELS[patient.estado] ?? patient.estado,
        );
        const diasIngreso = calcularDiasDesde(
          patient.fecha_ingreso ?? patient.fecha_cambio_estado,
        );
        const diasEgreso = calcularDiasDesde(
          patient.fecha_egreso ?? patient.fecha_cambio_estado,
        );
        return {
          patient,
          nombre: toCapitalizedWords(patient.nombre),
          rut,
          rutRaw,
          edad: patient.edad,
          diagnostico: toCapitalizedWords(patient.diagnostico),
          prioridad: patient.prioridad,
          prioridadLabel: toCapitalizedWords(
            PRIORIDAD_LABELS[patient.prioridad] ?? patient.prioridad,
          ),
          categoria: patient.categoria,
          categoriaLabel: toCapitalizedWords(
            CATEGORIA_LABELS[patient.categoria] ?? patient.categoria,
          ),
          estado: patient.estado,
          estadoLabel,
          proxima_atencion: patient.proxima_atencion,
          dias_en_lista: patient.dias_en_lista,
          dias_display:
            activeTab === "INGRESADOS"
              ? (diasIngreso ?? 0)
              : activeTab === "EGRESADOS"
                ? (diasEgreso ?? 0)
                : patient.dias_en_lista,
          searchIndex: `${nombreNormalizado} ${rutRaw} ${diagnosticoNormalizado} ${normalizeSearchText(estadoLabel)}`,
        };
      }),
    [activeTab, pacientesPorTab],
  );

  const daysColumnLabel =
    activeTab === "INGRESADOS"
      ? "Días de ingreso"
      : activeTab === "EGRESADOS"
        ? "Días de egreso"
        : "Días de espera";

  const columns = useMemo(
    () => [
      ...(user?.rol === "ADMIN"
        ? [
            columnHelper.accessor((row) => row.patient.kine_asignado_nombre, {
              id: "kine_asignado_nombre",
              header: "Responsable CCR",
              enableColumnFilter: true,
              filterFn: multiSelectFilter,
              enableResizing: true,
              size: 160,
              minSize: 120,
              meta: { label: "Responsable CCR", filterable: true } satisfies ColumnMeta,
              cell: (info) => (
              <div
                className="truncate font-semibold text-gray-800"
                title={info.getValue() || "Sin responsable"}
              >
                {toCapitalizedWords(info.getValue() || "Sin asignar")}
              </div>
              ),
            }),
          ]
        : []),
      columnHelper.accessor("nombre", {
        header: "Nombre",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 260,
        minSize: 220,
        meta: { label: "Nombre", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <div
            className="truncate font-semibold text-gray-800"
            title={info.getValue()}
          >
            {info.getValue()}
          </div>
        ),
      }),
      columnHelper.accessor("rut", {
        header: "RUT",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 160,
        minSize: 130,
        sortingFn: (a, b) =>
          a.original.rutRaw.localeCompare(b.original.rutRaw, "es"),
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
        size: 112,
        minSize: 96,
        meta: {
          label: "Edad",
          filterable: true,
          kind: "number",
        } satisfies ColumnMeta,
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
      columnHelper.accessor("prioridadLabel", {
        header: "Prioridad",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 145,
        minSize: 124,
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
        size: 145,
        minSize: 126,
        meta: { label: "Categoría", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <span className="text-gray-600">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("estadoLabel", {
        header: "Estado",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 150,
        minSize: 130,
        meta: { label: "Estado", filterable: true } satisfies ColumnMeta,
        cell: (info) => <BadgeEstado estado={info.row.original.estado} />,
      }),
      ...(activeTab === "INGRESADOS"
        ? [
            columnHelper.accessor("proxima_atencion", {
              id: "proximaAtencion",
              header: "Próxima atención",
              enableColumnFilter: false,
              enableResizing: true,
              size: 170,
              minSize: 150,
              sortingFn: (a, b) => {
                const aValue = a.original.proxima_atencion
                  ? new Date(a.original.proxima_atencion).getTime()
                  : Number.POSITIVE_INFINITY;
                const bValue = b.original.proxima_atencion
                  ? new Date(b.original.proxima_atencion).getTime()
                  : Number.POSITIVE_INFINITY;
                return aValue - bValue;
              },
              meta: { label: "Próxima atención" } satisfies ColumnMeta,
              cell: (info) => {
                const raw = info.getValue();
                if (!raw) {
                  return <span className="text-gray-400">Sin programar</span>;
                }

                const fecha = new Date(raw);
                if (Number.isNaN(fecha.getTime())) {
                  return <span className="text-gray-400">Sin programar</span>;
                }

                return (
                  <div className="ccr-appointment-soft inline-flex min-w-[118px] flex-col items-start rounded-md px-2.5 py-1.5 leading-tight">
                    <p className="font-bold text-white">
                      {fecha.toLocaleDateString("es-CL")}
                    </p>
                    <p className="text-[11px] font-semibold text-white/85">
                      {fecha.toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              },
            }),
          ]
        : []),
      columnHelper.accessor("dias_display", {
        header: daysColumnLabel,
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 136,
        minSize: 116,
        meta: {
          label: daysColumnLabel,
          filterable: true,
          kind: "number",
        } satisfies ColumnMeta,
        cell: (info) => <BadgeDias days={info.row.original.dias_display} />,
      }),
      columnHelper.display({
        id: "acciones",
        header: "Acciones",
        enableSorting: false,
        enableColumnFilter: false,
        enableResizing: true,
        size: 232,
        minSize: 205,
        meta: { label: "Acciones", align: "right" } satisfies ColumnMeta,
        cell: (info) => {
          const paciente = info.row.original.patient;
          return (
            <div className="flex items-center justify-end gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => setEditando(paciente)}
                className="ccr-table-action ccr-action-edit"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setSeleccionado(paciente)}
                className="ccr-table-action ccr-action-view"
              >
                Ver ficha operativa
              </button>
              {user?.rol === "ADMIN" && (
                <button
                  type="button"
                  onClick={() => void handleEliminar(paciente.id, paciente.nombre)}
                  className="ccr-table-action ccr-action-danger"
                >
                  Eliminar
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [activeTab, daysColumnLabel, user?.rol],
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
  const tableRows = table.getRowModel().rows;

  const columnTemplate = table
    .getVisibleLeafColumns()
    .map((column) => `${column.getSize()}px`)
    .join(" ");

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  function getColumnOptions(column: Column<MyPatientRow>) {
    const values = Array.from(column.getFacetedUniqueValues().keys())
      .map((value) => String(value))
      .filter(Boolean);

    return sortFilterValues(column.id, values);
  }

  function openColumnFilter(column: Column<MyPatientRow>, anchor?: HTMLElement) {
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
    column: Column<MyPatientRow>,
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
    });
  }

  if (!user) return null;

  return (
    <div className="space-y-3 text-[13px]">
      <header className="ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-lg font-bold text-gray-900">
              {user?.rol === "ADMIN" ? "Pacientes Asignados" : "Mis Pacientes"}
            </h1>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 outline-none transition hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-auto sm:justify-start"
              >
                <FiUserPlus size={13} />
                Agregar paciente
              </button>
              <button
                type="button"
                onClick={() => void cargar()}
                className="ccr-button-refresh inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-auto sm:justify-start"
              >
                <FiRefreshCw size={13} />
                Recargar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <FiSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={15}
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
                className="w-full rounded-xl border border-gray-200 bg-white px-9 py-2.5 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Buscar por nombre, RUT o diagnóstico"
                aria-label="Buscar pacientes"
              />
            </div>

            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-[42px] w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 outline-none transition hover:bg-gray-50 sm:w-auto"
            >
              Limpiar filtros
            </button>
          </div>

          {isPending && (
            <p className="text-[11px] text-gray-400">Actualizando tabla...</p>
          )}
        </div>
      </header>

      <section className="ccr-panel rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setOpenFilter(null);
                  setFilterPosition(null);
                }}
                className={
                  active
                    ? tab.id === "INGRESADOS"
                      ? "inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700"
                      : tab.id === "EGRESADOS"
                        ? "inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                        : "inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
                    : "inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                }
              >
                <span>{tab.label}</span>
                <span
                  className={
                    active
                      ? tab.id === "INGRESADOS"
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-[10px]"
                        : tab.id === "EGRESADOS"
                          ? "rounded-full bg-red-100 px-2 py-0.5 text-[10px]"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px]"
                      : "rounded-full bg-gray-100 px-2 py-0.5 text-[10px]"
                  }
                >
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <EmptyState variant="error" compact message={error} />
      )}

      {!error && (
        <section className="ccr-panel ccr-data-table relative overflow-hidden rounded-lg bg-white dark:bg-[#0f0f10]">
          {(loading || isPending || !hasHydrated) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px] dark:bg-[#151515]/75">
              {loading && !hasHydrated ? (
                <div className="w-full p-4">
                  <TableSkeleton rows={6} />
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-600 shadow-sm dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#daebf1]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  Actualizando...
                </div>
              )}
            </div>
          )}

        <div
          ref={tableScrollRef}
          className="max-h-[clamp(320px,calc(100dvh-335px),860px)] overflow-auto border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]"
        >
          <div className="min-w-max rounded-lg border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#151515]">
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                key={headerGroup.id}
                className="ccr-table-head sticky top-0 z-20 grid border-b border-gray-200 bg-gray-50/80 dark:border-[#262626] dark:bg-[#202020]"
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
                      className="relative border-r border-gray-200 px-3 py-2.5 last:border-r-0 dark:border-[#262626]"
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center justify-between gap-2">
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
                            className="ccr-table-sort-button flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-gray-700 dark:text-[#daebf1]"
                          >
                            <span className="whitespace-normal leading-tight">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                            </span>
                            {isSorted && (
                              <span className="text-[11px] text-blue-600">
                                {isSorted === "asc" ? "▲" : "▼"}
                                {sortIndex >= 0 &&
                                table.getState().sorting.length > 1
                                  ? ` ${sortIndex + 1}`
                                  : ""}
                              </span>
                            )}
                          </button>

                          {meta.filterable && (
                            <div data-filter-root className="relative shrink-0">
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
                                    ? "ccr-table-filter-button inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 dark:border-[#262626] dark:bg-white dark:text-[#335fdb]"
                                    : "ccr-table-filter-button inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 dark:border-[#e5e7eb] dark:bg-white dark:text-[#335fdb] dark:hover:bg-[#eef3ff]"
                                }
                                aria-label={`Filtrar ${meta.label}`}
                              >
                                <FiFilter size={12} />
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
                message={
                  activeTab === "EGRESADOS"
                    ? "Sin pacientes egresados en historial con los filtros seleccionados."
                    : "Sin pacientes en seguimiento con los filtros seleccionados."
                }
              />
            ) : (
              <div
                className="relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index];
                  return (
                    <div
                      key={row.id}
                      className="ccr-table-row absolute left-0 top-0 grid w-full border-b border-gray-100 bg-white transition hover:bg-blue-50/50 dark:border-[#262626] dark:bg-[#151515] dark:hover:bg-[#202020]"
                      style={{
                        gridTemplateColumns: columnTemplate,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
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
                            className={`border-r border-gray-100 px-2 py-1.5 text-[12px] text-gray-700 last:border-r-0 dark:border-[#262626] dark:text-[#b5d8e3] sm:px-3 lg:px-4 ${alignment}`}
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

        <div className="flex flex-col gap-1 border-t border-gray-200 bg-gray-50/50 px-5 py-3 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#b5d8e3] sm:flex-row sm:items-center sm:justify-between">
          <p>
            {filteredRows} paciente{filteredRows !== 1 ? "s" : ""}{" "}
            {activeTab === "EGRESADOS" ? "en historial" : "en seguimiento"}
          </p>
          <p className="text-gray-400">
            Mostrando {filteredRows} de {rowsData.length}
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
            void cargar();
            setSeleccionado(null);
          }}
        />
      )}

      {editando && (
        <EditarPacienteModal
          paciente={editando}
          mode="contact-only"
          onClose={() => setEditando(null)}
          onGuardado={(actualizado) => {
            setPacientes((prev) =>
              prev.map((item) =>
                item.id === actualizado.id ? actualizado : item,
              ),
            );
            setEditando(null);
          }}
        />
      )}

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
      
      <CrearPacienteModal
        isOpen={creando}
        onOpenChange={setCreando}
        onSuccess={() => void cargar()}
      />

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
    </div>
  );
}

type FilterPopoverProps = {
  column: Column<MyPatientRow>;
  position: FilterPopoverPosition;
  sortState: false | "asc" | "desc";
  query: string;
  selectedValues: string[];
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onQueryChange: (value: string) => void;
  onSelectionChange: (values: string[]) => void;
  onCancel: () => void;
  onApply: (selectedValuesOverride?: string[]) => void;
};

function FilterPopover({
  column,
  position,
  sortState,
  query,
  selectedValues,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onQueryChange,
  onSelectionChange,
  onCancel,
  onApply,
}: FilterPopoverProps) {
  const meta = getColumnMeta(column);
  const options = sortFilterValues(
    column.id,
    Array.from(column.getFacetedUniqueValues().keys())
      .map((value) => String(value))
      .filter(Boolean),
  );
  const visibleOptions = options.filter((option) =>
    matchesFilterSearch(column.id, option, query),
  );
  const allVisibleSelected =
    visibleOptions.length > 0 &&
    visibleOptions.every((option) => selectedValues.includes(option));
  const shouldApplyVisibleOnly =
    query.trim().length > 0 &&
    selectedValues.length === options.length &&
    visibleOptions.length < options.length;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-filter-root
      className="ccr-filter-popover fixed z-[100] w-[min(92vw,320px)] overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-[#262626] dark:bg-[#0f0f10]"
      style={{
        left: position.left,
        maxHeight: "calc(100vh - 24px)",
        top: position.top,
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[12px] font-semibold text-gray-800 dark:text-[#ecf5f8]">
            {meta.label}
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-[#459dba]">Filtro de lista</p>
        </div>
        <button
          type="button"
          onClick={() => onSelectionChange(options)}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 dark:text-[#6ab0c8] dark:hover:text-[#daebf1]"
        >
          Limpiar
        </button>
      </div>

      {column.getCanSort() && (
        <div className="mb-3 space-y-1 rounded-lg border border-gray-100 bg-gray-50/70 p-2 dark:border-[#262626] dark:bg-[#151515]">
          <button
            type="button"
            onClick={onSortAsc}
            className={`block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium ${sortState === "asc" ? "bg-blue-50 text-blue-700 dark:bg-[#202020] dark:text-blue-200" : "text-gray-600 hover:bg-gray-100 dark:text-[#b5d8e3] dark:hover:bg-[#202020]"}`}
          >
            Ordenar de menor a mayor
          </button>
          <button
            type="button"
            onClick={onSortDesc}
            className={`block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium ${sortState === "desc" ? "bg-blue-50 text-blue-700 dark:bg-[#202020] dark:text-blue-200" : "text-gray-600 hover:bg-gray-100 dark:text-[#b5d8e3] dark:hover:bg-[#202020]"}`}
          >
            Ordenar de mayor a menor
          </button>
          <button
            type="button"
            onClick={onClearSort}
            className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-gray-500 hover:bg-gray-100 dark:text-[#6ab0c8] dark:hover:bg-[#202020]"
          >
            Quitar orden
          </button>
        </div>
      )}

      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder="Buscar opción"
        className="mb-3 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-[#262626] dark:bg-[#151515] dark:text-[#ecf5f8] dark:placeholder:text-[#459dba] dark:focus:ring-blue-500/20"
      />

      <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px]">
        <button
          type="button"
          onClick={() => {
            if (allVisibleSelected) {
              onSelectionChange(
                selectedValues.filter(
                  (value) => !visibleOptions.includes(value),
                ),
              );
              return;
            }
            onSelectionChange(
              Array.from(new Set([...selectedValues, ...visibleOptions])),
            );
          }}
          className="font-semibold text-blue-600 hover:underline"
        >
          Seleccionar todo
        </button>
        <span className="text-gray-400 dark:text-[#459dba]">{visibleOptions.length} opciones</span>
      </div>

      <div className={`space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-2 dark:border-[#262626] ${visibleOptions.length > 5 ? "max-h-56" : "max-h-40"}`}>
        {visibleOptions.length === 0 ? (
          <p className="px-2 py-2 text-xs text-gray-400 dark:text-[#459dba]">Sin coincidencias.</p>
        ) : (
          visibleOptions.map((option) => {
            const checked = selectedValues.includes(option);
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-[#202020]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onSelectionChange(
                        selectedValues.filter((value) => value !== option),
                      );
                    } else {
                      onSelectionChange([...selectedValues, option]);
                    }
                  }}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span className="truncate text-gray-700 dark:text-[#b5d8e3]" title={option}>
                  {option}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-2 dark:border-[#262626]">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#b5d8e3] dark:hover:bg-[#202020]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() =>
            onApply(shouldApplyVisibleOnly ? visibleOptions : undefined)
          }
          className="ccr-filter-apply rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body,
  );
}
