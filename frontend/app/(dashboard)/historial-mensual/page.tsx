"use client";

import { puedeCargarDerivaciones } from "@/lib/roles";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import { useAlCambiarCargas } from "@/lib/cargasEventos";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiAlertTriangle,
  FiEye,
  FiLink,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";
import MenuAcciones from "@/components/MenuAcciones";
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

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

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
  reemplazado: boolean;
}

/** Color del estado de la carga vigente: franja del mes y texto del estado. */
const COLOR_ESTADO: Record<string, { texto: string; punto: string }> = {
  COMPLETADO: { texto: "text-emerald-600 dark:text-emerald-300", punto: "bg-emerald-500" },
  CON_ERRORES: { texto: "text-red-600 dark:text-red-300", punto: "bg-red-500" },
  REEMPLAZADO: { texto: "text-slate-500 dark:text-ink-black-300", punto: "bg-slate-400" },
};
const COLOR_ESTADO_OTRO = { texto: "text-amber-600 dark:text-amber-300", punto: "bg-amber-500" };

/** Tramos de la barra de cada mes. */
const TRAMOS = [
  { clave: "enLista", label: "En espera", color: "bg-slate-800 dark:bg-ink-black-100" },
  { clave: "ingresados", label: "Ingresados", color: "bg-slate-400 dark:bg-ink-black-300" },
  { clave: "egresados", label: "Egresados", color: "bg-slate-200 dark:bg-ink-black-500" },
] as const;

/** Color del estado del paciente en la vista previa. */
function colorEstadoPaciente(estado: string) {
  if (estado === "PENDIENTE") return "text-blue-600 dark:text-blue-300";
  if (estado === "RESCATE") return "text-amber-600 dark:text-amber-300";
  if (estado === "INGRESADO") return "text-emerald-600 dark:text-emerald-300";
  return "text-slate-500 dark:text-ink-black-300";
}

/** Pacientes del mes de derivación: en lista de espera (pendientes + rescate), ingresados y egresados. */
function desglose(item: ImportacionHistorialItem) {
  const p = item.pacientes_actuales_del_corte;
  const enLista = (p?.pendientes ?? 0) + (p?.rescate ?? 0);
  const ingresados = p?.ingresados ?? 0;
  const egresados = p?.egresados_total ?? 0;
  return { enLista, ingresados, egresados, total: enLista + ingresados + egresados };
}

const num = (n: number) => n.toLocaleString("es-CL");

