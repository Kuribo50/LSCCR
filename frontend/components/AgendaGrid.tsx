"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FiAlertCircle } from "react-icons/fi";
import type { Categoria, Paciente } from "@/lib/types";
import { CATEGORIA_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";

// =============================================================================
// Colores por categoria: fondo pastel, borde suave y punto de leyenda.
// Un mismo color identifica la categoria en toda la agenda.
// =============================================================================

type Tono = { bg: string; border: string; dot: string };

export const TONO_CATEGORIA: Record<Categoria, Tono> = {
  LUMBAGOS: { bg: "bg-[#E6F4E4] dark:bg-[#1B3320]", border: "border-[#B7DDB2] dark:border-[#2F5A36]", dot: "bg-[#4CA35A]" },
  HOMBROS: { bg: "bg-[#E3F1FA] dark:bg-[#15303F]", border: "border-[#AFD3EC] dark:border-[#24506A]", dot: "bg-[#3B8FC4]" },
  SDNT: { bg: "bg-[#FDEBE2] dark:bg-[#3A2219]", border: "border-[#F5C3AA] dark:border-[#6A3A27]", dot: "bg-[#E07A4F]" },
  SDT: { bg: "bg-[#EFEAFB] dark:bg-[#2A2340]", border: "border-[#CDBFF0] dark:border-[#4A3D78]", dot: "bg-[#7C62D6]" },
  OA_MENOS65: { bg: "bg-[#FBF1DC] dark:bg-[#382C14]", border: "border-[#EED4A0] dark:border-[#665124]", dot: "bg-[#C9922E]" },
  MAS65: { bg: "bg-[#FBE7EC] dark:bg-[#3A1D25]", border: "border-[#EFB9C6] dark:border-[#6A3443]", dot: "bg-[#CF5B78]" },
  OTROS_NEUROS: { bg: "bg-[#DFF3F1] dark:bg-[#13332F]", border: "border-[#A8D9D3] dark:border-[#245C55]", dot: "bg-[#2E9C8F]" },
  AATT: { bg: "bg-[#ECEEF1] dark:bg-[#24272B]", border: "border-[#CDD2D8] dark:border-[#3A3F45]", dot: "bg-[#6B7179]" },
  DUPLA: { bg: "bg-[#ECEEF1] dark:bg-[#24272B]", border: "border-[#CDD2D8] dark:border-[#3A3F45]", dot: "bg-[#6B7179]" },
  BORRADOR: { bg: "bg-[#ECEEF1] dark:bg-[#24272B]", border: "border-[#CDD2D8] dark:border-[#3A3F45]", dot: "bg-[#A2A8B0]" },
};

const TONO_APAGADO: Tono = {
  bg: "bg-slate-100 dark:bg-ink-black-700",
  border: "border-slate-200 dark:border-ink-black-600",
  dot: "bg-slate-300",
};

const SLOT_MINUTOS = 30;
const SLOT_ALTO = 62; // px por media hora
const BLOQUE_SLOTS = 1; // cada cita ocupa media hora: el sistema solo guarda la hora de inicio

const SIN_PROFESIONAL = "Sin profesional asignado";

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase());
}

