"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { unwrapResults } from "@/lib/swr";
import type { Categoria, Paciente, PaginatedResponse } from "@/lib/types";
import { CATEGORIA_LABELS } from "@/lib/types";
import { TONO_CATEGORIA } from "./AgendaGrid";

interface MesSerie {
  mes: number;
  total_derivados: number;
  ingresos: number;
  egresos_total: number;
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Color de la categoria (mismo que la Agenda), leido de la clase del punto.
function hexCategoria(cat: Categoria) {
  return TONO_CATEGORIA[cat]?.dot.match(/#[0-9A-Fa-f]{6}/)?.[0] ?? "#A2A8B0";
}

const TRAMOS = [
  { label: "0–3 m", min: 0, max: 90, color: "#8FB4F8" },
  { label: "3–6 m", min: 91, max: 180, color: "#5E90F1" },
  { label: "6–12 m", min: 181, max: 365, color: "#3B74E8" },
  { label: "+1 año", min: 366, max: Infinity, color: "#22448D" },
];

function Panel({
  titulo,
  detalle,
  leyenda,
  children,
}: {
  titulo: string;
  detalle: string;
  leyenda?: Array<{ nombre: string; color: string; punteado?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <section className="ccr-panel flex flex-col p-5">
      <h2 className="text-sm font-bold text-slate-950 dark:text-white">{titulo}</h2>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">{detalle}</p>
      {leyenda && (
        <div className="mt-2 flex flex-wrap gap-3">
          {leyenda.map((l) => (
            <span key={l.nombre} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-ink-black-200">
              <span
                aria-hidden="true"
                className="h-0.5 w-4 rounded-full"
                style={l.punteado ? { backgroundImage: `linear-gradient(90deg, ${l.color} 60%, transparent 0)`, backgroundSize: "6px 2px" } : { background: l.color }}
              />
              {l.nombre}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 h-[220px]">{children}</div>
    </section>
  );
}

function TooltipCaja({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: { fill?: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_8px_24px_-12px_rgba(22,24,27,0.3)] dark:border-ink-black-600 dark:bg-ink-black-800">
      {label && <p className="mb-1 font-bold text-slate-950 dark:text-white">{label}</p>}
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-2 font-semibold text-slate-600 dark:text-ink-black-200">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color ?? item.payload?.fill }} aria-hidden="true" />
          {item.name}: <span className="font-bold tabular-nums text-slate-950 dark:text-white">{item.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function GraficosInicio() {
  const [pendientes, setPendientes] = useState<Paciente[]>([]);
  const [serie, setSerie] = useState<MesSerie[]>([]);
  const [cargando, setCargando] = useState(true);
  const anio = new Date().getFullYear();

  useEffect(() => {
    let activo = true;
    Promise.allSettled([
      api.get<Paciente[] | PaginatedResponse<Paciente>>("/pacientes/?estado=PENDIENTE"),
      api.get<{ meses: MesSerie[] }>(`/reportes/serie-mensual/?anio=${anio}`),
    ]).then(([pac, ser]) => {
      if (!activo) return;
      if (pac.status === "fulfilled") setPendientes(unwrapResults(pac.value));
      if (ser.status === "fulfilled") setSerie(ser.value.meses ?? []);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [anio]);

  const porCategoria = useMemo(() => {
    const conteo = new Map<Categoria, number>();
    pendientes.forEach((p) => conteo.set(p.categoria, (conteo.get(p.categoria) ?? 0) + 1));
    return Array.from(conteo.entries())
      .map(([cat, total]) => ({ nombre: CATEGORIA_LABELS[cat] ?? cat, total, fill: hexCategoria(cat) }))
      .sort((a, b) => b.total - a.total);
  }, [pendientes]);

  const porTramo = useMemo(
    () =>
      TRAMOS.map((t) => ({
        nombre: t.label,
        total: pendientes.filter((p) => (p.dias_en_lista ?? 0) >= t.min && (p.dias_en_lista ?? 0) <= t.max).length,
        fill: t.color,
      })),
    [pendientes],
  );

  const mesActual = new Date().getMonth() + 1;
  const movimiento = useMemo(
    () =>
      serie
        .filter((m) => m.mes <= mesActual)
        .map((m) => ({
          nombre: MESES_CORTOS[m.mes - 1],
          Derivados: m.total_derivados,
          Ingresos: m.ingresos,
          Egresos: m.egresos_total,
        })),
    [serie, mesActual],
  );

  const eje = { fontSize: 11, fill: "#6B7179", fontWeight: 600 };
  const vacio = (
    <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-xs font-semibold text-slate-400 dark:bg-ink-black-700">
      {cargando ? "Cargando…" : "Sin datos para mostrar"}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Panel titulo="Lista de espera por categoría" detalle={`${pendientes.length} pacientes pendientes`}>
        {porCategoria.length === 0 ? vacio : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porCategoria} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="nombre" width={92} tick={eje} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipCaja />} cursor={{ fill: "rgba(59,116,232,0.06)" }} />
              <Bar dataKey="total" name="Pacientes" radius={[0, 6, 6, 0]} animationDuration={700}>
                {porCategoria.map((d) => (
                  <Cell key={d.nombre} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel titulo="Tiempo de espera" detalle="Tiempo desde la derivación de los pacientes pendientes">
        {pendientes.length === 0 ? vacio : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porTramo} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#ECEEF1" />
              <XAxis dataKey="nombre" tick={eje} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={eje} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<TooltipCaja />} cursor={{ fill: "rgba(59,116,232,0.06)" }} />
              <Bar dataKey="total" name="Pacientes" radius={[6, 6, 0, 0]} animationDuration={700}>
                {porTramo.map((d) => (
                  <Cell key={d.nombre} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel
        titulo={`Movimiento ${anio}`}
        detalle="Pacientes derivados, ingresados y egresados por mes"
        leyenda={[
          { nombre: "Derivados", color: "#3B74E8" },
          { nombre: "Ingresos", color: "#1F7A4D" },
          { nombre: "Egresos", color: "#B42318", punteado: true },
        ]}
      >
        {movimiento.length === 0 ? vacio : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={movimiento} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gradDerivados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B74E8" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#3B74E8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#ECEEF1" />
              <XAxis dataKey="nombre" tick={eje} axisLine={false} tickLine={false} />
              <YAxis tick={eje} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<TooltipCaja />} />
              <Area type="monotone" dataKey="Derivados" stroke="#3B74E8" strokeWidth={2} fill="url(#gradDerivados)" animationDuration={800} />
              <Area type="monotone" dataKey="Ingresos" stroke="#1F7A4D" strokeWidth={2} fill="transparent" animationDuration={800} />
              <Area type="monotone" dataKey="Egresos" stroke="#B42318" strokeWidth={2} strokeDasharray="4 3" fill="transparent" animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
