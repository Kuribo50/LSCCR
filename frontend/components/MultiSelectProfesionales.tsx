"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiChevronDown, FiUsers } from "react-icons/fi";

function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
        marcada ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white dark:border-ink-black-500 dark:bg-ink-black-800"
      }`}
    >
      {marcada && <FiCheck size={11} strokeWidth={3} />}
    </span>
  );
}

/**
 * Selector multiple de profesionales. Lista vacia = todos.
 */
export default function MultiSelectProfesionales({
  opciones,
  seleccion,
  onChange,
  conteos,
}: {
  opciones: string[];
  seleccion: string[];
  onChange: (valor: string[]) => void;
  /** Citas por profesional en el dia elegido (opcional). */
  conteos?: Map<string, number>;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  const todos = seleccion.length === 0;
  const etiqueta = todos
    ? "Todos los profesionales"
    : seleccion.length === 1
      ? seleccion[0]
      : `${seleccion.length} profesionales`;

  function alternar(nombre: string) {
    onChange(seleccion.includes(nombre) ? seleccion.filter((n) => n !== nombre) : [...seleccion, nombre]);
  }

  const fila =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-100 dark:hover:bg-ink-black-700";


  return (
    <div ref={ref} className="relative z-40">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
          abierto
            ? "border-blue-500 bg-white dark:bg-ink-black-800"
            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-800"
        } text-slate-800 dark:text-ink-black-100`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FiUsers size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
          <span className="truncate">{etiqueta}</span>
        </span>
        <FiChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Profesionales"
            className="absolute right-0 top-[calc(100%+6px)] w-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            <button type="button" role="option" aria-selected={todos} onClick={() => onChange([])} className={fila}>
              <Casilla marcada={todos} />
              <span className="flex-1 text-slate-950 dark:text-white">Todos los profesionales</span>
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-ink-black-700" />
            {opciones.map((nombre) => {
              const marcada = seleccion.includes(nombre);
              const total = conteos?.get(nombre) ?? 0;
              return (
                <button key={nombre} type="button" role="option" aria-selected={marcada} onClick={() => alternar(nombre)} className={fila}>
                  <Casilla marcada={marcada} />
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-ink-black-100">{nombre}</span>
                  {conteos && (
                    <span className={`text-xs font-bold tabular-nums ${total > 0 ? "text-blue-600 dark:text-blue-300" : "text-slate-500"}`}>
                      {total}
                    </span>
                  )}
                </button>
              );
            })}
            {!todos && (
              <div className="mt-1 flex justify-end border-t border-slate-100 px-1 pt-1.5 dark:border-ink-black-700">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-md px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  Quitar selección
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
