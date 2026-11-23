"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import dynamic from "next/dynamic";
import { FiAlertTriangle, FiChevronDown, FiExternalLink, FiRefreshCw, FiSearch, FiUserX } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { getErrorMessage } from "@/lib/errors";
import { esEncargado } from "@/lib/roles";
import { formatearRut, limpiarRut } from "@/lib/rut";
import type { InasistenciasResumen, InasistenciaPacienteResumen, Paciente } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import SelectFiltro from "@/components/SelectFiltro";
import { TableSkeleton } from "@/components/Skeleton";

const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });

// =============================================================================
// Filtros y helpers
// =============================================================================

const PERIODOS = [
  { value: "", label: "Todo el historial" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "365", label: "Último año" },
];

type Vista = "TODOS" | "RIESGO" | "UNA";

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function hace(dias: number) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f.toISOString().slice(0, 10);
}

function toNombre(valor: string) {
  return valor.toLocaleLowerCase("es-CL").replace(/\p{L}+/gu, (w) => w.charAt(0).toLocaleUpperCase("es-CL") + w.slice(1));
}

function Stat({ label, valor }: { label: string; valor: number }) {
  return (
    <span className="ccr-waitlist-stat">
      <span>{label}</span>
      <strong>{valor}</strong>
    </span>
  );
}

