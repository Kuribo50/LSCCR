"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Paciente } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import ProximaAtencionModal from "@/components/ProximaAtencionModal";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiRefreshCw,
  FiUserPlus,
} from "react-icons/fi";

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(date);
}

function formatDay(dateKey: string) {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fromDateKey(dateKey));
}

const ESTADOS_PROGRAMABLES = new Set(["PENDIENTE", "RESCATE", "INGRESADO"]);

function dateKeyFromDateTime(value: string) {
  return toDateKey(new Date(value));
}

function sameMonth(dateKey: string, reference: Date) {
  const date = fromDateKey(dateKey);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

const tunnelVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, staggerChildren: 0.04 },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export default function CalendarioPage() {
  const { user } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => toDateKey(new Date()));
  const [programando, setProgramando] = useState<Paciente | null>(null);

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = user.rol === "KINE" ? "/pacientes/?solo_mios=1" : "/pacientes/";
      const data = await api.get<Paciente[]>(endpoint);
      setPacientes(data);
    } catch {
      setError("No se pudo cargar el calendario.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void cargar();
  }, [cargar, user]);

  useEffect(() => {
    if (!sameMonth(fechaSeleccionada, mesActual)) {
      setFechaSeleccionada(toDateKey(new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)));
    }
  }, [mesActual, fechaSeleccionada]);

  const pacientesProgramables = useMemo(() => {
    if (!user) return [] as Paciente[];
    return pacientes.filter((paciente) => {
      const asignado = paciente.kine_asignado !== null;
      const estadoProgramable = ESTADOS_PROGRAMABLES.has(paciente.estado);
      const esPropio = paciente.kine_asignado === user.id;
      if (!asignado || !estadoProgramable) return false;
      if (user.rol === "KINE") return esPropio;
      return user.rol === "ADMIN" || user.rol === "ADMINISTRATIVO";
    });
  }, [pacientes, user]);

  const porFecha = useMemo(() => {
    const mapa = new Map<string, Paciente[]>();
    for (const p of pacientesProgramables) {
      if (!p.proxima_atencion) continue;
      const fecha = dateKeyFromDateTime(p.proxima_atencion);
      const lista = mapa.get(fecha) ?? [];
      lista.push(p);
      mapa.set(fecha, lista);
    }
    return mapa;
  }, [pacientesProgramables]);

  const diasDelMes = useMemo(() => {
    const inicio = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
    const fin = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0);
    const celdas: Array<Date | null> = Array(inicio.getDay()).fill(null);
    for (let d = 1; d <= fin.getDate(); d++) celdas.push(new Date(mesActual.getFullYear(), mesActual.getMonth(), d));
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
  }, [mesActual]);

  const pacientesDelDia = porFecha.get(fechaSeleccionada) ?? [];
  const pacientesSinFecha = pacientesProgramables.filter((p) => !p.proxima_atencion);

  const citasMes = useMemo(() => {
    const mes = mesActual.getMonth();
    const anio = mesActual.getFullYear();
    let total = 0;
    porFecha.forEach((_pacientes, dateKey) => {
      const d = fromDateKey(dateKey);
      if (d.getMonth() === mes && d.getFullYear() === anio) total += 1;
    });
    return total;
  }, [porFecha, mesActual]);

  const citasHoy = porFecha.get(toDateKey(new Date()))?.length ?? 0;

  return (
    <motion.div variants={tunnelVariants} initial="initial" animate="animate" className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <motion.header variants={itemVariants} className="ccr-panel ccr-dashboard-card rounded-xl p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <FiCalendar size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Calendario de Citas</h1>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Planificación diaria y seguimiento</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}
              className="ccr-calendar-action-button rounded-md p-2 transition"
            >
              <FiChevronLeft size={18} />
            </button>
            <div className="min-w-[160px] px-3 text-center">
              <p className="text-sm font-black capitalize text-slate-800">{formatMonthYear(mesActual)}</p>
            </div>
            <button
              onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}
              className="ccr-calendar-action-button rounded-md p-2 transition"
            >
              <FiChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Días con citas (mes)" value={citasMes} />
          <Kpi label="Citas para hoy" value={citasHoy} />
          <Kpi label="Pacientes sin agendar" value={pacientesSinFecha.length} />
        </div>
      </motion.header>

      {error && (
        <motion.div variants={itemVariants} className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">
          {error}
        </motion.div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <motion.section variants={itemVariants} className="ccr-panel ccr-dashboard-card rounded-xl p-5 lg:col-span-8">
          <div className="mb-3 grid grid-cols-7 gap-1 text-center">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => (
              <div key={`${d}-${i}`} className="py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{d}</div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {diasDelMes.map((dia, index) => {
                if (!dia) return <div key={`empty-${index}`} />;
                const dateKey = toDateKey(dia);
                const items = porFecha.get(dateKey) ?? [];
                const isSelected = fechaSeleccionada === dateKey;
                const isToday = dateKey === toDateKey(new Date());
                const hasAppointments = items.length > 0;

                return (
                  <motion.button
                    key={dateKey}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFechaSeleccionada(dateKey)}
                    className={`ccr-calendar-day relative h-16 sm:h-20 rounded-md border text-center transition ${
                      isSelected
                        ? "is-selected border-blue-600 bg-blue-600 text-white shadow-sm"
                        : isToday
                          ? "is-today border-blue-200 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    <span className="text-sm font-black">{dia.getDate()}</span>
                    {hasAppointments && (
                      <span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${isSelected ? "bg-white" : "bg-blue-600"}`} />
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.section>

        <motion.aside variants={itemVariants} className="space-y-4 lg:col-span-4">
          <div className="ccr-panel ccr-dashboard-card rounded-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Fecha seleccionada</p>
                <h3 className="ccr-date-badge mt-1 inline-flex rounded-md px-3 py-1.5 text-base font-black capitalize">{formatDay(fechaSeleccionada)}</h3>
              </div>
              <FiClock className="text-blue-600" size={18} />
            </div>

            <div className="custom-scrollbar max-h-[300px] space-y-2 overflow-y-auto pr-2">
              {pacientesDelDia.length > 0 ? (
                pacientesDelDia.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{p.nombre}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {p.proxima_atencion
                            ? new Date(p.proxima_atencion).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "--:--"}
                          {" · "}
                          {ESTADO_LABELS[p.estado]}
                        </p>
                      </div>
                      <button
                        onClick={() => setProgramando(p)}
                        className="ccr-calendar-action-button inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition"
                      >
                        <FiRefreshCw size={11} />
                        Editar
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm font-semibold text-slate-500">
                  Sin citas para este día
                </div>
              )}
            </div>
          </div>

          <div className="ccr-panel ccr-dashboard-card rounded-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pendientes de agenda</p>
                <h3 className="mt-1 text-base font-black text-slate-900">{pacientesSinFecha.length} pacientes</h3>
              </div>
              <FiUserPlus className="text-blue-600" size={18} />
            </div>

            <div className="custom-scrollbar max-h-[280px] space-y-2 overflow-y-auto pr-2">
              {pacientesSinFecha.length > 0 ? (
                pacientesSinFecha.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800">{p.nombre}</p>
                      <p className="truncate text-[10px] text-slate-500">{p.responsable_nombre || p.kine_asignado_nombre || "Sin responsable"}</p>
                    </div>
                    <button
                      onClick={() => setProgramando(p)}
                      className="ccr-calendar-action-button rounded-md px-2.5 py-1.5 text-[10px] font-bold transition"
                    >
                      Agendar
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs font-semibold text-slate-500">No hay pendientes por agendar</div>
              )}
            </div>
          </div>
        </motion.aside>
      </div>

      <AnimatePresence>
        {programando && (
          <ProximaAtencionModal
            paciente={programando}
            fechaInicial={`${fechaSeleccionada}T09:00`}
            onClose={() => setProgramando(null)}
            onConfirm={async (fechaHora) => {
              await api.post(`/pacientes/${programando.id}/programar-atencion/`, { fecha_hora: fechaHora });
              await cargar();
            }}
            onClear={
              programando.proxima_atencion
                ? async () => {
                    await api.delete(`/pacientes/${programando.id}/programar-atencion/`);
                    await cargar();
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}
