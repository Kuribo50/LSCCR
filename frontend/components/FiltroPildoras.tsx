"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface OpcionPildora {
  /** "" representa la opción "Todas". */
  value: string;
  label: string;
  /** Clase de color para el punto (ej. "bg-[#E07A4F]"). */
  dot?: string;
  total?: number;
}

/**
 * Filtro ovalado de selección única (el de categorías de la Agenda).
 * La opción activa se marca con un fondo que se desliza entre opciones.
 */
export default function FiltroPildoras({
  opciones,
  valor,
  onChange,
  ariaLabel,
  layoutId,
  franja = false,
}: {
  opciones: OpcionPildora[];
  valor: string;
  onChange: (valor: string) => void;
  ariaLabel: string;
  /** Identificador único por página para la animación del fondo activo. */
  layoutId: string;
  /** Centra el filtro en una franja con borde inferior (sobre tablas o grillas). */
  franja?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const grupo = (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-[0_8px_24px_-12px_rgba(22,24,27,0.25)] dark:border-ink-black-600 dark:bg-ink-black-800"
    >
      {opciones.map((op) => {
        const activa = valor === op.value;
        return (
          <button
            key={op.value || "todas"}
            type="button"
            aria-pressed={activa}
            onClick={() => onChange(op.value)}
            className={`relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
              activa ? "text-slate-950 dark:text-white" : "text-slate-600 hover:text-slate-950 dark:text-ink-black-200"
            }`}
          >
            {activa && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-slate-100 dark:bg-ink-black-700"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            {op.dot && (
              <span aria-hidden="true" className={`relative h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-ink-black-800 ${op.dot}`} />
            )}
            <span className="relative">{op.label}</span>
            {op.total !== undefined && <span className="relative text-xs tabular-nums text-slate-400">{op.total}</span>}
          </button>
        );
      })}
    </div>
  );

  if (!franja) return grupo;
  return (
    <div className="flex shrink-0 justify-center border-b border-slate-200 px-4 py-3 dark:border-ink-black-600">{grupo}</div>
  );
}
