"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiPhone,
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
import { toDateKey } from "@/lib/utils";

type GrupoAlerta = keyof AlertasOperativas;

// =============================================================================
// Helpers y contratos visuales del dashboard
// =============================================================================

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
  const [alertasLoading, setAlertasLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertasError, setAlertasError] = useState("");
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [mesMiniCalendario, setMesMiniCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [agendaResumen, setAgendaResumen] = useState<AgendaResumenDia[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaError, setAgendaError] = useState("");

  const traerDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;
    const silent = options?.silent ?? false;
    try {
      // Resumen y alertas se cargan separados para que una falla parcial no
      // deje inutilizable todo el dashboard.
      const data = await api.get<DashboardResumenOperativo>("/pacientes/dashboard-resumen/");
      setResumen(data);
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
      const data = await api.get<AlertasOperativas>("/pacientes/alertas-operativas/?limite=30");
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

  const cargarDashboard = useCallback(async () => {
    setLoading(true);
    setAlertasLoading(true);
    setError("");
    setAlertasError("");
    await traerDashboard();
  }, [traerDashboard]);

  useCargaAlMontar(traerDashboard);

  useEffect(() => {
    if (!user) return;
    // Refresco liviano de contadores operativos. No reemplaza eventos
    // `ccr:refresh-sidebar`, solo mantiene el dashboard vigente.
    const intervalId = window.setInterval(() => {
      void traerDashboard({ silent: true });
    }, 45000);

    return () => window.clearInterval(intervalId);
  }, [traerDashboard, user]);

  // Al cambiar el mes del mini calendario se vuelve a mostrar la carga (ajuste durante el render).
  const mesAgendaClave = toMonthKey(mesMiniCalendario);
  const [mesAgendaCargado, setMesAgendaCargado] = useState(mesAgendaClave);
  if (mesAgendaCargado !== mesAgendaClave) {
    setMesAgendaCargado(mesAgendaClave);
    setAgendaLoading(true);
    setAgendaError("");
  }

  const traerAgendaResumen = useCallback(async () => {
    if (!user) return;
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

  useCargaAlMontar(traerAgendaResumen);

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
      .slice(0, 30);
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

  if (loading) return <DashboardSkeleton />;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="ccr-dashboard-content space-y-5"
    >
      <div className="ccr-panel overflow-hidden rounded-2xl">
      <header>
        <h1 className="sr-only">Inicio</h1>
        <motion.div
          className="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-5 dark:bg-ink-black-600"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          <Kpi
            href="/lista-espera"
            icono={FiClock}
            tono="blue"
            label="En lista de espera"
            value={resumen.lista_espera_global ?? resumen.pendientes + resumen.rescate}
            detalle="Pendientes y en rescate"
          />
          <Kpi
            href="/calendario"
            icono={FiCalendar}
            tono="green"
            label="Citas de hoy"
            value={resumen.agenda_hoy}
            detalle={resumen.agenda_hoy ? "Ver la agenda del día" : "Sin citas programadas"}
          />
          <Kpi
            href="/mis-pacientes"
            icono={FiActivity}
            tono="violet"
            label="En atención"
            value={resumen.ingresados}
            detalle={user?.rol === "KINE" ? `${resumen.mios_activos} a tu cargo` : "Pacientes en tratamiento"}
          />
          <Kpi
            href="/llamados"
            icono={FiPhone}
            tono="amber"
            label="Por contactar"
            value={resumen.cola_llamados}
            detalle="En la cola de llamados"
            alerta={resumen.cola_llamados > 0}
          />
          <Kpi
            href="/llamados"
            icono={FiAlertTriangle}
            tono="red"
            label="En rescate"
            value={resumen.rescate}
            detalle="Requieren un nuevo contacto"
            alerta={resumen.rescate > 0}
          />
        </motion.div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 items-stretch border-t border-slate-200 dark:border-ink-black-600 xl:grid-cols-12">
        <div className="border-b border-slate-200 dark:border-ink-black-600 xl:col-span-7 xl:border-b-0 xl:border-r">
          <div className="flex h-full flex-col">
            <div className="flex min-h-[46px] items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-ink-black-600">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                Acciones prioritarias
                {accionesPrioritarias.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-950 dark:bg-ink-black-700 dark:text-white">
                    {accionesPrioritarias.length}
                  </span>
                )}
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">Por gravedad y espera</span>
            </div>

            {accionesPrioritarias.length === 0 ? (
              <div className="m-4 rounded-lg border border-green-100 bg-green-50 px-4 py-4 text-sm font-semibold text-green-800 dark:!border-green-900/60 dark:!bg-green-950/30 dark:!text-green-200">
                Sin acciones pendientes por ahora.
              </div>
            ) : (
              <div className="grid max-h-[380px] min-h-0 flex-1 grid-cols-1 content-start overflow-y-auto xl:max-h-none xl:basis-0">
                {accionesPrioritarias.map(({ paciente, grupo }) => (
                  <div
                    key={paciente.id}
                    className="flex w-full items-center justify-between gap-3 border-b border-[color:var(--border-table-row)] px-5 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-ink-black-700/50"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONO_CATEGORIA[paciente.categoria]?.dot ?? "bg-slate-400"}`}
                      />
                      <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-slate-900 dark:!text-slate-100">
                        {paciente.nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())}
                        <span className="ml-2 font-mono text-[12px] font-semibold text-slate-950 dark:!text-white">
                          {formatearRut(paciente.rut)}
                        </span>
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600 dark:!text-slate-300">
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
                    <div className="flex shrink-0 items-center">
                      <Link
                        href={getRutaTablaPaciente(grupo, paciente)}
                        className="ccr-control-button !h-7 !px-3 !text-[11px]"
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
        <div className="xl:col-span-5">
          <MiniCalendario
            mes={mesMiniCalendario}
            agenda={agendaResumen}
            loading={agendaLoading}
            error={agendaError}
            onMesChange={setMesMiniCalendario}
            onSelectDate={(dateKey) => router.push(`/calendario?fecha=${dateKey}`)}
          />
        </div>
      </section>

      <div className="border-t border-slate-200 dark:border-ink-black-600">
        <GraficosInicio />
      </div>

      <section className="grid grid-cols-1 items-stretch border-t border-slate-200 dark:border-ink-black-600 xl:grid-cols-12">
        <div className="space-y-3 border-b border-slate-200 dark:border-ink-black-600 xl:col-span-7 xl:border-b-0 xl:border-r">
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
        <div className="xl:col-span-5">
          <div className="p-5">
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
      </section>
      </div>

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

const TONOS_KPI: Record<"blue" | "green" | "violet" | "amber" | "red", { icono: string; numero: string }> = {
  blue: { icono: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200", numero: "text-blue-600 dark:text-blue-300" },
  green: { icono: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-200", numero: "text-slate-950 dark:text-white" },
  violet: { icono: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-200", numero: "text-slate-950 dark:text-white" },
  amber: { icono: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200", numero: "text-amber-700 dark:text-amber-300" },
  red: { icono: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200", numero: "text-red-600 dark:text-red-300" },
};

function Kpi({
  href,
  icono: Icono,
  tono,
  label,
  value,
  detalle,
  alerta = false,
}: {
  href: string;
  icono: IconType;
  tono: keyof typeof TONOS_KPI;
  label: string;
  value: number;
  detalle: string;
  /** Resalta el número con el color del tono (solo cuando hay algo pendiente). */
  alerta?: boolean;
}) {
  const t = TONOS_KPI[tono];
  const colorNumero = tono === "blue" || alerta ? t.numero : "text-slate-950 dark:text-white";
  return (
    <motion.div variants={kpiVariants} className="bg-white last:col-span-2 md:last:col-span-1 dark:bg-ink-black-800">
      <Link
        href={href}
        className="group flex h-full flex-col gap-1.5 px-4 py-3 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
      >
        <span className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.icono}`}>
            <Icono size={15} aria-hidden="true" />
          </span>
          <span className={`block text-3xl font-bold leading-none tabular-nums ${colorNumero}`}>
            <AnimatedNumber value={value} />
          </span>
        </span>
        <span className="text-[12px] font-semibold leading-tight text-slate-700 dark:text-ink-black-100">{label}</span>
        <span className="mt-auto flex items-center justify-between gap-2 text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400">
          {detalle}
          <FiArrowRight
            size={13}
            className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
            aria-hidden="true"
          />
        </span>
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
    <section className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-ink-black-600">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
          Agenda del mes
          {!loading && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-700 dark:bg-blue-500/15 dark:text-blue-200" title={`${totalMes} cita${totalMes !== 1 ? "s" : ""} en ${formatMonthYear(mes)}`}>
              {totalMes}
            </span>
          )}
        </h2>
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
