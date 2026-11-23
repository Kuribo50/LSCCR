"use client";

import { useState } from "react";
import { FiCheck, FiInfo } from "react-icons/fi";

/** Separa la alerta del paciente en sus observaciones (una por línea). */
export function lineasAlerta(alerta?: string | null): string[] {
  return (alerta ?? "")
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean);
}

/**
 * Chip azul para listas: avisa que el paciente tiene una observación o
 * incongruencia por revisar. El texto completo va en el tooltip.
 */
export default function AlertaChip({ alerta }: { alerta?: string | null }) {
  const lineas = lineasAlerta(alerta);
  if (lineas.length === 0) return null;
  return (
    <span
      title={lineas.join("\n")}
      aria-label={`Por revisar: ${lineas.join(". ")}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-500/30"
    >
      <FiInfo size={10} aria-hidden="true" />
      {lineas.length > 1 ? `Revisar (${lineas.length})` : "Revisar"}
    </span>
  );
}

/** Recuadro azul para la ficha: muestra cada observación y permite marcarla como revisada. */
export function AlertaPanel({
  alerta,
  puedeResolver,
  onResolver,
}: {
  alerta?: string | null;
  puedeResolver: boolean;
  onResolver: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const lineas = lineasAlerta(alerta);
  if (lineas.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-blue-50 px-3.5 py-2.5 text-[12px] text-blue-900 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-100 dark:ring-blue-500/30 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-2">
        <FiInfo className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">Por revisar</p>
          <ul className="mt-0.5 space-y-0.5 font-medium">
            {lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </div>
      </div>
      {puedeResolver && (
        <button
          type="button"
          disabled={guardando}
          onClick={async () => {
            setGuardando(true);
            try {
              await onResolver();
            } finally {
              setGuardando(false);
            }
          }}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-100 disabled:opacity-60 dark:bg-ink-black-800 dark:text-blue-200 dark:ring-blue-500/30"
        >
          <FiCheck size={12} aria-hidden="true" />
          {guardando ? "Guardando..." : "Marcar como revisado"}
        </button>
      )}
    </div>
  );
}
