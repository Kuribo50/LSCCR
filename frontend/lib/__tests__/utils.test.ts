import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  classes,
  normalizeRut,
  normalizeSearchText,
  toCapitalizedWords,
  calcularDiasDesde,
  formatDateDisplay,
  formatearFecha,
  dateSortValue,
  getResponsableLabel,
  multiSelectFilter,
  sinAcentos,
  capitalizarInicial,
  nombreLegible,
  toDateKey,
  fechaDDMMAAAA,
} from "../utils";

// ---------------------------------------------------------------------------
// classes()
// ---------------------------------------------------------------------------

describe("classes", () => {
  it("joins truthy class names with a space", () => {
    expect(classes("a", "b", "c")).toBe("a b c");
  });

  it("filters out false, null, and undefined", () => {
    expect(classes("a", false, null, "b", undefined)).toBe("a b");
  });

  it("returns empty string when all values are falsy", () => {
    expect(classes(false, null, undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// normalizeRut()
// ---------------------------------------------------------------------------

describe("normalizeRut", () => {
  it("strips dots, dashes, and lowercases K", () => {
    expect(normalizeRut("12.345.678-9")).toBe("123456789");
  });

  it("lowercases the check digit K", () => {
    expect(normalizeRut("12.345.678-K")).toBe("12345678k");
  });

  it("handles already-clean RUTs", () => {
    expect(normalizeRut("123456789")).toBe("123456789");
  });

  it("handles RUT with spaces and extra chars", () => {
    expect(normalizeRut(" 12.345.678-k ")).toBe("12345678k");
  });
});

// ---------------------------------------------------------------------------
// normalizeSearchText()
// ---------------------------------------------------------------------------

describe("normalizeSearchText", () => {
  it("removes accents and lowercases text", () => {
    expect(normalizeSearchText("María José")).toBe("maria jose");
  });

  it("handles uppercase with tilde", () => {
    expect(normalizeSearchText("GONZÁLEZ")).toBe("gonzalez");
  });

  it("trims whitespace", () => {
    expect(normalizeSearchText("  hola  ")).toBe("hola");
  });

  it("handles empty string", () => {
    expect(normalizeSearchText("")).toBe("");
  });

  it("preserves numbers", () => {
    expect(normalizeSearchText("Código 123")).toBe("codigo 123");
  });
});

// ---------------------------------------------------------------------------
// toCapitalizedWords()
// ---------------------------------------------------------------------------

describe("toCapitalizedWords", () => {
  it("capitalises each word", () => {
    expect(toCapitalizedWords("maria gonzalez")).toBe("Maria Gonzalez");
  });

  it("handles all-uppercase input", () => {
    expect(toCapitalizedWords("MARIA GONZALEZ")).toBe("Maria Gonzalez");
  });

  it("replaces underscores with spaces", () => {
    expect(toCapitalizedWords("alta_medica")).toBe("Alta Medica");
  });

  it("collapses multiple spaces", () => {
    expect(toCapitalizedWords("  maria   gonzalez  ")).toBe("Maria Gonzalez");
  });

  it("handles single word", () => {
    expect(toCapitalizedWords("hola")).toBe("Hola");
  });
});

// ---------------------------------------------------------------------------
// calcularDiasDesde()
// ---------------------------------------------------------------------------

describe("calcularDiasDesde", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix "today" at 2025-06-15T00:00:00
    vi.setSystemTime(new Date("2025-06-15T00:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for null input", () => {
    expect(calcularDiasDesde(null)).toBe(0);
  });

  it("returns 0 for undefined input", () => {
    expect(calcularDiasDesde(undefined)).toBe(0);
  });

  it("returns 0 for invalid date string", () => {
    expect(calcularDiasDesde("not-a-date")).toBe(0);
  });

  it("calculates correct days for a date in the past", () => {
    // 10 days before the faked "today"
    expect(calcularDiasDesde("2025-06-05")).toBe(10);
  });

  it("returns 0 for today", () => {
    expect(calcularDiasDesde("2025-06-15")).toBe(0);
  });

  it("returns 0 for future dates (clamped by Math.max)", () => {
    expect(calcularDiasDesde("2025-06-20")).toBe(0);
  });

  it("handles ISO datetime strings", () => {
    expect(calcularDiasDesde("2025-06-10T14:30:00Z")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// formatDateDisplay()
// ---------------------------------------------------------------------------

describe("formatDateDisplay", () => {
  it("returns 'Sin fecha' for null", () => {
    expect(formatDateDisplay(null)).toBe("Sin fecha");
  });

  it("returns 'Sin fecha' for undefined", () => {
    expect(formatDateDisplay(undefined)).toBe("Sin fecha");
  });

  it("returns 'Sin fecha' for invalid date", () => {
    expect(formatDateDisplay("garbage")).toBe("Sin fecha");
  });

  it("formats a valid date string", () => {
    const result = formatDateDisplay("2025-03-15");
    // es-CL locale uses DD-MM-YYYY format
    expect(result).toMatch(/15/);
    expect(result).toMatch(/03|3/);
    expect(result).toMatch(/2025/);
  });

  it("handles ISO datetime strings", () => {
    const result = formatDateDisplay("2025-03-15T10:30:00Z");
    expect(result).not.toBe("Sin fecha");
  });
});

// ---------------------------------------------------------------------------
// formatearFecha()
// ---------------------------------------------------------------------------

describe("formatearFecha", () => {
  it("returns '-' for null", () => {
    expect(formatearFecha(null)).toBe("-");
  });

  it("returns '-' for undefined", () => {
    expect(formatearFecha(undefined)).toBe("-");
  });

  it("returns '-' for invalid date", () => {
    expect(formatearFecha("invalid")).toBe("-");
  });

  it("formats a valid date", () => {
    const result = formatearFecha("2025-01-20");
    expect(result).toMatch(/20/);
    expect(result).toMatch(/01|1/);
    expect(result).toMatch(/2025/);
  });
});

// ---------------------------------------------------------------------------
// dateSortValue()
// ---------------------------------------------------------------------------

describe("dateSortValue", () => {
  it("returns +Infinity for null", () => {
    expect(dateSortValue(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns +Infinity for undefined", () => {
    expect(dateSortValue(undefined)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns +Infinity for invalid date", () => {
    expect(dateSortValue("not-a-date")).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns a numeric timestamp for valid dates", () => {
    const val = dateSortValue("2025-01-01");
    expect(typeof val).toBe("number");
    expect(val).toBeLessThan(Number.POSITIVE_INFINITY);
  });

  it("earlier dates have smaller sort values", () => {
    expect(dateSortValue("2025-01-01")).toBeLessThan(
      dateSortValue("2025-06-01") as number,
    );
  });
});

// ---------------------------------------------------------------------------
// getResponsableLabel()
// ---------------------------------------------------------------------------

describe("getResponsableLabel", () => {
  it("returns responsable_nombre when available", () => {
    expect(
      getResponsableLabel({
        responsable_nombre: "Dr. López",
        kine_asignado_nombre: "Kine X",
      }),
    ).toBe("Dr. López");
  });

  it("falls back to kine_asignado_nombre", () => {
    expect(
      getResponsableLabel({
        responsable_nombre: null,
        kine_asignado_nombre: "Kine X",
      }),
    ).toBe("Kine X");
  });

  it("returns 'Sin responsable' when both are null", () => {
    expect(
      getResponsableLabel({
        responsable_nombre: null,
        kine_asignado_nombre: null,
      }),
    ).toBe("Sin responsable");
  });
});

// ---------------------------------------------------------------------------
// multiSelectFilter()
// ---------------------------------------------------------------------------

describe("multiSelectFilter", () => {
  const makeRow = (values: Record<string, unknown>) => ({
    getValue: (columnId: string) => values[columnId],
  });

  it("returns true when filter is empty string", () => {
    const row = makeRow({ nombre: "María" });
    expect(multiSelectFilter(row, "nombre", "")).toBe(true);
  });

  it("matches with normalized text search", () => {
    const row = makeRow({ nombre: "María González" });
    expect(multiSelectFilter(row, "nombre", "maria")).toBe(true);
  });

  it("uses RUT normalisation for rut column", () => {
    const row = makeRow({ rut: "12.345.678-9" });
    expect(multiSelectFilter(row, "rut", "12345678")).toBe(true);
  });

  it("returns true when array filter is empty", () => {
    const row = makeRow({ estado: "PENDIENTE" });
    expect(multiSelectFilter(row, "estado", [])).toBe(true);
  });

  it("matches when value is in selected array", () => {
    const row = makeRow({ estado: "PENDIENTE" });
    expect(multiSelectFilter(row, "estado", ["PENDIENTE", "RESCATE"])).toBe(
      true,
    );
  });

  it("rejects when value is not in selected array", () => {
    const row = makeRow({ estado: "INGRESADO" });
    expect(multiSelectFilter(row, "estado", ["PENDIENTE", "RESCATE"])).toBe(
      false,
    );
  });

  describe("autoRemove", () => {
    it("returns true for empty string", () => {
      expect(multiSelectFilter.autoRemove("")).toBe(true);
    });

    it("returns true for empty array", () => {
      expect(multiSelectFilter.autoRemove([])).toBe(true);
    });

    it("returns false for non-empty string", () => {
      expect(multiSelectFilter.autoRemove("test")).toBe(false);
    });

    it("returns false for non-empty array", () => {
      expect(multiSelectFilter.autoRemove(["A"])).toBe(false);
    });
  });
});

describe("sinAcentos", () => {
  it("quita tildes sin cambiar mayúsculas", () => {
    expect(sinAcentos("Ñuñoa Árbol Éxito")).toBe("Nunoa Arbol Exito");
  });
});

describe("capitalizarInicial", () => {
  it("sube solo la primera letra", () => {
    expect(capitalizarInicial("noviembre de 2026")).toBe("Noviembre de 2026");
    expect(capitalizarInicial("")).toBe("");
  });
});

describe("formatearFecha con texto alternativo", () => {
  it("usa el valor vacío indicado", () => {
    expect(formatearFecha(null, "Sin dato")).toBe("Sin dato");
    expect(formatearFecha("no-es-fecha", "Sin dato")).toBe("Sin dato");
    expect(formatearFecha(null)).toBe("-");
  });
});

describe("nombreLegible", () => {
  it("pasa a formato de nombre propio, también con guion", () => {
    expect(nombreLegible("JUAN PÉREZ-SOTO")).toBe("Juan Pérez-Soto");
    expect(nombreLegible("maría ñuñez")).toBe("María Ñuñez");
  });
});

describe("toDateKey", () => {
  it("usa la fecha local y rellena con ceros", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateKey(new Date(2026, 10, 23))).toBe("2026-11-23");
  });
});

describe("fechaDDMMAAAA", () => {
  it("da vuelta la fecha ISO", () => {
    expect(fechaDDMMAAAA("2026-11-23")).toBe("23/11/2026");
  });
  it("devuelve vacío sin fecha y el texto tal cual si no es ISO", () => {
    expect(fechaDDMMAAAA(undefined)).toBe("");
    expect(fechaDDMMAAAA(null)).toBe("");
    expect(fechaDDMMAAAA("sin fecha")).toBe("sin fecha");
  });
});
