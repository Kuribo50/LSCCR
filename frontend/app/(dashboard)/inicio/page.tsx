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
  FiPhone,
  FiRefreshCw,
  FiUsers,
} from "react-icons/fi";
import { motion, type Variants } from "framer-motion";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatearRut } from "@/lib/rut";
import type { AlertasOperativas, Paciente } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import BadgePrioridad from "@/components/BadgePrioridad";
import FichaPaciente from "@/components/FichaPaciente";
import { DashboardSkeleton } from "@/components/Skeleton";
import TrabajoHoy from "@/components/TrabajoHoy";

type GrupoAlerta = keyof AlertasOperativas;

const ACTION_LINKS = [
  {
    title: "Lista de espera",
    href: "/lista-espera",
    description: "Revisar pacientes pendientes y asignaciones.",
    icon: FiUsers,
  },
  {
    title: "Contactabilidad",
    href: "/llamados",
    description: "Registrar contactos y rescates operativos.",
    icon: FiPhone,
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

const ACCIONES_ALERTA: { key: GrupoAlerta; accion: string }[] = [
  {
    key: "alta_sin_responsable",
    accion: "Asignar responsable CCR",
  },
  {
    key: "rescates_activos",
    accion: "Registrar nuevo contacto",
  },
  {
    key: "pendientes_con_1_intento",
    accion: "Completar contactabilidad",
  },
  {
    key: "ingresados_sin_proxima_atencion",
    accion: "Programar próxima atención",
  },
  {
    key: "posible_abandono",
    accion: "Evaluar cierre operativo",
  },
];
const CHART_COLORS = ["#335FDB", "#1B5E3B", "#ED8121", "#B91C1C", "#64748B", "#7C3AED"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sameMonth(value: string | null | undefined, key: string) {
  if (!value) return false;
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return monthKey(parsed) === key;
}

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

  const resumen = useMemo(() => {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    return {
      listaActiva: pacientes.filter((p) =>
        ["PENDIENTE", "RESCATE", "INGRESADO"].includes(p.estado),
      ).length,
      pendientes: pacientes.filter((p) => p.estado === "PENDIENTE").length,
      rescate: pacientes.filter((p) => p.estado === "RESCATE").length,
      ingresados: pacientes.filter((p) => p.estado === "INGRESADO").length,
      egresosMes: pacientes.filter((p) => {
        if (!p.fecha_egreso) return false;
        const fecha = new Date(`${p.fecha_egreso}T00:00:00`);
        return fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual;
      }).length,
    };
  }, [pacientes]);

  const accionesPrioritarias = useMemo(() => {
    if (!alertas) return [];
    const items = new Map<number, { paciente: Paciente; accion: string }>();
    ACCIONES_ALERTA.forEach(({ key, accion }) => {
      alertas[key].pacientes.forEach((paciente) => {
        if (!items.has(paciente.id)) items.set(paciente.id, { paciente, accion });
      });
    });
    return Array.from(items.values()).slice(0, 8);
  }, [alertas]);

  const estadoChartData = useMemo(() => {
    const estados = new Map<string, number>();
    pacientes.forEach((paciente) => {
      estados.set(paciente.estado, (estados.get(paciente.estado) ?? 0) + 1);
    });
    return Array.from(estados.entries()).map(([estado, total], index) => ({
      name: ESTADO_LABELS[estado as keyof typeof ESTADO_LABELS] ?? estado,
      value: total,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [pacientes]);

  const tendenciaOperativa = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    return Array.from({ length: 6 }, (_, index) => {
      const fecha = new Date(base.getFullYear(), base.getMonth() - (5 - index), 1);
      const key = monthKey(fecha);
      return {
        mes: fecha.toLocaleDateString("es-CL", { month: "short" }).replace(".", ""),
        ingresos: pacientes.filter((paciente) => sameMonth(paciente.fecha_ingreso, key)).length,
        egresos: pacientes.filter((paciente) => sameMonth(paciente.fecha_egreso, key)).length,
      };
    });
  }, [pacientes]);

  const handleVerGrupo = useCallback(
    (grupo: GrupoAlerta) => {
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
      <header className="rounded-xl border border-[#D4E4D4] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1B5E3B]">
              <FiActivity size={13} />
              Centro Comunitario de Rehabilitación
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">
              Gestión operativa CCR
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {user?.nombre} · {user?.rol} · Actualizado:{" "}
              {lastUpdated?.toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
              }) ?? "-"}
            </p>
          </div>
          <Button
            onPress={() => void cargarDashboard()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#335FDB] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0]"
          >
            <FiRefreshCw size={14} />
            Refrescar
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

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

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="rounded-xl border border-[#D4E4D4] bg-white p-5 shadow-sm xl:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Acciones prioritarias
              </h2>
              <p className="text-xs text-slate-500">
                Máximo 8 pacientes combinando las alertas más relevantes.
              </p>
            </div>
            <FiAlertTriangle className="text-[#1B5E3B]" size={22} />
          </div>

          {accionesPrioritarias.length === 0 ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm font-semibold text-emerald-800">
              Sin acciones pendientes por ahora.
            </div>
          ) : (
            <div className="space-y-2">
              {accionesPrioritarias.map(({ paciente, accion }) => (
                <button
                  key={paciente.id}
                  type="button"
                  onClick={() => setPacienteSeleccionado(paciente)}
                  className="flex w-full flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:border-[#D4E4D4] hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {paciente.nombre}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {paciente.id_ccr} · {formatearRut(paciente.rut)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgePrioridad prioridad={paciente.prioridad} />
                    <BadgeEstado estado={paciente.estado} />
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                      {accion}
                    </span>
                    <span className="rounded-full bg-[#1B5E3B] px-2 py-1 text-[11px] font-bold text-white">
                      Ver ficha operativa
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-5 xl:col-span-5">
          <div className="rounded-xl border border-[#D4E4D4] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Visual operativo</h2>
                <p className="text-xs font-semibold text-slate-500">Estado actual y actividad reciente.</p>
              </div>
              <FiBarChart2 className="text-blue-700" size={20} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3">
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={estadoChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={62}
                        paddingAngle={2}
                      >
                        {estadoChartData.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 self-center">
                  {estadoChartData.slice(0, 5).map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="font-black text-slate-950">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-[160px] rounded-lg border border-slate-100 bg-slate-50 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tendenciaOperativa} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#335FDB" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#B91C1C" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Lista activa" value={resumen.listaActiva} />
                <Stat label="Egresos del mes" value={resumen.egresosMes} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#D4E4D4] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Ir a módulos</h2>
            <div className="mt-4 space-y-3">
              {ACTION_LINKS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[#D4E4D4] hover:bg-white"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700">
                    <card.icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">{card.title}</p>
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
    <div className="rounded-lg border border-[#D4E4D4] bg-[#F8FAF8] px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}
