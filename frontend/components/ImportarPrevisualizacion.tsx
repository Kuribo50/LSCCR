"use client";

import type { ReactNode } from "react";
import type {
  ImportacionPreviewRegistro,
  ImportacionPreviewResultado,
} from "@/lib/types";

// =============================================================================
// Tipos compartidos con la pagina de importacion
// =============================================================================

export type CampoEditable =
  | "fecha"
  | "nombre"
  | "rut"
  | "edad"
  | "diagnostico"
  | "profesional"
  | "prioridad"
  | "sector_cesfam";

export interface CorreccionFila {
  hoja: string;
  fila: number;
  campos: Partial<Record<CampoEditable, string>>;
  descartar?: boolean;
}

export type CorreccionesMap = Record<string, CorreccionFila>;

export function claveFila(hoja: string | undefined, fila: number) {
  return `${hoja ?? ""}|${fila}`;
}

// =============================================================================
// Columnas de la vista previa (solo lectura)
// =============================================================================

interface ColumnaPreview {
  label: string;
  width: string;
  /** Texto plano de la celda (tambien se usa como tooltip). */
  texto: (r: ImportacionPreviewRegistro) => string;
  /** Contenido enriquecido opcional. */
  render?: (r: ImportacionPreviewRegistro) => ReactNode;
}

/** Sin columna de estado, las filas con error se marcan en rojo y explican el motivo al pasar el cursor. */
function motivoError(registro: ImportacionPreviewRegistro) {
  return registro.estado === "ERROR" ? registro.error || "Fila con error" : "";
}

const COLUMNAS: ColumnaPreview[] = [
  { label: "FECHA", width: "9%", texto: (r) => r.fecha_derivacion || "" },
  { label: "NOMBRE", width: "18%", texto: (r) => r.nombre || "" },
  { label: "RUT", width: "9%", texto: (r) => r.rut || "" },
  {
    label: "EDAD",
    width: "5%",
    texto: (r) => (r.edad ? String(r.edad) : ""),
  },
  { label: "DESDE", width: "12%", texto: (r) => r.percapita_desde || "" },
  {
    label: "DIAGNÓSTICO MÉDICO",
    width: "14%",
    texto: (r) => r.diagnostico || "",
  },
  {
    label: "PROFESIONAL DERIVADO",
    width: "10%",
    texto: (r) => r.profesional || "",
  },
  {
    label: "GRADO PRIORIDAD",
    width: "8%",
    texto: (r) => String(r.prioridad ?? "").toUpperCase(),
  },
  // Se completan solos con el histórico de Tomé cuando la planilla no los trae.
  { label: "SECTOR", width: "7%", texto: (r) => r.sector_cesfam || "" },
  { label: "TERRITORIO", width: "8%", texto: (r) => r.sector_oficial || "" },
];

// =============================================================================
// Componente principal
// =============================================================================

interface Props {
  preview: ImportacionPreviewResultado;
}

export default function ImportarPrevisualizacion({ preview }: Props) {
  const registros = preview.registros;

  if (registros.length === 0) {
    return (
      <div className="px-4 py-5 text-sm font-semibold text-amber-800 dark:!text-amber-100">
        No se encontraron filas compatibles. Revisa que la planilla tenga
        encabezados como Nombre, RUT, Diagnóstico y Fecha de derivación.
      </div>
    );
  }

  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full table-fixed border-collapse text-[11px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-11 border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-center font-black text-slate-500 dark:!border-[#333] dark:!bg-[#202020] dark:!text-ink-black-300">
              #
            </th>
            {COLUMNAS.map((col, i) => (
              <th
                key={col.label}
                style={{ width: col.width }}
                className={`border-b border-slate-300 bg-slate-100 px-2 py-2 text-left font-black uppercase tracking-[0.02em] text-slate-700 dark:!border-[#333] dark:!bg-[#202020] dark:!text-ink-black-100 ${
                  i < COLUMNAS.length - 1 ? "border-r" : ""
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr
              key={claveFila(r.hoja, r.fila)}
              title={motivoError(r) || undefined}
              className={`ccr-table-row ${motivoError(r) ? "bg-red-50 dark:!bg-red-500/10" : ""}`}
            >
              <td className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:!border-[#262626] dark:!bg-[#181818]">
                {r.fila}
              </td>
              {COLUMNAS.map((col, i) => {
                const texto = col.texto(r);
                return (
                  <td
                    key={col.label}
                    title={texto}
                    className={`h-8 truncate border-b border-slate-200 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 dark:!border-[#262626] dark:!text-ink-black-100 ${
                      i < COLUMNAS.length - 1 ? "border-r" : ""
                    }`}
                  >
                    {col.render
                      ? col.render(r)
                      : texto || <span className="text-slate-300">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
