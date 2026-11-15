"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Modal, ModalOverlay, Dialog } from "react-aria-components";
import { api } from "@/lib/api";
import { useAPI, unwrapResults } from "@/lib/swr";
import type { ActividadGrupal, Paciente, PaginatedResponse } from "@/lib/types";
import { CATEGORIA_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import AgendaGrid, { TONO_CATEGORIA } from "@/components/AgendaGrid";
import MultiSelectProfesionales from "@/components/MultiSelectProfesionales";
import { CalendarioDesplegable } from "@/components/ProximaAtencionModal";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { motion, AnimatePresence } from "framer-motion";

// Heavy modals / slide-overs not visible on initial render — lazy-loaded.
const ProximaAtencionModal = dynamic(() => import("@/components/ProximaAtencionModal"), {
  ssr: false,
});
const ActividadesGrupalesModal = dynamic(() => import("@/components/ActividadesGrupalesModal"), { ssr: false });
const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), {
  ssr: false,
});
const ConfirmDialog = dynamic(() => import("@/components/ConfirmDialog"), {
  ssr: false,
});
import {
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiEdit3,
  FiEye,
  FiMoreHorizontal,
  FiRefreshCw,
  FiTrash2,
  FiXCircle,
  FiPlus,
  FiSearch,
  FiChevronDown,
  FiUsers,
} from "react-icons/fi";
import { normalizeRut, normalizeSearchText } from "@/lib/utils";

// =============================================================================
// Helpers de fecha y reglas locales de calendario
// =============================================================================

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function dateFromParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = fromDateKey(value);
  if (Number.isNaN(date.getTime()) || toDateKey(date) !== value) return null;
  return date;
}

function capitalizarInicial(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatDay(dateKey: string) {
  return capitalizarInicial(
    new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(fromDateKey(dateKey)),
  );
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
    hour12: false,
  });
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dateKeyFromDateTime(value: string) {
  return toDateKey(new Date(value));
}

function sameMonth(dateKey: string, reference: Date) {
  const date = fromDateKey(dateKey);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

function mondayStartOffset(date: Date) {
  return (date.getDay() + 6) % 7;
}

const ESTADOS_PROGRAMABLES = new Set(["PENDIENTE", "RESCATE", "INGRESADO"]);

const tunnelVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, staggerChildren: 0.03 },
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

// =============================================================================
// Componente principal
// =============================================================================

