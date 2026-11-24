"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface OpcionPildora {
  /** "" representa la opción "Todas". */
  value: string;
  label: string;
  /** Clase de color para el punto (ej. "bg-[#E07A4F]"). */
  dot?: string;
  total?: number;
}

function Contenido({ op }: { op: OpcionPildora }) {
  return (
    <>
      {op.dot && <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${op.dot}`} />}
      <span className="truncate">{op.label}</span>
      {op.total !== undefined && <span className="ml-auto pl-2 text-xs tabular-nums text-slate-500">{op.total}</span>}
    </>
  );
}

/**
 * Filtro desplegable de selección única (categorías de la Agenda, tipos de
 * observación, estados del historial). Se mantiene el nombre por compatibilidad.
 */
export default function FiltroPildoras({
  opciones,
  valor,
  onChange,
  ariaLabel,
  franja = false,
}: {
  opciones: OpcionPildora[];
  valor: string;
  onChange: (valor: string) => void;
  ariaLabel: string;
  /** Ya no se usa (era para la animación de las píldoras). */
  layoutId?: string;
  /** Pone el filtro en una franja con borde inferior (sobre tablas o grillas). */
  franja?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const listaId = useId();
  const actual = opciones.find((o) => o.value === valor) ?? opciones[0];

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const control = (
    <div ref={raiz} className="relative w-full max-w-[13rem]">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listaId}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-[13px] font-semibold text-slate-900 outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-white"
      >
        {actual && <Contenido op={actual} />}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`ml-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-30 mt-1 max-h-72 w-full min-w-[12rem] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          {opciones.map((op) => {
            const activa = op.value === valor;
            return (
              <li key={op.value || "todas"} role="option" aria-selected={activa}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(op.value);
                    setAbierto(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium outline-none hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-ink-black-700 dark:focus-visible:bg-ink-black-700 ${
                    activa ? "bg-slate-100 font-semibold text-slate-950 dark:bg-ink-black-700 dark:text-white" : "text-slate-700 dark:text-ink-black-200"
                  }`}
                >
                  <Contenido op={op} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (!franja) return control;
  return (
    <div className="flex shrink-0 justify-center border-b border-slate-200 px-4 py-3 dark:border-ink-black-600">{control}</div>
  );
}
