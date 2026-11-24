// =============================================================================
// Shared FilterPopover component for column-level multi-select filtering.
// Used by both the lista-espera and mis-pacientes tables.
// =============================================================================

import { createPortal } from "react-dom";
import { FiArrowDown, FiArrowUp, FiCheck, FiSearch, FiX } from "react-icons/fi";
import type { Column } from "@tanstack/react-table";
import type { Prioridad, Estado } from "@/lib/types";
import { PRIORIDAD_LABELS, ESTADO_LABELS } from "@/lib/types";
import { normalizeRut, normalizeSearchText } from "@/lib/utils";
import FondoPestana from "./FondoPestana";

// =============================================================================
// Shared types
// =============================================================================

export type ColumnMeta = {
  label: string;
  kind?: "text" | "number";
  filterable?: boolean;
  align?: "left" | "center" | "right";
};

export type FilterPopoverPosition = { top: number; left: number };

// =============================================================================
// Priority / state ordering constants (shared across tables)
// =============================================================================

export const PRIORIDAD_ORDER: Record<Prioridad, number> = {
  ALTA: 0,
  MEDIANA: 1,
  MODERADA: 2,
  LICENCIA_MEDICA: 3,
};

export const ESTADO_ORDER: Record<Estado, number> = {
  PENDIENTE: 0,
  INGRESADO: 1,
  RESCATE: 2,
  DERIVADO: 3,
  ABANDONO: 4,
  ALTA_MEDICA: 5,
  EGRESO_VOLUNTARIO: 6,
  EGRESO_ADMINISTRATIVO: 7,
};

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Extract the ColumnMeta from a column definition, falling back to a default.
 */
export function getColumnMeta<TData>(column: Column<TData>): ColumnMeta {
  return (column.columnDef.meta ?? { label: column.id }) as ColumnMeta;
}

/**
 * Sort the distinct filter values for a given column, respecting domain order
 * for priority/state columns and numeric order where appropriate.
 */
export function sortFilterValues(columnId: string, values: string[]): string[] {
  if (
    columnId === "edad" ||
    columnId === "dias_en_lista" ||
    columnId === "dias_display"
  ) {
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

/**
 * Check whether a filter option matches the user's search query inside the
 * filter popover. Handles RUT normalisation for the `rut` column.
 */
export function matchesFilterSearch(
  columnId: string,
  option: string,
  query: string,
): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  if (columnId === "rut") {
    return normalizeRut(option).includes(normalizeRut(trimmedQuery));
  }

  return normalizeSearchText(option).includes(
    normalizeSearchText(trimmedQuery),
  );
}

// =============================================================================
// FilterPopover component
// =============================================================================

export type FilterPopoverProps<TData> = {
  column: Column<TData>;
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

export default function FilterPopover<TData>({
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
}: FilterPopoverProps<TData>) {
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

  const filtrando = selectedValues.length > 0 && selectedValues.length < options.length;

  function alternar(option: string) {
    if (selectedValues.includes(option)) {
      onSelectionChange(selectedValues.filter((value) => value !== option));
    } else {
      onSelectionChange([...selectedValues, option]);
    }
  }

  const botonOrden = (activo: boolean) =>
    `relative inline-flex h-8 flex-1 items-center justify-center rounded-md text-[11px] font-bold outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
      activo
        ? "text-blue-700 dark:text-blue-200"
        : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300 dark:hover:text-ink-black-50"
    }`;

  return createPortal(
    <div
      data-filter-root
      role="dialog"
      aria-label={`Filtrar ${meta.label}`}
      className="ccr-filter-popover fixed z-[100] flex w-[min(92vw,300px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
      style={{
        left: position.left,
        maxHeight: "calc(100vh - 24px)",
        top: position.top,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 dark:border-ink-black-700">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-500 dark:text-ink-black-400">Filtrar columna</p>
          <h3 className="truncate text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{meta.label}</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar filtro"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
        >
          <FiX size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-2.5 p-3">
        {column.getCanSort() && (
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900">
            <button type="button" onClick={onSortAsc} aria-pressed={sortState === "asc"} className={botonOrden(sortState === "asc")}>
              {sortState === "asc" && <FondoPestana id={`orden-${column.id}`} />}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <FiArrowUp size={12} aria-hidden="true" />
                {meta.kind === "number" ? "Menor a mayor" : "A a la Z"}
              </span>
            </button>
            <button type="button" onClick={onSortDesc} aria-pressed={sortState === "desc"} className={botonOrden(sortState === "desc")}>
              {sortState === "desc" && <FondoPestana id={`orden-${column.id}`} />}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <FiArrowDown size={12} aria-hidden="true" />
                {meta.kind === "number" ? "Mayor a menor" : "Z a la A"}
              </span>
            </button>
            {sortState && (
              <button
                type="button"
                onClick={onClearSort}
                aria-label="Quitar orden"
                title="Quitar orden"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 outline-none hover:text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                <FiX size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={13} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApply(shouldApplyVisibleOnly ? visibleOptions : undefined);
              }
              if (event.key === "Escape") onCancel();
            }}
            placeholder="Buscar valor"
            aria-label={`Buscar valor de ${meta.label}`}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-ink-black-50"
          />
        </div>

        <div className="flex items-center justify-between px-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              if (allVisibleSelected) {
                onSelectionChange(selectedValues.filter((value) => !visibleOptions.includes(value)));
                return;
              }
              onSelectionChange(Array.from(new Set([...selectedValues, ...visibleOptions])));
            }}
            className="font-bold text-blue-700 outline-none hover:underline focus-visible:underline dark:text-blue-300"
          >
            {allVisibleSelected ? "Desmarcar todo" : "Marcar todo"}
          </button>
          <span className="font-semibold text-slate-500 dark:text-ink-black-400">
            {filtrando ? `${selectedValues.length} de ${options.length}` : `${visibleOptions.length} valores`}
          </span>
        </div>

        <ul className={`-mx-1 overflow-y-auto ${visibleOptions.length > 6 ? "max-h-56" : "max-h-44"}`}>
          {visibleOptions.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs font-medium text-slate-500 dark:text-ink-black-400">Sin coincidencias</li>
          ) : (
            visibleOptions.map((option) => {
              const checked = selectedValues.includes(option);
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => alternar(option)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-100 dark:hover:bg-ink-black-700"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white dark:border-ink-black-500 dark:bg-ink-black-900"
                      }`}
                    >
                      {checked && <FiCheck size={11} strokeWidth={3} />}
                    </span>
                    <span
                      className={`truncate ${checked ? "font-semibold text-slate-800 dark:text-ink-black-50" : "font-medium text-slate-500 dark:text-ink-black-300"}`}
                      title={option}
                    >
                      {option}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-ink-black-700 dark:bg-ink-black-900/60">
        <button
          type="button"
          onClick={() => onSelectionChange(options)}
          disabled={!filtrando}
          className="text-[11px] font-bold text-red-600 outline-none hover:underline focus-visible:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline dark:text-red-300 dark:disabled:text-ink-black-500"
        >
          Quitar filtro
        </button>
        <button
          type="button"
          onClick={() => onApply(shouldApplyVisibleOnly ? visibleOptions : undefined)}
          className="ccr-filter-apply inline-flex h-8 items-center rounded-lg bg-blue-500 px-4 text-[11px] font-bold text-white outline-none transition-colors hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body,
  );
}