export default function CalendarioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const fechaParam = searchParams.get("fecha");
  const fechaInicial = dateFromParam(fechaParam) ?? new Date();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mesActual, setMesActual] = useState(
    () => new Date(fechaInicial.getFullYear(), fechaInicial.getMonth(), 1),
  );
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => toDateKey(fechaInicial));
  const [programando, setProgramando] = useState<Paciente | null>(null);
  const [fichaPaciente, setFichaPaciente] = useState<Paciente | null>(null);
  const [gestionandoCita, setGestionandoCita] = useState<Paciente | null>(null);
  const [inasistenciaAgenda, setInasistenciaAgenda] = useState<Paciente | null>(null);
  const [eliminandoCita, setEliminandoCita] = useState<Paciente | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState("");
  const [profesionalesFiltro, setProfesionalesFiltro] = useState<string[]>([]);
  const [vista, setVista] = useState<"grilla" | "lista">("grilla");
  const [selectorDiaAbierto, setSelectorDiaAbierto] = useState(false);
  const selectorDiaRef = useRef<HTMLDivElement | null>(null);
  const [agendarAbierto, setAgendarAbierto] = useState(false);
  // Actividades grupales: `null` cerrado; `{}` lista; `{ id }` detalle de una actividad.
  const [grupoAbierto, setGrupoAbierto] = useState<{ id?: number } | null>(null);

  const cargar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      // KINE ve solo su cartera; ADMIN/ADMINISTRATIVO pueden planificar global.
      const endpoint = user.rol === "KINE" ? "/pacientes/?solo_mios=1" : "/pacientes/";
      const data = await api.get<Paciente[] | PaginatedResponse<Paciente>>(endpoint);
      setPacientes(unwrapResults(data));
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
    const fechaUrl = dateFromParam(fechaParam);
    if (!fechaUrl) return;
    const dateKey = toDateKey(fechaUrl);
    setMesActual(new Date(fechaUrl.getFullYear(), fechaUrl.getMonth(), 1));
    setFechaSeleccionada(dateKey);
  }, [fechaParam]);

  useEffect(() => {
    if (!sameMonth(fechaSeleccionada, mesActual)) {
      setFechaSeleccionada(toDateKey(new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)));
    }
  }, [mesActual, fechaSeleccionada]);

  function actualizarPaciente(actualizado: Paciente) {
    setPacientes((prev) => prev.map((item) => (item.id === actualizado.id ? actualizado : item)));
    setFichaPaciente((prev) => (prev?.id === actualizado.id ? actualizado : prev));
  }

  function puedeGestionarAgenda(paciente: Paciente) {
    if (!user) return false;
    if (user.rol === "ADMIN") return true;
    return user.rol === "KINE" && paciente.kine_asignado === user.id;
  }

  const pacientesProgramables = useMemo(() => {
    if (!user) return [] as Paciente[];
    return pacientes.filter((paciente) => {
      const estadoProgramable = ESTADOS_PROGRAMABLES.has(paciente.estado);
      const esPropio = paciente.kine_asignado === user.id;
      // Solo se agenda a pacientes activos y, para KINE, propios.
      if (!estadoProgramable) return false;
      if (user.rol === "KINE") return esPropio;
      return user.rol === "ADMIN" || user.rol === "ADMINISTRATIVO";
    });
  }, [pacientes, user]);

  const profesionales = useMemo(
    () =>
      Array.from(
        new Set(
          pacientesProgramables
            .map((p) => p.responsable_nombre || p.kine_asignado_nombre)
            .filter((nombre): nombre is string => Boolean(nombre)),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    [pacientesProgramables],
  );

  const pacientesFiltrados = useMemo(
    () =>
      profesionalesFiltro.length
        ? pacientesProgramables.filter((p) =>
            profesionalesFiltro.includes(p.responsable_nombre || p.kine_asignado_nombre || ""),
          )
        : pacientesProgramables,
    [pacientesProgramables, profesionalesFiltro],
  );

  const porFecha = useMemo(() => {
    const mapa = new Map<string, Paciente[]>();
    for (const p of pacientesFiltrados) {
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
  }, [pacientesFiltrados]);


  const pacientesDelDia = useMemo(() => porFecha.get(fechaSeleccionada) ?? [], [porFecha, fechaSeleccionada]);

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

  const hoyKey = toDateKey(new Date());
  const semana = useMemo(() => {
    const base = fromDateKey(fechaSeleccionada);
    const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() - mondayStartOffset(base));
    return Array.from({ length: 7 }, (_, i) => new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i));
  }, [fechaSeleccionada]);

  const bloquesDelDia = useMemo(() => {
    const grupos = new Map<string, Paciente[]>();
    for (const p of pacientesDelDia) {
      const hora = p.proxima_atencion ? `${String(new Date(p.proxima_atencion).getHours()).padStart(2, "0")}:00` : "--:--";
      grupos.set(hora, [...(grupos.get(hora) ?? []), p]);
    }
    return Array.from(grupos.entries());
  }, [pacientesDelDia]);

  const { data: actividadesData, mutate: recargarActividades } = useAPI<ActividadGrupal[] | PaginatedResponse<ActividadGrupal>>(
    user ? `/actividades-grupales/?desde=${toDateKey(semana[0])}&hasta=${toDateKey(semana[6])}` : null,
  );
  const actividadesSemana = useMemo(() => unwrapResults(actividadesData), [actividadesData]);
  const actividadesPorDia = useMemo(() => {
    const mapa = new Map<string, ActividadGrupal[]>();
    actividadesSemana.forEach((a) => {
      const key = toDateKey(new Date(a.fecha_hora));
      mapa.set(key, [...(mapa.get(key) ?? []), a]);
    });
    return mapa;
  }, [actividadesSemana]);
  const actividadesDelDia = actividadesPorDia.get(fechaSeleccionada) ?? [];

  const profesionalesDelDia = new Set(
    pacientesDelDia.map((p) => p.responsable_nombre || p.kine_asignado_nombre).filter(Boolean),
  ).size;

  // Cierra el selector de dia al hacer clic fuera o con Esc.
  useEffect(() => {
    if (!selectorDiaAbierto) return;
    function onDown(e: MouseEvent) {
      if (selectorDiaRef.current && !selectorDiaRef.current.contains(e.target as Node)) setSelectorDiaAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectorDiaAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [selectorDiaAbierto]);

  const citasDelDiaPorProfesional = useMemo(() => {
    const mapa = new Map<string, number>();
    pacientesProgramables.forEach((p) => {
      if (!p.proxima_atencion || toDateKey(new Date(p.proxima_atencion)) !== fechaSeleccionada) return;
      const nombre = p.responsable_nombre || p.kine_asignado_nombre;
      if (nombre) mapa.set(nombre, (mapa.get(nombre) ?? 0) + 1);
    });
    return mapa;
  }, [pacientesProgramables, fechaSeleccionada]);

  const citasPorDia = useMemo(() => {
    const mapa = new Map<string, number>();
    porFecha.forEach((lista, key) => mapa.set(key, lista.length));
    return mapa;
  }, [porFecha]);

  function seleccionarFecha(dateKey: string) {
    const fecha = fromDateKey(dateKey);
    setMesActual(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setFechaSeleccionada(dateKey);
  }

  function moverDias(dias: number) {
    const base = fromDateKey(fechaSeleccionada);
    seleccionarFecha(toDateKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias)));
  }

  const botonIcono =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200 dark:hover:bg-ink-black-700";

  return (
    <motion.div variants={tunnelVariants} initial="initial" animate="animate" className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      {/* ---------- Cabecera: fecha, navegacion y filtro ---------- */}
      <motion.header variants={itemVariants} className="ccr-panel px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-950 dark:text-white">Agenda de atenciones</h1>
            <div ref={selectorDiaRef} className="relative z-50 mt-1">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={selectorDiaAbierto}
                onClick={() => setSelectorDiaAbierto((v) => !v)}
                className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-ink-black-100 dark:hover:bg-ink-black-700"
              >
                <FiCalendar size={14} className="text-slate-500" aria-hidden="true" />
                {formatDay(fechaSeleccionada)}
                {fechaSeleccionada === hoyKey && (
                  <span className="rounded-md bg-blue-500 px-1.5 py-0.5 text-[11px] font-bold text-white">Hoy</span>
                )}
                <FiChevronDown
                  size={15}
                  className={`text-slate-500 transition-transform ${selectorDiaAbierto ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              <AnimatePresence>
                {selectorDiaAbierto && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
                  >
                    <CalendarioDesplegable
                      key={fechaSeleccionada}
                      valor={fechaSeleccionada}
                      diasConCitas={citasPorDia}
                      permitirPasado
                      leyenda="Días con citas programadas"
                      onElegir={(key) => {
                        seleccionarFecha(key);
                        setSelectorDiaAbierto(false);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectProfesionales
              opciones={profesionales}
              seleccion={profesionalesFiltro}
              onChange={setProfesionalesFiltro}
              conteos={citasDelDiaPorProfesional}
            />
            {(user?.rol === "ADMIN" || user?.rol === "KINE") && (
              <button type="button" onClick={() => setAgendarAbierto(true)} className="ccr-button-refresh outline-none focus-visible:ring-2 focus-visible:ring-slate-950/30">
                <FiPlus size={14} aria-hidden="true" />
                Agendar atención
              </button>
            )}
          </div>
        </div>

        {/* Franja semanal compacta: los dias con citas quedan resaltados */}
        <div className="mt-3 flex items-center gap-1.5">
          <button type="button" onClick={() => moverDias(-7)} className={botonIcono} aria-label="Semana anterior">
            <FiChevronLeft size={16} />
          </button>
          <div className="grid flex-1 grid-cols-7 gap-1.5" role="tablist" aria-label="Días de la semana">
            {semana.map((dia) => {
              const key = toDateKey(dia);
              const total = porFecha.get(key)?.length ?? 0;
              const activo = key === fechaSeleccionada;
              const esHoy = key === hoyKey;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  aria-label={`${formatDay(key)}: ${total ? `${total} cita${total !== 1 ? "s" : ""}` : "sin citas"}`}
                  onClick={() => seleccionarFecha(key)}
                  className={`relative flex h-10 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                    activo
                      ? "text-white"
                      : total > 0
                        ? "bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200"
                        : "text-slate-500 hover:bg-slate-100 dark:text-ink-black-300 dark:hover:bg-ink-black-700"
                  } ${esHoy && !activo ? "ring-1 ring-inset ring-blue-400" : ""}`}
                >
                  {activo && (
                    <motion.span
                      layoutId="agenda-dia-activo"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg bg-blue-500"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative font-semibold capitalize">
                    {new Intl.DateTimeFormat("es-CL", { weekday: "short" }).format(dia).replace(".", "")}
                  </span>
                  <span className="relative font-bold tabular-nums">{dia.getDate()}</span>
                  {total > 0 && (
                    <span
                      className={`relative rounded-full px-1.5 text-[10px] font-bold tabular-nums leading-4 ${
                        activo ? "bg-white/25 text-white" : "bg-blue-500 text-white"
                      }`}
                    >
                      {total}
                    </span>
                  )}
                  {(actividadesPorDia.get(key)?.length ?? 0) > 0 && (
                    <span
                      aria-label="con actividad grupal"
                      title="Actividad grupal"
                      className={`relative h-2 w-2 rounded-full ${activo ? "bg-white" : "bg-violet-500"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => moverDias(7)} className={botonIcono} aria-label="Semana siguiente">
            <FiChevronRight size={16} />
          </button>
        </div>
      </motion.header>

      {error && (
        <motion.div variants={itemVariants} className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          {error}
        </motion.div>
      )}

      <div className="min-w-0 space-y-4">
        {/* ---------- Actividades grupales del dia ---------- */}
        {actividadesDelDia.length > 0 && (
          <motion.section variants={itemVariants} className="ccr-panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-ink-black-600">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                  <FiUsers size={14} aria-hidden="true" />
                </span>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Actividades grupales</h2>
              </div>
              <button type="button" onClick={() => setGrupoAbierto({})} className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-300">
                Ver todas
              </button>
            </div>
            <ul className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
              {actividadesDelDia.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setGrupoAbierto({ id: a.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                      a.estado === "CANCELADA"
                        ? "border-slate-200 bg-slate-50 opacity-70 dark:border-ink-black-600 dark:bg-ink-black-900"
                        : "border-violet-200 bg-violet-50/60 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10"
                    }`}
                  >
                    <span className="w-12 shrink-0 text-sm font-extrabold tabular-nums text-violet-800 dark:text-violet-200">
                      {formatTime(a.fecha_hora)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-bold text-slate-900 dark:text-ink-black-50 ${a.estado === "CANCELADA" ? "line-through" : ""}`}>
                        {a.nombre}
                      </span>
                      <span className="block truncate text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                        {[a.lugar, a.responsable_nombre, a.estado !== "PROGRAMADA" ? a.estado_label : ""].filter(Boolean).join(" · ") || `${a.duracion_minutos} min`}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-violet-800 dark:bg-ink-black-800 dark:text-violet-200">
                      <FiUsers size={11} aria-hidden="true" />
                      {a.total_participantes}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {/* ---------- Agenda del dia: quienes deben venir ---------- */}
        <motion.section variants={itemVariants} className="ccr-panel min-w-0 overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 dark:border-ink-black-600 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">Citas programadas</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
                Pacientes citados en la fecha seleccionada.
              </p>
            </div>
            <div className="flex items-center gap-3">
            <div role="tablist" aria-label="Vista de la agenda" className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-ink-black-700">
              {(["grilla", "lista"] as const).map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  role="tab"
                  aria-selected={vista === opcion}
                  onClick={() => setVista(opcion)}
                  className={`relative rounded-md px-3 py-1 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
                    vista === opcion ? "text-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-ink-black-300"
                  }`}
                >
                  {vista === opcion && (
                    <motion.span
                      layoutId="agenda-vista-activa"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-ink-black-600"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative">{opcion === "grilla" ? "Grilla" : "Lista"}</span>
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-ink-black-200">
              <span className="font-bold tabular-nums text-slate-950 dark:text-white">{pacientesDelDia.length}</span>{" "}
              cita{pacientesDelDia.length !== 1 ? "s" : ""}
              {profesionalesDelDia > 0 && (
                <>
                  {" · "}
                  <span className="font-bold tabular-nums text-slate-950 dark:text-white">{profesionalesDelDia}</span>{" "}
                  profesional{profesionalesDelDia !== 1 ? "es" : ""}
                </>
              )}
            </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-ink-black-700" />
              ))}
            </div>
          ) : bloquesDelDia.length > 0 && vista === "grilla" ? (
            <AgendaGrid
              citas={pacientesDelDia}
              esHoy={fechaSeleccionada === hoyKey}
              onSelect={(p) => (puedeGestionarAgenda(p) ? setGestionandoCita(p) : setFichaPaciente(p))}
            />
          ) : bloquesDelDia.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Sin citas programadas"
                description="No hay atenciones agendadas para este día. Selecciona otra fecha o usa «Agendar atención»."
              />
            </div>
          ) : (
            <ol className="divide-y divide-slate-200 dark:divide-ink-black-600">
              {bloquesDelDia.map(([hora, citas]) => (
                <li key={hora} className="grid grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                  <div className="border-r border-slate-200 px-4 py-4 dark:border-ink-black-600">
                    <p className="text-sm font-bold tabular-nums text-slate-950 dark:text-white">{hora}</p>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-ink-black-700">
                    {citas.map((p) => (
                      <CitaRow
                        key={p.id}
                        paciente={p}
                        puedeGestionar={puedeGestionarAgenda(p)}
                        ocupado={accionEnCurso.endsWith(`-${p.id}`)}
                        onAsistio={() => void handleAsistencia(p)}
                        onNoAsistio={() => setInasistenciaAgenda(p)}
                        onGestionar={() => setGestionandoCita(p)}
                        onFicha={() => setFichaPaciente(p)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </motion.section>

      </div>

      {agendarAbierto && (
        <AgendarDialog
          pacientes={pacientesProgramables}
          puedeGestionar={puedeGestionarAgenda}
          onClose={() => setAgendarAbierto(false)}
          onElegir={(p) => {
            setAgendarAbierto(false);
            setProgramando(p);
          }}
        />
      )}

      <AnimatePresence>
        {programando && (
          <ProximaAtencionModal
            paciente={programando}
            agenda={pacientesProgramables}
            // Reagendar parte desde la cita vigente; agendar, desde el dia seleccionado.
            fechaInicial={programando.proxima_atencion ? undefined : `${fechaSeleccionada < hoyKey ? hoyKey : fechaSeleccionada}T09:00`}
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

      {gestionandoCita && (
        <GestionarCitaModal
          paciente={gestionandoCita}
          puedeGestionar={puedeGestionarAgenda(gestionandoCita)}
          accionEnCurso={accionEnCurso}
          onClose={() => setGestionandoCita(null)}
          onAsistencia={async () => {
            await handleAsistencia(gestionandoCita);
            setGestionandoCita(null);
          }}
          onInasistencia={() => {
            setInasistenciaAgenda(gestionandoCita);
            setGestionandoCita(null);
          }}
          onReagendar={() => {
            setProgramando(gestionandoCita);
            setGestionandoCita(null);
          }}
          onEliminar={() => {
            setEliminandoCita(gestionandoCita);
            setGestionandoCita(null);
          }}
          onFicha={() => {
            setFichaPaciente(gestionandoCita);
            setGestionandoCita(null);
          }}
        />
      )}

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

      {grupoAbierto && user && (
        <ActividadesGrupalesModal
          usuario={user}
          pacientesDisponibles={pacientes.filter(
            (p) => p.estado === "INGRESADO" && (user.rol !== "KINE" || p.kine_asignado === user.id),
          )}
          actividadInicial={grupoAbierto.id}
          onClose={() => setGrupoAbierto(null)}
          onCambio={() => void recargarActividades()}
        />
      )}

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

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase());
}

function CitaRow({
  paciente,
  puedeGestionar,
  ocupado,
  onAsistio,
  onNoAsistio,
  onGestionar,
  onFicha,
}: {
  paciente: Paciente;
  puedeGestionar: boolean;
  ocupado: boolean;
  onAsistio: () => void;
  onNoAsistio: () => void;
  onGestionar: () => void;
  onFicha: () => void;
}) {
  const responsable = paciente.responsable_nombre || paciente.kine_asignado_nombre || "Sin profesional asignado";
  const categoria = paciente.categoria_label ?? CATEGORIA_LABELS[paciente.categoria] ?? "Sin categoría";

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-ink-black-700/50 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={onFicha} className="min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-950/25">
        <p className="truncate text-sm font-bold text-slate-950 dark:text-white" title={paciente.nombre}>
          <span
            aria-hidden="true"
            className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${TONO_CATEGORIA[paciente.categoria]?.dot ?? "bg-slate-400"}`}
          />
          <span className="tabular-nums">{formatTime(paciente.proxima_atencion)}</span>
          <span className="mx-2 text-slate-300" aria-hidden="true">|</span>
          {nombreLegible(paciente.nombre)}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-600 dark:text-ink-black-200">
          <span className="tabular-nums">{formatearRut(paciente.rut)}</span>
          {paciente.edad ? <span className="font-bold text-slate-800 dark:text-ink-black-100"> · {paciente.edad} años</span> : null}
          <span className="font-medium text-slate-500 dark:text-ink-black-300"> · {categoria}</span>
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-ink-black-300">{responsable}</p>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {puedeGestionar ? (
          <>
            <button
              type="button"
              onClick={onAsistio}
              disabled={ocupado}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-xs font-bold text-white outline-none transition-colors hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-slate-950/30 disabled:opacity-50 dark:bg-blue-500 dark:text-white"
            >
              <FiCheckCircle size={13} aria-hidden="true" />
              Asistió
            </button>
            <button
              type="button"
              onClick={onNoAsistio}
              disabled={ocupado}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:opacity-50 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200"
            >
              <FiXCircle size={13} aria-hidden="true" />
              No asistió
            </button>
            <button
              type="button"
              onClick={onGestionar}
              disabled={ocupado}
              aria-label={`Más acciones para ${paciente.nombre}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950/20 disabled:opacity-50 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200"
            >
              <FiMoreHorizontal size={15} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onFicha}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-950/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200"
          >
            <FiEye size={13} aria-hidden="true" />
            Ver ficha operativa
          </button>
        )}
      </div>
    </li>
  );
}

function GestionarCitaModal({
  paciente,
  puedeGestionar,
  accionEnCurso,
  onClose,
  onAsistencia,
  onInasistencia,
  onReagendar,
  onEliminar,
  onFicha,
}: {
  paciente: Paciente;
  puedeGestionar: boolean;
  accionEnCurso: string;
  onClose: () => void;
  onAsistencia: () => void | Promise<void>;
  onInasistencia: () => void;
  onReagendar: () => void;
  onEliminar: () => void;
  onFicha: () => void;
}) {
  const disabled = accionEnCurso.endsWith(`-${paciente.id}`);

  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-xl">
        <Dialog aria-label="Gestionar cita" className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-20px_rgba(22,24,27,0.35)] outline-none">
        <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="text-lg font-bold text-slate-950">Gestionar cita</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {paciente.nombre} · {formatDateTime(paciente.proxima_atencion)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="break-words text-sm font-black text-slate-950">{paciente.nombre}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Kine: {paciente.responsable_nombre || paciente.kine_asignado_nombre || "Sin responsable"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Hora: {formatTime(paciente.proxima_atencion)}</p>
          </div>

          {puedeGestionar ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void onAsistencia()}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-xs font-bold text-green-800 transition hover:bg-green-100 disabled:opacity-50"
              >
                <FiCheckCircle size={15} />
                Llegó / asistió
              </button>
              <button
                type="button"
                onClick={onInasistencia}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <FiXCircle size={15} />
                No asistió
              </button>
              <button
                type="button"
                onClick={onReagendar}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-3 text-xs font-bold text-white transition hover:bg-blue-600 disabled:opacity-50"
              >
                <FiEdit3 size={15} />
                Reagendar
              </button>
              <button
                type="button"
                onClick={onEliminar}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-3 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <FiTrash2 size={15} />
                Eliminar cita
              </button>
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600">
              No tienes permisos para modificar esta cita.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="ccr-control-button px-4 py-2 text-xs disabled:opacity-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onFicha}
            disabled={disabled}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <FiEye size={14} />
            Ver ficha operativa
          </button>
        </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
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
    <ModalOverlay
      isOpen
      onOpenChange={(open) => { if (!open && !loading) onClose(); }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-lg">
        <Dialog aria-label="Registrar inasistencia" className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-20px_rgba(22,24,27,0.35)] outline-none">
        <div className="border-b border-slate-200 px-5 py-4">
                    <h3 className="text-lg font-bold text-slate-950">Registrar inasistencia</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {paciente.nombre} · {formatDateTime(paciente.proxima_atencion)}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-bold text-slate-800">Motivo u observación</span>
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
              className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
            />
            Justificada
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="ccr-button-cancel"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo.trim(), justificada)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-500 px-4 text-xs font-bold text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? <FiRefreshCw className="animate-spin" size={13} /> : <FiXCircle size={13} />}
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-ink-black-600">
      <FiCalendar className="mx-auto text-slate-400" size={20} aria-hidden="true" />
      <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500 dark:text-ink-black-300">{description}</p>
    </div>
  );
}

// =============================================================================
// Agendar: buscar a quien programar por RUT o nombre
// =============================================================================

function AgendarDialog({
  pacientes,
  puedeGestionar,
  onClose,
  onElegir,
}: {
  pacientes: Paciente[];
  puedeGestionar: (p: Paciente) => boolean;
  onClose: () => void;
  onElegir: (p: Paciente) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);

  const resultados = useMemo(() => {
    const texto = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    return pacientes
      .filter((p) => (soloPendientes ? !p.proxima_atencion : true))
      .filter((p) => {
        if (!texto) return true;
        if (rut.length >= 3 && normalizeRut(p.rut).includes(rut)) return true;
        return normalizeSearchText(p.nombre).includes(texto);
      })
      .sort((a, b) => (b.dias_en_lista ?? 0) - (a.dias_en_lista ?? 0))
      .slice(0, 60);
  }, [busqueda, pacientes, soloPendientes]);

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => { if (!open) onClose(); }}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/30 px-4 pt-[10vh] backdrop-blur-[2px]"
    >
      <Modal className="w-full max-w-[640px] outline-none">
        <Dialog
          aria-label="Agendar atención"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-20px_rgba(22,24,27,0.35)] outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          <div className="border-b border-slate-200 px-5 pb-4 pt-5 dark:border-ink-black-600">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">Agendar atención</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
              Busque al paciente por RUT o nombre. La fecha y hora se definen en el paso siguiente.
            </p>
            <div className="relative mt-4">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} aria-hidden="true" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resultados.length === 1 && puedeGestionar(resultados[0])) {
                    onElegir(resultados[0]);
                  }
                }}
                placeholder="Ej: 12.345.678-9 o apellido"
                aria-label="Buscar paciente por RUT o nombre"
                className="ccr-control-input w-full pl-9 pr-3"
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-ink-black-200">
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(e) => setSoloPendientes(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
              />
              Mostrar solo pacientes sin cita
            </label>
          </div>

          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto dark:divide-ink-black-700">
            {resultados.length === 0 ? (
              <li className="px-5 py-10 text-center">
                <p className="text-sm font-bold text-slate-950 dark:text-white">Sin resultados</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Verifique el RUT o desmarque «Mostrar solo pacientes sin cita».
                </p>
              </li>
            ) : (
              resultados.map((p) => {
                const habilitado = puedeGestionar(p);
                const categoria = p.categoria_label ?? CATEGORIA_LABELS[p.categoria] ?? "Sin categoría";
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!habilitado}
                      onClick={() => onElegir(p)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-ink-black-700"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">{nombreLegible(p.nombre)}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-600 dark:text-ink-black-200">
                          <span className="tabular-nums">{formatearRut(p.rut)}</span>
                          {p.edad ? <span className="font-bold"> · {p.edad} años</span> : null}
                          <span className="font-medium text-slate-500"> · {categoria}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                          {p.proxima_atencion
                            ? `Ya tiene cita: ${formatDateTime(p.proxima_atencion)}`
                            : `${p.dias_en_lista ?? 0} días esperando`}
                          {" · "}
                          {p.responsable_nombre || p.kine_asignado_nombre || "Sin profesional asignado"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-700 dark:text-ink-black-100">
                        {habilitado ? (p.proxima_atencion ? "Reagendar" : "Agendar") : "Sin permiso"}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-semibold text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-900">
            <span>{resultados.length === 60 ? "Mostrando los primeros 60" : `${resultados.length} pacientes`}</span>
            <button type="button" onClick={onClose} className="ccr-control-button">
              Cerrar
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