function ContadorInasistencias({ item }: { item: InasistenciaPacienteResumen }) {
  const riesgo = item.no_justificadas >= 2;
  return (
    <span
      className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${
        riesgo
          ? "bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-100"
          : item.no_justificadas === 0
            ? "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
            : "bg-amber-50 text-amber-800 dark:!bg-amber-400/15 dark:!text-amber-100"
      }`}
      title={`${item.no_justificadas} sin justificar · ${item.justificadas} justificadas`}
    >
      {item.no_justificadas}
    </span>
  );
}

// =============================================================================
// Página
// =============================================================================

export default function InasistenciasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fichaPaciente, setFichaPaciente] = useState<Paciente | null>(null);
  const [data, setData] = useState<InasistenciasResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [kine, setKine] = useState("TODOS");
  const [vista, setVista] = useState<Vista>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);

  // Al cambiar el periodo se vuelve a mostrar el estado de carga (ajuste durante el render).
  const [periodoCargado, setPeriodoCargado] = useState(periodo);
  if (periodoCargado !== periodo) {
    setPeriodoCargado(periodo);
    setLoading(true);
    setError("");
  }

  const traer = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (periodo) params.set("desde", hace(Number(periodo)));
      const res = await api.get<InasistenciasResumen>(`/pacientes/inasistencias-resumen/?${params.toString()}`);
      setData(res);
    } catch (e) {
      setData(null);
      setError(getErrorMessage(e, "No se pudieron cargar las inasistencias."));
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    await traer();
  }, [traer]);

  // La ficha necesita el paciente completo, no solo el resumen de inasistencias.
  async function abrirFicha(pacienteId: number) {
    try {
      setFichaPaciente(await api.get<Paciente>(`/pacientes/${pacienteId}/`));
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo abrir la ficha del paciente."));
    }
  }

  useCargaAlMontar(traer);

  const items = useMemo(() => data?.items ?? [], [data]);
  const kines = useMemo(
    () => Array.from(new Set(items.map((i) => i.kine_nombre || "Sin responsable"))).sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const qRut = limpiarRut(busqueda).toLowerCase();
    return items.filter((i) => {
      if (kine !== "TODOS" && (i.kine_nombre || "Sin responsable") !== kine) return false;
      if (vista === "RIESGO" && i.no_justificadas < 2) return false;
      if (vista === "UNA" && i.no_justificadas !== 1) return false;
      if (!q) return true;
      return (
        i.nombre.toLowerCase().includes(q) ||
        (qRut.length > 2 && i.rut.toLowerCase().includes(qRut)) ||
        (i.id_ccr || "").toLowerCase().includes(q)
      );
    });
  }, [items, kine, vista, busqueda]);

  const puedeVerTodos = user?.rol === "ADMIN" || esEncargado(user);

  if (!user) return null;

  return (
    <div className="ccr-dashboard-content space-y-4">
      <header className="ccr-waitlist-toolbar ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:!text-white">Inasistencias</h1>
            <p className="mt-0.5 text-xs font-semibold text-gray-500 dark:!text-ink-black-200">
              {puedeVerTodos
                ? "Pacientes con inasistencias registradas y cuántas lleva cada uno."
                : "Tus pacientes con inasistencias registradas y cuántas lleva cada uno."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Stat label="Pacientes" valor={data?.total_pacientes ?? 0} />
              <Stat label="Inasistencias" valor={data?.total_inasistencias ?? 0} />
              <Stat label="Sin justificar" valor={data?.no_justificadas ?? 0} />
              <Stat label="En riesgo" valor={data?.en_riesgo ?? 0} />
            </div>
            <button
              type="button"
              onClick={() => void cargar()}
              className="ccr-button-refresh inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold"
            >
              <FiRefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Recargar
            </button>
          </div>
        </div>
      </header>

      <section className="ccr-panel space-y-3 rounded-2xl p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, RUT o ID"
              aria-label="Buscar paciente"
              className="ccr-control-input h-12 w-full pl-9 pr-3 text-sm"
            />
          </div>
          <SelectFiltro
            label="Periodo"
            value={periodo}
            onChange={setPeriodo}
            opciones={PERIODOS}
          />
          <SelectFiltro
            label="Responsable"
            value={kine}
            todos={{ value: "TODOS", label: "Todos" }}
            opciones={kines.map((k) => ({ value: k, label: k }))}
            onChange={setKine}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { v: "TODOS", label: "Todos", n: items.length },
              { v: "RIESGO", label: "2 o más sin justificar", n: items.filter((i) => i.no_justificadas >= 2).length },
              { v: "UNA", label: "1 sin justificar", n: items.filter((i) => i.no_justificadas === 1).length },
            ] as Array<{ v: Vista; label: string; n: number }>
          ).map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setVista(f.v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                vista === f.v
                  ? "bg-blue-600 text-white"
                  : "bg-[var(--bg-elevated)] text-slate-600 hover:bg-blue-50 dark:!text-ink-black-200"
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${vista === f.v ? "text-white/80" : "text-[var(--text-muted)]"}`}>{f.n}</span>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{error}</div>
      )}

      <section className="ccr-panel ccr-data-table overflow-hidden rounded-2xl">
        {loading ? (
          <div className="p-3">
            <TableSkeleton rows={6} />
          </div>
        ) : visibles.length === 0 ? (
          <div className="p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] text-blue-500">
              <FiUserX size={26} />
            </span>
            <p className="mt-3 text-sm font-bold text-slate-700 dark:!text-white">
              {items.length === 0 ? "Aún no hay inasistencias registradas" : "Ningún paciente coincide con los filtros"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs font-medium text-[var(--text-muted)]">
              {items.length === 0
                ? "Se registran desde la ficha del paciente ingresado o desde la Agenda, al marcar que no asistió."
                : "Prueba con otro periodo o responsable."}
            </p>
          </div>
        ) : (
          <div className="ccr-table-scroll max-h-[680px] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)]">
                <tr>
                  {["Paciente", "RUT", "Responsable", "Estado", "Sin justificar", "Justificadas", "Total", "Última", ""].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((item) => {
                  const expandido = abierto === item.paciente_id;
                  return (
                    <Fragment key={item.paciente_id}>
                      <tr
                        className="cursor-pointer border-t border-[var(--border-subtle)] transition hover:bg-[var(--bg-elevated)]/60"
                        onClick={() => setAbierto(expandido ? null : item.paciente_id)}
                        aria-expanded={expandido}
                      >
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            {item.no_justificadas >= 2 && (
                              <FiAlertTriangle className="shrink-0 text-red-600" size={13} aria-label="En riesgo de abandono" />
                            )}
                            <span className="max-w-[230px] truncate font-bold text-slate-800 dark:!text-white">{toNombre(item.nombre)}</span>
                          </span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-[var(--text-muted)]">{item.id_ccr}</span>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600 dark:!text-ink-black-200">{formatearRut(item.rut)}</td>
                        <td className="px-3 py-3 text-slate-600 dark:!text-ink-black-200">{item.kine_nombre || "Sin responsable"}</td>
                        <td className="px-3 py-3">
                          <BadgeEstado estado={item.estado} />
                        </td>
                        <td className="px-3 py-3">
                          <ContadorInasistencias item={item} />
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums text-slate-600 dark:!text-ink-black-200">{item.justificadas}</td>
                        <td className="px-3 py-3 font-bold tabular-nums text-slate-800 dark:!text-white">{item.total}</td>
                        <td className="px-3 py-3 text-slate-600 dark:!text-ink-black-200">
                          <span className="block font-semibold">{fechaCorta(item.ultima_fecha)}</span>
                          {item.ultimo_motivo && (
                            <span className="block max-w-[200px] truncate text-[10px] text-[var(--text-muted)]" title={item.ultimo_motivo}>
                              {item.ultimo_motivo}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void abrirFicha(item.paciente_id);
                              }}
                              className="ccr-control-button inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px]"
                            >
                              <FiExternalLink size={11} /> Ficha
                            </button>
                            <FiChevronDown
                              size={15}
                              className={`text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`}
                              aria-hidden
                            />
                          </span>
                        </td>
                      </tr>
                      {expandido && (
                        <tr className="bg-[var(--bg-elevated)]/50">
                          <td colSpan={9} className="px-6 py-3">
                            <ul className="space-y-1.5">
                              {item.detalle.map((d) => (
                                <li key={d.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span className="w-20 font-bold tabular-nums text-slate-700 dark:!text-white">{fechaCorta(d.fecha)}</span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      d.justificada
                                        ? "bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-100"
                                        : "bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-100"
                                    }`}
                                  >
                                    {d.justificada ? "Justificada" : "Sin justificar"}
                                  </span>
                                  <span className="text-slate-600 dark:!text-ink-black-200">{d.motivo || "Sin motivo registrado"}</span>
                                  {d.usuario_nombre && <span className="text-[var(--text-muted)]">· registró {d.usuario_nombre}</span>}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && visibles.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)]">
            Mostrando {visibles.length} de {items.length} pacientes · el número en rojo marca 2 o más inasistencias sin justificar
            (evaluar abandono).
          </div>
        )}
      </section>

      {fichaPaciente && user && (
        <FichaPaciente
          paciente={fichaPaciente}
          usuario={user}
          onClose={() => setFichaPaciente(null)}
          onRefresh={() => void cargar()}
        />
      )}
    </div>
  );
}
