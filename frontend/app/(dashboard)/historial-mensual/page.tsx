"use client";

import { puedeCargarDerivaciones } from "@/lib/roles";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  FiAlertTriangle,
  FiArrowDown,
  FiArrowUp,
  FiCalendar,
  FiCheckCircle,
  FiFilter,
  FiFileText,
  FiInfo,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiUsers,
  FiX,
} from "react-icons/fi";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import FiltroPildoras from "@/components/FiltroPildoras";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { TableSkeleton } from "@/components/Skeleton";
import RevertirCarga from "@/components/RevertirCarga";
import type {
  ImportacionDeletePeriodoResultado,
  ImportacionHistorialDetalle,
  ImportacionHistorialItem,
  ImportacionHistorialPaciente,
} from "@/lib/types";

interface HistorialGrupo {
  key: string;
  mes: number;
  anio: number;
  periodoLabel: string;
  items: ImportacionHistorialItem[];
  activo: ImportacionHistorialItem | null;
  usuarios: string[];
}

interface HistorialGrupoResumen {
  grupo: HistorialGrupo;
  activo: ImportacionHistorialItem;
  registrosMes: number;
  recurrentesMes: number;
  erroresMes: number;
  pendientesRevision: number;
  totalPeriodo: number;
  totalAcumulado: number;
  reemplazado: boolean;
}

function claseEstado(estado: ImportacionHistorialItem["estado"]) {
  if (estado === "COMPLETADO") return "ccr-preview-status ccr-preview-status-ok";
  if (estado === "CON_ERRORES") return "ccr-preview-status ccr-preview-status-error";
  if (estado === "REEMPLAZADO") return "ccr-preview-status !border-slate-200 !bg-slate-100 !text-slate-500";
  return "ccr-preview-status ccr-preview-status-duplicate";
}

const DOT_ESTADO: Record<string, string> = {
  COMPLETADO: "bg-emerald-500",
  CON_ERRORES: "bg-red-500",
  REEMPLAZADO: "bg-slate-400",
};

/** Pacientes del mes de derivación: en lista de espera (pendientes + rescate), ingresados y egresados. */
function desglose(item: ImportacionHistorialItem) {
  const p = item.pacientes_actuales_del_corte;
  const enLista = (p?.pendientes ?? 0) + (p?.rescate ?? 0);
  const ingresados = p?.ingresados ?? 0;
  const egresados = p?.egresados_total ?? 0;
  return { enLista, ingresados, egresados, total: enLista + ingresados + egresados };
}

const num = (n: number) => n.toLocaleString("es-CL");

function fechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistorialMensualPage() {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<ImportacionHistorialItem[]>([]);
  const [detalleHistorial, setDetalleHistorial] = useState<
    Record<string, ImportacionHistorialDetalle>
  >({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [periodoAEliminar, setPeriodoAEliminar] =
    useState<HistorialGrupo | null>(null);
  const [resultadoEliminacion, setResultadoEliminacion] =
    useState<ImportacionDeletePeriodoResultado | null>(null);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroAnio, setFiltroAnio] = useState<string[]>([]);
  const [filtroUsuario, setFiltroUsuario] = useState<string[]>([]);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [masAntiguoPrimero, setMasAntiguoPrimero] = useState(false);

  useEffect(() => {
    if (user && !puedeCargarDerivaciones(user)) {
      router.replace("/pacientes");
    }
  }, [user, router]);

  const cargarHistorial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<ImportacionHistorialItem[]>(
        "/importar/historial/",
      );
      setHistorial(data);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo cargar el historial mensual.");
      setError(message);
      toastError(message);
      setHistorial([]);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (user && puedeCargarDerivaciones(user)) {
      void cargarHistorial();
    }
  }, [user, cargarHistorial]);

  const grupos = useMemo<HistorialGrupo[]>(() => {
    const mapa = new Map<string, HistorialGrupo>();

    for (const item of historial) {
      const mes = item.mes_datos ?? item.mes;
      const anio = item.anio_datos ?? item.anio;
      const key = `${mes}-${anio}`;
      const grupo = mapa.get(key);

      if (grupo) {
        grupo.items.push(item);
      } else {
        mapa.set(key, {
          key,
          mes,
          anio,
          periodoLabel: item.periodo_label,
          items: [item],
          activo: null,
          usuarios: [],
        });
      }
    }

    return Array.from(mapa.values())
      .map((grupo) => {
        grupo.items.sort(
          (a, b) =>
            new Date(b.fecha_subida).getTime() -
            new Date(a.fecha_subida).getTime(),
        );
        grupo.activo =
          grupo.items.find((it) => it.estado !== "REEMPLAZADO") ??
          grupo.items[0] ??
          null;
        grupo.usuarios = Array.from(
          new Set(
            grupo.items
              .map((it) => it.usuario_nombre)
              .filter(Boolean) as string[],
          ),
        );
        return grupo;
      })
      .sort((a, b) => {
        if (a.anio !== b.anio) return b.anio - a.anio;
        return b.mes - a.mes;
      });
  }, [historial]);

  const gruposEnriquecidos = useMemo<HistorialGrupoResumen[]>(() => {
    const cronologicos = [...grupos].sort((a, b) => {
      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
    const resumenes: HistorialGrupoResumen[] = [];
    let totalAcumulado = 0;

    for (const grupo of cronologicos) {
      const activo = grupo.activo;
      if (!activo) continue;
      const registrosMes = grupo.items.reduce(
        (acc, item) => acc + item.registros_importados,
        0,
      );
      const recurrentesMes = grupo.items.reduce(
        (acc, item) => acc + item.duplicados,
        0,
      );
      const erroresMes = grupo.items.reduce(
        (acc, item) => acc + (item.errores_count ?? item.errores.length),
        0,
      );
      const pendientesRevision = grupo.items.reduce(
        (acc, item) => acc + (item.observaciones_pendientes_count ?? 0),
        0,
      );
      const totalPeriodo = activo.total_registros;
      totalAcumulado += totalPeriodo;

      resumenes.push({
        grupo,
        activo,
        registrosMes,
        recurrentesMes,
        erroresMes,
        pendientesRevision,
        totalPeriodo,
        totalAcumulado,
        reemplazado: activo.estado === "REEMPLAZADO",
      });
    }

    return resumenes;
  }, [grupos]);

  const estadoOptions = useMemo(
    () =>
      Array.from(
        new Map(
          gruposEnriquecidos.map(({ activo }) => [
            activo.estado,
            activo.estado_label,
          ]),
        ).entries(),
      ),
    [gruposEnriquecidos],
  );

  const anioOptions = useMemo(
    () =>
      Array.from(new Set(gruposEnriquecidos.map(({ grupo }) => grupo.anio))).sort(
        (a, b) => b - a,
      ),
    [gruposEnriquecidos],
  );

  const gruposFiltrados = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-CL");

    return gruposEnriquecidos.filter(({ grupo, activo }) => {
      const textoBusqueda = [
        grupo.periodoLabel,
        grupo.mes,
        grupo.anio,
        activo.estado_label,
        grupo.usuarios.join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase("es-CL");

      const coincideBusqueda = !query || textoBusqueda.includes(query);
      const coincideEstado = !filtroEstado || activo.estado === filtroEstado;
      const coincideAnio = filtroAnio.length === 0 || filtroAnio.includes(String(grupo.anio));
      const coincideUsuario = filtroUsuario.length === 0 || grupo.usuarios.some((u) => filtroUsuario.includes(u));

      return coincideBusqueda && coincideEstado && coincideAnio && coincideUsuario;
    });
  }, [filtroAnio, filtroEstado, filtroUsuario, gruposEnriquecidos, search]);

  // Los acumulados se calculan de más antiguo a más nuevo; la vista parte mostrando lo más nuevo primero.
  const gruposOrdenados = useMemo(
    () => (masAntiguoPrimero ? gruposFiltrados : [...gruposFiltrados].reverse()),
    [gruposFiltrados, masAntiguoPrimero],
  );

  const usuarioOptions = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const { grupo } of gruposEnriquecidos) for (const u of grupo.usuarios) mapa.set(u, (mapa.get(u) ?? 0) + 1);
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "es"))
      .map(([value, total]) => ({ value, label: value, total }));
  }, [gruposEnriquecidos]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (filtroEstado ? 1 : 0) + filtroAnio.length + filtroUsuario.length;

  function limpiarFiltros() {
    setSearch("");
    setFiltroEstado("");
    setFiltroAnio([]);
    setFiltroUsuario([]);
  }

  // Tras revertir una carga, el periodo cambia: se recarga todo el historial.
  const recargarTrasRevertir = useCallback(() => {
    setDetalleHistorial({});
    setExpandido(null);
    void cargarHistorial();
  }, [cargarHistorial]);

  const cargarDetalle = useCallback(
    async (grupo: HistorialGrupo) => {
      const key = grupo.key;
      if (detalleHistorial[key]) {
        setExpandido((prev) => (prev === key ? null : key));
        return;
      }

      try {
        const data = await api.get<ImportacionHistorialDetalle>(
          `/importar/historial/${grupo.mes}/${grupo.anio}/`,
        );
        setDetalleHistorial((prev) => ({ ...prev, [key]: data }));
      } catch {
        setDetalleHistorial((prev) => ({
          ...prev,
          [key]: {
            mes: grupo.mes,
            anio: grupo.anio,
            mes_label: grupo.periodoLabel,
            pacientes: [],
            items: grupo.items,
          },
        }));
      }

      setExpandido((prev) => (prev === key ? null : key));
    },
    [detalleHistorial],
  );

  async function confirmarEliminar() {
    if (!periodoAEliminar) return;
    setEliminando(true);
    setError("");

    try {
      const data = await api.delete<ImportacionDeletePeriodoResultado>(
        `/importar/historial/${periodoAEliminar.mes}/${periodoAEliminar.anio}/`,
      );
      setResultadoEliminacion(data);
      setDetalleHistorial((prev) => {
        const next = { ...prev };
        delete next[periodoAEliminar.key];
        return next;
      });
      if (expandido === periodoAEliminar.key) {
        setExpandido(null);
      }
      setPeriodoAEliminar(null);
      await cargarHistorial();
      toastSuccess("Datos del periodo eliminados correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudieron eliminar los datos del periodo.");
      setError(message);
      toastError(message);
    } finally {
      setEliminando(false);
    }
  }

  if (!user || !puedeCargarDerivaciones(user)) return null;

  const esAdmin = user?.rol === "ADMIN";
  const ultimoCorte = gruposEnriquecidos[gruposEnriquecidos.length - 1];
  const desgloseUltimoCorte = ultimoCorte ? desglose(ultimoCorte.activo) : null;
  const resumenEliminar = periodoAEliminar
    ? gruposEnriquecidos.find(({ grupo }) => grupo.key === periodoAEliminar.key)
    : undefined;
  const resumenDetalle = expandido
    ? gruposEnriquecidos.find(({ grupo }) => grupo.key === expandido)
    : undefined;
  const itemsDetalle = resumenDetalle
    ? detalleHistorial[resumenDetalle.grupo.key]?.items ?? resumenDetalle.grupo.items
    : [];
  const pacientesDetalle: ImportacionHistorialPaciente[] = resumenDetalle
    ? detalleHistorial[resumenDetalle.grupo.key]?.pacientes ?? []
    : [];
  const chip = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold";

  return (
    <div className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-2rem))] flex-col overflow-hidden border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800">
        <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-ink-black-600 dark:bg-ink-black-800">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-950 dark:text-white">Historial de cortes mensuales</h1>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{gruposEnriquecidos.length}</span> periodos
                  {gruposFiltrados.length !== gruposEnriquecidos.length && (
                    <>
                      {" · "}mostrando <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{gruposFiltrados.length}</span>
                    </>
                  )}
                  {ultimoCorte && (
                    <>
                      {" · "}último corte{" "}
                      <span className="font-bold text-slate-800 dark:text-ink-black-100">{ultimoCorte.grupo.periodoLabel}</span>
                    </>
                  )}
                  .
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void cargarHistorial()} className="ccr-control-button" title="Volver a cargar">
                  <FiRefreshCw size={13} aria-hidden="true" className={loading ? "animate-spin" : ""} />
                  Actualizar
                </button>
                <Link href="/importar" className="ccr-export-button">
                  <FiUpload size={13} aria-hidden="true" />
                  Importar derivaciones
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-ink-black-600 dark:bg-ink-black-900">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-ink-black-300">Ingresadas a lista de espera</p>
                <p className="text-lg font-black tabular-nums leading-tight text-blue-600 dark:text-blue-300">{num(desgloseUltimoCorte?.enLista ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-ink-black-300">Pendientes + rescate del último corte</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-ink-black-600 dark:bg-ink-black-900">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-ink-black-300">Recurrentes</p>
                <p className="text-lg font-black tabular-nums leading-tight text-slate-700 dark:text-white">{num(ultimoCorte?.recurrentesMes ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-ink-black-300">Ya estaban en el sistema</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-ink-black-600 dark:bg-ink-black-900">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-ink-black-300">Pacientes nuevos</p>
                <p className="text-lg font-black tabular-nums leading-tight text-emerald-600 dark:text-emerald-300">{num(ultimoCorte?.registrosMes ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-ink-black-300">Ingresados por primera vez</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-ink-black-600 dark:bg-ink-black-900">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-ink-black-300">Total pacientes</p>
                <p className="text-lg font-black tabular-nums leading-tight text-slate-900 dark:text-white">{num(desgloseUltimoCorte?.total ?? 0)}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400 dark:text-ink-black-300">Personas del corte completo</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
              <div className="relative order-1 min-w-0 flex-1 sm:max-w-sm">
                <FiSearch className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={15} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar periodo, año o usuario"
                  aria-label="Buscar cortes"
                  className="ccr-control-input w-full pl-9 pr-3"
                />
              </div>
              <button
                type="button"
                onClick={() => setMasAntiguoPrimero((v) => !v)}
                className="ccr-control-button order-2 ml-auto"
                title="Cambiar el orden de la tabla"
              >
                {masAntiguoPrimero ? <FiArrowUp size={13} aria-hidden="true" /> : <FiArrowDown size={13} aria-hidden="true" />}
                {masAntiguoPrimero ? "Más antiguos primero" : "Más recientes primero"}
              </button>
              <button
                type="button"
                onClick={() => setFiltrosAbiertos((prev) => !prev)}
                className="ccr-control-button order-2"
                aria-expanded={filtrosAbiertos}
                aria-controls="historial-filtros"
              >
                <FiFilter size={13} aria-hidden="true" />
                Filtros
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">{activeFilterCount}</span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  aria-label="Quitar todos los filtros"
                  title="Quitar filtros"
                  className="order-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-900/60 dark:bg-transparent dark:text-red-300"
                >
                  <FiX size={15} aria-hidden="true" />
                </button>
              )}
            </div>

            {filtrosAbiertos && (
              <motion.div
                id="historial-filtros"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-ink-black-700 sm:grid-cols-2 lg:grid-cols-4"
              >
                <MultiSelectFiltro
                  anchoCompleto
                  textoTodos
                  label="Año"
                  values={filtroAnio}
                  opciones={anioOptions.map((anio) => ({
                    value: String(anio),
                    label: String(anio),
                    total: gruposEnriquecidos.filter(({ grupo }) => grupo.anio === anio).length,
                  }))}
                  onChange={setFiltroAnio}
                />
                <MultiSelectFiltro
                  anchoCompleto
                  textoTodos
                  label="Usuario"
                  values={filtroUsuario}
                  opciones={usuarioOptions}
                  onChange={setFiltroUsuario}
                />
              </motion.div>
            )}

          </div>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-2 dark:border-ink-black-600">
          <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-ink-black-300">
            <FiInfo size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">
              {esAdmin
                ? "Borrar un periodo elimina sus pacientes y cargas."
                : "Solo quien subió una carga puede revertirla durante los primeros 10 minutos."}
            </span>
          </p>
          <FiltroPildoras
            ariaLabel="Filtrar por estado del corte"
            layoutId="historial-estado-activo"
            valor={filtroEstado}
            onChange={setFiltroEstado}
            opciones={[
              { value: "", label: "Todos", total: gruposEnriquecidos.length },
              ...estadoOptions.map(([estado, label]) => ({
                value: estado,
                label,
                dot: DOT_ESTADO[estado],
                total: gruposEnriquecidos.filter(({ activo }) => activo.estado === estado).length,
              })),
            ]}
          />
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{error}</div>
        )}

        {resultadoEliminacion && (
          <div className="flex items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-100">
              Periodo eliminado: {resultadoEliminacion.pacientes_eliminados} pacientes, {resultadoEliminacion.importaciones_eliminadas} importaciones y{" "}
              {resultadoEliminacion.archivos_eliminados} archivos.
            </p>
            <button
              type="button"
              onClick={() => setResultadoEliminacion(null)}
              aria-label="Cerrar aviso"
              className="rounded-md px-1.5 py-1 text-blue-700 hover:bg-blue-100 dark:text-blue-100 dark:hover:bg-white/10"
            >
              <FiX size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <TableSkeleton rows={6} />
          </div>
        ) : (
          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/70 dark:bg-ink-black-900">
            <div className="min-h-0 flex-1 overflow-auto p-4 [animation:tableFadeIn_260ms_ease-out] sm:p-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {gruposFiltrados.length === 0 ? (
                    <div className="col-span-full flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-gray-400 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200">
                        No hay cortes con los filtros seleccionados.
                    </div>
                  ) : (
                    gruposOrdenados.map((itemResumen, indice) => {
                      const { grupo, activo, registrosMes, recurrentesMes, erroresMes, pendientesRevision, totalAcumulado, reemplazado } =
                        itemResumen;
                      const detalle = detalleHistorial[grupo.key];
                      const estaExpandido = expandido === grupo.key;
                      const sinIncidencias = recurrentesMes + erroresMes + pendientesRevision === 0;
                      const d = desglose(activo);
                      const indiceHistorico = gruposEnriquecidos.findIndex(({ grupo: grupoActual }) => grupoActual.key === grupo.key);
                      const anterior = indiceHistorico > 0 ? gruposEnriquecidos[indiceHistorico - 1] : undefined;
                      const enListaAnterior = anterior ? desglose(anterior.activo).enLista : null;
                      const crecimiento = enListaAnterior === null ? null : d.enLista - enListaAnterior;
                      const crecimientoPorcentaje = enListaAnterior && enListaAnterior > 0 && crecimiento !== null
                        ? Math.round((crecimiento / enListaAnterior) * 100)
                        : null;
                      const anioNuevo = indice === 0 || gruposOrdenados[indice - 1].grupo.anio !== grupo.anio;
                      const delAnio = gruposOrdenados.filter((r) => r.grupo.anio === grupo.anio);
                      const totalAnio = delAnio.reduce((acc, r) => acc + desglose(r.activo).total, 0);

                      return (
                        <Fragment key={grupo.key}>
                          {anioNuevo && (
                            <div className="col-span-full flex items-center gap-3 px-1 pt-1">
                              <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white">{grupo.anio}</span>
                              <span className="h-px flex-1 bg-slate-200 dark:bg-ink-black-600" />
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
                                  {delAnio.length} periodo{delAnio.length !== 1 ? "s" : ""} · {num(totalAnio)} pacientes
                              </span>
                            </div>
                          )}
                          <article
                            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(37,99,235,0.08)] dark:border-ink-black-600 dark:bg-ink-black-800 ${reemplazado ? "opacity-75" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-expanded={estaExpandido}
                            aria-label={`Ver detalle de ${grupo.periodoLabel}`}
                            onClick={() => void cargarDetalle(grupo)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void cargarDetalle(grupo);
                              }
                            }}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 dark:border-ink-black-700 sm:px-5">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
                                  <FiCalendar size={18} aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h2 className={`truncate text-base font-black text-slate-950 dark:text-white ${reemplazado ? "line-through" : ""}`}>{grupo.periodoLabel}</h2>
                                    <span className={claseEstado(activo.estado)}>{activo.estado_label}</span>
                                  </div>
                                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                                    <span>{grupo.items.length} corte{grupo.items.length !== 1 ? "s" : ""}</span>
                                    <span className="text-slate-300 dark:text-ink-black-600">·</span>
                                    <span>{fechaHora(activo.fecha_subida)}</span>
                                    <span className="text-slate-300 dark:text-ink-black-600">·</span>
                                    <span>{grupo.usuarios.join(", ") || "Usuario no disponible"}</span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => void cargarDetalle(grupo)}
                                  aria-expanded={estaExpandido}
                                  className="ccr-control-button inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
                                >
                                  <FiFileText size={13} aria-hidden="true" />
                                  Ver detalle
                                </button>
                                {activo.revertible && (
                                  <RevertirCarga
                                    corteId={activo.id}
                                    hasta={activo.revertible_hasta}
                                    descripcion={`${activo.periodo_label} · ${activo.archivo_nombre}`}
                                    onRevertida={recargarTrasRevertir}
                                    compacto
                                  />
                                )}
                                {esAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => setPeriodoAEliminar(grupo)}
                                    aria-label={`Borrar ${grupo.periodoLabel}`}
                                    title="Borrar periodo"
                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-500/10"
                                  >
                                    <FiTrash2 size={12} /> Borrar
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 divide-y divide-slate-100 border-b border-slate-100 dark:divide-ink-black-700 dark:border-ink-black-700 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                              {(
                                [
                                  ["Ingresadas a lista de espera", d.enLista, FiUsers, "text-blue-600 dark:text-blue-300"],
                                  ["Recurrentes", recurrentesMes, FiRefreshCw, "text-slate-700 dark:text-white"],
                                  ["Pacientes nuevos", registrosMes, FiUpload, "text-emerald-600 dark:text-emerald-300"],
                                  ["Total pacientes", d.total, FiUsers, "text-slate-950 dark:text-white"],
                                ] as Array<[string, number, typeof FiFileText, string]>
                              ).map(([label, value, Icon, color]) => (
                                <div key={label} className="flex items-center gap-2 px-4 py-3 sm:px-3">
                                  <Icon size={14} className="shrink-0 text-slate-400 dark:text-ink-black-300" aria-hidden="true" />
                                  <div className="min-w-0">
                                    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-ink-black-300">{label}</p>
                                    <p className={`text-sm font-black tabular-nums ${color}`}>{num(value)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {sinIncidencias && (
                                  <span className={`${chip} bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-100`}>
                                    <FiCheckCircle size={10} /> Sin incidencias
                                  </span>
                                )}
                                {recurrentesMes > 0 && (
                                  <span className={`${chip} bg-blue-50 text-blue-800 dark:!bg-[#151b2e] dark:!text-ink-black-100`}>
                                    {recurrentesMes} recurrente{recurrentesMes !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {erroresMes > 0 && (
                                  <span className={`${chip} bg-red-50 text-red-700 dark:!bg-red-500/15 dark:!text-red-100`}>
                                    {erroresMes} error{erroresMes !== 1 ? "es" : ""}
                                  </span>
                                )}
                                {pendientesRevision > 0 && (
                                  <Link
                                    href="/importar/revision"
                                    onClick={(event) => event.stopPropagation()}
                                    title="Ir a la revisión de carga"
                                    className={`${chip} bg-amber-50 text-amber-800 hover:bg-amber-100 dark:!bg-amber-400/15 dark:!text-amber-100`}
                                  >
                                    <FiAlertTriangle size={10} /> {pendientesRevision} por revisar
                                  </Link>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-400 dark:text-ink-black-300">
                                <span>Acumulado: <strong className="tabular-nums text-slate-600 dark:text-ink-black-200">{num(totalAcumulado)}</strong></span>
                                {crecimiento !== null && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold ${crecimiento > 0 ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" : crecimiento < 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200"}`}>
                                    {crecimiento > 0 ? "↑" : crecimiento < 0 ? "↓" : "="} {crecimiento > 0 ? "+" : ""}{num(crecimiento)} en espera vs. mes anterior{crecimientoPorcentaje !== null ? ` (${crecimientoPorcentaje > 0 ? "+" : ""}${crecimientoPorcentaje}%)` : ""}
                                  </span>
                                )}
                              </div>
                            </div>

                          {false && (
                            <div className="border-t border-blue-100 bg-blue-50/40 p-3 dark:border-blue-500/20 dark:bg-blue-500/5 sm:p-4">
                                <div className="space-y-2">
                                  {(detalle?.items ?? grupo.items).map((item, pos, lista) => (
                                    <div key={item.id} className="rounded-lg border border-[#d9e1ea] bg-white p-3 dark:border-[#2f3440] dark:bg-[#151515]">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">
                                            Corte {lista.length - pos} de {lista.length}
                                            {item.estado === "REEMPLAZADO" ? " · reemplazado" : pos === 0 ? " · vigente" : ""}
                                          </p>
                                          <p className="truncate text-xs font-bold text-gray-800 dark:text-white" title={item.archivo_nombre}>
                                            {item.archivo_nombre || "Archivo sin nombre"}
                                          </p>
                                          <p className="text-[11px] text-gray-500 dark:text-ink-black-300">
                                            {fechaHora(item.fecha_subida)} · {item.usuario_nombre || "Usuario no disponible"}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className={claseEstado(item.estado)}>{item.estado_label}</span>
                                          {item.revertible ? (
                                            <RevertirCarga
                                              corteId={item.id}
                                              hasta={item.revertible_hasta}
                                              descripcion={`${item.periodo_label} · ${item.archivo_nombre}`}
                                              onRevertida={recargarTrasRevertir}
                                              compacto
                                            />
                                          ) : (
                                            <span className={`${chip} ${item.en_ventana ? "bg-blue-50 text-blue-800 dark:!bg-[#151b2e] dark:!text-ink-black-100" : "bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-100"}`}>
                                              {item.en_ventana ? "En ventana de reversión" : "Consolidada"}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                                        {(
                                          [
                                            ["Total en archivo", item.total_registros],
                                            ["Importados", item.registros_importados],
                                            ["Duplicados", item.duplicados],
                                            ["Por revisar", item.observaciones_pendientes_count ?? 0],
                                          ] as Array<[string, number]>
                                        ).map(([k, v]) => (
                                          <div key={k} className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-[#202020]">
                                            <dt className="font-semibold text-gray-500 dark:text-ink-black-300">{k}</dt>
                                            <dd className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{v.toLocaleString("es-CL")}</dd>
                                          </div>
                                        ))}
                                      </dl>

                                      {item.errores.length > 0 ? (
                                        <div className="mt-2 space-y-1">
                                          {item.errores.slice(0, 8).map((err, idx) => (
                                            <div
                                              key={`${item.id}-${idx}`}
                                              className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:!bg-red-500/10 dark:!text-red-100"
                                            >
                                              {err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}: {err.motivo}
                                            </div>
                                          ))}
                                          {item.errores.length > 8 && (
                                            <p className="text-[11px] font-medium text-gray-500 dark:text-ink-black-300">
                                              y {item.errores.length - 8} errores más. Se resuelven en{" "}
                                              <Link href="/importar/revision" className="font-bold text-blue-600 hover:underline dark:text-blue-300">
                                                Revisión de carga
                                              </Link>
                                              .
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-[11px] text-gray-500 dark:text-ink-black-300">Sin errores registrados.</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                            </div>
                          )}
                          </article>
                        </Fragment>
                      );
                    })
                  )}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50/50 px-5 py-3 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-ink-black-200">
              <p>
                {gruposFiltrados.length} periodo{gruposFiltrados.length !== 1 ? "s" : ""} mensual{gruposFiltrados.length !== 1 ? "es" : ""}
              </p>
              <p className="text-gray-400">Mostrando {gruposFiltrados.length} de {gruposEnriquecidos.length}</p>
            </div>
          </section>
        )}
      </div>

      {resumenDetalle && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setExpandido(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="historial-detalle-titulo"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[min(680px,calc(100dvh-72px))] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800 sm:max-h-[calc(100dvh-80px)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 dark:border-ink-black-700 sm:px-7">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
                  <FiCalendar size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="historial-detalle-titulo" className="truncate text-lg font-black text-slate-950 dark:text-white">{resumenDetalle.grupo.periodoLabel}</h2>
                    <span className={claseEstado(resumenDetalle.activo.estado)}>{resumenDetalle.activo.estado_label}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-ink-black-300">Detalle de {itemsDetalle.length} carga{itemsDetalle.length !== 1 ? "s" : ""} del periodo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandido(null)}
                aria-label="Cerrar detalle del periodo"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-ink-black-300 dark:hover:bg-ink-black-700 dark:hover:text-white"
              >
                <FiX size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-3 dark:bg-ink-black-900 sm:p-4">
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Filas del archivo", resumenDetalle.totalPeriodo, "El tamaño del archivo vigente"],
                    ["Pacientes nuevos", resumenDetalle.registrosMes, "Registros incorporados este mes"],
                    ["Duplicados", resumenDetalle.recurrentesMes, "Ya existían en el sistema"],
                    ["Por revisar", resumenDetalle.pendientesRevision, "Requieren revisión manual"],
                  ] as Array<[string, number, string]>
                ).map(([label, value, help]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-ink-black-600 dark:bg-ink-black-800">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-ink-black-300">{label}</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">{num(value)}</p>
                    <p className="mt-1 text-[10px] font-medium leading-tight text-slate-500 dark:text-ink-black-300">{help}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-ink-black-600">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Registros del corte</h3>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                      {pacientesDetalle.length > 0 ? `${pacientesDetalle.length} pacientes del corte` : "No hay pacientes registrados en este corte"}
                    </p>
                  </div>
                  <span className="ccr-preview-status ccr-preview-status-ok">{resumenDetalle.activo.estado_label}</span>
                </div>
                {pacientesDetalle.length > 0 ? (
                  <div className="max-h-[360px] overflow-auto [scrollbar-gutter:stable]">
                    <table className="w-full min-w-[1180px] table-fixed border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-ink-black-300">
                          <th className="w-[220px] px-3 py-3">Paciente</th>
                          <th className="w-[64px] px-3 py-3">Edad</th>
                          <th className="w-[125px] px-3 py-3">Categoría</th>
                          <th className="w-[100px] px-3 py-3">Prioridad</th>
                          <th className="w-[110px] px-3 py-3">Fecha</th>
                          <th className="w-[145px] px-3 py-3">Profesional</th>
                          <th className="w-[145px] px-3 py-3">Sector</th>
                          <th className="w-[190px] px-3 py-3">Diagnóstico</th>
                          <th className="w-[120px] px-3 py-3">Estado</th>
                          <th className="w-[120px] px-3 py-3">Estado corte</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-ink-black-700">
                        {pacientesDetalle.map((paciente) => (
                          <tr key={paciente.id} className="bg-white transition-colors hover:bg-blue-50/60 dark:bg-ink-black-800 dark:hover:bg-blue-500/10">
                            <td className="px-3 py-2">
                              <span className="block truncate font-bold text-slate-900 dark:text-white" title={paciente.nombre}>{paciente.nombre || "Paciente sin nombre"}</span>
                              <span className="mt-0.5 block truncate font-mono text-[10px] font-medium tabular-nums text-slate-500 dark:text-ink-black-300">{paciente.rut || "Sin RUT"}</span>
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-ink-black-200">{paciente.edad}</td>
                            <td className="truncate px-3 py-2" title={paciente.categoria}><span className="inline-flex max-w-full items-center truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-700 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-ink-black-100">{paciente.categoria}</span></td>
                            <td className="px-3 py-2 font-semibold text-slate-700 dark:text-ink-black-100">{paciente.prioridad}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-ink-black-200">{paciente.fecha_derivacion || "-"}</td>
                            <td className="truncate px-3 py-2 text-slate-600 dark:text-ink-black-200" title={paciente.kine_asignado_nombre || "Sin asignar"}>{paciente.kine_asignado_nombre || "Sin asignar"}</td>
                            <td className="truncate px-3 py-2 text-slate-600 dark:text-ink-black-200" title={paciente.sector_cesfam || paciente.sector_oficial || "Sin sector"}>{paciente.sector_cesfam || paciente.sector_oficial || "Sin sector"}</td>
                            <td className="truncate px-3 py-2 text-slate-600 dark:text-ink-black-200" title={paciente.diagnostico}>{paciente.diagnostico || "-"}</td>
                            <td className="px-3 py-2"><span className="ccr-preview-status ccr-preview-status-ok">{paciente.estado_label}</span></td>
                            <td className="px-3 py-2"><span className={claseEstado(resumenDetalle.activo.estado)}>{resumenDetalle.activo.estado_label}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-[150px] items-center justify-center px-4 text-center text-xs font-medium text-slate-500 dark:text-ink-black-300">Este corte no tiene pacientes disponibles para mostrar.</div>
                )}
              </div>

              <div className="hidden space-y-3">
                {itemsDetalle.map((item, pos, lista) => (
                  <section key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-ink-black-600 dark:bg-ink-black-800 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">Carga {lista.length - pos} de {lista.length}</p>
                        <h3 className="mt-1 truncate text-sm font-black text-slate-900 dark:text-white" title={item.archivo_nombre}>{item.archivo_nombre || "Archivo sin nombre"}</h3>
                        <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-ink-black-300">{fechaHora(item.fecha_subida)} · {item.usuario_nombre || "Usuario no disponible"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={claseEstado(item.estado)}>{item.estado_label}</span>
                        {item.revertible ? <RevertirCarga corteId={item.id} hasta={item.revertible_hasta} descripcion={`${item.periodo_label} · ${item.archivo_nombre}`} onRevertida={recargarTrasRevertir} compacto /> : <span className={`${chip} ${item.en_ventana ? "bg-blue-50 text-blue-800 dark:!bg-[#151b2e] dark:!text-ink-black-100" : "bg-emerald-50 text-emerald-700 dark:!bg-emerald-500/15 dark:!text-emerald-100"}`}>{item.en_ventana ? "En ventana de reversión" : "Consolidada"}</span>}
                      </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-ink-black-600">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-ink-black-900 dark:text-ink-black-300">
                          <tr>
                            <th className="px-3 py-2">Indicador</th>
                            <th className="px-3 py-2 text-right">Cantidad</th>
                            <th className="hidden px-3 py-2 sm:table-cell">Qué significa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-ink-black-700">
                          {(
                            [
                              ["Filas del archivo", item.total_registros, "Registros leídos desde el archivo"],
                              ["Pacientes nuevos", item.registros_importados, "Pacientes incorporados al sistema"],
                              ["Duplicados", item.duplicados, "Registros que ya existían"],
                              ["Por revisar", item.observaciones_pendientes_count ?? 0, "Casos que requieren revisión manual"],
                            ] as Array<[string, number, string]>
                          ).map(([label, value, help]) => (
                            <tr key={label} className="bg-white dark:bg-ink-black-800">
                              <th className="px-3 py-2.5 font-bold text-slate-700 dark:text-ink-black-100">{label}</th>
                              <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-white">{num(value)}</td>
                              <td className="hidden px-3 py-2.5 font-medium text-slate-500 dark:text-ink-black-300 sm:table-cell">{help}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {item.errores.length > 0 ? (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wide text-red-600 dark:text-red-300">Incidencias detectadas</p>
                        {item.errores.slice(0, 8).map((err, idx) => <div key={`${item.id}-${idx}`} className="rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}: {err.motivo}</div>)}
                        {item.errores.length > 8 && <p className="text-[11px] font-medium text-slate-500 dark:text-ink-black-300">y {item.errores.length - 8} incidencias más en <Link href="/importar/revision" className="font-bold text-blue-600 hover:underline dark:text-blue-300">Revisión de carga</Link>.</p>}
                      </div>
                    ) : <p className="mt-3 text-[11px] font-medium text-emerald-700 dark:text-emerald-200">Sin incidencias registradas en esta carga.</p>}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {periodoAEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => !eliminando && setPeriodoAEliminar(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={`Eliminar ${periodoAEliminar.periodoLabel}`}
            onClick={(event) => event.stopPropagation()}
            className="ccr-panel w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
          >
            <div className="flex items-start gap-3 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200">
                <FiAlertTriangle size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:!text-white">Eliminar {periodoAEliminar.periodoLabel}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-ink-black-200">
                  Se borran los pacientes cargados para ese mes y todo su historial de importación.
                </p>
                {resumenEliminar && (
                  <ul className="mt-3 space-y-1 text-xs font-medium text-slate-600 dark:text-ink-black-200">
                    <li>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">{periodoAEliminar.items.length}</span> corte
                      {periodoAEliminar.items.length !== 1 ? "s" : ""} subido{periodoAEliminar.items.length !== 1 ? "s" : ""}
                    </li>
                    <li>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">{resumenEliminar.totalPeriodo.toLocaleString("es-CL")}</span>{" "}
                      derivaciones del periodo
                    </li>
                  </ul>
                )}
                <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-300">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-3">
              <button type="button" onClick={() => setPeriodoAEliminar(null)} disabled={eliminando} className="ccr-control-button px-3 py-2 text-xs disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarEliminar()}
                disabled={eliminando}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <FiTrash2 size={13} /> {eliminando ? "Eliminando..." : "Eliminar corte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
