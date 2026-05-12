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
  FiChevronLeft,
  FiChevronRight,
  FiPhone,
  FiRefreshCw,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";
import { motion, type Variants } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatearRut } from "@/lib/rut";
import type {
  AgendaResumenDia,
  AlertasOperativas,
  DashboardResumenOperativo,
  Paciente,
} from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import { DashboardSkeleton } from "@/components/Skeleton";
import TrabajoHoy from "@/components/TrabajoHoy";

type GrupoAlerta = keyof AlertasOperativas;

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

function mondayStartOffset(date: Date) {
  return (date.getDay() + 6) % 7;
}

const DIAS_SEMANA = [
  { label: "L", className: "text-slate-400" },
  { label: "M", className: "text-slate-400" },
  { label: "M", className: "text-slate-400" },
  { label: "J", className: "text-slate-400" },
  { label: "V", className: "text-slate-400" },
  { label: "S", className: "text-slate-400" },
  { label: "D", className: "text-red-500" },
];

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
  alta_sin_responsable: "/lista-espera?alerta=alta_sin_responsable",
  sobre_90_dias: "/lista-espera?alerta=sobre_90_dias",
  pendientes_con_1_intento: "/lista-espera?alerta=pendientes_con_1_intento",
  rescates_activos: "/lista-espera?alerta=rescates_activos",
  ingresados_sin_proxima_atencion:
    "/lista-espera?alerta=ingresados_sin_proxima_atencion",
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

export default function InicioPage() {
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
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
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
      <header className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm dark:!border-zinc-800 dark:!bg-[#0f0f10]">
        <div className="relative bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_48%,#e0f2fe_100%)] p-5 dark:!bg-[linear-gradient(135deg,#050505_0%,#0f0f10_55%,#151515_100%)] sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-blue-300/35 blur-3xl dark:!bg-blue-950/20" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-28 w-56 -translate-x-1/2 rounded-full bg-sky-200/45 blur-3xl dark:!bg-zinc-800/45" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-800 shadow-sm dark:!border-zinc-700 dark:!bg-zinc-900 dark:!text-blue-200">
                <FiActivity size={13} />
                Centro Comunitario de Rehabilitación
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:!text-white">
                Gestión operativa CCR
              </h1>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:!text-zinc-400">
                {user?.nombre} · {user?.rol} · Actualizado{" "}
                {lastUpdated?.toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                }) ?? "-"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/80 bg-white/88 p-2 shadow-sm backdrop-blur dark:!border-zinc-800 dark:!bg-zinc-950 sm:grid-cols-4">
                <Stat label="Activos" value={resumen.lista_activa} />
                <Stat label="En espera" value={resumen.pendientes} />
                <Stat label="En atención" value={resumen.ingresados} />
                <Stat label="Rescate" value={resumen.rescate} />
              </div>
              <Button
                onPress={() => {
                  void cargarDashboard();
                  void cargarAgendaResumen();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#335FDB] px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-[#284FC0] focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <FiRefreshCw size={14} />
                Refrescar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:!border-slate-800 dark:!bg-slate-950/80">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:!text-white">
                  Acciones prioritarias
                </h2>
                <p className="text-xs text-slate-500 dark:!text-slate-400">
                  Pacientes según gravedad y tiempo de espera.
                </p>
              </div>
              <FiAlertTriangle className="text-blue-700 dark:!text-blue-300" size={22} />
            </div>

            {accionesPrioritarias.length === 0 ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800 dark:!border-emerald-900/60 dark:!bg-emerald-950/30 dark:!text-emerald-200">
                Sin acciones pendientes por ahora.
              </div>
            ) : (
              <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {accionesPrioritarias.map(({ paciente, grupo }) => (
                  <div
                    key={paciente.id}
                    className="flex w-full flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:!border-slate-800 dark:!bg-slate-900/75"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:!text-slate-100">
                        {paciente.nombre}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:!text-slate-400">
                        {formatearRut(paciente.rut)}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-600 dark:!text-slate-300">
                        {paciente.diagnostico || "Sin diagnóstico"} · {paciente.categoria || "Sin categoría"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Link
                        href={getRutaTablaPaciente(grupo, paciente)}
                        className="rounded-full bg-[#335FDB] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#284FC0] dark:!bg-blue-500 dark:hover:!bg-blue-400"
                      >
                        Ver en lista
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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

        <aside className="space-y-3 xl:col-span-4">
          <MiniCalendario
            mes={mesMiniCalendario}
            agenda={agendaResumen}
            loading={agendaLoading}
            error={agendaError}
            onMesChange={setMesMiniCalendario}
            onSelectDate={(dateKey) => router.push(`/calendario?fecha=${dateKey}`)}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">Accesos</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {ACTION_LINKS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 transition hover:border-[#D4E4D4] hover:bg-white"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700">
                    <card.icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900">{card.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{card.description}</p>
                  </div>
                  <FiArrowRight className="text-slate-300 transition group-hover:text-blue-700" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white px-3 py-2.5 shadow-sm dark:!border-zinc-800 dark:!bg-[#151515]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:!text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-slate-950 dark:!text-white">{value}</p>
    </div>
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
  const diasDelMes = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const celdas: Array<Date | null> = Array(mondayStartOffset(inicio)).fill(null);
    for (let dia = 1; dia <= fin.getDate(); dia++) {
      celdas.push(new Date(mes.getFullYear(), mes.getMonth(), dia));
    }
    while (celdas.length % 7 !== 0) celdas.push(null);
    return celdas;
  }, [mes]);
  const hoyKey = toDateKey(new Date());

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
            Mini agenda
          </p>
          <h2 className="mt-0.5 text-sm font-black capitalize text-slate-950">
            {formatMonthYear(mes)}
          </h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onMesChange(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
            className="rounded-md p-1.5 text-slate-600 transition hover:bg-white hover:text-blue-700"
            aria-label="Mes anterior"
          >
            <FiChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMesChange(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
            className="rounded-md p-1.5 text-slate-600 transition hover:bg-white hover:text-blue-700"
            aria-label="Mes siguiente"
          >
            <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA.map((dia, index) => (
          <div
            key={`${dia.label}-${index}`}
            className={`py-1 text-[10px] font-black uppercase ${dia.className}`}
          >
            {dia.label}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {diasDelMes.map((dia, index) => {
          if (!dia) {
            return <div key={`empty-${index}`} className="h-9 rounded-md" />;
          }
          const dateKey = toDateKey(dia);
          const total = agendaPorDia.get(dateKey) ?? 0;
          const isToday = dateKey === hoyKey;
          const isSunday = dia.getDay() === 0;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              className={`relative flex h-9 items-center justify-center rounded-md border text-[11px] font-black transition ${
                isToday
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : isSunday
                    ? "border-red-100 bg-red-50 text-red-700 hover:border-red-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
              }`}
              aria-label={`Ver agenda del ${dateKey}`}
            >
              {dia.getDate()}
              {total > 0 && (
                <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#335FDB] px-1 text-[9px] font-black leading-4 text-white">
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
        <span>{loading ? "Cargando citas..." : `${agenda.length} días con citas`}</span>
        <Link href="/calendario" className="font-bold text-blue-700 hover:text-blue-900">
          Ver calendario
        </Link>
      </div>
      {error && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
          {error}
        </p>
      )}
    </section>
  );
}
