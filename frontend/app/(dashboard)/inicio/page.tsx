"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-aria-components";
import {
  FiArrowRight,
  FiBarChart2,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiPhone,
  FiRefreshCw,
  FiUser,
  FiUsers,
  FiActivity,
} from "react-icons/fi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ESTADO_LABELS } from "@/lib/types";
import type { AlertasOperativas, Paciente } from "@/lib/types";
import { limpiarRut } from "@/lib/rut";
import { motion, type Variants } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DashboardSkeleton } from "@/components/Skeleton";
import FichaPaciente from "@/components/FichaPaciente";
import TrabajoHoy from "@/components/TrabajoHoy";

const ACTION_CARDS = [
  {
    title: "Lista de espera",
    href: "/lista-espera",
    description: "Revisa pacientes sin responsable y su prioridad operativa.",
    icon: FiUsers,
    color: "#335fdb",
    tint: "from-blue-100 to-blue-50",
  },
  {
    title: "Mi cartera",
    href: "/mis-pacientes",
    description: "Accede rápido a tu cartera activa de seguimiento.",
    icon: FiUser,
    color: "#0F766E",
    tint: "from-teal-100 to-emerald-50",
  },
  {
    title: "Contactabilidad",
    href: "/llamados",
    description: "Gestiona contactos, rescates e intentos previos al ingreso.",
    icon: FiPhone,
    color: "#ca8702",
    tint: "from-orange-100 to-amber-50",
  },
  {
    title: "Estadísticas",
    href: "/analisis/estadisticas",
    description: "Explora tendencias de carga y egresos por periodo.",
    icon: FiBarChart2,
    color: "#4338CA",
    tint: "from-indigo-100 to-violet-50",
  },
];

const COLORS = {
  INGRESADO: "#335fdb",
  PENDIENTE: "#F59E0B",
  RESCATE: "#c90603",
  OTROS: "#94A3B8",
};

