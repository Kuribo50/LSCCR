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
import { FiDownload, FiFilter, FiMail, FiPhone, FiRefreshCw, FiSearch, FiUser } from "react-icons/fi";
import { formatearRut } from "@/lib/rut";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { usePersistentTableState } from "@/lib/tables/usePersistentTableState";
import type { Categoria, Estado, Paciente, Prioridad } from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import BadgePrioridad from "@/components/BadgePrioridad";
import BadgeDias from "@/components/BadgeDias";
import ConfirmDialog from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

const PRIORIDAD_ORDER: Record<Prioridad, number> = {
  ALTA: 0,
  MEDIANA: 1,
  MODERADA: 2,
  LICENCIA_MEDICA: 3,
};

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

type ColumnMeta = {
  label: string;
  kind?: "text" | "number";
  filterable?: boolean;
  align?: "left" | "center" | "right";
};

type FilterDraftState = Record<string, string[]>;
type FilterQueryState = Record<string, string>;
type FilterPopoverPosition = { top: number; left: number };
type AssignContactDraft = {
  telefono: string;
  telefono_recados: string;
  email: string;
  observaciones: string;
};
type QuickFilterState = {
  estado: Estado | "TODOS";
  prioridad: Prioridad | "TODAS";
  categoria: Categoria | "TODAS";
  sector_cesfam: string;
  sector_oficial: string;
  responsable: string;
};

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

function getResponsableLabel(paciente: Paciente) {
  return (
    paciente.responsable_nombre ??
    paciente.kine_asignado_nombre ??
    "Sin responsable"
  );
}

function formatDateDisplay(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value.length > 10 ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return parsed.toLocaleDateString("es-CL");
}

function dateSortValue(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value.length > 10 ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return parsed.getTime();
}

function descargarBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

