"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Paciente } from "@/lib/types";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import ProximaAtencionModal from "@/components/ProximaAtencionModal";
import FichaPaciente from "@/components/FichaPaciente";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiEdit3,
  FiEye,
  FiPhone,
  FiRefreshCw,
  FiTrash2,
  FiUserPlus,
  FiXCircle,
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function dateKeyFromDateTime(value: string) {
  return toDateKey(new Date(value));
}

function sameMonth(dateKey: string, reference: Date) {
  const date = fromDateKey(dateKey);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

const ESTADOS_PROGRAMABLES = new Set(["PENDIENTE", "RESCATE", "INGRESADO"]);

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

interface InasistenciaAgendaResponse {
  paciente: Paciente;
  alerta_abandono: boolean;
  mensaje?: string;
}

export default function CalendarioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mesActual, setMesActual] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => toDateKey(new Date()));
  const [programando, setProgramando] = useState<Paciente | null>(null);
  const [fichaPaciente, setFichaPaciente] = useState<Paciente | null>(null);
  const [inasistenciaAgenda, setInasistenciaAgenda] = useState<Paciente | null>(null);
  const [eliminandoCita, setEliminandoCita] = useState<Paciente | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState("");

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = user.rol === "KINE" ? "/pacientes/?solo_mios=1" : "/pacientes/";
      const data = await api.get<Paciente[]>(endpoint);
      setPacientes(data);
    } catch (error) {
      const message = getErrorMessage(error, "No se pudo cargar el calendario.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (user) void cargar();
  }, [cargar, user]);

  useEffect(() => {
    if (!sameMonth(fechaSeleccionada, mesActual)) {
      setFechaSeleccionada(toDateKey(new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)));
    }
  }, [mesActual, fechaSeleccionada]);

  function actualizarPaciente(actualizado: Paciente) {
    setPacientes((prev) => prev.map((item) => (item.id === actualizado.id ? actualizado : item)));
    setFichaPaciente((prev) => (prev?.id === actualizado.id ? actualizado : prev));
  }

  function irAHoy() {
    const hoy = new Date();
    setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setFechaSeleccionada(toDateKey(hoy));
  }

  function puedeGestionarAgenda(paciente: Paciente) {
    if (!user) return false;
    if (user.rol === "ADMIN") return true;
    return user.rol === "KINE" && paciente.kine_asignado === user.id;
  }

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
      lista.sort((a, b) => {
        const fechaA = a.proxima_atencion ? new Date(a.proxima_atencion).getTime() : 0;
        const fechaB = b.proxima_atencion ? new Date(b.proxima_atencion).getTime() : 0;
        return fechaA - fechaB;
      });
      mapa.set(fecha, lista);
    }
    return mapa;
  }, [pacientesProgramables]);

  const diasDelMes = useMemo(() => {
    const inicio = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
    const fin = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0);
    const celdas: Array<Date | null> = Array(inicio.getDay()).fill(null);
    for (let d = 1; d <= fin.getDate(); d++) {
      celdas.push(new Date(mesActual.getFullYear(), mesActual.getMonth(), d));
    }
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
  }, [mesActual]);

  const pacientesDelDia = porFecha.get(fechaSeleccionada) ?? [];
  const pacientesSinFecha = pacientesProgramables.filter((p) => !p.proxima_atencion);
  const ingresadosSinAgenda = pacientesSinFecha.filter((p) => p.estado === "INGRESADO").length;
  const rescatesSinAgenda = pacientesSinFecha.filter((p) => p.estado === "RESCATE").length;
  const citasHoy = porFecha.get(toDateKey(new Date()))?.length ?? 0;

  async function handleAsistencia(paciente: Paciente) {
    if (!paciente.proxima_atencion) return;
    setAccionEnCurso(`asistencia-${paciente.id}`);
    try {
      const actualizado = await api.post<Paciente>(
        `/pacientes/${paciente.id}/registrar-asistencia/`,
        {
          fecha_programada: paciente.proxima_atencion,
          observacion: "Paciente asistió a atención programada.",
        },
      );
      actualizarPaciente(actualizado);
      toast.success("Asistencia registrada. El paciente vuelve a pendientes de agenda.");
      await cargar();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo registrar asistencia."));
    } finally {
      setAccionEnCurso("");
    }
  }

  async function handleInasistencia(paciente: Paciente, motivo: string, justificada: boolean) {
    if (!paciente.proxima_atencion) return;
    setAccionEnCurso(`inasistencia-${paciente.id}`);
    try {
      const data = await api.post<InasistenciaAgendaResponse>(
        `/pacientes/${paciente.id}/registrar-inasistencia-agenda/`,
        {
          fecha_programada: paciente.proxima_atencion,
          motivo,
          justificada,
        },
      );
      actualizarPaciente(data.paciente);
      setInasistenciaAgenda(null);
      if (data.alerta_abandono) {
        toast.warning("Paciente con 2 inasistencias. Evaluar ABANDONO.");
      } else {
        toast.warning("Inasistencia registrada.");
      }
      await cargar();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo registrar inasistencia."));
    } finally {
      setAccionEnCurso("");
    }
  }

  async function handleEliminarCita() {
    if (!eliminandoCita?.proxima_atencion) return;
    setAccionEnCurso(`eliminar-${eliminandoCita.id}`);
    try {
      const actualizado = await api.post<Paciente>(
        `/pacientes/${eliminandoCita.id}/eliminar-cita/`,
        {
          fecha_programada: eliminandoCita.proxima_atencion,
          observacion: "Cita eliminada desde calendario.",
        },
      );
      actualizarPaciente(actualizado);
      setEliminandoCita(null);
      toast.info("Cita eliminada. Paciente vuelve a pendientes de agenda.");
      await cargar();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo eliminar la cita."));
    } finally {
      setAccionEnCurso("");
    }
  }

  return (
    <motion.div variants={tunnelVariants} initial="initial" animate="animate" className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <motion.header variants={itemVariants} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <FiCalendar size={21} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-950">Agenda CCR</h1>
              <p className="mt-0.5 text-sm font-medium text-slate-500">Planificación diaria y seguimiento operativo.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))}
                className="rounded-md p-2 text-slate-600 transition hover:bg-white hover:text-blue-700"
                aria-label="Mes anterior"
              >
                <FiChevronLeft size={18} />
              </button>
              <p className="min-w-[150px] px-2 text-center text-sm font-black capitalize text-slate-800">{formatMonthYear(mesActual)}</p>
              <button
                onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))}
                className="rounded-md p-2 text-slate-600 transition hover:bg-white hover:text-blue-700"
                aria-label="Mes siguiente"
              >
                <FiChevronRight size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={irAHoy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => void cargar()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#335FDB] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-60"
            >
              <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} />
              Refrescar
            </button>
          </div>
        </div>
      </motion.header>

      {error && (
        <motion.div variants={itemVariants} className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">
          {error}
        </motion.div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <motion.aside variants={itemVariants} className="order-2 space-y-4 xl:order-1">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Calendario mensual</p>
                <h2 className="mt-1 text-sm font-black capitalize text-slate-900">{formatMonthYear(mesActual)}</h2>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                Hoy: {citasHoy}
              </span>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 text-center">
              {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                <div key={`${d}-${i}`} className="py-1 text-[10px] font-bold uppercase text-slate-400">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-md bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {diasDelMes.map((dia, index) => {
                  if (!dia) return <div key={`empty-${index}`} />;
                  const dateKey = toDateKey(dia);
                  const items = porFecha.get(dateKey) ?? [];
                  const isSelected = fechaSeleccionada === dateKey;
                  const isToday = dateKey === toDateKey(new Date());

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setFechaSeleccionada(dateKey)}
                      className={`relative flex h-11 flex-col items-center justify-center rounded-md border text-xs font-black transition ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : isToday
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      <span>{dia.getDate()}</span>
                      {items.length > 0 && (
                        <span className={`absolute bottom-1 rounded-full px-1 text-[8px] leading-3 ${isSelected ? "bg-white text-blue-700" : "bg-blue-100 text-blue-700"}`}>
                          {items.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pendientes de agenda</p>
                <h2 className="mt-1 text-sm font-black text-slate-900">{pacientesSinFecha.length} pacientes activos</h2>
              </div>
              <FiUserPlus className="text-blue-600" size={18} />
            </div>

            <div className="custom-scrollbar max-h-[430px] space-y-2 overflow-y-auto pr-1">
              {pacientesSinFecha.length > 0 ? (
                pacientesSinFecha.map((p) => (
                  <PendienteAgendaItem
                    key={p.id}
                    paciente={p}
                    puedeGestionar={puedeGestionarAgenda(p)}
                    onProgramar={() => setProgramando(p)}
                    onFicha={() => setFichaPaciente(p)}
                  />
                ))
              ) : (
                <EmptyState title="Sin pendientes" description="Todos los pacientes activos tienen agenda próxima." />
              )}
            </div>
          </section>
        </motion.aside>

        <motion.main variants={itemVariants} className="order-1 space-y-4 xl:order-2">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResumenDiaCard label="Citas del día" value={pacientesDelDia.length} tone="blue" />
            <ResumenDiaCard label="Pendientes de agenda" value={pacientesSinFecha.length} tone="slate" />
            <ResumenDiaCard label="Ingresados sin agenda" value={ingresadosSinAgenda} tone="amber" />
            <ResumenDiaCard label="Rescate sin agenda" value={rescatesSinAgenda} tone="red" />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Agenda del día</p>
                  <h2 className="mt-1 text-lg font-black capitalize text-slate-950">{formatDay(fechaSeleccionada)}</h2>
                </div>
                <p className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                  {pacientesDelDia.length} cita{pacientesDelDia.length !== 1 ? "s" : ""} programada{pacientesDelDia.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="custom-scrollbar max-h-[640px] space-y-3 overflow-y-auto p-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-32 animate-pulse rounded-lg bg-slate-100" />
                ))
              ) : pacientesDelDia.length > 0 ? (
                pacientesDelDia.map((p) => (
                  <AgendaDiaCard
                    key={p.id}
                    paciente={p}
                    puedeGestionar={puedeGestionarAgenda(p)}
                    accionEnCurso={accionEnCurso}
                    onAsistencia={() => void handleAsistencia(p)}
                    onInasistencia={() => setInasistenciaAgenda(p)}
                    onReagendar={() => setProgramando(p)}
                    onEliminar={() => setEliminandoCita(p)}
                    onFicha={() => setFichaPaciente(p)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Sin citas para este día"
                  description="Selecciona otro día en el calendario o programa una atención desde pendientes de agenda."
                />
              )}
            </div>
          </section>
        </motion.main>
      </div>

      <AnimatePresence>
        {programando && (
          <ProximaAtencionModal
            paciente={programando}
            fechaInicial={`${fechaSeleccionada}T09:00`}
            onClose={() => setProgramando(null)}
            onConfirm={async (fechaHora, observacion) => {
              const actualizado = programando.proxima_atencion
                ? await api.post<Paciente>(
                    `/pacientes/${programando.id}/reagendar-atencion/`,
                    {
                      fecha_programada: programando.proxima_atencion,
                      nueva_fecha: fechaHora,
                      observacion: observacion || "Atención reagendada desde calendario.",
                    },
                  )
                : await api.post<Paciente>(
                    `/pacientes/${programando.id}/programar-atencion/`,
                    { fecha_hora: fechaHora },
                  );
              actualizarPaciente(actualizado);
              await cargar();
            }}
            successMessage={
              programando.proxima_atencion
                ? "Atención reagendada correctamente."
                : "Atención programada correctamente."
            }
          />
        )}
      </AnimatePresence>

      {inasistenciaAgenda && (
        <InasistenciaAgendaModal
          paciente={inasistenciaAgenda}
          loading={accionEnCurso === `inasistencia-${inasistenciaAgenda.id}`}
          onClose={() => setInasistenciaAgenda(null)}
          onConfirm={(motivo, justificada) => void handleInasistencia(inasistenciaAgenda, motivo, justificada)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(eliminandoCita)}
        title="Eliminar cita"
        message="Se quitará la próxima atención programada. El paciente no será eliminado y el evento quedará en el historial de acciones."
        confirmLabel="Eliminar cita"
        cancelLabel="Cancelar"
        variant="danger"
        loading={eliminandoCita ? accionEnCurso === `eliminar-${eliminandoCita.id}` : false}
        onConfirm={() => void handleEliminarCita()}
        onCancel={() => setEliminandoCita(null)}
      />

      {fichaPaciente && user && (
        <FichaPaciente
          paciente={fichaPaciente}
          usuario={user}
          onClose={() => setFichaPaciente(null)}
          onRefresh={() => void cargar()}
        />
      )}
    </motion.div>
  );
}

function ResumenDiaCard({ label, value, tone }: { label: string; value: number; tone: "blue" | "slate" | "amber" | "red" }) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-white text-slate-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    red: "border-red-100 bg-red-50 text-red-700",
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function AgendaDiaCard({
  paciente,
  puedeGestionar,
  accionEnCurso,
  onAsistencia,
  onInasistencia,
  onReagendar,
  onEliminar,
  onFicha,
}: {
  paciente: Paciente;
  puedeGestionar: boolean;
  accionEnCurso: string;
  onAsistencia: () => void;
  onInasistencia: () => void;
  onReagendar: () => void;
  onEliminar: () => void;
  onFicha: () => void;
}) {
  const disabled = accionEnCurso.endsWith(`-${paciente.id}`);
  const responsable = paciente.responsable_nombre || paciente.kine_asignado_nombre || "Sin responsable";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-100 hover:shadow-md">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
              <FiClock size={13} />
              {formatTime(paciente.proxima_atencion)}
            </span>
            <Badge text={ESTADO_LABELS[paciente.estado]} className={estadoBadgeClass(paciente.estado)} />
            <Badge text={PRIORIDAD_LABELS[paciente.prioridad]} className={prioridadBadgeClass(paciente.prioridad)} />
          </div>

          <h3 className="mt-3 truncate text-base font-black text-slate-950">{paciente.nombre}</h3>
          <div className="mt-2 grid gap-2 text-xs font-semibold text-slate-600 md:grid-cols-2">
            <p>ID {paciente.id_ccr}</p>
            <p>RUT {formatearRut(paciente.rut)}</p>
            <p>Responsable: {responsable}</p>
            <p className="inline-flex items-center gap-1">
              <FiPhone size={12} />
              {paciente.telefono || "Sin teléfono"}
            </p>
          </div>
          <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Acción sugerida: registrar asistencia, inasistencia o reagendar según resultado de la atención.
          </p>
        </div>

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:w-[300px]">
          {puedeGestionar && (
            <>
              <button
                type="button"
                onClick={onAsistencia}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <FiCheckCircle size={14} />
                Llegó
              </button>
              <button
                type="button"
                onClick={onInasistencia}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <FiXCircle size={14} />
                No asistió
              </button>
              <button
                type="button"
                onClick={onReagendar}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1 rounded-md bg-[#335FDB] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-50"
              >
                <FiEdit3 size={14} />
                Reagendar
              </button>
              <button
                type="button"
                onClick={onEliminar}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <FiTrash2 size={14} />
                Eliminar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onFicha}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 sm:col-span-2"
          >
            <FiEye size={14} />
            Ver ficha operativa
          </button>
        </div>
      </div>
    </article>
  );
}

function PendienteAgendaItem({
  paciente,
  puedeGestionar,
  onProgramar,
  onFicha,
}: {
  paciente: Paciente;
  puedeGestionar: boolean;
  onProgramar: () => void;
  onFicha: () => void;
}) {
  const responsable = paciente.responsable_nombre || paciente.kine_asignado_nombre || "Sin responsable";

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-slate-900">{paciente.nombre}</p>
          <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">
            {paciente.id_ccr} · {responsable}
          </p>
        </div>
        <Badge text={ESTADO_LABELS[paciente.estado]} className={estadoBadgeClass(paciente.estado)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge text={PRIORIDAD_LABELS[paciente.prioridad]} className={prioridadBadgeClass(paciente.prioridad)} />
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
          {paciente.dias_en_lista ?? 0} días
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {puedeGestionar && (
          <button
            type="button"
            onClick={onProgramar}
            className="inline-flex items-center gap-1 rounded-md bg-[#335FDB] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#284FC0]"
          >
            <FiCalendar size={11} />
            Programar
          </button>
        )}
        <button
          type="button"
          onClick={onFicha}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-50"
        >
          <FiEye size={11} />
          Ver ficha
        </button>
      </div>
    </article>
  );
}

function InasistenciaAgendaModal({
  paciente,
  loading,
  onClose,
  onConfirm,
}: {
  paciente: Paciente;
  loading: boolean;
  onClose: () => void;
  onConfirm: (motivo: string, justificada: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [justificada, setJustificada] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Agenda operativa</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">Registrar inasistencia</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {paciente.nombre} · {formatDateTime(paciente.proxima_atencion)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Motivo u observación</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              className="ccr-control-input mt-2 w-full px-3 py-2 text-sm"
              placeholder="No asiste a atención programada."
            />
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">Recomendado para dejar trazabilidad operativa.</span>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={justificada}
              onChange={(e) => setJustificada(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#335FDB] focus:ring-[#335FDB]"
            />
            Justificada
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="ccr-control-button px-4 py-2 text-xs disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo.trim(), justificada)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-[#335FDB] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-50"
          >
            {loading ? <FiRefreshCw className="animate-spin" size={13} /> : <FiXCircle size={13} />}
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-black text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs font-semibold text-slate-500">{description}</p>
    </div>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${className}`}>
      {text}
    </span>
  );
}

function estadoBadgeClass(estado: Paciente["estado"]) {
  if (estado === "INGRESADO") return "border-emerald-100 bg-emerald-50 text-emerald-700";
  if (estado === "RESCATE") return "border-amber-100 bg-amber-50 text-amber-800";
  return "border-blue-100 bg-blue-50 text-blue-700";
}

function prioridadBadgeClass(prioridad: Paciente["prioridad"]) {
  if (prioridad === "ALTA") return "border-red-100 bg-red-50 text-red-700";
  if (prioridad === "MEDIANA") return "border-amber-100 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-600";
}
