"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiChevronDown, FiSearch } from "react-icons/fi";
import { normalizeSearchText } from "@/lib/utils";

export interface OpcionFiltro {
  value: string;
  label: string;
  /** Clase de color para un punto a la izquierda (ej. "bg-[#4CA35A]"). */
  dot?: string;
}

/**
 * Selector de filtro con el estilo de la app: etiqueta arriba, valor abajo y
 * lista desplegable. Con muchas opciones muestra un buscador.
 */
export default function SelectFiltro({
  label,
  value,
  todos,
  opciones,
  onChange,
}: {
  label: string;
  value: string;
  /** Opcion "sin filtro" (ej. { value: "TODOS", label: "Todos" }). Omitir en formularios. */
  todos?: OpcionFiltro;
  opciones: OpcionFiltro[];
  onChange: (value: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const activo = todos ? value !== todos.value : false;
  const lista = todos ? [todos, ...opciones] : opciones;
  const seleccion = lista.find((o) => o.value === value) ?? todos ?? { value: "", label: "Seleccionar" };

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

  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    return q ? opciones.filter((o) => normalizeSearchText(o.label).includes(q)) : opciones;
  }, [busqueda, opciones]);

  function elegir(v: string) {
    onChange(v);
    setAbierto(false);
    setBusqueda("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-12 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
          activo
            ? "border-blue-300 bg-blue-50/60 dark:border-blue-500/50 dark:bg-blue-500/10"
            : abierto
              ? "border-blue-400 bg-white dark:bg-ink-black-800"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-ink-black-600 dark:bg-ink-black-800"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-bold text-slate-500 dark:text-ink-black-300">{label}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            {seleccion.dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${seleccion.dot}`} />}
            <span className={`truncate text-[13px] font-semibold ${activo ? "text-blue-700 dark:text-blue-200" : "text-slate-800 dark:text-ink-black-100"}`}>
              {seleccion.label}
            </span>
          </span>
        </span>
        <FiChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            {opciones.length > 8 && (
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
            <ul role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
              {(todos ? [todos, ...visibles] : visibles).map((o) => {
                const marcada = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={marcada}
                      onClick={() => elegir(o.value)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors focus-visible:bg-slate-100 ${
                        marcada
                          ? "bg-blue-50 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                          : "font-medium text-slate-700 hover:bg-slate-50 dark:text-ink-black-100 dark:hover:bg-ink-black-700"
                      }`}
                    >
                      {o.dot ? (
                        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} />
                      ) : (
                        <span aria-hidden="true" className="h-2 w-2 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {marcada && <FiCheck size={14} className="shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
              {visibles.length === 0 && (
                <li className="px-3 py-3 text-xs font-medium text-slate-400">Sin coincidencias</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
