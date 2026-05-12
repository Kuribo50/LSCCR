"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { TableSkeleton } from "@/components/Skeleton";
import type {
  ImportacionDeletePeriodoResultado,
  ImportacionHistorialDetalle,
  ImportacionHistorialItem,
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

function badgeEstado(estado: ImportacionHistorialItem["estado"]) {
  if (estado === "COMPLETADO") {
    return { backgroundColor: "#E8F5E9", color: "#1B5E20" };
  }
  if (estado === "CON_ERRORES") {
    return { backgroundColor: "#FFF3E0", color: "#BF360C" };
  }
  if (estado === "REEMPLAZADO") {
    return { backgroundColor: "#F3F4F6", color: "#9E9E9E" };
  }
  return { backgroundColor: "#e9f4fb", color: "#335fdb" };
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
  const [filtroAnio, setFiltroAnio] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);

  useEffect(() => {
    if (user && !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
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
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
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
      const coincideAnio = !filtroAnio || String(grupo.anio) === filtroAnio;

      return coincideBusqueda && coincideEstado && coincideAnio;
    });
  }, [filtroAnio, filtroEstado, gruposEnriquecidos, search]);

  const activeFilterCount = [
    search.trim(),
    filtroEstado,
    filtroAnio,
  ].filter(Boolean).length;

  function limpiarFiltros() {
    setSearch("");
    setFiltroEstado("");
    setFiltroAnio("");
  }

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

  if (!user || !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">
          Historial de cortes mensuales
        </h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Revisa los datos separados por mes y elimina un corte completo cuando
          sea necesario.
        </p>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {resultadoEliminacion && (
        <div
          className="rounded-[10px] bg-[#e9f4fb] p-4"
          style={{ border: "0.5px solid #a8d4f0" }}
        >
          <p className="text-sm font-semibold text-[#335fdb]">
            Periodo eliminado correctamente
          </p>
          <p className="mt-1 text-xs text-[#355B43]">
            {resultadoEliminacion.pacientes_eliminados} pacientes eliminados ·{" "}
            {resultadoEliminacion.importaciones_eliminadas} importaciones
            eliminadas · {resultadoEliminacion.archivos_eliminados} archivos
            eliminados
          </p>
        </div>
      )}

      <div
        className="rounded-[10px] bg-white p-4"
        style={{ border: "0.5px solid #a8d4f0" }}
      >
        <p className="text-xs text-gray-600">
          Al borrar un periodo se eliminan todos los pacientes con fecha de
          derivación en ese mes/año y sus registros de importación asociados.
        </p>
      </div>

      <section className="ccr-waitlist-toolbar rounded-xl border border-[#d9e1ea] bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#0f0f10]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Cortes registrados
            </h2>
            <p className="text-xs text-gray-500 dark:text-[#b5d8e3]">
              Vista acumulada por mes con importados separados.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <span className="ccr-waitlist-stat">
              <span>Total</span>
              <strong>{gruposEnriquecidos.length}</strong>
            </span>
            <span className="ccr-waitlist-stat">
              <span>Vista</span>
              <strong>{gruposFiltrados.length}</strong>
            </span>
            <span className="ccr-waitlist-stat">
              <span>Filtros</span>
              <strong>{activeFilterCount}</strong>
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por periodo, año, estado o usuario"
            className="h-10 rounded-xl border border-[#d9e1ea] bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-[#335fdb] focus:ring-2 focus:ring-[#335fdb]/15 dark:border-[#262626] dark:bg-[#151515] dark:text-white"
          />
          <button
            type="button"
            onClick={limpiarFiltros}
            className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-xs font-bold text-[#335fdb] hover:bg-[#eef3ff] disabled:opacity-50"
            disabled={activeFilterCount === 0}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((prev) => !prev)}
            className="h-10 rounded-xl border border-[#cbd5e1] px-4 text-xs font-bold text-[#335fdb] hover:bg-[#eef3ff]"
          >
            {filtrosAbiertos ? "Ocultar filtros" : "Filtros"}
          </button>
        </div>

        {filtrosAbiertos && (
          <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-[#d9e1ea] bg-[#fbfdff] p-3 sm:grid-cols-2 dark:border-[#262626] dark:bg-[#151515]">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-[#b5d8e3]">
              Estado
              <select
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#d9e1ea] bg-white px-3 text-xs font-medium text-gray-700 outline-none focus:border-[#335fdb] focus:ring-2 focus:ring-[#335fdb]/15 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-white"
              >
                <option value="">Todos</option>
                {estadoOptions.map(([estado, label]) => (
                  <option key={estado} value={estado}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-semibold text-slate-500 dark:text-[#b5d8e3]">
              Año
              <select
                value={filtroAnio}
                onChange={(event) => setFiltroAnio(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-[#d9e1ea] bg-white px-3 text-xs font-medium text-gray-700 outline-none focus:border-[#335fdb] focus:ring-2 focus:ring-[#335fdb]/15 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-white"
              >
                <option value="">Todos</option>
                {anioOptions.map((anio) => (
                  <option key={anio} value={anio}>
                    {anio}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      {loading ? (
        <div className="ccr-panel ccr-data-table ccr-operational-table rounded-lg bg-white p-3 dark:bg-[#0f0f10]">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <section className="ccr-panel ccr-data-table ccr-operational-table relative overflow-hidden rounded-lg bg-white dark:bg-[#0f0f10]">
          <div className="ccr-table-scroll min-h-[420px] max-h-[clamp(420px,calc(100dvh-335px),900px)] overflow-auto border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]">
            <table className="w-full min-w-[1320px] table-fixed text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="ccr-table-head border-b border-gray-200 bg-gray-50/80 dark:border-[#262626] dark:bg-[#202020]">
                  <th className="w-[180px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Periodo
                  </th>
                  <th className="w-[120px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Estado
                  </th>
                  <th className="w-[90px] text-center font-semibold text-gray-700 dark:text-[#daebf1]">
                    Cortes
                  </th>
                  <th className="w-[150px] text-right font-semibold text-gray-700 dark:text-[#daebf1]">
                    Total acumulado
                  </th>
                  <th className="w-[130px] text-right font-semibold text-gray-700 dark:text-[#daebf1]">
                    Total periodo
                  </th>
                  <th className="w-[130px] text-right font-semibold text-gray-700 dark:text-[#daebf1]">
                    Importados
                  </th>
                  <th className="w-[220px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Incidencias
                  </th>
                  <th className="w-[170px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Última subida
                  </th>
                  <th className="w-[180px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Usuarios
                  </th>
                  <th className="w-[140px] text-left font-semibold text-gray-700 dark:text-[#daebf1]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {gruposFiltrados.length === 0 ? (
                  <tr className="bg-white dark:bg-[#151515]">
                    <td colSpan={10} className="h-[260px] text-center text-sm text-gray-400 dark:text-[#b5d8e3]">
                      No hay importaciones registradas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : gruposFiltrados.map((itemResumen) => {
            const {
              grupo,
              activo,
              registrosMes,
              recurrentesMes,
              erroresMes,
              pendientesRevision,
              totalPeriodo,
              totalAcumulado,
              reemplazado,
            } = itemResumen;
            const detalle = detalleHistorial[grupo.key];
            const estaExpandido = expandido === grupo.key;

            return (
              <Fragment key={grupo.key}>
                <tr
                  className={`ccr-table-row cursor-pointer bg-white dark:bg-[#151515] ${reemplazado ? "opacity-75" : ""}`}
                  onClick={() => void cargarDetalle(grupo)}
                >
                  <td className="align-middle">
                    <div
                      className="truncate font-bold text-gray-900 dark:text-white"
                      style={{ textDecoration: reemplazado ? "line-through" : "none" }}
                    >
                      {grupo.periodoLabel}
                    </div>
                    <p className="text-[10px] font-medium text-gray-400">
                      {grupo.mes}/{grupo.anio}
                    </p>
                  </td>
                  <td className="align-middle">
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={badgeEstado(activo.estado)}
                    >
                      {activo.estado_label}
                    </span>
                  </td>
                  <td className="text-center align-middle font-semibold text-gray-700 dark:text-white">
                    {grupo.items.length}
                  </td>
                  <td className="text-right align-middle text-gray-900 dark:text-white">
                    <span className="font-bold">{totalAcumulado.toLocaleString("es-CL")}</span>
                  </td>
                  <td className="text-right align-middle font-semibold text-gray-700 dark:text-[#daebf1]">
                    {totalPeriodo.toLocaleString("es-CL")}
                  </td>
                  <td className="text-right align-middle font-semibold text-[#335fdb]">
                    {registrosMes.toLocaleString("es-CL")}
                  </td>
                  <td className="align-middle text-gray-600 dark:text-[#b5d8e3]">
                    <div className="truncate">
                      {recurrentesMes} recurrentes · {erroresMes} errores · {pendientesRevision} pendientes
                    </div>
                  </td>
                  <td className="whitespace-nowrap align-middle font-medium text-gray-700 dark:text-white">
                    {new Date(activo.fecha_subida).toLocaleString("es-CL")}
                  </td>
                  <td className="align-middle text-gray-600 dark:text-[#b5d8e3]">
                    <div className="truncate">
                      {grupo.usuarios.length > 0 ? grupo.usuarios.join(", ") : "No disponible"}
                    </div>
                  </td>
                  <td className="align-middle">
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => void cargarDetalle(grupo)}
                        className="rounded-lg border px-2.5 py-1 text-[11px] font-medium text-gray-600"
                        style={{ borderColor: "#a8d4f0" }}
                      >
                        {estaExpandido ? "Ocultar" : "Detalles"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodoAEliminar(grupo)}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: "#B42318" }}
                      >
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>

                {estaExpandido && (
                  <tr className="bg-[#f8fbff] dark:bg-[#111827]">
                    <td colSpan={10} className="align-top">
                      <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-2 dark:border-[#2f3440] dark:bg-[#0f0f10]">
                        {(detalle?.items ?? grupo.items).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-[#d9e1ea] bg-[#FAFCFA] p-2 dark:border-[#2f3440] dark:bg-[#151515]"
                          >
                            <div className="grid gap-2 text-[11px] text-gray-600 dark:text-[#b5d8e3] lg:grid-cols-[190px_1fr]">
                              <div>
                                <p className="font-bold text-gray-800 dark:text-white">
                                  {new Date(item.fecha_subida).toLocaleString("es-CL")}
                                </p>
                                <p>Subido por: {item.usuario_nombre || "No disponible"}</p>
                              </div>
                              <p>
                                Estado: {item.estado_label} · Total: {item.total_registros} · Importados:{" "}
                                {item.registros_importados} · Duplicados: {item.duplicados} · Revisión pendiente:{" "}
                                {item.observaciones_pendientes_count}
                              </p>
                            </div>

                            {item.errores.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {item.errores.map((err, idx) => (
                                  <div
                                    key={`${item.id}-${idx}`}
                                    className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700"
                                  >
                                    {err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}: {err.motivo}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] text-gray-500 dark:text-[#b5d8e3]">
                                Sin errores registrados.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 border-t border-gray-200 bg-gray-50/50 px-4 py-2 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#b5d8e3] sm:flex-row sm:items-center sm:justify-between">
            <p>{gruposFiltrados.length} corte{gruposFiltrados.length !== 1 ? "s" : ""} mensual{gruposFiltrados.length !== 1 ? "es" : ""}</p>
            <p className="text-gray-400">Mostrando {gruposFiltrados.length} de {gruposEnriquecidos.length}</p>
          </div>
        </section>
      )}

      {periodoAEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-lg rounded-[10px] bg-white p-5"
            style={{ border: "0.5px solid #a8d4f0" }}
          >
            <h2 className="text-base font-semibold text-gray-800">
              Confirmar eliminación
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Vas a borrar toda la información cargada del periodo{" "}
              {periodoAEliminar.periodoLabel}.
            </p>
            <p className="mt-2 text-sm text-[#B42318]">
              Esta acción elimina pacientes cargados para ese mes y su historial
              de importación.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPeriodoAEliminar(null)}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600"
                style={{ borderColor: "#a8d4f0" }}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarEliminar()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#B42318" }}
                disabled={eliminando}
              >
                {eliminando ? "Eliminando..." : "Eliminar corte del periodo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
