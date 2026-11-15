// =============================================================================
// Shared utility functions for ListaEsperaCCR frontend.
// Centralises text normalisation, date formatting and class merging helpers that
// were previously duplicated across multiple page and component files.
// =============================================================================

/**
 * Merge CSS class name values, filtering out falsy entries.
 */
export function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Strip a RUT down to digits and `k`, lowercased.
 */
export function normalizeRut(value: string) {
  return value.toLowerCase().replace(/[^0-9k]/g, "");
}

/**
 * Normalise a search string: strip diacritics and lowercase (es-CL).
 */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

/**
 * Capitalise each word in a string (locale-aware, es-CL).
 */
export function toCapitalizedWords(value: string) {
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

/**
 * Calculate the number of whole days between a date string and today.
 * Returns 0 when `fecha` is null/undefined/invalid.
 */
export function calcularDiasDesde(fecha: string | null | undefined): number {
  if (!fecha) return 0;
  const inicio = new Date(fecha.includes("T") ? fecha : `${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  inicio.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoy.getTime() - inicio.getTime()) / 86400000));
}

/**
 * Format a date string for display (es-CL locale). Returns `"-"` for
 * null/undefined/invalid values and `"Sin fecha"` when the caller explicitly
 * uses `formatDateDisplay`.
 */
export function formatearFecha(fecha: string | null | undefined) {
  if (!fecha) return "-";
  const parsed = new Date(fecha.includes("T") ? fecha : `${fecha}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-CL");
}

/**
 * Same as `formatearFecha` but returns `"Sin fecha"` instead of `"-"` for
 * missing/invalid dates. Used in table contexts where the label matters.
 */
export function formatDateDisplay(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value.length > 10 ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return parsed.toLocaleDateString("es-CL");
}

/**
 * Format a date-time string with day, month, year, hour and minute (es-CL).
 */
export function formatearFechaHora(fecha: string | null | undefined) {
  if (!fecha) return "-";
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Short date-time format: 2-digit year variant (es-CL).
 */
export function formatearFechaHoraCorta(fecha: string | null | undefined) {
  if (!fecha) return "-";
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =============================================================================
// Table helpers shared across lista-espera and mis-pacientes
// =============================================================================

/**
 * Numeric sort value for a date string.  Returns `+Infinity` for missing or
 * invalid dates so they sort last.
 */
export function dateSortValue(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value.length > 10 ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return parsed.getTime();
}

/**
 * Build the display label for the person responsible for a patient.
 */
export function getResponsableLabel(paciente: {
  responsable_nombre?: string | null;
  kine_asignado_nombre?: string | null;
}): string {
  return (
    paciente.responsable_nombre ??
    paciente.kine_asignado_nombre ??
    "Sin responsable"
  );
}

/**
 * Trigger a file download from a Blob.
 */
export function descargarBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Generic multi-select column filter function for TanStack Table.
 *
 * Supports both string query filtering (text search within cell values) and
 * array-based multi-select filtering (checking membership in selected values).
 * Attach to a column via `filterFn: multiSelectFilter`.
 */
export function multiSelectFilter<TData>(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean {
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
}

/** Auto-remove rule for multiSelectFilter (TanStack Table convention). */
multiSelectFilter.autoRemove = (value: unknown) =>
  typeof value === "string"
    ? value.trim().length === 0
    : !Array.isArray(value) || value.length === 0;

// Re-export the filter typed for FilterFn compatibility.  Because FilterFn
// requires a specific TData, consumers cast:
//   `multiSelectFilter as FilterFn<MyRowType>`
// The runtime behaviour is identical regardless of TData.