function fechaCorta(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function HistorialMensualPage() {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const router = useRouter();

  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const anioHoy = hoy.getFullYear();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historial, setHistorial] = useState<ImportacionHistorialItem[]>([]);
  const [detalleHistorial, setDetalleHistorial] = useState<
    Record<string, ImportacionHistorialDetalle>
  >({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [busquedaPreview, setBusquedaPreview] = useState("");
  const [estadoPreview, setEstadoPreview] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [periodoAEliminar, setPeriodoAEliminar] =
    useState<HistorialGrupo | null>(null);
  const [resultadoEliminacion, setResultadoEliminacion] =
    useState<ImportacionDeletePeriodoResultado | null>(null);
  const [anioVista, setAnioVista] = useState(anioHoy);

  useEffect(() => {
    if (user && !puedeCargarDerivaciones(user)) {
      router.replace("/pacientes");
    }
  }, [user, router]);

  const traerHistorial = useCallback(async () => {
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

  const cargarHistorial = useCallback(async () => {
    setLoading(true);
    setError("");
    await traerHistorial();
  }, [traerHistorial]);

  useCargaAlMontar(traerHistorial, Boolean(user && puedeCargarDerivaciones(user)));

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

    return Array.from(mapa.values()).map((grupo) => {
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
    });
  }, [historial]);

  /** Resumen por mes, ordenado de más antiguo a más nuevo. */
  const resumenes = useMemo<HistorialGrupoResumen[]>(() => {
    return grupos
      .filter((grupo) => grupo.activo)
      .sort((a, b) => (a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes))
      .map((grupo) => {
        const activo = grupo.activo as ImportacionHistorialItem;
        const suma = (fn: (item: ImportacionHistorialItem) => number) =>
          grupo.items.reduce((acc, item) => acc + fn(item), 0);
        return {
          grupo,
          activo,
          registrosMes: suma((item) => item.registros_importados),
          recurrentesMes: suma((item) => item.duplicados),
          erroresMes: suma((item) => item.errores_count ?? item.errores.length),
          pendientesRevision: suma((item) => item.observaciones_pendientes_count ?? 0),
          totalPeriodo: activo.total_registros,
          reemplazado: activo.estado === "REEMPLAZADO",
        };
      });
  }, [grupos]);

  const porMes = useMemo(
    () => new Map(resumenes.map((r) => [r.grupo.key, r])),
    [resumenes],
  );

  // Años navegables: los que tienen cargas y el actual.
  const listaAnios = useMemo(() => {
    const conDatos = resumenes.map((r) => r.grupo.anio);
    const min = Math.min(anioHoy, ...conDatos);
    const max = Math.max(anioHoy, ...conDatos);
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const anio = min + i;
      return { anio, meses: conDatos.filter((a) => a === anio).length };
    });
  }, [resumenes, anioHoy]);

  const delAnio = resumenes.filter((r) => r.grupo.anio === anioVista);
  const totalesAnio = delAnio.reduce(
    (acc, r) => {
      const d = desglose(r.activo);
      acc.total += d.total;
      acc.enLista += d.enLista;
      acc.ingresados += d.ingresados;
      acc.egresados += d.egresados;
      acc.nuevos += r.registrosMes;
      acc.recurrentes += r.recurrentesMes;
      return acc;
    },
    { total: 0, enLista: 0, ingresados: 0, egresados: 0, nuevos: 0, recurrentes: 0 },
  );
  // Escala común de las barras: el mes con más pacientes del año llena la barra.
  const maximoAnio = Math.max(1, ...delAnio.map((r) => desglose(r.activo).total));

  // Tras revertir una carga, el periodo cambia: se recarga todo el historial.
  const recargarTrasRevertir = useCallback(() => {
    setDetalleHistorial({});
    setExpandido(null);
    void cargarHistorial();
  }, [cargarHistorial]);
  // También cuando se revierte (o se sube) una carga desde otra pantalla.
  useAlCambiarCargas(recargarTrasRevertir);

  const abrirPreview = useCallback(
    async (grupo: HistorialGrupo) => {
      const key = grupo.key;
      setBusquedaPreview("");
      setEstadoPreview("");
      setExpandido(key);
      if (detalleHistorial[key]) return;
      setCargandoDetalle(true);
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
      } finally {
        setCargandoDetalle(false);
      }
    },
    [detalleHistorial],
  );

  function irAImportar(mes: number, anio: number, sobrescribir: boolean) {
    const accion = sobrescribir ? "&accion=sobrescribir" : "";
    router.push(`/importar?mes=${mes}&anio=${anio}${accion}`);
  }

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
      toastSuccess(`${periodoAEliminar.periodoLabel} quedó sin carga.`);
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
  const resumenEliminar = periodoAEliminar ? porMes.get(periodoAEliminar.key) : undefined;
  const desgloseEliminar = resumenEliminar ? desglose(resumenEliminar.activo) : null;
  const resumenDetalle = expandido ? porMes.get(expandido) : undefined;
  const pacientesDetalle: ImportacionHistorialPaciente[] = resumenDetalle
    ? detalleHistorial[resumenDetalle.grupo.key]?.pacientes ?? []
    : [];
  const estadosPreview = Array.from(
    new Map(pacientesDetalle.map((p) => [p.estado, p.estado_label])).entries(),
  );
  const consulta = busquedaPreview.trim().toLocaleLowerCase("es-CL");
  const pacientesPreview = pacientesDetalle.filter((p) => {
    if (estadoPreview && p.estado !== estadoPreview) return false;
    if (!consulta) return true;
    return [p.nombre, p.rut, p.diagnostico, p.kine_asignado_nombre ?? "", p.sector_cesfam, p.sector_oficial]
      .join(" ")
      .toLocaleLowerCase("es-CL")
      .includes(consulta);
  });
  const botonIcono =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

  return (
    <div className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-2rem))] flex-col overflow-hidden border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800">
        <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 pt-3 dark:border-ink-black-600 dark:bg-ink-black-800">
          <h1 className="sr-only">Historial de cortes mensuales</h1>

          {/* Un año por pestaña, con cuántos meses tiene cargados. */}
          <div className="flex items-end gap-3">
            <div role="tablist" aria-label="Año" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {listaAnios.map(({ anio, meses }) => {
                const activo = anio === anioVista;
                return (
                  <button
                    key={anio}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setAnioVista(anio)}
                    className={`flex shrink-0 items-baseline gap-2 border-b-2 px-3 pb-2.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                      activo
                        ? "border-blue-600 text-slate-950 dark:border-blue-400 dark:text-white"
                        : "border-transparent text-slate-400 hover:text-slate-700 dark:text-ink-black-400 dark:hover:text-ink-black-100"
                    }`}
                  >
                    <span className="text-xl font-black tabular-nums tracking-tight">{anio}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${activo ? "text-blue-600 dark:text-blue-300" : ""}`}>
                      {meses}/12
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mb-2 shrink-0">
              <MenuAcciones
                acciones={[
                  {
                    label: "Actualizar",
                    detalle: "Vuelve a cargar los cortes",
                    tono: "azul",
                    icon: <FiRefreshCw size={13} aria-hidden="true" />,
                    onClick: () => void cargarHistorial(),
                  },
                  {
                    label: "Importar derivaciones",
                    detalle: "Subir un nuevo corte",
                    tono: "verde",
                    icon: <FiUpload size={13} aria-hidden="true" />,
                    onClick: () => router.push("/importar"),
                  },
                  {
                    label: "Copiar enlace",
                    detalle: "De esta vista",
                    tono: "gris",
                    icon: <FiLink size={13} aria-hidden="true" />,
                    onClick: () => {
                      void navigator.clipboard?.writeText(window.location.href).then(() => toastInfo("Enlace copiado."));
                    },
                  },
                ]}
              />
            </div>
          </div>
        </header>

        {/* Totales del año elegido; los puntos sirven de leyenda para la barra de cada mes. */}
        <dl className="grid shrink-0 grid-cols-3 border-b border-slate-200 dark:border-ink-black-600 sm:grid-cols-6">
          {(
            [
              ["Pacientes", totalesAnio.total, null],
              ["En espera", totalesAnio.enLista, TRAMOS[0].color],
              ["Ingresados", totalesAnio.ingresados, TRAMOS[1].color],
              ["Egresados", totalesAnio.egresados, TRAMOS[2].color],
              ["Nuevos", totalesAnio.nuevos, null],
              ["Recurrentes", totalesAnio.recurrentes, null],
            ] as Array<[string, number, string | null]>
          ).map(([label, valor, punto]) => (
            <div key={label} className="px-5 py-2.5">
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                {punto && <i className={`h-2 w-2 rounded-full ${punto}`} aria-hidden="true" />}
                {label}
              </dt>
              <dd className="text-lg font-black leading-tight tabular-nums text-slate-900 dark:text-white">{num(valor)}</dd>
            </div>
          ))}
        </dl>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700 dark:!bg-red-500/10 dark:!text-red-100">{error}</div>
        )}

        {resultadoEliminacion && (
          <div className="flex items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-5 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-100">
              Mes eliminado: {resultadoEliminacion.pacientes_eliminados} pacientes, {resultadoEliminacion.importaciones_eliminadas} cargas y{" "}
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
          <section
            aria-label={`Calendario de cortes ${anioVista}`}
            className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-4 [animation:tableFadeIn_260ms_ease-out] dark:bg-ink-black-900 sm:p-5"
          >
            <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 min-[480px]:grid-cols-2 lg:h-full lg:min-h-[480px] lg:grid-cols-4 lg:grid-rows-3 dark:border-ink-black-600 dark:bg-ink-black-600">
              {MESES.map((nombreMes, indice) => {
                const mes = indice + 1;
                const resumen = porMes.get(`${mes}-${anioVista}`);
                const esFuturo = anioVista > anioHoy || (anioVista === anioHoy && mes > mesHoy);
                const esActual = anioVista === anioHoy && mes === mesHoy;
                // El mes actual se marca como "hoy" en un calendario: fondo suave y nombre en azul.
                const fondo = esActual
                  ? "bg-blue-50/70 dark:bg-blue-500/10"
                  : esFuturo
                    ? "bg-slate-50 dark:bg-ink-black-900"
                    : "bg-white dark:bg-ink-black-800";
                const tituloMes = (
                  <h2 className={`text-[22px] font-black leading-none tracking-tight ${esActual ? "text-blue-700 dark:text-blue-300" : resumen ? "text-slate-950 dark:text-white" : "text-slate-400 dark:text-ink-black-400"}`}>
                    {nombreMes}
                  </h2>
                );
                const marcaActual = esActual && (
                  <p className="mt-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-300">Este mes</p>
                );

                if (!resumen) {
                  return (
                    <li
                      key={mes}
                      className={`flex min-h-[150px] flex-col p-4 ${fondo}`}
                    >
                      {tituloMes}
                      {marcaActual}
                      <div className="mt-auto">
                        {!esFuturo && (
                          <button
                            type="button"
                            onClick={() => irAImportar(mes, anioVista, false)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-blue-500/30 dark:bg-transparent dark:text-blue-200 dark:hover:bg-blue-500/10"
                          >
                            <FiPlus size={13} aria-hidden="true" /> Cargar mes
                          </button>
                        )}
                      </div>
                    </li>
                  );
                }

                const { grupo, activo, erroresMes, pendientesRevision, reemplazado } = resumen;
                const d = desglose(activo);
                const color = COLOR_ESTADO[activo.estado] ?? COLOR_ESTADO_OTRO;
                const posicion = resumenes.indexOf(resumen);
                const anterior = posicion > 0 ? resumenes[posicion - 1] : undefined;
                const variacion = anterior ? d.enLista - desglose(anterior.activo).enLista : null;
                const anchoBarra = (d.total / maximoAnio) * 100;

                return (
                  <li
                    key={mes}
                    className={`flex min-h-[150px] flex-col transition-colors hover:bg-slate-50 dark:hover:bg-ink-black-700/60 ${fondo} ${reemplazado ? "opacity-70" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => void abrirPreview(grupo)}
                      aria-label={`Vista previa de ${grupo.periodoLabel}`}
                      className="flex flex-1 flex-col p-4 pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30"
                    >
                      {/* Fila 1: el mes y su total comparten la línea base. */}
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {tituloMes}
                            <i
                              title={`${activo.estado_label}${erroresMes > 0 ? `: ${erroresMes} con error` : ""}`}
                              aria-label={activo.estado_label}
                              className={`h-2 w-2 shrink-0 rounded-full ${color.punto}`}
                            />
                          </div>
                          {marcaActual}
                        </div>
                        <p
                          title={`${num(d.total)} pacientes`}
                          className="text-[22px] font-black leading-none tabular-nums tracking-tight text-slate-900 dark:text-white"
                        >
                          {num(d.total)}
                        </p>
                      </div>

                      {/* Fila 2: barra a escala del mes más grande del año. */}
                      <div
                        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-ink-black-700"
                        role="img"
                        aria-label={`${d.enLista} en espera, ${d.ingresados} ingresados, ${d.egresados} egresados`}
                      >
                        <div className="flex h-full gap-px" style={{ width: `${anchoBarra}%` }}>
                          {TRAMOS.map((t) =>
                            d[t.clave] > 0 ? (
                              <i key={t.clave} className={`h-full first:rounded-l-full last:rounded-r-full ${t.color}`} style={{ width: `${(d[t.clave] / Math.max(1, d.total)) * 100}%` }} />
                            ) : null,
                          )}
                        </div>
                      </div>

                      {/* Fila 3: los tres tramos; la leyenda está en los totales del año. */}
                      <dl className="mt-auto flex w-full items-center gap-4 pt-3">
                        {TRAMOS.map((t) => (
                          <div key={t.clave} className="flex items-center gap-1.5" title={t.label}>
                            <dt className="sr-only">{t.label}</dt>
                            <i className={`h-2 w-2 shrink-0 rounded-full ${t.color}`} aria-hidden="true" />
                            <dd className="text-sm font-black tabular-nums text-slate-800 dark:text-ink-black-100">{num(d[t.clave])}</dd>
                          </div>
                        ))}
                        {variacion !== null && variacion !== 0 && (
                          <p
                            title="Cambio de pacientes en espera respecto al mes anterior"
                            className={`ml-auto text-[11px] font-bold tabular-nums ${variacion > 0 ? "text-amber-600 dark:text-amber-300" : "text-emerald-600 dark:text-emerald-300"}`}
                          >
                            {variacion > 0 ? "↑" : "↓"} {num(Math.abs(variacion))}
                          </p>
                        )}
                      </dl>
                    </button>

                    <div className="flex items-center gap-0.5 px-2 pb-1.5">
                      <p className="min-w-0 flex-1 truncate px-2 text-[10px] text-slate-500 dark:text-ink-black-300" title={`Subido por ${grupo.usuarios.join(", ")}`}>
                        {fechaCorta(activo.fecha_subida)}
                      </p>
                      {pendientesRevision > 0 && (
                        <Link
                          href="/importar/revision"
                          title={`${pendientesRevision} por revisar`}
                          aria-label={`${pendientesRevision} por revisar`}
                          className={`${botonIcono} text-amber-600 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-400/10`}
                        >
                          <FiAlertTriangle size={14} aria-hidden="true" />
                        </Link>
                      )}
                      {activo.revertible && (
                        <RevertirCarga
                          corteId={activo.id}
                          hasta={activo.revertible_hasta}
                          descripcion={`${activo.periodo_label} · ${activo.archivo_nombre}`}
                          onRevertida={recargarTrasRevertir}
                          compacto
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void abrirPreview(grupo)}
                        title="Vista previa"
                        aria-label={`Vista previa de ${grupo.periodoLabel}`}
                        className={`${botonIcono} text-slate-500 hover:bg-white hover:text-slate-900 dark:text-ink-black-300 dark:hover:bg-ink-black-700 dark:hover:text-white`}
                      >
                        <FiEye size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => irAImportar(mes, anioVista, true)}
                        title="Sobrescribir con una planilla nueva"
                        aria-label={`Sobrescribir ${grupo.periodoLabel}`}
                        className={`${botonIcono} text-slate-500 hover:bg-white hover:text-amber-600 dark:text-ink-black-300 dark:hover:bg-ink-black-700 dark:hover:text-amber-300`}
                      >
                        <FiRefreshCw size={14} aria-hidden="true" />
                      </button>
                      {esAdmin && (
                        <button
                          type="button"
                          onClick={() => setPeriodoAEliminar(grupo)}
                          title="Eliminar el mes"
                          aria-label={`Eliminar ${grupo.periodoLabel}`}
                          className={`${botonIcono} text-slate-500 hover:bg-white hover:text-red-600 dark:text-ink-black-300 dark:hover:bg-ink-black-700 dark:hover:text-red-300`}
                        >
                          <FiTrash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
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
            className="flex max-h-[calc(100dvh-48px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-ink-black-700 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
                  <FiEye size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="historial-detalle-titulo" className="truncate text-lg font-black text-slate-950 dark:text-white">
                    Vista previa · {resumenDetalle.grupo.periodoLabel}
                  </h2>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-ink-black-300">
                    <b className={(COLOR_ESTADO[resumenDetalle.activo.estado] ?? COLOR_ESTADO_OTRO).texto}>{resumenDetalle.activo.estado_label}</b>
                    {" · "}
                    {resumenDetalle.activo.archivo_nombre || "Archivo sin nombre"} · {fechaCorta(resumenDetalle.activo.fecha_subida)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandido(null)}
                aria-label="Cerrar vista previa"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-ink-black-300 dark:hover:bg-ink-black-700 dark:hover:text-white"
              >
                <FiX size={18} />
              </button>
            </header>

            <div className="grid shrink-0 grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 dark:divide-ink-black-700 dark:border-ink-black-700 sm:grid-cols-5">
              {(() => {
                const d = desglose(resumenDetalle.activo);
                return (
                  [
                    ["Pacientes", d.total, "text-slate-900 dark:text-white"],
                    ["En espera", d.enLista, "text-blue-600 dark:text-blue-300"],
                    ["Ingresados", d.ingresados, "text-emerald-600 dark:text-emerald-300"],
                    ["Nuevos", resumenDetalle.registrosMes, "text-slate-700 dark:text-ink-black-100"],
                    ["Recurrentes", resumenDetalle.recurrentesMes, "text-slate-700 dark:text-ink-black-100"],
                  ] as Array<[string, number, string]>
                ).map(([label, value, colorValor]) => (
                  <div key={label} className="px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-ink-black-300">{label}</p>
                    <p className={`text-lg font-black tabular-nums ${colorValor}`}>{num(value)}</p>
                  </div>
                ));
              })()}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} aria-hidden="true" />
                <input
                  value={busquedaPreview}
                  onChange={(event) => setBusquedaPreview(event.target.value)}
                  placeholder="Buscar nombre, RUT o diagnóstico"
                  aria-label="Buscar en la vista previa"
                  className="ccr-control-input w-full pl-9 pr-3"
                />
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
                {[["", "Todos"] as [string, string], ...estadosPreview].map(([valor, label]) => (
                  <button
                    key={valor || "todos"}
                    type="button"
                    onClick={() => setEstadoPreview(valor)}
                    aria-pressed={estadoPreview === valor}
                    className={`h-8 rounded-lg px-2.5 text-[11px] font-bold transition ${
                      estadoPreview === valor
                        ? "bg-slate-900 text-white dark:bg-white dark:text-ink-black-900"
                        : "text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="ml-auto text-[11px] font-medium tabular-nums text-slate-500 dark:text-ink-black-300">
                {pacientesPreview.length} de {pacientesDetalle.length}
              </p>
            </div>

            <div className="min-h-[200px] flex-1 overflow-auto border-t border-slate-100 [scrollbar-gutter:stable] dark:border-ink-black-700">
              {cargandoDetalle && pacientesDetalle.length === 0 ? (
                <div className="p-4">
                  <TableSkeleton rows={6} />
                </div>
              ) : pacientesPreview.length > 0 ? (
                <table className="w-full min-w-[960px] table-fixed border-collapse text-[11px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-ink-black-300">
                      <th className="w-[220px] px-3 py-2.5">Paciente</th>
                      <th className="w-[56px] px-3 py-2.5">Edad</th>
                      <th className="w-[96px] px-3 py-2.5">Fecha</th>
                      <th className="px-3 py-2.5">Diagnóstico</th>
                      <th className="w-[90px] px-3 py-2.5">Prioridad</th>
                      <th className="w-[140px] px-3 py-2.5">Sector</th>
                      <th className="w-[140px] px-3 py-2.5">Profesional</th>
                      <th className="w-[100px] px-3 py-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-ink-black-700">
                    {pacientesPreview.map((paciente) => (
                      <tr key={paciente.id} className="transition-colors hover:bg-blue-50/60 dark:hover:bg-blue-500/10">
                        <td className="px-3 py-2">
                          <p className="truncate font-bold text-slate-900 dark:text-white" title={paciente.nombre}>{paciente.nombre || "Paciente sin nombre"}</p>
                          <p className="truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-ink-black-300">{paciente.rut || "Sin RUT"}</p>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-ink-black-200">{paciente.edad}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-ink-black-200">{paciente.fecha_derivacion || "—"}</td>
                        <td className="truncate px-3 py-2 text-slate-700 dark:text-ink-black-100" title={paciente.diagnostico}>{paciente.diagnostico || "—"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-ink-black-100">{paciente.prioridad || "—"}</td>
                        <td className="truncate px-3 py-2 text-slate-600 dark:text-ink-black-200" title={paciente.sector_cesfam || paciente.sector_oficial}>{paciente.sector_cesfam || paciente.sector_oficial || "—"}</td>
                        <td className="truncate px-3 py-2 text-slate-600 dark:text-ink-black-200" title={paciente.kine_asignado_nombre ?? ""}>{paciente.kine_asignado_nombre || "Sin asignar"}</td>
                        <td className={`px-3 py-2 font-bold ${colorEstadoPaciente(paciente.estado)}`}>{paciente.estado_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center px-4 text-center text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  {pacientesDetalle.length === 0 ? "Este mes no tiene pacientes para mostrar." : "Ningún paciente coincide con la búsqueda."}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-ink-black-700">
              {esAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodoAEliminar(resumenDetalle.grupo);
                    setExpandido(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <FiTrash2 size={13} aria-hidden="true" /> Eliminar mes
                </button>
              )}
              <button
                type="button"
                onClick={() => irAImportar(resumenDetalle.grupo.mes, resumenDetalle.grupo.anio, true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
              >
                <FiRefreshCw size={13} aria-hidden="true" /> Sobrescribir mes
              </button>
            </footer>
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200">
                <FiAlertTriangle size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:!text-white">Eliminar {periodoAEliminar.periodoLabel}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-ink-black-200">
                  El mes queda sin carga en el calendario.
                </p>
                <ul className="mt-3 space-y-1 text-xs font-medium text-slate-600 dark:text-ink-black-200">
                  {desgloseEliminar && (
                    <li>
                      Se borran los que siguen en espera sin profesional (hasta{" "}
                      <b className="tabular-nums text-slate-900 dark:text-white">{num(desgloseEliminar.enLista)}</b>)
                    </li>
                  )}
                  <li>Se conservan los ingresados y los que ya tienen profesional</li>
                  <li>
                    Se borran sus <b className="tabular-nums text-slate-900 dark:text-white">{periodoAEliminar.items.length}</b> carga
                    {periodoAEliminar.items.length !== 1 ? "s" : ""} y archivos
                  </li>
                </ul>
                <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-300">No se puede deshacer.</p>
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
                <FiTrash2 size={13} /> {eliminando ? "Eliminando..." : "Eliminar mes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
