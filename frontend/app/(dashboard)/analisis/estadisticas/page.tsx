"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiDownload,
  FiRefreshCw,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type {
  ReportePorResponsable,
  ReporteResponsableItem,
  ReporteResumenMensual,
  ReporteSerieMensual,
} from "@/lib/types";

const MESES = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const CARD_BORDER = "border-[#D4E4D4]";
const CHART_COLORS = ["#335FDB", "#1B5E3B", "#ED8121", "#B91C1C", "#64748B", "#7C3AED", "#0F766E"];

export default function EstadisticasPage() {
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [resumen, setResumen] = useState<ReporteResumenMensual | null>(null);
  const [porResponsable, setPorResponsable] = useState<ReportePorResponsable | null>(null);
  const [serie, setSerie] = useState<ReporteSerieMensual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportandoResponsables, setExportandoResponsables] = useState(false);

  const cargarReportes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resumenData, responsableData, serieData] = await Promise.all([
        api.get<ReporteResumenMensual>(`/reportes/resumen/?mes=${mes}&anio=${anio}`),
        api.get<ReportePorResponsable>(`/reportes/por-responsable/?mes=${mes}&anio=${anio}`),
        api.get<ReporteSerieMensual>(`/reportes/serie-mensual/?anio=${anio}`),
      ]);
      setResumen(resumenData);
      setPorResponsable(responsableData);
      setSerie(serieData);
    } catch {
      setError("No se pudieron cargar las estadísticas operativas.");
    } finally {
      setLoading(false);
    }
  }, [mes, anio]);

  useEffect(() => {
    void cargarReportes();
  }, [cargarReportes]);

  const tendencia = useMemo(
    () =>
      serie?.meses.map((item) => ({
        mes: MESES[item.mes - 1]?.label.slice(0, 3) ?? String(item.mes),
        derivados: item.total_derivados,
        ingresos: item.ingresos,
        egresos: item.egresos_total,
      })) ?? [],
    [serie],
  );

  const estadoActualData = useMemo(
    () =>
      resumen?.por_estado
        .filter((item) => item.total > 0)
        .map((item, index) => ({
          name: item.label,
          value: item.total,
          color: CHART_COLORS[index % CHART_COLORS.length],
        })) ?? [],
    [resumen],
  );

  const exportarCsv = useCallback(() => {
    if (!resumen || !porResponsable) return;
    const filas = [
      ["Periodo", resumen.periodo_label],
      ["Derivados del corte", resumen.corte.total_derivados],
      ["Pendientes", resumen.corte.pendientes],
      ["Rescate", resumen.corte.rescate],
      ["Ingresos del mes", resumen.actividad_mes.ingresos],
      ["Egresos del mes", resumen.actividad_mes.egresos_total],
      ["Sobre 90 dias", resumen.corte.sobre_90_dias],
      [],
      ["Responsable CCR", "Asignados corte", "Pendientes", "Rescate", "Ingresos mes", "Egresos mes"],
      ...porResponsable.responsables.map((item) => [
        item.responsable_nombre ?? "Sin nombre",
        item.total_asignados_corte,
        item.pendientes,
        item.rescate,
        item.ingresos_mes,
        item.egresos_mes,
      ]),
    ];
    const csv = filas
      .map((fila) => fila.map((valor) => `"${String(valor ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-ccr-${resumen.anio}-${String(resumen.mes).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [resumen, porResponsable]);

  const exportarExcelResponsables = useCallback(async () => {
    setExportandoResponsables(true);
    try {
      const blob = await api.getBlob(`/reportes/por-responsable/exportar/?mes=${mes}&anio=${anio}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `reporte-responsables-ccr-${anio}-${String(mes).padStart(2, "0")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo exportar el reporte por responsable.");
    } finally {
      setExportandoResponsables(false);
    }
  }, [mes, anio]);

  return (
    <main className="ccr-dashboard-content space-y-6">
      <header className={`rounded-xl border ${CARD_BORDER} bg-white p-5 shadow-sm`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-[#E7F3EC] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1B5E3B]">
              <FiBarChart2 size={12} />
              Reportes operativos
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-900">Estadísticas CCR</h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Reportes operativos por mes y responsable.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-[#D4E4D4] bg-[#F6FBF8] p-3 sm:flex-row sm:items-end">
            <label className="text-xs font-bold text-slate-700">
              Mes
              <select
                value={mes}
                onChange={(event) => setMes(Number(event.target.value))}
                className="mt-1 block w-full rounded-md border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#335FDB] focus:ring-2 focus:ring-blue-100"
              >
                {MESES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Año
              <input
                type="number"
                value={anio}
                onChange={(event) => setAnio(Number(event.target.value))}
                className="mt-1 block w-28 rounded-md border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-[#335FDB] focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <button
              type="button"
              onClick={() => void cargarReportes()}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#335FDB] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#284FC0]"
            >
              <FiRefreshCw size={14} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <section className={`rounded-xl border ${CARD_BORDER} bg-white p-10 text-center text-sm font-semibold text-slate-500`}>
          Cargando estadísticas...
        </section>
      ) : resumen && porResponsable && serie ? (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="Derivados del corte" value={resumen.corte.total_derivados} icon={<FiUsers />} />
            <KpiCard title="Pendientes" value={resumen.corte.pendientes} icon={<FiActivity />} />
            <KpiCard title="Rescate" value={resumen.corte.rescate} icon={<FiAlertTriangle />} tone="amber" />
            <KpiCard title="Ingresos del mes" value={resumen.actividad_mes.ingresos} icon={<FiTrendingUp />} />
            <KpiCard title="Egresos del mes" value={resumen.actividad_mes.egresos_total} icon={<FiBarChart2 />} />
            <KpiCard title="Sobre 90 días" value={resumen.corte.sobre_90_dias} icon={<FiAlertTriangle />} tone="rose" />
            <KpiCard title="Prom. días hasta ingreso" value={resumen.actividad_mes.promedio_dias_hasta_ingreso} icon={<FiTrendingUp />} />
            <KpiCard title="Abandonos del mes" value={resumen.actividad_mes.abandonos} icon={<FiAlertTriangle />} tone="rose" />
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={exportarCsv}
              className="ccr-export-button inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition"
            >
              <FiDownload className="text-[#1B5E3B]" size={14} />
              Exportar resumen CSV
            </button>
            <button
              type="button"
              onClick={() => void exportarExcelResponsables()}
              disabled={exportandoResponsables}
              className="ccr-export-button inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition disabled:opacity-60"
            >
              <FiDownload className="text-[#1B5E3B]" size={14} />
              {exportandoResponsables ? "Exportando..." : "Exportar Excel por responsable"}
            </button>
          </div>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-5">
            <ChartPanel
              title="Distribución por estado actual"
              subtitle="Estado actual de los pacientes del corte."
              className="xl:col-span-2"
            >
              {estadoActualData.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="h-[190px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={estadoActualData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={76}
                          paddingAngle={2}
                        >
                          {estadoActualData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 self-center">
                    {estadoActualData.map((item) => (
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
              ) : (
                <EmptyState text="Sin datos para graficar este corte." compact />
              )}
            </ChartPanel>

            <ChartPanel
              title="Tendencia anual de actividad"
              subtitle={`Derivaciones, ingresos y egresos durante ${serie.anio}.`}
              className="xl:col-span-3"
            >
              {tendencia.some((item) => item.derivados || item.ingresos || item.egresos) ? (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tendencia} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                      <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="derivados" name="Derivados" stroke="#335FDB" strokeWidth={3} />
                      <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#1B5E3B" strokeWidth={3} />
                      <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#B91C1C" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState text="Sin datos para graficar este año." compact />
              )}
            </ChartPanel>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <DistributionCard title="Resumen del corte por estado" items={resumen.por_estado} labelKey="label" />
            <DistributionCard title="Prioridad operativa" items={resumen.por_prioridad} labelKey="label" />
            <DistributionCard title="Categoría" items={resumen.por_categoria} labelKey="label" />
          </section>

          <section className={`rounded-xl border ${CARD_BORDER} bg-white p-5 shadow-sm`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Actividad del mes</h2>
                <p className="text-xs font-semibold text-slate-500">{resumen.periodo_label}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <MiniMetric label="Ingresos" value={resumen.actividad_mes.ingresos} />
              <MiniMetric label="Altas médicas" value={resumen.actividad_mes.altas_medicas} />
              <MiniMetric label="Egresos voluntarios" value={resumen.actividad_mes.egresos_voluntarios} />
              <MiniMetric label="Egresos admin." value={resumen.actividad_mes.egresos_administrativos ?? 0} />
              <MiniMetric label="Abandonos" value={resumen.actividad_mes.abandonos} />
              <MiniMetric label="Derivados" value={resumen.actividad_mes.derivados} />
            </div>
          </section>

          <section className={`rounded-xl border ${CARD_BORDER} bg-white p-5 shadow-sm`}>
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-900">Por responsable</h2>
              <p className="text-xs font-semibold text-slate-500">
                Incluye responsables sin pacientes asignados durante el corte.
              </p>
            </div>
            <ResponsablesTable responsables={porResponsable.responsables} />
            <div className="mt-4 rounded-lg border border-[#D4E4D4] bg-[#F6FBF8] p-3 text-xs font-semibold text-slate-700">
              Sin responsable: {porResponsable.sin_responsable.total_corte} del corte,
              {" "}
              {porResponsable.sin_responsable.pendientes} pendientes,
              {" "}
              {porResponsable.sin_responsable.rescate} en rescate y
              {" "}
              {porResponsable.sin_responsable.sobre_90_dias} sobre 90 días.
            </div>
          </section>

        </>
      ) : (
        <EmptyState text="Sin datos disponibles para el periodo seleccionado." />
      )}
    </main>
  );
}

function ChartPanel({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-xl border ${CARD_BORDER} bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  icon,
  tone = "green",
}: {
  title: string;
  value: number;
  icon: ReactNode;
  tone?: "green" | "amber" | "rose";
}) {
  const toneClasses = {
    green: "bg-[#E7F3EC] text-[#1B5E3B]",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <article className={`rounded-xl border ${CARD_BORDER} bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{formatNumber(value)}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          {icon}
        </div>
      </div>
    </article>
  );
}

function DistributionCard<T extends { total: number }>({
  title,
  items,
  labelKey,
}: {
  title: string;
  items: T[];
  labelKey: keyof T;
}) {
  const visibles = items.filter((item) => item.total > 0);
  return (
    <section className={`rounded-xl border ${CARD_BORDER} bg-white p-5 shadow-sm`}>
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      <div className="mt-4 space-y-2">
        {visibles.length > 0 ? (
          visibles.map((item, index) => (
            <div key={`${String(item[labelKey])}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{String(item[labelKey])}</span>
              <span className="rounded-full bg-[#E7F3EC] px-2 py-1 text-xs font-black text-[#1B5E3B]">
                {item.total}
              </span>
            </div>
          ))
        ) : (
          <EmptyState text="Sin registros en este corte." compact />
        )}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{formatNumber(value)}</p>
    </div>
  );
}

function ResponsablesTable({ responsables }: { responsables: ReporteResponsableItem[] }) {
  if (responsables.length === 0) {
    return <EmptyState text="No hay responsables para mostrar." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead>
          <tr className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
            <th className="px-3 py-3">Responsable CCR</th>
            <th className="px-3 py-3">Asignados corte</th>
            <th className="px-3 py-3">Pendientes</th>
            <th className="px-3 py-3">Rescate</th>
            <th className="px-3 py-3">Ingresos mes</th>
            <th className="px-3 py-3">Egresos mes</th>
            <th className="px-3 py-3">Altas</th>
            <th className="px-3 py-3">Egresos admin.</th>
            <th className="px-3 py-3">Abandonos</th>
            <th className="px-3 py-3">Prom. días</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {responsables.map((item) => (
            <tr key={item.responsable_id ?? item.responsable_nombre ?? "sin-responsable"} className="hover:bg-[#F6FBF8]">
              <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-900">
                {item.responsable_nombre ?? "Sin nombre"}
              </td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.total_asignados_corte}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.pendientes}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.rescate}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.ingresos_mes}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.egresos_mes}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.altas_medicas_mes}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.egresos_administrativos_mes ?? 0}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.abandonos_mes}</td>
              <td className="px-3 py-3 font-semibold text-slate-700">{item.promedio_dias_hasta_ingreso}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-dashed border-[#D4E4D4] bg-[#F6FBF8] text-center text-sm font-semibold text-slate-500 ${compact ? "px-3 py-4" : "p-8"}`}>
      {text}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
}
