"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-aria-components";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiPhone,
  FiRefreshCw,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { animate, motion, useReducedMotion, type Variants } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import InicioMedico from "@/components/InicioMedico";
import { formatearRut } from "@/lib/rut";
import type {
  AgendaResumenDia,
  AlertasOperativas,
  DashboardResumenOperativo,
  Paciente,
} from "@/lib/types";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import { DashboardSkeleton } from "@/components/Skeleton";
import TrabajoHoy from "@/components/TrabajoHoy";
import dynamic from "next/dynamic";

// Los graficos cargan aparte para no frenar la primera pintura del inicio.
const GraficosInicio = dynamic(() => import("@/components/GraficosInicio"), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-[20px] bg-white/60 dark:bg-ink-black-800" />,
});
import { CalendarioDesplegable } from "@/components/ProximaAtencionModal";
import { TONO_CATEGORIA } from "@/components/AgendaGrid";

type GrupoAlerta = keyof AlertasOperativas;

// =============================================================================
// Helpers y contratos visuales del dashboard
// =============================================================================

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(date);
}

const ACTION_LINKS = [
  {
    title: "Lista de espera",
    href: "/lista-espera",
    description: "Revisar pacientes pendientes y asignaciones.",
    icon: FiUsers,
  },
  {
    title: "Cola de llamados",
    href: "/llamados",
    description: "Registrar contactos y rescates operativos.",
    icon: FiPhone,
  },
  {
    title: "Importar derivaciones",
    href: "/importar",
    description: "Cargar y revisar cortes mensuales.",
    icon: FiUploadCloud,
  },
  {
    title: "Estadísticas",
    href: "/analisis/estadisticas",
    description: "Ver reportes mensuales y por responsable.",
    icon: FiBarChart2,
  },
];

const RUTAS_ALERTA: Record<GrupoAlerta, string> = {
  // Cada clave corresponde a backend ALERTAS_OPERATIVAS. Cambiar nombres rompe
  // los links profundos hacia /lista-espera?alerta=...
  alta_sin_responsable: "/lista-espera?alerta=alta_sin_responsable",
  sobre_90_dias: "/lista-espera?alerta=sobre_90_dias",
  pendientes_con_1_intento: "/lista-espera?alerta=pendientes_con_1_intento",
  rescates_activos: "/lista-espera?alerta=rescates_activos",
  ingresados_sin_proxima_atencion:
    "/llamados?seccion=citar",
  posible_abandono: "/lista-espera?alerta=posible_abandono",
  telefonos_incompletos: "/lista-espera?alerta=telefonos_incompletos",
};

const GRUPOS_ACCIONES_PRIORITARIAS: GrupoAlerta[] = [
  "alta_sin_responsable",
  "sobre_90_dias",
];

const ORDEN_PRIORIDAD: Record<Paciente["prioridad"], number> = {
  ALTA: 0,
  MEDIANA: 1,
  MODERADA: 2,
  LICENCIA_MEDICA: 3,
};

const RESUMEN_VACIO: DashboardResumenOperativo = {
  lista_activa: 0,
  pendientes: 0,
  rescate: 0,
  ingresados: 0,
  sin_asignar: 0,
  asignados_activos: 0,
  mios_activos: 0,
  rescates_globales: 0,
  cola_llamados: 0,
  egresados: 0,
  agenda_hoy: 0,
};

// =============================================================================
// Componente principal
// =============================================================================

export default function InicioPage() {
  const { user } = useAuth();
  // El Médico solo opera la carga de derivaciones: su Inicio resume sus cargas.
  if (user?.rol === "MEDICO") return <InicioMedico />;
  return <InicioOperativo />;
}

