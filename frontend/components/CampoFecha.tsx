"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";

type Vista = "dias" | "meses" | "anios";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const ALTO_PANEL = 344;
const ANCHO_PANEL = 296;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha de hoy en hora local, formato YYYY-MM-DD. */
export function fechaHoyKey() {
  return toKey(new Date());
}

function fromKey(key: string) {
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaLegible(key: string) {
  const d = fromKey(key);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

type Posicion = { left: number; top?: number; bottom?: number };

/**
 * Campo de fecha con el calendario de la app (en vez del nativo del navegador).
 * Valor en formato YYYY-MM-DD; "" significa sin fecha.
 */
export default function CampoFecha({
  label,
  value,
  onChange,
  max,
  opcional = true,
  vistaVacia = "dias",
  compacto = false,
  altoCompacto = "h-[38px]",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Ultima fecha permitida (YYYY-MM-DD), p. ej. hoy para la fecha de nacimiento. */
  max?: string;
  /** Muestra la opcion de borrar la fecha. */
  opcional?: boolean;
  /** Vista con que abre cuando no hay fecha (para nacimiento conviene "anios"). */
  vistaVacia?: Vista;
  /** Sin etiqueta interna y con el alto de un input normal (la etiqueta va fuera). */
  compacto?: boolean;
  /** Clase de alto en modo compacto, para igualar los inputs vecinos. */
  altoCompacto?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<Posicion>({ left: 0, top: 0 });
  const arriba = pos.bottom !== undefined;
  const [vista, setVista] = useState<Vista>("dias");
  const [mes, setMes] = useState(() => {
    const base = fromKey(value) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const hoy = toKey(new Date());

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
      }
    }
    // El panel es fijo en pantalla: si se hace scroll o cambia el tamano, se cierra.
    function cerrar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  function abrir() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    const base = fromKey(value) ?? new Date();
    setMes(new Date(base.getFullYear(), base.getMonth(), 1));
    setVista(value ? "dias" : vistaVacia);
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - ANCHO_PANEL - 8));
      const vh = window.innerHeight;
      if (vh - rect.bottom >= ALTO_PANEL + 12) {
        setPos({ left, top: rect.bottom + 4 });
      } else if (rect.top >= ALTO_PANEL + 12) {
        setPos({ left, bottom: vh - rect.top + 4 });
      } else {
        // Pantalla baja: el panel se ajusta para quedar completo a la vista.
        setPos({ left, top: Math.max(8, vh - ALTO_PANEL - 12) });
      }
    }
    setAbierto(true);
  }

  function elegir(key: string) {
    onChange(key);
    setAbierto(false);
  }

  function mover(delta: number) {
    if (vista === "dias") setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
    else if (vista === "meses") setMes(new Date(mes.getFullYear() + delta, mes.getMonth(), 1));
    else setMes(new Date(mes.getFullYear() + delta * 12, mes.getMonth(), 1));
  }

  const inicioDecada = mes.getFullYear() - (mes.getFullYear() % 12);
  const titulo =
    vista === "dias"
      ? capitalizar(new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(mes))
      : vista === "meses"
        ? String(mes.getFullYear())
        : `${inicioDecada} – ${inicioDecada + 11}`;

  const offset = (mes.getDay() + 6) % 7;
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: Array<Date | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1)),
  ];

  const celdaBase =
    "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-ink-black-600";
  const celdaActiva = "bg-blue-500 font-bold text-white";
  const celdaNormal = "font-semibold text-slate-700 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700";

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex ${compacto ? altoCompacto : "h-12"} w-full items-center rounded-lg border transition-colors ${
          abierto
            ? "border-blue-400 bg-white dark:bg-ink-black-800"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-ink-black-600 dark:bg-ink-black-800"
        }`}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label={compacto ? `${label}: ${value ? fechaLegible(value) : "sin fecha"}` : undefined}
          onClick={abrir}
          className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <span className="min-w-0">
            {!compacto && <span className="block text-[10px] font-bold text-slate-500 dark:text-ink-black-300">{label}</span>}
            <span
              className={`block truncate text-[13px] font-semibold ${
                value ? "text-slate-800 dark:text-ink-black-100" : "text-slate-400 dark:text-ink-black-400"
              }`}
            >
              {value ? fechaLegible(value) : "Sin fecha"}
            </span>
          </span>
          <FiCalendar size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
        </button>
        {opcional && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Borrar ${label.toLowerCase()}`}
            title="Borrar fecha"
            className="mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 outline-none transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-red-500/10"
          >
            <FiX size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {abierto && (
          <motion.div
            role="dialog"
            aria-label={`Elegir ${label.toLowerCase()}`}
            initial={{ opacity: 0, y: arriba ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: arriba ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: ANCHO_PANEL }}
            className="fixed z-[120] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => mover(-1)}
                aria-label="Anterior"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
              >
                <FiChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setVista(vista === "dias" ? "meses" : "anios")}
                disabled={vista === "anios"}
                title={vista === "anios" ? undefined : "Cambiar mes o año"}
                className="rounded-lg px-2.5 py-1 text-sm font-bold text-slate-950 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:hover:bg-transparent dark:text-white dark:hover:bg-ink-black-700"
              >
                {titulo}
              </button>
              <button
                type="button"
                onClick={() => mover(1)}
                aria-label="Siguiente"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
              >
                <FiChevronRight size={15} />
              </button>
            </div>

            {vista === "dias" && (
              <div className="grid grid-cols-7 text-center">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <span key={i} className="pb-1 text-[11px] font-bold text-slate-500 dark:text-ink-black-300">
                    {d}
                  </span>
                ))}
                {celdas.map((dia, i) => {
                  if (!dia) return <span key={`v-${i}`} />;
                  const key = toKey(dia);
                  const activo = key === value;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={Boolean(max && key > max)}
                      onClick={() => elegir(key)}
                      aria-pressed={activo}
                      aria-label={fechaLegible(key)}
                      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[13px] tabular-nums ${celdaBase} ${
                        activo
                          ? celdaActiva
                          : key === hoy
                            ? "font-bold text-slate-950 ring-1 ring-inset ring-blue-500 dark:text-white dark:ring-blue-400"
                            : dia.getDay() === 0
                              ? "font-medium text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-black-700"
                              : celdaNormal
                      }`}
                    >
                      {dia.getDate()}
                    </button>
                  );
                })}
              </div>
            )}

            {vista === "meses" && (
              <div className="grid grid-cols-3 gap-1.5">
                {MESES.map((nombre, i) => {
                  const activo = value.startsWith(`${mes.getFullYear()}-${pad(i + 1)}`);
                  return (
                    <button
                      key={nombre}
                      type="button"
                      disabled={Boolean(max && `${mes.getFullYear()}-${pad(i + 1)}-01` > max)}
                      onClick={() => {
                        setMes(new Date(mes.getFullYear(), i, 1));
                        setVista("dias");
                      }}
                      className={`h-11 rounded-lg text-[13px] ${celdaBase} ${activo ? celdaActiva : celdaNormal}`}
                    >
                      {nombre}
                    </button>
                  );
                })}
              </div>
            )}

            {vista === "anios" && (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => inicioDecada + i).map((anio) => {
                  const activo = value.startsWith(`${anio}-`);
                  return (
                    <button
                      key={anio}
                      type="button"
                      disabled={Boolean(max && `${anio}-01-01` > max)}
                      onClick={() => {
                        setMes(new Date(anio, mes.getMonth(), 1));
                        setVista("meses");
                      }}
                      className={`h-11 rounded-lg text-[13px] tabular-nums ${celdaBase} ${activo ? celdaActiva : celdaNormal}`}
                    >
                      {anio}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-ink-black-700">
              {opcional && value ? (
                <button
                  type="button"
                  onClick={() => elegir("")}
                  className="rounded-md px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  Borrar
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => elegir(hoy)}
                disabled={Boolean(max && hoy > max)}
                className="rounded-md px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 disabled:text-slate-300 dark:text-blue-300"
              >
                Hoy
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