export default function InicioPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [alertas, setAlertas] = useState<AlertasOperativas | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertasLoading, setAlertasLoading] = useState(false);
  const [error, setError] = useState("");
  const [alertasError, setAlertasError] = useState("");
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedMiniDate, setSelectedMiniDate] = useState(() => toDateKey(new Date()));

  const isKine = user?.rol === "KINE";

  const cargarDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setAlertasLoading(true);
    setError("");
    setAlertasError("");
    try {
      const data = isKine
        ? await api.get<Paciente[]>(`/pacientes/?kine=${user.id}`)
        : await api.get<Paciente[]>("/pacientes/");
      setPacientes(data);
      setLastUpdated(new Date());
    } catch {
      setError("No fue posible cargar el dashboard. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }

    try {
      const data = await api.get<AlertasOperativas>("/pacientes/alertas-operativas/");
      setAlertas(data);
    } catch {
      setAlertas(null);
      setAlertasError("No se pudieron cargar las alertas operativas.");
    } finally {
      setAlertasLoading(false);
    }
  }, [user, isKine]);

  useEffect(() => {
    void cargarDashboard();
  }, [cargarDashboard]);

  const statsData = useMemo(() => {
    const counts = { INGRESADO: 0, PENDIENTE: 0, RESCATE: 0, OTROS: 0 };
    pacientes.forEach((p) => {
      if (p.estado === "INGRESADO") counts.INGRESADO++;
      else if (p.estado === "PENDIENTE") counts.PENDIENTE++;
      else if (p.estado === "RESCATE") counts.RESCATE++;
      else counts.OTROS++;
    });

    return [
      { name: "Ingresados", value: counts.INGRESADO, color: COLORS.INGRESADO },
      { name: "Pendientes", value: counts.PENDIENTE, color: COLORS.PENDIENTE },
      { name: "Rescate", value: counts.RESCATE, color: COLORS.RESCATE },
      { name: "Otros", value: counts.OTROS, color: COLORS.OTROS },
    ].filter((d) => d.value > 0);
  }, [pacientes]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, Paciente[]>();
    pacientes.forEach((p) => {
      if (!p.proxima_atencion) return;
      const dateKey = toDateKeyFromApiDate(p.proxima_atencion);
      if (!dateKey) return;
      const bucket = grouped.get(dateKey) ?? [];
      bucket.push(p);
      grouped.set(dateKey, bucket);
    });

    grouped.forEach((bucket) => {
      bucket.sort((a, b) => {
        const aTime = extractTimeFromApiDate(a.proxima_atencion);
        const bTime = extractTimeFromApiDate(b.proxima_atencion);
        return aTime.localeCompare(bTime);
      });
    });

    return grouped;
  }, [pacientes]);

  const scheduledTodayCount = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return appointmentsByDate.get(todayKey)?.length ?? 0;
  }, [appointmentsByDate]);

  const scheduledMonthCount = useMemo(() => {
    const monthPrefix = `${miniCalendarMonth.getFullYear()}-${String(miniCalendarMonth.getMonth() + 1).padStart(2, "0")}`;
    let totalInMonth = 0;
    appointmentsByDate.forEach((bucket, key) => {
      if (key.startsWith(monthPrefix)) totalInMonth += bucket.length;
    });
    return totalInMonth;
  }, [appointmentsByDate, miniCalendarMonth]);

  const todaysAppointments = useMemo(
    () => appointmentsByDate.get(selectedMiniDate) ?? [],
    [appointmentsByDate, selectedMiniDate]
  );

  const tunnelVariants: Variants = {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants: Variants = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
  };

  const handleVerGrupo = useCallback(
    (grupo: keyof AlertasOperativas) => {
      const rutas: Record<keyof AlertasOperativas, string> = {
        alta_sin_responsable: "/lista-espera?alerta=alta_sin_responsable",
        sobre_90_dias: "/lista-espera?alerta=sobre_90_dias",
        pendientes_con_1_intento: "/lista-espera?alerta=pendientes_con_1_intento",
        rescates_activos: "/lista-espera?alerta=rescates_activos",
        ingresados_sin_proxima_atencion:
          "/lista-espera?alerta=ingresados_sin_proxima_atencion",
        posible_abandono: "/lista-espera?alerta=posible_abandono",
        telefonos_incompletos: "/lista-espera?alerta=telefonos_incompletos",
      };
      router.push(rutas[grupo]);
    },
    [router],
  );

  if (loading) return <DashboardSkeleton />;

  const total = pacientes.length;
  const ingresados = statsData.find((s) => s.name === "Ingresados")?.value ?? 0;
  const pendientes = statsData.find((s) => s.name === "Pendientes")?.value ?? 0;
  const rescate = statsData.find((s) => s.name === "Rescate")?.value ?? 0;

  return (
    <motion.div variants={tunnelVariants} initial="initial" animate="animate" className="ccr-dashboard-content space-y-6">
      <motion.header variants={itemVariants} className="ccr-hero rounded-xl p-6 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#284fc0] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
              <FiActivity size={12} /> Centro Comunitario de Rehabilitación
            </div>
            <div>
              <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">Panel de Gestión Operativa CCR</h1>
              <p className="mt-2 text-sm text-blue-50 sm:text-base">
                {isKine
                  ? "Seguimiento de tu cartera activa y agenda diaria de atenciones."
                  : "Visión operativa de lista de espera, seguimiento y carga asistencial."}
              </p>
            </div>
          </div>

          <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total" value={total} />
            <StatTile label="Pendiente" value={pendientes} />
            <StatTile label="Rescate" value={rescate} />
            <StatTile label="Citas hoy" value={scheduledTodayCount} />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-white/20 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-white/90">
            {user?.nombre} · {user?.rol}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/80">Actualizado: {lastUpdated?.toLocaleTimeString()}</span>
              <Button
                onPress={() => void cargarDashboard()}
                className="ccr-button-refresh inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition"
              >
              <FiRefreshCw size={12} /> Refrescar
            </Button>
          </div>
        </div>
      </motion.header>

      {error && (
        <motion.div variants={itemVariants} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <TrabajoHoy
          alertas={alertas}
          loading={alertasLoading}
          onVerPaciente={setPacienteSeleccionado}
          onVerGrupo={handleVerGrupo}
        />
        {alertasError && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {alertasError}
          </p>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <motion.section variants={itemVariants} className="ccr-panel ccr-dashboard-card rounded-xl p-6 lg:col-span-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">Distribución de estados</h2>
            <div className="rounded-full bg-blue-700 px-4 py-1 text-xs font-bold text-white shadow-sm dark:!bg-[#0f0f10]">{ingresados} ingresados</div>
          </div>

          <div className="grid h-[310px] grid-cols-1 gap-8 md:grid-cols-2">
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statsData} cx="50%" cy="50%" innerRadius={58} outerRadius={102} paddingAngle={4} dataKey="value" stroke="none">
                    {statsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: "14px", border: "none", boxShadow: "0 10px 18px -10px rgba(15,23,42,0.35)" }}
                    itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-black text-slate-900 dark:!text-white">{total}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:!text-[#b5d8e3]">pacientes</p>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3">
              {statsData.map((stat) => (
                <div key={stat.name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-white hover:shadow-sm dark:!border-[#262626] dark:!bg-[#202020] dark:hover:!bg-[#262626]">
                  <div className="flex items-center gap-3">
                    <div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: stat.color }} />
                    <span className="text-sm font-bold text-slate-700 dark:!text-white">{stat.name}</span>
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-lg font-black text-slate-900 dark:!text-white">{stat.value}</span>
                    <span className="text-[10px] font-bold text-slate-500 dark:!text-[#8fc4d6]">({Math.round((stat.value / total) * 100)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section variants={itemVariants} className="grid grid-cols-1 gap-4 lg:col-span-4">
          {ACTION_CARDS.map((card) => (
            <Link key={card.href} href={card.href}>
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} className="ccr-panel ccr-dashboard-card group flex h-full items-center gap-4 rounded-xl border p-5">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${card.tint} border border-white shadow-sm`}>
                  <card.icon size={24} style={{ color: card.color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900 group-hover:text-blue-700 dark:!text-white dark:group-hover:!text-[#8fc4d6]">{card.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-600 dark:!text-[#b5d8e3]">{card.description}</p>
                </div>
                <FiArrowRight size={18} className="ml-auto text-slate-300 transition group-hover:text-slate-900 dark:!text-[#6ab0c8] dark:group-hover:!text-white" />
              </motion.div>
            </Link>
          ))}
        </motion.section>
      </div>

      <motion.section variants={itemVariants} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="ccr-panel ccr-dashboard-card rounded-xl p-6 lg:col-span-5">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">Calendario</h2>
            <div className="ccr-date-badge inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
              {scheduledMonthCount} programadas
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2 dark:!border-[#262626] dark:!bg-[#202020]">
              <button
                onClick={() => setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() - 1))}
                className="rounded-lg p-2 text-slate-700 transition hover:bg-white dark:!text-white dark:hover:!bg-[#262626]"
              >
                <FiChevronLeft size={18} />
              </button>
              <span className="font-bold capitalize text-slate-800 dark:!text-white">{formatoMes(miniCalendarMonth)}</span>
              <button
                onClick={() => setMiniCalendarMonth(new Date(miniCalendarMonth.getFullYear(), miniCalendarMonth.getMonth() + 1))}
                className="rounded-lg p-2 text-slate-700 transition hover:bg-white dark:!text-white dark:hover:!bg-[#262626]"
              >
                <FiChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                <div key={`${d}-${i}`} className="text-center text-[10px] font-black uppercase text-slate-400 dark:!text-[#8fc4d6]">{d}</div>
              ))}
              {crearDias(miniCalendarMonth).map((d, j) => {
                if (!d) return <div key={`empty-${j}`} />;
                const key = toDateKey(d);
                const isSelected = key === selectedMiniDate;
                const isToday = key === toDateKey(new Date());
                const appointmentsCount = appointmentsByDate.get(key)?.length ?? 0;
                const hasAppointments = appointmentsCount > 0;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMiniDate(key)}
                    className={`ccr-calendar-day relative h-11 w-full rounded-lg border text-xs font-bold transition ${
                      isSelected
                        ? "is-selected bg-blue-700 text-white shadow dark:!bg-[#335fdb] dark:!text-white"
                        : isToday
                          ? "is-today border-blue-400 bg-white text-slate-900 dark:!border-blue-400 dark:!bg-white dark:!text-[#335fdb]"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#daebf1] dark:hover:!bg-[#262626]"
                    }`}
                  >
                    {d.getDate()}
                    {hasAppointments && (
                      <span
                        className={`absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full px-1.5 py-[1px] text-[9px] font-black ${
                          isSelected
                            ? "bg-white text-blue-700"
                            : "bg-blue-100 text-blue-700 dark:!bg-[#202020] dark:!text-white"
                        }`}
                      >
                        {appointmentsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="ccr-panel ccr-dashboard-card rounded-xl p-6 lg:col-span-7">
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4 dark:!border-[#262626]">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">Atenciones programadas</h2>
            <div className="ccr-date-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold">
              {formatDateKey(selectedMiniDate)}
              <span className="rounded-full bg-[#202020] px-1.5 py-0.5 text-[9px] text-white">
                {todaysAppointments.length}
              </span>
            </div>
          </div>

          <div className="custom-scrollbar max-h-[300px] space-y-3 overflow-y-auto pr-2">
            {todaysAppointments.length > 0 ? (
              todaysAppointments.map((p) => (
                <Link
                  key={p.id}
                  href={`/paciente/${limpiarRut(p.rut)}`}
                  className="group flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-white hover:shadow-sm dark:!border-[#262626] dark:!bg-[#202020] dark:hover:!bg-[#262626]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-16 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm dark:!border-[#262626] dark:!bg-[#111111] dark:!text-white">
                      <span className="text-xs font-bold">
                        {new Date(p.proxima_atencion!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:!text-white">{p.nombre}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:!text-[#8fc4d6]">{ESTADO_LABELS[p.estado]}</p>
                    </div>
                  </div>
                  <FiArrowRight className="text-slate-300 transition group-hover:text-slate-900 dark:!text-[#6ab0c8] dark:group-hover:!text-white" />
                </Link>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-60">
                <FiCalendar size={46} className="mb-2 text-slate-300 dark:!text-[#6ab0c8]" />
                <p className="text-sm font-bold text-slate-500 dark:!text-[#b5d8e3]">Sin atenciones registradas para este día</p>
              </div>
            )}
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#262626] bg-[#0f0f10] px-3 py-2 text-white">
      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">{label}</p>
      <p className="mt-1 text-2xl font-black leading-none">{value}</p>
    </div>
  );
}

function toDateKey(valor: Date): string {
  const year = valor.getFullYear();
  const month = String(valor.getMonth() + 1).padStart(2, "0");
  const day = String(valor.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatoMes(valor: Date): string {
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(valor);
}

function crearDias(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const days: (Date | null)[] = Array(first.getDay()).fill(null);
  for (let i = 1; i <= last.getDate(); i++) days.push(new Date(month.getFullYear(), month.getMonth(), i));
  return days;
}

function toDateKeyFromApiDate(value?: string | null): string | null {
  if (!value) return null;
  const onlyDate = value.includes("T") ? value.split("T")[0] : value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) return null;
  return onlyDate;
}

function extractTimeFromApiDate(value?: string | null): string {
  if (!value) return "";
  const timeMatch = value.match(/T(\d{2}:\d{2})/);
  return timeMatch?.[1] ?? "";
}

function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