const multiSelectFilter: FilterFn<WaitlistRow> = (
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

const columnHelper = createColumnHelper<WaitlistRow>();

function getColumnMeta(column: Column<WaitlistRow>): ColumnMeta {
  return (column.columnDef.meta ?? { label: column.id }) as ColumnMeta;
}

function sortFilterValues(columnId: string, values: string[]) {
  if (columnId === "edad" || columnId === "dias_en_lista") {
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
  responsable: true,
  nombre: true,
  rut: true,
  edad: true,
  sector_cesfam: true,
  sector_oficial: true,
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

  return BASE_COLUMN_VISIBILITY;
}

function getCompactColumnSizing(isAdmin: boolean): Record<string, number> {
  return {
    acciones: isAdmin ? 132 : 96,
    responsable: 132,
    nombre: 200,
    rut: 126,
    edad: 72,
    sector_cesfam: 170,
    sector_oficial: 170,
    diagnostico: 230,
    fecha_ingreso: 112,
    prioridadLabel: 104,
    categoriaLabel: 104,
    dias_en_lista: 88,
  };
}

export default function ListaEsperaPage() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const [quickFilters, setQuickFilters] = useState<QuickFilterState>({
    estado: "TODOS",
    prioridad: "TODAS",
    categoria: "TODAS",
    sector_cesfam: "TODOS",
    sector_oficial: "TODOS",
    responsable: "TODOS",
  });
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef(0);
  const searchUrlAplicadoRef = useRef<string | null>(null);
  const initialTableState = useMemo(
    () => ({
      globalSearch: "",
      sorting: [{ id: "dias_en_lista", desc: true as const }],
      columnFilters: [],
      columnSizing: getCompactColumnSizing(user?.rol === "ADMIN"),
      columnOrder: [
        "acciones",
        "responsable",
        "nombre",
        "rut",
        "edad",
        "sector_cesfam",
        "sector_oficial",
        "diagnostico",
        "fecha_ingreso",
        "prioridadLabel",
        "categoriaLabel",
        "dias_en_lista",
      ],
      columnVisibility: {},
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
    storageKey: "table-prefs:lista-espera",
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

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (alertaActiva) {
        params.set("alerta", alertaActiva);
      } else {
        params.set("estado", LISTA_ESPERA_ESTADOS.join(","));
      }
      if (mes) params.set("mes", mes);
      if (anio) params.set("anio", anio);
      if (importacionId) params.set("importacion", importacionId);
      const data = await api.get<Paciente[]>(
        `/pacientes/?${params.toString()}`,
      );
      setPacientes(data);
    } catch (error) {
      setPacientes([]);
      const message = getErrorMessage(error, "No se pudo cargar la lista de espera.");
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [alertaActiva, mes, anio, importacionId, toastError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
      if (prev[0] === "acciones") return prev;
      const withoutActions = prev.filter((id) => id !== "acciones");
      return ["acciones", ...withoutActions];
    });
  }, [hasHydrated, setColumnOrder]);

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
      if (quickFilters.estado !== "TODOS") {
        params.set("estado", quickFilters.estado);
      } else if (!alertaActiva) {
        params.set("estado", LISTA_ESPERA_ESTADOS.join(","));
      }
      if (mes) params.set("mes", mes);
      if (anio) params.set("anio", anio);
      if (importacionId) params.set("importacion", importacionId);
      if (tableState.globalSearch.trim()) {
        params.set("search", tableState.globalSearch.trim());
      }
      if (quickFilters.prioridad !== "TODAS") params.set("prioridad", quickFilters.prioridad);
      if (quickFilters.categoria !== "TODAS") params.set("categoria", quickFilters.categoria);
      if (quickFilters.sector_cesfam !== "TODOS") params.set("sector_cesfam", quickFilters.sector_cesfam);
      if (quickFilters.sector_oficial !== "TODOS") params.set("sector_oficial", quickFilters.sector_oficial);
      if (quickFilters.responsable !== "TODOS") {
        if (quickFilters.responsable === "SIN_RESPONSABLE") {
          params.set("sin_asignar", "1");
        } else {
          params.set("kine", quickFilters.responsable);
        }
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

    function closeOnScrollOrResize() {
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
        quickFilters.estado !== "TODOS",
        quickFilters.prioridad !== "TODAS",
        quickFilters.categoria !== "TODAS",
        quickFilters.sector_cesfam !== "TODOS",
        quickFilters.sector_oficial !== "TODOS",
        quickFilters.responsable !== "TODOS",
      ].filter(Boolean).length,
    [quickFilters],
  );

  const pacientesFiltradosRapidos = useMemo(
    () =>
      pacientes.filter((paciente) => {
        if (quickFilters.estado !== "TODOS" && paciente.estado !== quickFilters.estado) {
          return false;
        }
        if (
          quickFilters.prioridad !== "TODAS" &&
          paciente.prioridad !== quickFilters.prioridad
        ) {
          return false;
        }
        if (
          quickFilters.categoria !== "TODAS" &&
          paciente.categoria !== quickFilters.categoria
        ) {
          return false;
        }
        if (
          quickFilters.sector_cesfam !== "TODOS" &&
          paciente.sector_cesfam !== quickFilters.sector_cesfam
        ) {
          return false;
        }
        if (
          quickFilters.sector_oficial !== "TODOS" &&
          paciente.sector_oficial !== quickFilters.sector_oficial
        ) {
          return false;
        }
        if (quickFilters.responsable === "SIN_RESPONSABLE" && paciente.kine_asignado) {
          return false;
        }
        if (
          quickFilters.responsable !== "TODOS" &&
          quickFilters.responsable !== "SIN_RESPONSABLE" &&
          String(paciente.kine_asignado) !== quickFilters.responsable
        ) {
          return false;
        }
        return true;
      }),
    [pacientes, quickFilters],
  );

  const rowsData = useMemo<WaitlistRow[]>(
    () =>
      pacientesFiltradosRapidos.map((patient) => {
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
              header: "Responsable CCR",
              enableColumnFilter: true,
              filterFn: multiSelectFilter,
              enableResizing: true,
              size: 132,
              minSize: 108,
              meta: { label: "Responsable CCR", filterable: true } satisfies ColumnMeta,
              cell: (info) => (
                <div
                  className="truncate font-semibold text-gray-800"
                  title={info.getValue() || "Sin responsable"}
                >
                  {info.getValue() || "Sin asignar"}
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
        size: 200,
        minSize: 160,
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
        size: 126,
        minSize: 102,
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
        size: 72,
        minSize: 64,
        meta: {
          label: "Edad",
          filterable: true,
          kind: "number",
        } satisfies ColumnMeta,
      }),
      columnHelper.accessor("sector_cesfam", {
        header: "Sector CESFAM",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 170,
        minSize: 140,
        meta: { label: "Sector CESFAM", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <span className="block truncate text-gray-600" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("sector_oficial", {
        header: "Sector oficial",
        enableColumnFilter: true,
        filterFn: multiSelectFilter,
        enableResizing: true,
        size: 170,
        minSize: 140,
        meta: { label: "Sector oficial", filterable: true } satisfies ColumnMeta,
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
        header: "Fecha ingreso",
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
        size: 104,
        minSize: 92,
        meta: { label: "Categoría", filterable: true } satisfies ColumnMeta,
        cell: (info) => (
          <span className="text-gray-600">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("dias_en_lista", {
        header: "Días de espera",
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
      columnHelper.display({
        id: "acciones",
        header: "Acciones",
        enableSorting: false,
        enableColumnFilter: false,
        enableResizing: true,
        size: user?.rol === "ADMIN" ? 132 : 96,
        minSize: user?.rol === "ADMIN" ? 116 : 88,
        meta: { label: "Acciones", align: "left" } satisfies ColumnMeta,
        cell: (info) => {
          const paciente = info.row.original.patient;
          return (
            <div className="flex items-center justify-start gap-1">
              {user?.rol === "KINE" && (
                <button
                  type="button"
                  disabled={asignando === paciente.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    abrirAsignacionConContacto(paciente);
                  }}
                  className="ccr-table-action ccr-action-primary px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {asignando === paciente.id ? "Asignando..." : "Tomar"}
                </button>
              )}
              {user?.rol === "ADMIN" && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleEliminar(paciente.id, paciente.nombre);
                  }}
                  className="ccr-table-action ccr-action-danger px-2 py-1 text-[10px]"
                >
                  Eliminar
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [asignando, user?.rol],
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
  const activeFilterCount =
    tableState.columnFilters.length +
    quickFilterCount +
    (tableState.globalSearch.trim() ? 1 : 0) +
    (alertaActiva ? 1 : 0);
  const columnTemplate = useMemo(
    () => {
      const visibleColumns = table.getVisibleLeafColumns();
      return visibleColumns
        .map((column) => {
          if (
            column.id === "nombre" ||
            column.id === "diagnostico" ||
            column.id === "sector_cesfam" ||
            column.id === "sector_oficial" ||
            column.id === "categoriaLabel"
          ) {
            return `minmax(${column.getSize()}px, 1fr)`;
          }
          return `${column.getSize()}px`;
        })
        .join(" ");
    },
    [table, tableState.columnSizing],
  );
  const tableMinWidth = table
    .getVisibleLeafColumns()
    .reduce((total, column) => total + column.getSize(), 0);

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

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
    setError("");
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

      if (observacionExtra) {
        const base = (asignarPaciente.observaciones ?? "").trim();
        payload.observaciones = base
          ? `${base}\n${observacionExtra}`
          : observacionExtra;
      }

      await api.patch<Paciente>(`/pacientes/${asignarPaciente.id}/`, payload);
      await api.post(`/pacientes/${asignarPaciente.id}/asignar/`);
      setAsignarPaciente(null);
      toastSuccess(`Paciente "${nombrePaciente}" asignado a tu cartera.`);
      await cargar();
      window.dispatchEvent(new Event("ccr:refresh-sidebar"));
    } catch (e: unknown) {
      const detail = getErrorMessage(e, "Error al asignar.");
      setAsignarError(detail);
      setError(detail);
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
        estado: "TODOS",
        prioridad: "TODAS",
        categoria: "TODAS",
        sector_cesfam: "TODOS",
        sector_oficial: "TODOS",
        responsable: "TODOS",
      });
    });
  }

  if (!user) return null;

  return (
    <div className="ccr-waitlist-page space-y-3 text-[13px]">
      <header className="ccr-waitlist-toolbar ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Lista de espera</h1>
              <p className="mt-0.5 text-xs font-medium text-gray-500">
                Priorización, filtros y asignación de pacientes pendientes.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="grid grid-cols-3 gap-2 sm:flex">
                <span className="ccr-waitlist-stat">
                  <span>Total</span>
                  <strong>{pacientes.length}</strong>
                </span>
                <span className="ccr-waitlist-stat">
                  <span>Vista</span>
                  <strong>{filteredRows}</strong>
                </span>
                <span className="ccr-waitlist-stat">
                  <span>Filtros</span>
                  <strong>{activeFilterCount}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void cargar()}
                className="ccr-button-refresh inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-200 sm:w-auto sm:justify-start"
              >
                <FiRefreshCw size={13} />
                Recargar
              </button>
              <button
                type="button"
                onClick={() => void exportarExcel()}
                disabled={exportando}
                className="ccr-export-button inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-60 sm:w-auto"
              >
                <FiDownload size={13} />
                {exportando ? "Exportando..." : "Exportar Excel"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <FiSearch
                className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
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
                className="ccr-control-input w-full px-9 py-2.5 text-xs"
                placeholder="Buscar por nombre, RUT, sector o diagnóstico"
                aria-label="Buscar pacientes"
              />
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={clearAllFilters}
                className="ccr-control-button inline-flex h-[42px] w-full items-center justify-center px-3 text-xs sm:w-auto"
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                onClick={() => setShowQuickFilters((prev) => !prev)}
                className="ccr-control-button inline-flex h-[42px] w-full items-center justify-center gap-1.5 px-3 text-xs sm:w-auto"
                aria-expanded={showQuickFilters}
                aria-controls="lista-espera-quick-filters"
              >
                <FiFilter size={13} />
                Filtros
              </button>
            </div>
          </div>

          {showQuickFilters && (
          <div
            id="lista-espera-quick-filters"
            className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
                Filtros de tabla
              </p>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                {filteredRows} resultado{filteredRows !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[11px] font-semibold text-slate-500">
                Estado
                <select
                  value={quickFilters.estado}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      estado: event.target.value as QuickFilterState["estado"],
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODOS">Todos</option>
                  {quickFilterOptions.estados.map((estado) => (
                    <option key={estado} value={estado}>
                      {ESTADO_LABELS[estado]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-slate-500">
                Prioridad
                <select
                  value={quickFilters.prioridad}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      prioridad: event.target.value as QuickFilterState["prioridad"],
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODAS">Todas</option>
                  {quickFilterOptions.prioridades.map((prioridad) => (
                    <option key={prioridad} value={prioridad}>
                      {PRIORIDAD_LABELS[prioridad]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-slate-500">
                Categoría
                <select
                  value={quickFilters.categoria}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      categoria: event.target.value as QuickFilterState["categoria"],
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODAS">Todas</option>
                  {quickFilterOptions.categorias.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {CATEGORIA_LABELS[categoria]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-slate-500">
                Sector CESFAM
                <select
                  value={quickFilters.sector_cesfam}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      sector_cesfam: event.target.value,
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODOS">Todos</option>
                  {quickFilterOptions.sectoresCesfam.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-slate-500">
                Sector oficial
                <select
                  value={quickFilters.sector_oficial}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      sector_oficial: event.target.value,
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODOS">Todos</option>
                  {quickFilterOptions.sectoresOficiales.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-slate-500">
                Responsable
                <select
                  value={quickFilters.responsable}
                  onChange={(event) =>
                    setQuickFilters((prev) => ({
                      ...prev,
                      responsable: event.target.value,
                    }))
                  }
                  className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                >
                  <option value="TODOS">Todos</option>
                  {quickFilterOptions.responsables.map((responsable) => (
                    <option key={responsable.value} value={responsable.value}>
                      {responsable.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          )}

          {isPending && (
            <p className="text-[11px] text-gray-400">Actualizando tabla...</p>
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
        <section className="ccr-panel ccr-data-table ccr-operational-table relative overflow-hidden rounded-lg bg-white dark:bg-[#0f0f10]">
          {(loading || isPending || !hasHydrated) && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[1px] dark:bg-[#151515]/75">
              {loading && !hasHydrated ? (
                <div className="w-full p-4">
                  <TableSkeleton rows={6} />
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-600 shadow-sm dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#daebf1]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#335FDB]" />
                  Actualizando...
                </div>
              )}
            </div>
          )}

        <div
          ref={tableScrollRef}
          onScroll={(event) => {
            horizontalScrollRef.current = event.currentTarget.scrollLeft;
          }}
          className="ccr-table-scroll max-h-[clamp(320px,calc(100dvh-335px),860px)] overflow-auto border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]"
        >
          <div
            className="w-full min-w-max rounded-lg border border-gray-200 bg-white dark:border-[#262626] dark:bg-[#151515]"
            style={{ minWidth: tableMinWidth }}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                key={headerGroup.id}
                className="ccr-table-head sticky top-0 z-20 grid border-b border-gray-200 bg-gray-50/80 dark:border-[#262626] dark:bg-[#202020]"
                style={{
                  gridAutoColumns: "max-content",
                  gridAutoFlow: "column",
                  gridTemplateColumns: columnTemplate,
                }}
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
                      className="relative border-r border-gray-200 px-2 py-1.5 last:border-r-0 dark:border-[#262626]"
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
                                    ? "ccr-table-filter-button is-active inline-flex h-7 w-7 items-center justify-center rounded-md"
                                    : "ccr-table-filter-button inline-flex h-7 w-7 items-center justify-center rounded-md"
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
                message="Sin pacientes en espera con los filtros seleccionados."
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
                      className="ccr-table-row absolute left-0 top-0 grid w-full cursor-pointer border-b border-gray-100 bg-white transition hover:bg-blue-50/50 dark:border-[#262626] dark:bg-[#151515] dark:hover:bg-[#202020]"
                      style={{
                        gridAutoColumns: "max-content",
                        gridAutoFlow: "column",
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
                            className={`flex h-9 items-center overflow-hidden border-r border-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 last:border-r-0 dark:border-[#262626] dark:text-[#b5d8e3] sm:px-2 ${alignment}`}
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
            {filteredRows} paciente{filteredRows !== 1 ? "s" : ""} en espera
          </p>
          <p className="text-gray-400">
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
            void cargar();
            setSeleccionado(null);
          }}
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
        <div className="border-b border-[#dbe7ff] bg-gradient-to-br from-[#f4f8ff] via-white to-[#eef3ff] px-5 py-5 dark:border-[#2a2a2a] dark:from-[#151515] dark:via-[#111111] dark:to-[#151515] sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#335FDB] dark:text-[#8fc4d6]">
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:opacity-60 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-[#ecf5f8] dark:hover:bg-[#242424]"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex max-w-full items-center gap-3 rounded-xl border border-[#dbe7ff] bg-white/95 px-3.5 py-2.5 text-[12px] text-slate-700 shadow-sm dark:border-[#2a2a2a] dark:bg-[#111111] dark:text-[#ecf5f8]">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#cddcff] bg-[#eef3ff] text-[#335FDB] dark:border-[#2a2a2a] dark:bg-[#1a1a1a] dark:text-[#8fc4d6]">
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
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-[12px] text-slate-600 dark:border-[#2a2a2a] dark:bg-[#181818] dark:text-[#b5d8e3]">
            Campos opcionales: teléfono principal, recados, correo y observación.
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
                Teléfono principal
              </label>
              <div className="relative">
                <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
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
                <FiPhone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
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
              <FiMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
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
            className="rounded-xl bg-[#335FDB] px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-14px_rgba(51,95,219,0.9)] transition hover:bg-[#284FC0] disabled:opacity-50"
          >
            {loading ? "Asignando..." : "Guardar y tomar"}
          </button>
        </div>
      </div>
    </div>
  );
}

type FilterPopoverProps = {
  column: Column<WaitlistRow>;
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
        className="mb-3 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs text-gray-800 outline-none focus:border-[#335FDB] focus:ring-2 focus:ring-blue-100 dark:border-[#262626] dark:bg-[#151515] dark:text-[#ecf5f8] dark:placeholder:text-[#459dba] dark:focus:ring-blue-500/20"
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
          className="font-semibold text-blue-700 hover:underline"
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
                  className="h-3.5 w-3.5 accent-[#335FDB]"
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
          className="ccr-filter-apply rounded-md bg-[#335FDB] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#284FC0]"
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body,
  );
}