function hora(fecha: Date) {
  return fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function responsableDe(p: Paciente) {
  return p.responsable_nombre || p.kine_asignado_nombre || SIN_PROFESIONAL;
}

// Circulo punteado = programada; alerta = la hora ya paso y no se registro asistencia.
function EstadoIcono({ atrasada }: { atrasada: boolean }) {
  if (atrasada) {
    return <FiAlertCircle className="shrink-0 text-amber-600" size={16} aria-label="Hora pasada sin registro" />;
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-slate-500 dark:text-ink-black-300" aria-label="Programada">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.2" />
    </svg>
  );
}

export default function AgendaGrid({
  citas,
  onSelect,
  esHoy = false,
}: {
  citas: Paciente[];
  onSelect: (paciente: Paciente) => void;
  esHoy?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [categoriaActiva, setCategoriaActiva] = useState<Categoria | null>(null);
  // Hora de referencia fijada al montar: suficiente para marcar citas ya pasadas.
  const [ahora] = useState(() => Date.now());

  const { columnas, inicioMin, finMin } = useMemo(() => {
    const porProfesional = new Map<string, Paciente[]>();
    let min = 8 * 60;
    let max = 18 * 60;
    for (const p of citas) {
      if (!p.proxima_atencion) continue;
      const d = new Date(p.proxima_atencion);
      const m = d.getHours() * 60 + d.getMinutes();
      min = Math.min(min, Math.floor(m / 60) * 60);
      max = Math.max(max, m + BLOQUE_SLOTS * SLOT_MINUTOS);
      const clave = responsableDe(p);
      porProfesional.set(clave, [...(porProfesional.get(clave) ?? []), p]);
    }
    const lista = Array.from(porProfesional.entries()).sort(([a], [b]) =>
      a === SIN_PROFESIONAL ? 1 : b === SIN_PROFESIONAL ? -1 : a.localeCompare(b, "es"),
    );
    return { columnas: lista, inicioMin: min, finMin: Math.ceil(max / 60) * 60 };
  }, [citas]);

  const categoriasPresentes = useMemo(() => {
    const set = new Set<Categoria>();
    citas.forEach((p) => set.add(p.categoria));
    return Array.from(set);
  }, [citas]);

  const minutoAhora = new Date(ahora).getHours() * 60 + new Date(ahora).getMinutes();
  const mostrarAhora = esHoy && minutoAhora >= inicioMin && minutoAhora <= finMin;
  const primeraCita = useMemo(() => {
    const minutos = citas
      .filter((p) => p.proxima_atencion)
      .map((p) => {
        const d = new Date(p.proxima_atencion!);
        return d.getHours() * 60 + d.getMinutes();
      });
    return minutos.length ? Math.min(...minutos) : inicioMin;
  }, [citas, inicioMin]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const objetivo = mostrarAhora ? minutoAhora - 60 : primeraCita - 30;
    el.scrollTop = Math.max(0, ((objetivo - inicioMin) / SLOT_MINUTOS) * SLOT_ALTO);
  }, [mostrarAhora, minutoAhora, primeraCita, inicioMin]);

  const totalSlots = (finMin - inicioMin) / SLOT_MINUTOS;
  const alto = totalSlots * SLOT_ALTO;
  const horas = Array.from({ length: (finMin - inicioMin) / 60 }, (_, i) => inicioMin + i * 60);

  // Citas que se topan en la misma columna se dibujan lado a lado.
  function ubicar(lista: Paciente[]) {
    const ordenadas = [...lista].sort(
      (a, b) => new Date(a.proxima_atencion!).getTime() - new Date(b.proxima_atencion!).getTime(),
    );
    const carriles: number[] = [];
    const resultado = ordenadas.map((p) => {
      const d = new Date(p.proxima_atencion!);
      const inicio = d.getHours() * 60 + d.getMinutes();
      const fin = inicio + BLOQUE_SLOTS * SLOT_MINUTOS;
      let carril = carriles.findIndex((libreDesde) => libreDesde <= inicio);
      if (carril === -1) {
        carril = carriles.length;
        carriles.push(fin);
      } else {
        carriles[carril] = fin;
      }
      return { p, inicio, carril };
    });
    return { items: resultado, carriles: Math.max(1, carriles.length) };
  }

  return (
    <div className="relative">
      {/* Filtro por categoria: ovalo arriba de la grilla; destaca una categoria y apaga las demas */}
      {categoriasPresentes.length > 0 && (
        <div className="flex justify-center border-b border-slate-200 px-4 py-3 dark:border-ink-black-600">
          <div
            role="group"
            aria-label="Filtrar por categoría"
            className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 shadow-[0_8px_24px_-12px_rgba(22,24,27,0.25)] dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            {([null, ...categoriasPresentes] as Array<Categoria | null>).map((cat) => {
              const activa = categoriaActiva === cat;
              const total = cat ? citas.filter((p) => p.categoria === cat).length : citas.length;
              return (
                <button
                  key={cat ?? "todas"}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setCategoriaActiva(cat)}
                  className={`relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                    activa ? "text-slate-950 dark:text-white" : "text-slate-600 hover:text-slate-950 dark:text-ink-black-200"
                  }`}
                >
                  {activa && (
                    <motion.span
                      layoutId="agenda-categoria-activa"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-slate-100 dark:bg-ink-black-700"
                      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  {cat && (
                    <span
                      aria-hidden="true"
                      className={`relative h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-ink-black-800 ${TONO_CATEGORIA[cat]?.dot ?? "bg-slate-400"}`}
                    />
                  )}
                  <span className="relative">{cat ? CATEGORIA_LABELS[cat] ?? cat : "Todas"}</span>
                  <span className="relative text-xs tabular-nums text-slate-400">{total}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="max-h-[min(560px,calc(100vh-280px))] overflow-auto overscroll-contain">
        <div
          className="grid min-w-full"
          style={{ gridTemplateColumns: `4rem repeat(${Math.max(columnas.length, 1)}, minmax(190px, 1fr))` }}
        >
          {/* Encabezados de columna */}
          <div className="sticky left-0 top-0 z-30 border-b border-r border-slate-200 bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-900" />
          {columnas.map(([profesional, lista]) => (
            <div
              key={profesional}
              className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-center last:border-r-0 dark:border-ink-black-600 dark:bg-ink-black-900"
            >
              <p className="truncate text-sm font-bold text-slate-800 dark:text-ink-black-100">{profesional}</p>
              <p className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-ink-black-300">
                {lista.length} cita{lista.length !== 1 ? "s" : ""}
              </p>
            </div>
          ))}

          {/* Columna de horas */}
          <div className="sticky left-0 z-10 border-r border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800" style={{ height: alto }}>
            {mostrarAhora && (
              <span
                className="absolute right-1 z-10 -translate-y-1/2 rounded bg-red-500 px-1 text-[10px] font-bold tabular-nums text-white"
                style={{ top: ((minutoAhora - inicioMin) / SLOT_MINUTOS) * SLOT_ALTO }}
              >
                {hora(new Date(ahora))}
              </span>
            )}
            {horas.map((m) => (
              <div key={m} className="relative" style={{ height: SLOT_ALTO * 2 }}>
                <span className="absolute right-2 top-1.5 text-[11px] font-bold tabular-nums text-slate-500 dark:text-ink-black-300">
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Columnas de profesionales */}
          {columnas.map(([profesional, lista]) => {
            const { items, carriles } = ubicar(lista);
            return (
              <div
                key={profesional}
                className="relative border-r border-slate-200 last:border-r-0 dark:border-ink-black-600"
                style={{
                  height: alto,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${SLOT_ALTO - 1}px, var(--border-table-row) ${SLOT_ALTO - 1}px, var(--border-table-row) ${SLOT_ALTO}px)`,
                }}
              >
                {mostrarAhora && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-0 h-0.5 bg-red-500/80"
                    style={{ top: ((minutoAhora - inicioMin) / SLOT_MINUTOS) * SLOT_ALTO }}
                  />
                )}
                {items.map(({ p, inicio, carril }, i) => {
                  const fecha = new Date(p.proxima_atencion!);
                  const atrasada = fecha.getTime() < ahora;
                  const apagada = categoriaActiva !== null && categoriaActiva !== p.categoria;
                  const tono = apagada ? TONO_APAGADO : TONO_CATEGORIA[p.categoria] ?? TONO_APAGADO;
                  const ancho = 100 / carriles;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => onSelect(p)}
                      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.03 }}
                      className={`absolute z-[1] flex flex-col justify-between overflow-hidden rounded-xl border px-3 py-1.5 text-left outline-none transition-[filter,opacity] duration-200 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-slate-950/30 ${tono.bg} ${tono.border}`}
                      style={{
                        top: ((inicio - inicioMin) / SLOT_MINUTOS) * SLOT_ALTO + 2,
                        height: BLOQUE_SLOTS * SLOT_ALTO - 4,
                        left: `calc(${carril * ancho}% + 4px)`,
                        width: `calc(${ancho}% - 8px)`,
                      }}
                      aria-label={`${hora(fecha)}, ${nombreLegible(p.nombre)}, ${CATEGORIA_LABELS[p.categoria] ?? ""}`}
                      title={`${hora(fecha)} · ${nombreLegible(p.nombre)} · ${p.edad ? `${p.edad} años · ` : ""}${responsableDe(p)}`}
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <EstadoIcono atrasada={atrasada} />
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-[13px] font-bold leading-tight ${
                              apagada ? "text-slate-500 dark:text-ink-black-300" : "text-slate-950 dark:text-white"
                            }`}
                          >
                            {nombreLegible(p.nombre)}
                          </span>
                          <span className="block truncate text-xs font-semibold leading-tight text-slate-600 dark:text-ink-black-200">
                            {formatearRut(p.rut)}
                            {p.edad ? <span className="font-bold"> · {p.edad} años</span> : null}
                          </span>
                        </span>
                      </span>
                      <span className="truncate pl-6 text-xs font-bold leading-tight tabular-nums text-slate-600 dark:text-ink-black-200">
                        {hora(fecha)}
                        <span className="ml-2 font-semibold text-slate-500 dark:text-ink-black-300">
                          {p.categoria_label ?? CATEGORIA_LABELS[p.categoria]}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
