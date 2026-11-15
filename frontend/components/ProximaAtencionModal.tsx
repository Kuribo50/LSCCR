"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Paciente, Usuario } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { unwrapResults } from "@/lib/swr";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiPhone,
  FiRefreshCw,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { TONO_CATEGORIA } from "./AgendaGrid";

interface Props {
  paciente: Paciente;
  fechaInicial?: string;
  /** Otras citas conocidas (p. ej. desde la Agenda) para mostrar ocupacion y choques. */
  agenda?: Paciente[];
  onClose: () => void;
  onConfirm: (fechaHora: string, observacion?: string) => Promise<void>;
  onClear?: () => Promise<void>;
  successMessage?: string;
  clearSuccessMessage?: string;
}

// -----------------------------------------------------------------------------
// Utilidades de fecha (todo en hora local)
// -----------------------------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromKey(key: string) {
  return new Date(`${key}T00:00:00`);
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${toKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fechaHoraLocalDefault() {
  const now = new Date();
  return `${toKey(now)}T${pad(Math.min(Math.max(now.getHours() + 1, 8), 17))}:00`;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaLarga(key: string) {
  if (!key) return "Elegir fecha";
  return capitalizar(
    new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(fromKey(key)),
  );
}

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase());
}

const TIPOS_ATENCION = ["Sesión de tratamiento", "Ingreso", "Control", "Reevaluación"] as const;
const HORAS_RELOJ = Array.from({ length: 12 }, (_, i) => 7 + i); // 07:00 a 18:00 en la esfera
const MINUTOS = ["00", "15", "30", "45"];

// Cierra un desplegable al hacer clic fuera o al presionar Esc.
function useCerrarFuera(abierto: boolean, ref: React.RefObject<HTMLElement | null>, cerrar: () => void) {
  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [abierto, ref, cerrar]);
}

// -----------------------------------------------------------------------------
// Calendario desplegable
// -----------------------------------------------------------------------------

