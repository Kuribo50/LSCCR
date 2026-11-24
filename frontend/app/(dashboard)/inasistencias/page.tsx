"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import dynamic from "next/dynamic";
import { FiAlertTriangle, FiChevronDown, FiExternalLink, FiLink, FiRefreshCw, FiSearch, FiUserX } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut, limpiarRut } from "@/lib/rut";
import type { InasistenciasResumen, InasistenciaPacienteResumen, Paciente } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import SelectFiltro from "@/components/SelectFiltro";
import MenuAcciones from "@/components/MenuAcciones";
import { TableSkeleton } from "@/components/Skeleton";
import { fechaDDMMAAAA } from "@/lib/utils";

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
type Orden = "SIN_JUSTIFICAR" | "RECIENTE" | "NOMBRE";

function hace(dias: number) {
  const f = new Date();
  f.setDate(f.getDate() - dias);
  return f.toISOString().slice(0, 10);
}

function toNombre(valor: string) {
  return valor.toLocaleLowerCase("es-CL").replace(/\p{L}+/gu, (w) => w.charAt(0).toLocaleUpperCase("es-CL") + w.slice(1));
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
  const [orden, setOrden] = useState<Orden>("SIN_JUSTIFICAR");
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
    const lista = items.filter((i) => {
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
    return [...lista].sort((a, b) => {
      if (orden === "NOMBRE") return a.nombre.localeCompare(b.nombre, "es");
      if (orden === "RECIENTE") return (b.ultima_fecha || "").localeCompare(a.ultima_fecha || "");
      return b.no_justificadas - a.no_justificadas || (b.ultima_fecha || "").localeCompare(a.ultima_fecha || "");
    });
  }, [items, kine, vista, busqueda, orden]);

  if (!user) return null;

  return (
    <div className="ccr-dashboard-content space-y-4">
      <h1 className="sr-only">Inasistencias</h1>

      <section className="ccr-panel ccr-data-table overflow-hidden rounded-2xl">
      <div className="border-b border-[var(--border-subtle)] p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_200px_230px_200px_auto]">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} />
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
          <SelectFiltro
            label="Categoría"
            value={vista}
            onChange={(v) => setVista(v as Vista)}
            opciones={[
              { value: "TODOS", label: `Todos (${items.length})` },
              { value: "RIESGO", label: `2 o más sin justificar (${items.filter((i) => i.no_justificadas >= 2).length})`, dot: "bg-red-500" },
              { value: "UNA", label: `1 sin justificar (${items.filter((i) => i.no_justificadas === 1).length})`, dot: "bg-amber-400" },
            ]}
          />
          <SelectFiltro
            label="Ordenar por"
            value={orden}
            onChange={(v) => setOrden(v as Orden)}
            opciones={[
              { value: "SIN_JUSTIFICAR", label: "Más sin justificar" },
              { value: "RECIENTE", label: "Última inasistencia" },
              { value: "NOMBRE", label: "Nombre (A-Z)" },
            ]}
          />
          <div className="flex items-center justify-end">
            <MenuAcciones
              acciones={[
                {
                  label: "Actualizar",
                  detalle: "Vuelve a cargar las inasistencias",
                  tono: "azul",
                  icon: <FiRefreshCw size={13} aria-hidden="true" className={loading ? "animate-spin" : ""} />,
                  onClick: () => void cargar(),
                },
                {
                  label: "Copiar enlace",
                  detalle: "De esta vista",
                  tono: "gris",
                  icon: <FiLink size={13} aria-hidden="true" />,
                  onClick: () => {
                    void navigator.clipboard?.writeText(window.location.href).then(() => toast.info("Enlace copiado."));
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="m-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{error}</div>
      )}

      <div>
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
                          <span className="block font-semibold">{fechaDDMMAAAA(item.ultima_fecha)}</span>
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
                              className={`text-slate-500 dark:text-slate-400 transition-transform ${expandido ? "rotate-180" : ""}`}
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
                                  <span className="w-20 font-bold tabular-nums text-slate-700 dark:!text-white">{fechaDDMMAAAA(d.fecha)}</span>
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
          <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>
              Mostrando {visibles.length} de {items.length} pacientes · {data?.total_inasistencias ?? 0} inasistencias ·{" "}
              {data?.no_justificadas ?? 0} sin justificar ·{" "}
              <span className={(data?.en_riesgo ?? 0) > 0 ? "font-bold text-red-600 dark:text-red-300" : ""}>{data?.en_riesgo ?? 0} en riesgo</span>
            </p>
            <p>El número en rojo marca 2 o más sin justificar (evaluar abandono).</p>
          </div>
        )}
      </div>
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