function InicioOperativo() {
  const { user } = useAuth();
  const router = useRouter();
  const [resumen, setResumen] = useState<DashboardResumenOperativo>(RESUMEN_VACIO);
  const [alertas, setAlertas] = useState<AlertasOperativas | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertasLoading, setAlertasLoading] = useState(false);
  const [error, setError] = useState("");
  const [alertasError, setAlertasError] = useState("");
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mesMiniCalendario, setMesMiniCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [agendaResumen, setAgendaResumen] = useState<AgendaResumenDia[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState("");

  const cargarDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setAlertasLoading(true);
      setError("");
      setAlertasError("");
    }
    try {
      // Resumen y alertas se cargan separados para que una falla parcial no
      // deje inutilizable todo el dashboard.
      const data = await api.get<DashboardResumenOperativo>("/pacientes/dashboard-resumen/");
      setResumen(data);
      setLastUpdated(new Date());
    } catch {
      if (!silent) {
        setResumen(RESUMEN_VACIO);
        setError("No fue posible cargar el dashboard. Intenta nuevamente.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }

    try {
      const data = await api.get<AlertasOperativas>("/pacientes/alertas-operativas/");
      setAlertas(data);
    } catch {
      setAlertas(null);
      if (!silent) {
        setAlertasError("No se pudieron cargar las alertas operativas.");
      }
    } finally {
      if (!silent) {
        setAlertasLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    void cargarDashboard();
  }, [cargarDashboard]);

  useEffect(() => {
    if (!user) return;
    // Refresco liviano de contadores operativos. No reemplaza eventos
    // `ccr:refresh-sidebar`, solo mantiene el dashboard vigente.
    const intervalId = window.setInterval(() => {
      void cargarDashboard({ silent: true });
    }, 45000);

    return () => window.clearInterval(intervalId);
  }, [cargarDashboard, user]);

  const cargarAgendaResumen = useCallback(async () => {
    if (!user) return;
    setAgendaLoading(true);
    setAgendaError("");
    try {
      const data = await api.get<AgendaResumenDia[]>(
        `/pacientes/agenda-resumen/?mes=${toMonthKey(mesMiniCalendario)}`,
      );
      setAgendaResumen(data);
    } catch {
      setAgendaResumen([]);
      setAgendaError("No se pudo cargar la agenda del mes.");
    } finally {
      setAgendaLoading(false);
    }
  }, [mesMiniCalendario, user]);

  useEffect(() => {
    void cargarAgendaResumen();
  }, [cargarAgendaResumen]);

  const accionesPrioritarias = useMemo(() => {
    if (!alertas) return [];
    const items = new Map<
      number,
      { paciente: Paciente; grupo: GrupoAlerta }
    >();
    GRUPOS_ACCIONES_PRIORITARIAS.forEach((key) => {
      alertas[key].pacientes.forEach((paciente) => {
        if (paciente.estado === "PENDIENTE" && !items.has(paciente.id)) {
          items.set(paciente.id, { paciente, grupo: key });
        }
      });
    });
    return Array.from(items.values())
      .sort((a, b) => {
        const prioridadA = ORDEN_PRIORIDAD[a.paciente.prioridad] ?? 99;
        const prioridadB = ORDEN_PRIORIDAD[b.paciente.prioridad] ?? 99;
        if (prioridadA !== prioridadB) return prioridadA - prioridadB;
        return b.paciente.dias_en_lista - a.paciente.dias_en_lista;
      })
      .slice(0, 15);
  }, [alertas]);

  const getRutaTablaPaciente = useCallback((grupo: GrupoAlerta, paciente: Paciente) => {
    const params = new URLSearchParams();
    params.set("alerta", grupo);
    params.set("search", formatearRut(paciente.rut));
    return `/lista-espera?${params.toString()}`;
  }, []);

  const handleVerGrupo = useCallback(
    (grupo: GrupoAlerta) => {
      if (grupo === "rescates_activos") {
        router.push("/llamados");
        return;
      }
      router.push(RUTAS_ALERTA[grupo]);
    },
    [router],
  );

  const pageVariants: Variants = {
    initial: { opacity: 0, y: 8 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.04 },
    },
  };
  const seccionVariants: Variants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
  };

  const horaActual = new Date().getHours();
  const saludo =
    horaActual < 6 ? "Buenas noches" : horaActual < 12 ? "Buenos días" : horaActual < 20 ? "Buenas tardes" : "Buenas noches";
  const primerNombre = (user?.nombre ?? "").split(" ")[0] || "equipo CCR";
  const fechaHoy = (() => {
    const texto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  })();

  if (loading) return <DashboardSkeleton />;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="ccr-dashboard-content space-y-5"
    >
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500 dark:text-ink-black-300">{fechaHoy}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {saludo}, {primerNombre}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-ink-black-200">
              Hoy hay{" "}
              <span className="font-bold text-slate-950 dark:text-white">
                {resumen.agenda_hoy} cita{resumen.agenda_hoy !== 1 ? "s" : ""}
              </span>{" "}
              programada{resumen.agenda_hoy !== 1 ? "s" : ""} y{" "}
              <span className="font-bold text-slate-950 dark:text-white">
                {resumen.cola_llamados} paciente{resumen.cola_llamados !== 1 ? "s" : ""}
              </span>{" "}
              por contactar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs font-medium text-slate-500 sm:inline">
              Actualizado{" "}
              {lastUpdated?.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "-"}
            </span>
            <Button
              onPress={() => {
                void cargarDashboard();
                void cargarAgendaResumen();
              }}
              className="ccr-control-button outline-none"
            >
              <FiRefreshCw size={13} aria-hidden="true" />
              Actualizar
            </Button>
          </div>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          <Kpi
            href="/lista-espera"
            icono={FiClock}
            tono="blue"
            label="En lista de espera"
            value={resumen.pendientes}
            detalle={`${resumen.sin_asignar} sin profesional`}
            proporcion={resumen.pendientes ? resumen.sin_asignar / resumen.pendientes : 0}
            leyendaProporcion="sin asignar"
          />
          <Kpi
            href="/calendario"
            icono={FiCalendar}
            tono="green"
            label="Citas de hoy"
            value={resumen.agenda_hoy}
            detalle={resumen.agenda_hoy ? "Ver agenda" : "Sin citas"}
          />
          <Kpi
            href="/mis-pacientes"
            icono={FiActivity}
            tono="violet"
            label="En atención"
            value={resumen.ingresados}
            detalle={user?.rol === "KINE" ? `${resumen.mios_activos} a tu cargo` : "En tratamiento"}
          />
          <Kpi
            href="/llamados"
            icono={FiPhone}
            tono="amber"
            label="Por contactar"
            value={resumen.cola_llamados}
            detalle="En cola de llamados"
          />
          <Kpi
            href="/llamados"
            icono={FiAlertTriangle}
            tono="red"
            label="En rescate"
            value={resumen.rescate}
            detalle="Nuevo contacto"
          />
        </motion.div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <motion.section variants={seccionVariants} className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="ccr-panel flex h-full flex-col p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-[color:var(--ink)]">
                  Acciones prioritarias
                </h2>
                <p className="text-xs text-slate-500 dark:!text-slate-400">
                  Pacientes según gravedad y tiempo de espera.
                </p>
              </div>
              <FiAlertTriangle className="text-ink-black-400" size={18} aria-hidden="true" />
            </div>

            {accionesPrioritarias.length === 0 ? (
              <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-4 text-sm font-semibold text-green-800 dark:!border-green-900/60 dark:!bg-green-950/30 dark:!text-green-200">
                Sin acciones pendientes por ahora.
              </div>
            ) : (
              <div className="max-h-[380px] min-h-0 flex-1 divide-y divide-[color:var(--border-table-row)] overflow-y-auto pr-1 xl:max-h-none xl:basis-0">
                {accionesPrioritarias.map(({ paciente, grupo }) => (
                  <div
                    key={paciente.id}
                    className="flex w-full flex-col gap-2 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-ink-black-700/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONO_CATEGORIA[paciente.categoria]?.dot ?? "bg-slate-400"}`}
                      />
                      <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:!text-slate-100">
                        {paciente.nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:!text-slate-400">
                        {formatearRut(paciente.rut)}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-600 dark:!text-slate-300">
                        {/* Sin diagnostico: es dato sensible y queda en la ficha operativa. */}
                        {[
                          paciente.categoria_label ?? CATEGORIA_LABELS[paciente.categoria] ?? "Sin categoría",
                          PRIORIDAD_LABELS[paciente.prioridad] && `Prioridad ${PRIORIDAD_LABELS[paciente.prioridad].toLowerCase()}`,
                          paciente.dias_en_lista != null && `${paciente.dias_en_lista} días en lista`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Link
                        href={getRutaTablaPaciente(grupo, paciente)}
                        className="ccr-control-button !h-8 !text-[11px]"
                      >
                        Ver en lista
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="xl:col-span-4">
          <MiniCalendario
            mes={mesMiniCalendario}
            agenda={agendaResumen}
            loading={agendaLoading}
            error={agendaError}
            onMesChange={setMesMiniCalendario}
            onSelectDate={(dateKey) => router.push(`/calendario?fecha=${dateKey}`)}
          />
        </div>
      </motion.section>

      <motion.div variants={seccionVariants}>
        <GraficosInicio />
      </motion.div>

      <motion.section variants={seccionVariants} className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <TrabajoHoy
            alertas={alertas}
            loading={alertasLoading}
            onVerPaciente={setPacienteSeleccionado}
            onVerGrupo={handleVerGrupo}
          />
          {alertasError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {alertasError}
            </p>
          )}
        </div>
        <div className="xl:col-span-4">
          <div className="ccr-panel p-5">
            <h2 className="text-base font-extrabold text-[color:var(--ink)]">Accesos</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {ACTION_LINKS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex items-center gap-3 rounded-2xl px-2 py-2 outline-none transition hover:bg-[color:var(--bg-elevated)] focus-visible:ring-2 focus-visible:ring-blue-600/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-500 group-hover:text-white dark:bg-blue-500/15 dark:text-blue-200">
                    <card.icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[color:var(--ink)]">{card.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{card.description}</p>
                  </div>
                  <FiArrowRight className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {pacienteSeleccionado && user && (
        <FichaPaciente
          paciente={pacienteSeleccionado}
          usuario={user}
          onClose={() => setPacienteSeleccionado(null)}
          onRefresh={() => void cargarDashboard()}
        />
      )}
    </motion.div>
  );
}

const kpiVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } },
};

function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  const shown = reduceMotion ? value : display;
  return <>{shown.toLocaleString("es-CL")}</>;
}

const TONOS_KPI: Record<"blue" | "green" | "violet" | "amber" | "red", { icono: string; barra: string; numero: string }> = {
  blue: { icono: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200", barra: "bg-blue-500", numero: "text-blue-600 dark:text-blue-300" },
  green: { icono: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-200", barra: "bg-green-500", numero: "text-slate-950 dark:text-white" },
  violet: { icono: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-200", barra: "bg-violet-500", numero: "text-slate-950 dark:text-white" },
  amber: { icono: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200", barra: "bg-amber-500", numero: "text-slate-950 dark:text-white" },
  red: { icono: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200", barra: "bg-red-500", numero: "text-slate-950 dark:text-white" },
};

function Kpi({
  href,
  icono: Icono,
  tono,
  label,
  value,
  detalle,
  proporcion,
  leyendaProporcion,
}: {
  href: string;
  icono: IconType;
  tono: keyof typeof TONOS_KPI;
  label: string;
  value: number;
  detalle: string;
  proporcion?: number;
  leyendaProporcion?: string;
}) {
  const t = TONOS_KPI[tono];
  const pct = Math.round(Math.min(Math.max(proporcion ?? 0, 0), 1) * 100);
  return (
    <motion.div variants={kpiVariants}>
      <Link
        href={href}
        title={detalle}
        className="group relative flex h-full items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_24px_-16px_rgba(47,99,214,0.35)] focus-visible:ring-2 focus-visible:ring-blue-500/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-ink-black-600 dark:bg-ink-black-800"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.icono}`}>
          <Icono size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{label}</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-xl font-bold leading-tight tabular-nums ${t.numero}`}>
              <AnimatedNumber value={value} />
            </span>
            <span className="truncate text-[11px] font-medium text-slate-400">{detalle}</span>
          </span>
        </span>
        <FiArrowRight
          size={14}
          className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
          aria-hidden="true"
        />
        {proporcion !== undefined && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-slate-100 dark:bg-ink-black-700" aria-label={`${pct}% ${leyendaProporcion ?? ""}`}>
            <motion.span
              className={`block h-full ${t.barra}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
        )}
      </Link>
    </motion.div>
  );
}

function MiniCalendario({
  mes,
  agenda,
  loading,
  error,
  onMesChange,
  onSelectDate,
}: {
  mes: Date;
  agenda: AgendaResumenDia[];
  loading: boolean;
  error: string;
  onMesChange: (date: Date) => void;
  onSelectDate: (dateKey: string) => void;
}) {
  const agendaPorDia = useMemo(
    () => new Map(agenda.map((item) => [item.fecha, item.total])),
    [agenda],
  );
  const totalMes = agenda.reduce((acc, item) => acc + item.total, 0);
  const hoyKey = toDateKey(new Date());

  return (
    <section className="ccr-panel flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-ink-black-600">
        <div>
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">Agenda del mes</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
            {loading ? "Cargando citas…" : (
              <>
                <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{totalMes}</span>{" "}
                cita{totalMes !== 1 ? "s" : ""} programada{totalMes !== 1 ? "s" : ""} en {formatMonthYear(mes)}
              </>
            )}
          </p>
        </div>
        <Link
          href="/calendario"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-blue-600 outline-none transition-colors hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-blue-300"
        >
          Abrir agenda
        </Link>
      </div>
      {error ? (
        <p className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{error}</p>
      ) : (
        <CalendarioDesplegable
          valor={hoyKey}
          diasConCitas={agendaPorDia}
          permitirPasado
          className={`w-full p-3 transition-opacity ${loading ? "opacity-60" : ""}`}
          leyenda="Días con citas (toca uno para abrirlo)"
          textoHoy="Hoy"
          onMesChange={onMesChange}
          onElegir={onSelectDate}
        />
      )}
    </section>
  );
}