export function CalendarioDesplegable({
  valor,
  diasConCitas,
  onElegir,
  permitirPasado = false,
  leyenda = "Días con citas del profesional",
  className = "w-[300px] p-3",
  onMesChange,
  textoHoy = "Ir a hoy",
}: {
  valor: string;
  diasConCitas: Map<string, number>;
  onElegir: (key: string) => void;
  permitirPasado?: boolean;
  leyenda?: string;
  className?: string;
  /** Avisa cuando se cambia de mes (p. ej. para cargar las citas de ese mes). */
  onMesChange?: (primerDia: Date) => void;
  textoHoy?: string;
}) {
  const base = valor ? fromKey(valor) : new Date();
  const [mes, setMes] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const hoy = toKey(new Date());
  const offset = (mes.getDay() + 6) % 7;
  const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: Array<Date | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: total }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1)),
  ];

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const nuevo = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
            setMes(nuevo);
            onMesChange?.(nuevo);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
          aria-label="Mes anterior"
        >
          <FiChevronLeft size={15} />
        </button>
        <p className="text-sm font-bold text-slate-950 dark:text-white">
          {capitalizar(new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(mes))}
        </p>
        <button
          type="button"
          onClick={() => {
            const nuevo = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
            setMes(nuevo);
            onMesChange?.(nuevo);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
          aria-label="Mes siguiente"
        >
          <FiChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-bold text-slate-500 dark:text-ink-black-300">
            {d}
          </span>
        ))}
        {celdas.map((dia, i) => {
          if (!dia) return <span key={`v-${i}`} />;
          const key = toKey(dia);
          const activo = key === valor;
          const pasado = !permitirPasado && key < hoy;
          const citas = diasConCitas.get(key) ?? 0;
          return (
            <button
              key={key}
              type="button"
              disabled={pasado}
              onClick={() => onElegir(key)}
              aria-pressed={activo}
              aria-label={`${fechaLarga(key)}${citas ? `, ${citas} cita${citas !== 1 ? "s" : ""}` : ""}`}
              className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[13px] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/25 disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-ink-black-600 ${
                activo
                  ? "bg-blue-500 font-bold text-white dark:bg-blue-500 dark:text-white"
                  : citas > 0
                    ? `bg-blue-50 font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200 ${key === hoy ? "ring-1 ring-inset ring-blue-500" : ""}`
                    : key === hoy
                    ? "font-bold text-slate-950 ring-1 ring-inset ring-blue-500 dark:text-white dark:ring-blue-400"
                    : dia.getDay() === 0
                      ? "font-medium text-slate-400 hover:bg-slate-100 dark:hover:bg-ink-black-700"
                      : "font-semibold text-slate-700 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
              }`}
            >
              {dia.getDate()}
              {citas > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
                    activo ? "bg-white text-blue-600 ring-1 ring-blue-500" : "bg-blue-500 text-white"
                  }`}
                >
                  {citas}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-ink-black-700">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <span className="h-3 w-3 rounded bg-blue-50 ring-1 ring-blue-200" aria-hidden="true" /> {leyenda}
        </span>
        <button type="button" onClick={() => onElegir(hoy)} className="rounded-md px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-300">
          {textoHoy}
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reloj desplegable: esfera con horas laborales y minutos al costado
// -----------------------------------------------------------------------------

function RelojDesplegable({
  valor,
  ocupadas,
  onElegir,
}: {
  valor: string; // "HH:MM"
  ocupadas: Set<string>;
  onElegir: (hhmm: string, cerrar: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [h, m] = valor ? valor.split(":") : ["09", "00"];
  const hora = Number(h);
  const indice = Math.min(Math.max(hora - 7, 0), 11);
  const R = 84;

  return (
    <div className="flex gap-4 p-4">
      {/* Esfera */}
      <div className="relative h-[208px] w-[208px] shrink-0 rounded-full bg-slate-100 dark:bg-ink-black-700">
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-[2px] origin-left rounded-full bg-blue-500 dark:bg-blue-500"
          style={{ width: R - 14 }}
          animate={{ rotate: indice * 30 - 90 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24 }}
        />
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500 dark:bg-blue-500" />
        {HORAS_RELOJ.map((hh, i) => {
          const ang = ((i * 30 - 90) * Math.PI) / 180;
          const x = 104 + R * Math.cos(ang);
          const y = 104 + R * Math.sin(ang);
          const activa = hh === hora;
          const colacion = hh === 13;
          return (
            <button
              key={hh}
              type="button"
              onClick={() => onElegir(`${pad(hh)}:${m}`, false)}
              aria-pressed={activa}
              aria-label={`${pad(hh)} horas${colacion ? ", horario de colación" : ""}`}
              className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[13px] font-bold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/30 ${
                activa
                  ? "bg-blue-500 text-white dark:bg-blue-500 dark:text-white"
                  : colacion
                    ? "text-slate-400 hover:bg-white dark:hover:bg-ink-black-600"
                    : "text-slate-700 hover:bg-white dark:text-ink-black-100 dark:hover:bg-ink-black-600"
              }`}
              style={{ left: x, top: y }}
            >
              {hh}
            </button>
          );
        })}
      </div>

      {/* Minutos y lectura digital */}
      <div className="flex w-[132px] flex-col">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">Hora elegida</p>
        <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 dark:text-white">
          {pad(hora)}:{m}
        </p>
        <p className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">Minutos</p>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {MINUTOS.map((mm) => {
            const hhmm = `${pad(hora)}:${mm}`;
            const activo = mm === m;
            const ocupado = ocupadas.has(hhmm);
            return (
              <button
                key={mm}
                type="button"
                onClick={() => onElegir(hhmm, true)}
                aria-pressed={activo}
                title={ocupado ? "El profesional ya tiene una cita a esta hora" : undefined}
                className={`relative h-9 rounded-lg text-xs font-bold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
                  activo
                    ? "bg-blue-500 text-white dark:bg-blue-500 dark:text-white"
                    : ocupado
                      ? "border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200"
                }`}
              >
                :{mm}
              </button>
            );
          })}
        </div>
        <p className="mt-auto pt-3 text-[11px] font-medium leading-snug text-slate-500 dark:text-ink-black-300">
          <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-amber-300 bg-amber-50 align-middle" aria-hidden="true" />
          Horario con otra cita
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Ventana principal
// -----------------------------------------------------------------------------

const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  initial: { opacity: 0, scale: 0.97, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, damping: 24, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.98, y: 6 },
};

export default function ProximaAtencionModal({
  paciente,
  fechaInicial,
  agenda,
  onClose,
  onConfirm,
  onClear,
  successMessage = "Atención programada correctamente.",
  clearSuccessMessage = "Atención eliminada correctamente.",
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [fechaHora, setFechaHora] = useState(
    toInputDateTime(fechaInicial) || toInputDateTime(paciente.proxima_atencion) || fechaHoraLocalDefault(),
  );
  const [tipo, setTipo] = useState<(typeof TIPOS_ATENCION)[number]>(
    paciente.estado === "INGRESADO" ? "Sesión de tratamiento" : "Ingreso",
  );
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [abierto, setAbierto] = useState<"fecha" | "hora" | null>(null);
  const fechaRef = useRef<HTMLDivElement | null>(null);
  const horaRef = useRef<HTMLDivElement | null>(null);
  useCerrarFuera(abierto === "fecha", fechaRef, () => setAbierto(null));
  useCerrarFuera(abierto === "hora", horaRef, () => setAbierto(null));

  const fecha = fechaHora.slice(0, 10);
  const horaElegida = fechaHora.slice(11, 16);
  const esReagendar = Boolean(paciente.proxima_atencion);
  const sinProfesional = !paciente.kine_asignado;
  const esAdmin = user?.rol === "ADMIN";
  const [kines, setKines] = useState<Usuario[]>([]);
  const [kineElegido, setKineElegido] = useState<number | "">("");

  // El backend exige profesional asignado para agendar. Solo el admin puede
  // elegir a otro kinesiologo; la lista de usuarios es exclusiva de ADMIN.
  useEffect(() => {
    if (!sinProfesional || !esAdmin) return;
    let activo = true;
    api
      .get<Usuario[]>("/usuarios/")
      .then((data) => {
        if (!activo) return;
        const lista = unwrapResults<Usuario>(data).filter((u) => u.rol === "KINE" && u.is_active !== false);
        setKines(lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      })
      .catch(() => {
        if (activo) setKines([]);
      });
    return () => {
      activo = false;
    };
  }, [sinProfesional, esAdmin]);

  const kineNombreElegido = kines.find((k) => k.id === kineElegido)?.nombre ?? "";
  const profesional =
    paciente.responsable_nombre ||
    paciente.kine_asignado_nombre ||
    (sinProfesional && !esAdmin && user?.rol === "KINE" ? user.nombre : kineNombreElegido) ||
    "";
  const tono = TONO_CATEGORIA[paciente.categoria];
  const categoria = paciente.categoria_label ?? CATEGORIA_LABELS[paciente.categoria] ?? "Sin categoría";

  // Citas del mismo profesional (excluye a este paciente).
  const citasProfesional = useMemo(
    () =>
      (agenda ?? []).filter(
        (p) =>
          p.id !== paciente.id &&
          p.proxima_atencion &&
          profesional &&
          (p.responsable_nombre || p.kine_asignado_nombre) === profesional,
      ),
    [agenda, paciente.id, profesional],
  );
  const diasConCitas = useMemo(() => {
    const mapa = new Map<string, number>();
    citasProfesional.forEach((p) => {
      const k = toKey(new Date(p.proxima_atencion!));
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    });
    return mapa;
  }, [citasProfesional]);
  const citasDelDia = useMemo(
    () =>
      citasProfesional
        .filter((p) => toKey(new Date(p.proxima_atencion!)) === fecha)
        .sort((a, b) => new Date(a.proxima_atencion!).getTime() - new Date(b.proxima_atencion!).getTime()),
    [citasProfesional, fecha],
  );
  const horasOcupadas = useMemo(
    () => new Set(citasDelDia.map((p) => toInputDateTime(p.proxima_atencion).slice(11, 16))),
    [citasDelDia],
  );
  const choque = citasDelDia.find((p) => toInputDateTime(p.proxima_atencion).slice(11, 16) === horaElegida);

  async function handleConfirm() {
    if (!fecha || !horaElegida) {
      setError("Elige fecha y hora para continuar.");
      return;
    }
    if (sinProfesional && esAdmin && !kineElegido) {
      setError("Elige el profesional que atenderá al paciente antes de agendar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (sinProfesional) {
        if (esAdmin) {
          await api.patch(`/pacientes/${paciente.id}/`, { kine_asignado: kineElegido });
        } else if (user?.rol === "KINE") {
          await api.post(`/pacientes/${paciente.id}/asignar/`);
        }
      }
      const nota = [tipo, observacion.trim()].filter(Boolean).join(" — ");
      await onConfirm(new Date(fechaHora).toISOString(), nota);
      toast.success(sinProfesional ? `${successMessage} Profesional asignado: ${profesional}.` : successMessage);
      onClose();
    } catch (e: unknown) {
      // La API lanza el cuerpo de la respuesta ({ detail }); un 403 de DRF dice "permiso"/"permission".
      const detalle = String((e as { detail?: unknown })?.detail ?? "");
      const sinPermiso = /permis/i.test(detalle);
      const message =
        sinPermiso
          ? user?.rol === "KINE"
            ? "Solo puedes agendar a tus propios pacientes. Este paciente tiene otro profesional asignado."
            : "No se pudo agendar: el paciente debe estar pendiente, en rescate o ingresado, y tener un profesional asignado."
          : getErrorMessage(e, "No se pudo guardar la cita.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!onClear) return;
    setLoading(true);
    setError("");
    try {
      await onClear();
      toast.success(clearSuccessMessage);
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "No se pudo quitar la cita.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const campo =
    "flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/25";
  const desplegable =
    "absolute left-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800";

  return (
    <motion.div
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/30 px-4 pb-6 pt-[6vh] backdrop-blur-[2px]"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !loading && !abierto) onClose();
      }}
    >
      <motion.div
        variants={modalVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby="programar-titulo"
        className="relative w-full max-w-[880px] rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-20px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-ink-black-600">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white dark:bg-blue-500 dark:text-white">
              <FiCalendar size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="programar-titulo" className="text-lg font-bold text-slate-950 dark:text-white">
                {esReagendar ? "Reagendar atención" : "Agendar atención"}
              </h3>
              <p className="truncate text-sm font-bold text-slate-800 dark:text-ink-black-100">
                {nombreLegible(paciente.nombre)}
                <span className="font-semibold text-slate-500 dark:text-ink-black-300">
                  {" · "}
                  <span className="tabular-nums">{formatearRut(paciente.rut)}</span>
                  {paciente.edad ? <span className="font-bold text-slate-700 dark:text-ink-black-100"> · {paciente.edad} años</span> : null}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950/20 dark:border-ink-black-600 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
            aria-label="Cerrar"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Formulario */}
          <div className="space-y-5 px-6 py-5">
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* Fecha */}
              <div ref={fechaRef} className="relative">
                <p className="mb-1.5 text-sm font-bold text-slate-800 dark:text-ink-black-100">Fecha</p>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={abierto === "fecha"}
                  onClick={() => setAbierto(abierto === "fecha" ? null : "fecha")}
                  className={`${campo} ${
                    abierto === "fecha"
                      ? "border-slate-950 bg-white dark:border-white dark:bg-ink-black-800"
                      : "border-slate-200 bg-slate-50 hover:bg-white dark:border-ink-black-600 dark:bg-ink-black-900"
                  } text-slate-950 dark:text-white`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FiCalendar size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="truncate">{fechaLarga(fecha)}</span>
                  </span>
                  <FiChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${abierto === "fecha" ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {abierto === "fecha" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className={desplegable}
                    >
                      <CalendarioDesplegable
                        valor={fecha}
                        diasConCitas={diasConCitas}
                        onElegir={(key) => {
                          setFechaHora(`${key}T${horaElegida || "09:00"}`);
                          setAbierto("hora");
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Hora */}
              <div ref={horaRef} className="relative">
                <p className="mb-1.5 text-sm font-bold text-slate-800 dark:text-ink-black-100">Hora</p>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={abierto === "hora"}
                  onClick={() => setAbierto(abierto === "hora" ? null : "hora")}
                  className={`${campo} ${
                    abierto === "hora"
                      ? "border-slate-950 bg-white dark:border-white dark:bg-ink-black-800"
                      : "border-slate-200 bg-slate-50 hover:bg-white dark:border-ink-black-600 dark:bg-ink-black-900"
                  } text-slate-950 dark:text-white`}
                >
                  <span className="flex items-center gap-2">
                    <FiClock size={15} className="text-slate-500" aria-hidden="true" />
                    <span className="tabular-nums">{horaElegida || "Elegir hora"}</span>
                  </span>
                  <FiChevronDown size={15} className={`text-slate-500 transition-transform ${abierto === "hora" ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {abierto === "hora" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className={`${desplegable} sm:left-auto sm:right-0`}
                    >
                      <RelojDesplegable
                        valor={horaElegida}
                        ocupadas={horasOcupadas}
                        onElegir={(hhmm, cerrar) => {
                          setFechaHora(`${fecha}T${hhmm}`);
                          if (cerrar) setAbierto(null);
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {sinProfesional && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-ink-black-600 dark:bg-ink-black-900">
                <p className="text-sm font-bold text-slate-800 dark:text-ink-black-100">Profesional</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  El paciente no tiene profesional asignado. Debe asignarse uno para agendar la atención.
                </p>
                {esAdmin ? (
                  <select
                    value={kineElegido}
                    onChange={(e) => setKineElegido(e.target.value ? Number(e.target.value) : "")}
                    className="ccr-control-input mt-2 w-full bg-white px-3 font-semibold dark:bg-ink-black-800"
                    aria-label="Profesional que atenderá"
                  >
                    <option value="">Seleccionar kinesiólogo</option>
                    {kines.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nombre}
                      </option>
                    ))}
                  </select>
                ) : user?.rol === "KINE" ? (
                  <p className="mt-2 text-xs font-bold text-slate-800 dark:text-ink-black-100">
                    Al confirmar quedará asignado a ti ({user.nombre}).
                  </p>
                ) : null}
              </div>
            )}

            {choque && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <FiAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                {profesional} ya tiene a {nombreLegible(choque.nombre)} a las {horaElegida}. Puede mantener la hora o seleccionar otra.
              </p>
            )}

            {/* Tipo de atencion */}
            <div>
              <p className="mb-1.5 text-sm font-bold text-slate-800 dark:text-ink-black-100">Tipo de atención</p>
              <div role="radiogroup" aria-label="Tipo de atención" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-ink-black-700 sm:grid-cols-4">
                {TIPOS_ATENCION.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => setTipo(t)}
                    className={`relative rounded-lg px-2 py-2 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-950/25 ${
                      tipo === t ? "text-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-ink-black-300"
                    }`}
                  >
                    {tipo === t && (
                      <motion.span
                        layoutId="tipo-atencion-activo"
                        aria-hidden="true"
                        className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-ink-black-600"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative">{t === "Sesión de tratamiento" ? "Sesión" : t}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-bold text-slate-800 dark:text-ink-black-100">
                Observación <span className="font-medium text-slate-500">(opcional)</span>
              </span>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                className="ccr-control-input mt-1.5 w-full !rounded-xl px-3 py-2.5 text-sm"
                placeholder={esReagendar ? "Motivo del cambio de horario" : "Indicaciones para el profesional"}
              />
              <span className="mt-1 block text-[11px] font-medium text-slate-500">
                Se guarda como «{tipo}{observacion.trim() ? ` — ${observacion.trim().slice(0, 40)}${observacion.trim().length > 40 ? "…" : ""}` : ""}».
              </span>
            </label>
          </div>

          {/* Resumen del paciente y agenda del profesional */}
          <aside className="space-y-4 border-t border-slate-200 bg-slate-50 px-5 py-5 dark:border-ink-black-600 dark:bg-ink-black-900 md:border-l md:border-t-0">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-ink-black-300">Paciente</p>
              <dl className="mt-2 space-y-2 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="font-medium text-slate-500">Categoría</dt>
                  <dd className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-bold text-slate-800 dark:text-ink-black-100 ${tono?.bg ?? ""} ${tono?.border ?? ""}`}>
                    <span className={`h-2 w-2 rounded-full ${tono?.dot ?? "bg-slate-400"}`} aria-hidden="true" />
                    {categoria}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">Prioridad</dt>
                  <dd className="font-bold text-slate-950 dark:text-white">{PRIORIDAD_LABELS[paciente.prioridad] ?? paciente.prioridad}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">En lista</dt>
                  <dd className="font-bold tabular-nums text-slate-950 dark:text-white">{paciente.dias_en_lista ?? 0} días</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">Profesional</dt>
                  <dd className="truncate font-bold text-slate-950 dark:text-white">{profesional || "Sin asignar"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-slate-500">Inasistencias</dt>
                  <dd className={`font-bold tabular-nums ${(paciente.n_inasistencias ?? 0) >= 2 ? "text-red-700 dark:text-red-300" : "text-slate-950 dark:text-white"}`}>
                    {paciente.n_inasistencias ?? 0}
                  </dd>
                </div>
                {paciente.telefono && (
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium text-slate-500">Teléfono</dt>
                    <dd>
                      <a href={`tel:${paciente.telefono}`} className="inline-flex items-center gap-1 font-bold tabular-nums text-slate-950 hover:underline dark:text-white">
                        <FiPhone size={12} aria-hidden="true" />
                        {paciente.telefono}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {esReagendar && (
                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-ink-black-800 dark:text-ink-black-100">
                  Cita actual: {fechaLarga(toInputDateTime(paciente.proxima_atencion).slice(0, 10))},{" "}
                  {toInputDateTime(paciente.proxima_atencion).slice(11, 16)}
                </p>
              )}
            </div>

            {agenda && profesional && (
              <div className="border-t border-slate-200 pt-4 dark:border-ink-black-600">
                <p className="text-xs font-bold text-slate-500 dark:text-ink-black-300">
                  Agenda de {profesional.split(" ")[0]} · {fechaLarga(fecha).split(",")[0]}
                </p>
                {citasDelDia.length === 0 ? (
                  <p className="mt-2 text-xs font-medium text-slate-500">Sin otras citas programadas.</p>
                ) : (
                  <ul className="mt-2 max-h-[180px] space-y-1 overflow-y-auto">
                    {citasDelDia.map((p) => {
                      const hhmm = toInputDateTime(p.proxima_atencion).slice(11, 16);
                      const mismaHora = hhmm === horaElegida;
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                            mismaHora ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" : "text-slate-700 dark:text-ink-black-200"
                          }`}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_CATEGORIA[p.categoria]?.dot ?? "bg-slate-400"}`} aria-hidden="true" />
                          <span className="font-bold tabular-nums">{hhmm}</span>
                          <span className="truncate font-medium">{nombreLegible(p.nombre)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* Pie */}
        <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-200 bg-white px-6 py-4 dark:border-ink-black-600 dark:bg-ink-black-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={loading} className="ccr-button-cancel">
              Cancelar
            </button>
            {onClear && (
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-red-700 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600/30 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <FiTrash2 size={13} aria-hidden="true" /> Quitar cita
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-semibold text-slate-500 sm:block">
              {fechaLarga(fecha)}{horaElegida ? `, ${horaElegida}` : ""}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || !fecha || !horaElegida || (sinProfesional && esAdmin && !kineElegido)}
              className="ccr-button-refresh outline-none focus-visible:ring-2 focus-visible:ring-slate-950/30 disabled:opacity-50"
            >
              {loading ? (
                <FiRefreshCw className="animate-spin motion-reduce:animate-none" size={14} aria-hidden="true" />
              ) : (
                <FiCheck size={15} aria-hidden="true" />
              )}
              {loading
                ? "Guardando…"
                : esReagendar
                  ? "Confirmar cambio"
                  : sinProfesional && !esAdmin
                    ? "Asignármelo y agendar"
                    : sinProfesional
                      ? "Asignar y agendar"
                      : "Confirmar cita"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
