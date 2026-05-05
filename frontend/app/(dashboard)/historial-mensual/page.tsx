"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { FiDownload } from "react-icons/fi";
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
  const [exportandoKey, setExportandoKey] = useState<string | null>(null);

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
      if (e && typeof e === "object" && "detail" in e) {
        setError((e as { detail: string }).detail);
      } else {
        setError("No se pudo cargar el historial mensual.");
      }
      setHistorial([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    } catch (e: unknown) {
      if (e && typeof e === "object" && "detail" in e) {
        setError((e as { detail: string }).detail);
      } else {
        setError("No se pudieron eliminar los datos del periodo.");
      }
    } finally {
      setEliminando(false);
    }
  }

  async function exportarCorte(grupo: HistorialGrupo) {
    setExportandoKey(grupo.key);
    setError("");
    try {
      const blob = await api.getBlob(`/importar/historial/${grupo.mes}/${grupo.anio}/exportar/`);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `corte-ccr-${grupo.mes}-${grupo.anio}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo exportar el corte mensual.");
    } finally {
      setExportandoKey(null);
    }
  }

  if (!user || !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-800">
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

      {loading ? (
        <div
          className="rounded-[10px] bg-white p-8 text-center text-sm text-gray-400"
          style={{ border: "0.5px solid #a8d4f0" }}
        >
          Cargando historial...
        </div>
      ) : grupos.length === 0 ? (
        <div
          className="rounded-[10px] bg-white p-8 text-center text-sm text-gray-400"
          style={{ border: "0.5px solid #a8d4f0" }}
        >
          No hay importaciones registradas.
        </div>
      ) : (
        <section
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
          }}
        >
          {grupos.map((grupo) => {
            const detalle = detalleHistorial[grupo.key];
            const activo = grupo.activo;
            const estaExpandido = expandido === grupo.key;
            const registrosMes = grupo.items.reduce(
              (acc, item) => acc + item.registros_importados,
              0,
            );
            const recurrentesMes = grupo.items.reduce((acc, item) => acc + item.duplicados, 0);
            const erroresMes = grupo.items.reduce((acc, item) => acc + (item.errores_count ?? item.errores.length), 0);
            const pendientesRevision = grupo.items.reduce(
              (acc, item) => acc + (item.observaciones_pendientes_count ?? 0),
              0,
            );
            const reemplazado = activo?.estado === "REEMPLAZADO";

            if (!activo) return null;
            const resumenCorte = activo.pacientes_actuales_del_corte;

            return (
              <article
                key={grupo.key}
                className="rounded-[10px] bg-white p-4"
                style={{
                  border: "0.5px solid #a8d4f0",
                  opacity: reemplazado ? 0.75 : 1,
                }}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2
                        className="text-sm font-semibold text-gray-800"
                        style={{
                          textDecoration: reemplazado ? "line-through" : "none",
                        }}
                      >
                        {grupo.periodoLabel}
                      </h2>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {grupo.items.length} corte
                        {grupo.items.length !== 1 ? "s" : ""} registrado
                        {grupo.items.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={badgeEstado(activo.estado)}
                    >
                      {activo.estado_label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-gray-600">
                    <p>
                      {activo.total_registros} registros · {registrosMes} importados
                    </p>
                    <p>
                      {recurrentesMes} recurrentes · {erroresMes} errores · {pendientesRevision} pendientes de revisión
                    </p>
                    <p>
                      Última subida:{" "}
                      {new Date(activo.fecha_subida).toLocaleString("es-CL")}
                    </p>
                    <p>
                      Usuarios:{" "}
                      {grupo.usuarios.length > 0
                        ? grupo.usuarios.join(", ")
                        : "No disponible"}
                    </p>
                  </div>

                  {resumenCorte && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#E7F3EC] p-2 text-[11px] text-[#1B5E3B]">
                      <span className="font-semibold">Pendientes: {resumenCorte.pendientes}</span>
                      <span className="font-semibold">Rescate: {resumenCorte.rescate}</span>
                      <span className="font-semibold">Ingresados: {resumenCorte.ingresados}</span>
                      <span className="font-semibold">Egresados: {resumenCorte.egresados_total}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/lista-espera?mes=${grupo.mes}&anio=${grupo.anio}`)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: "#335fdb" }}
                    >
                      Ver lista de espera
                    </button>
                    <button
                      type="button"
                      onClick={() => void cargarDetalle(grupo)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600"
                      style={{ borderColor: "#a8d4f0" }}
                    >
                      {estaExpandido ? "Ocultar detalle" : "Detalles corte"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportarCorte(grupo)}
                      disabled={exportandoKey === grupo.key}
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-60"
                      style={{ borderColor: "#a8d4f0" }}
                    >
                      <FiDownload size={12} />
                      {exportandoKey === grupo.key ? "Exportando..." : "Exportar corte"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodoAEliminar(grupo)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: "#B42318" }}
                    >
                      Borrar corte del periodo
                    </button>
                  </div>

                  {estaExpandido && (
                    <div
                      className="space-y-2 rounded-lg bg-[#FAFCFA] p-3"
                      style={{ border: "0.5px solid #a8d4f0" }}
                    >
                      {(detalle?.items ?? grupo.items).map((item) => (
                        <div
                          key={item.id}
                          className="space-y-1 border-b border-[#E6EEE6] pb-2 last:border-b-0 last:pb-0"
                        >
                          <p className="text-[11px] font-semibold text-gray-700">
                            {new Date(item.fecha_subida).toLocaleString(
                              "es-CL",
                            )}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                             <p className="text-[11px] text-gray-500">
                               Estado: {item.estado_label} · Total:{" "}
                               {item.total_registros} · Importados:{" "}
                               {item.registros_importados} · Duplicados:{" "}
                               {item.duplicados} · Revisión pendiente:{" "}
                               {item.observaciones_pendientes_count}
                             </p>
                             <button
                               type="button"
                               onClick={() => router.push(`/lista-espera?importacion=${item.id}`)}
                               className="text-[10px] font-bold text-[#335fdb] hover:underline"
                             >
                               Ver pacientes de este corte
                             </button>
                          </div>
                          <p className="text-[11px] text-gray-500">
                            Subido por: <span className="font-semibold text-gray-700">{item.usuario_nombre || "No disponible"}</span>
                          </p>
                          {item.errores.length > 0 && (
                            <div className="space-y-1">
                              {item.errores.map((err, idx) => (
                                <div
                                  key={`${item.id}-${idx}`}
                                  className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700"
                                >
                                  {err.hoja ? `${err.hoja} · ` : ""}Fila{" "}
                                  {err.fila}: {err.motivo}
                                </div>
                              ))}
                            </div>
                          )}
                          {item.errores.length === 0 && (
                            <p className="text-[11px] text-gray-500">
                              Sin errores registrados.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
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
