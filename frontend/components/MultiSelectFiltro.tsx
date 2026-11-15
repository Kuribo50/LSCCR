"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import { normalizeSearchText } from "@/lib/utils";

export interface OpcionMulti {
  value: string;
  label: string;
  /** Clase de color para un punto a la izquierda (ej. "bg-[#4CA35A]"). */
  dot?: string;
  /** Cantidad que se muestra a la derecha. */
  total?: number;
}

/**
 * Desplegable con casillas para elegir varias opciones. Sin nada marcado
 * equivale a "Todas".
 */
export default function MultiSelectFiltro({
  label,
  values,
  opciones,
  onChange,
  textoTodos = false,
  anchoCompleto = false,
}: {
  label: string;
  values: string[];
  opciones: OpcionMulti[];
  onChange: (values: string[]) => void;
  /** Usa "Todos" / "seleccionados" (masculino) en vez de "Todas". */
  textoTodos?: boolean;
  /** Ocupa todo el ancho (para grillas de filtros). */
  anchoCompleto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const activo = values.length > 0;

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const seleccionadas = opciones.filter((o) => values.includes(o.value));
  const conBuscador = opciones.length > 8;
  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    return q ? opciones.filter((o) => normalizeSearchText(o.label).includes(q)) : opciones;
  }, [busqueda, opciones]);
  const resumen =
    seleccionadas.length === 0
      ? textoTodos
        ? "Todos"
        : "Todas"
      : seleccionadas.length === 1
        ? seleccionadas[0].label
        : `${seleccionadas.length} ${textoTodos ? "seleccionados" : "seleccionadas"}`;

  function alternar(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <div ref={ref} className={`relative ${anchoCompleto ? "w-full" : ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => {
          setAbierto((v) => !v);
          setBusqueda("");
        }}
        className={`${anchoCompleto ? "flex w-full" : "inline-flex max-w-full"} h-9 items-center gap-2 rounded-lg border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
          activo
            ? "border-blue-300 bg-blue-50/70 text-blue-800 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-100"
            : abierto
              ? "border-blue-400 bg-white text-slate-800 dark:bg-ink-black-800 dark:text-ink-black-100"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-100"
        }`}
      >
        <span className="font-semibold text-slate-500 dark:text-ink-black-300">{label}:</span>
        {seleccionadas.some((o) => o.dot) && (
          <span className="flex shrink-0 items-center -space-x-0.5" aria-hidden="true">
            {seleccionadas.slice(0, 4).map((o) => (
              <span key={o.value} className={`h-2 w-2 rounded-full ring-2 ring-white dark:ring-ink-black-800 ${o.dot ?? "bg-slate-400"}`} />
            ))}
          </span>
        )}
        <span className={`truncate font-bold ${anchoCompleto ? "flex-1 text-left" : ""}`}>{resumen}</span>
        <FiChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute left-0 top-[calc(100%+4px)] z-50 overflow-hidden ${anchoCompleto ? "min-w-full w-[280px]" : "w-[260px]"} rounded-xl border border-slate-200 bg-white shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800`}
          >
            {conBuscador && (
              <div className="relative border-b border-slate-100 p-2 dark:border-ink-black-700">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={13} aria-hidden="true" />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={`Buscar ${label.toLowerCase()}`}
                  aria-label={`Buscar ${label.toLowerCase()}`}
                  className="h-8 w-full rounded-md bg-slate-50 pl-7 pr-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 dark:bg-ink-black-900 dark:text-ink-black-100"
                />
              </div>
            )}
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] dark:border-ink-black-700">
              <span className="font-bold text-slate-500 dark:text-ink-black-300">
                {activo ? `${values.length} de ${opciones.length}` : `${label} (${opciones.length})`}
              </span>
              <button
                type="button"
                onClick={() => onChange(activo ? [] : opciones.map((o) => o.value))}
                className="font-bold text-blue-700 outline-none hover:underline focus-visible:underline dark:text-blue-300"
              >
                {activo ? "Limpiar" : textoTodos ? "Marcar todos" : "Marcar todas"}
              </button>
            </div>
            <ul role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-72 overflow-y-auto p-1">
              {visibles.length === 0 && (
                <li className="px-3 py-3 text-xs font-medium text-slate-400">Sin coincidencias</li>
              )}
              {visibles.map((o) => {
                const marcada = values.includes(o.value);
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={marcada}
                      onClick={() => alternar(o.value)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors focus-visible:bg-slate-100 ${
                        marcada
                          ? "bg-blue-50 font-bold text-blue-800 dark:bg-blue-500/15 dark:text-blue-100"
                          : "font-medium text-slate-700 hover:bg-slate-50 dark:text-ink-black-100 dark:hover:bg-ink-black-700"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          marcada
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-slate-300 bg-white dark:border-ink-black-500 dark:bg-ink-black-900"
                        }`}
                      >
                        {marcada && <FiCheck size={11} strokeWidth={3} />}
                      </span>
                      {o.dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} />}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.total !== undefined && (
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{o.total}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {activo && (
              <div className="border-t border-slate-100 p-1 dark:border-ink-black-700">
                <button
                  type="button"
                  onClick={() => {
                    onChange([]);
                    setAbierto(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-red-600 outline-none hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <FiX size={12} aria-hidden="true" />
                  Quitar filtro de {label.toLowerCase()}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
