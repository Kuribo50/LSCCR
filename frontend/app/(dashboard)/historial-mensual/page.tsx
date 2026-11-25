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
import { motion, type Variants } from "framer-motion";
import NumeroAnimado from "@/components/NumeroAnimado";
import InfoHover, { TarjetaInfo } from "@/components/InfoHover";
import LoaderKine from "@/components/LoaderKine";
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
  /** Cargas vigentes del mes (las reemplazadas no cuentan). */
  cargas: ImportacionHistorialItem[];
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

/** Tramos de la barra de cada mes: barra y punto llevan el color del estado. */
const TRAMOS = [
  {
    clave: "enLista",
    label: "En espera",
    color: "bg-blue-500",
    punto: "bg-blue-500",
    descripcion: "Pendientes o en rescate.",
  },
  {
    clave: "ingresados",
    label: "Ingresados",
    color: "bg-emerald-500",
    punto: "bg-emerald-500",
    descripcion: "En atención con un profesional.",
  },
  {
    clave: "egresados",
    label: "Egresados",
    color: "bg-violet-500",
    punto: "bg-violet-500",
    descripcion: "Alta, abandono o egreso administrativo.",
  },
] as const;

/** Totales del año: mismo color que el estado del paciente en el resto de la app. */
const KPIS = [
  {
    clave: "total",
    label: "Pacientes",
    descripcion: "Entraron en los cortes del año.",
    punto: null,
    fondo: "bg-slate-100 dark:bg-ink-black-700",
    etiqueta: "text-slate-600 dark:text-ink-black-200",
    valor: "text-slate-900 dark:text-white",
  },
  {
    clave: "enLista",
    label: "En espera",
    descripcion: "Pendientes o en rescate.",
    punto: TRAMOS[0].punto,
    fondo: "bg-blue-50 dark:bg-blue-500/10",
    etiqueta: "text-blue-700 dark:text-blue-200",
    valor: "text-blue-700 dark:text-blue-200",
  },
  {
    clave: "ingresados",
    label: "Ingresados",
    descripcion: "En atención con un profesional.",
    punto: TRAMOS[1].punto,
    fondo: "bg-emerald-50 dark:bg-emerald-500/10",
    etiqueta: "text-emerald-700 dark:text-emerald-200",
    valor: "text-emerald-700 dark:text-emerald-200",
  },
  {
    clave: "egresados",
    label: "Egresados",
    descripcion: "Alta, abandono o egreso administrativo.",
    punto: TRAMOS[2].punto,
    fondo: "bg-violet-50 dark:bg-violet-500/10",
    etiqueta: "text-violet-700 dark:text-violet-200",
    valor: "text-violet-700 dark:text-violet-200",
  },
  {
    clave: "nuevos",
    label: "Nuevos",
    descripcion: "Primera vez en una planilla.",
    punto: null,
    fondo: "bg-sky-50 dark:bg-sky-500/10",
    etiqueta: "text-sky-700 dark:text-sky-200",
    valor: "text-sky-700 dark:text-sky-200",
  },
  {
    clave: "recurrentes",
    label: "Recurrentes",
    descripcion: "Ya estaban en el sistema.",
    punto: null,
    fondo: "bg-amber-50 dark:bg-amber-500/10",
    etiqueta: "text-amber-700 dark:text-amber-200",
    valor: "text-amber-700 dark:text-amber-200",
  },
] as const;

/** Punto y texto del estado del paciente en la vista previa: mismos colores que el calendario. */
function colorEstadoPaciente(estado: string) {
  if (estado === "PENDIENTE") return { punto: "bg-blue-500", texto: "text-blue-700 dark:text-blue-300" };
  if (estado === "RESCATE") return { punto: "bg-amber-500", texto: "text-amber-700 dark:text-amber-300" };
  if (estado === "INGRESADO") return { punto: "bg-emerald-500", texto: "text-emerald-700 dark:text-emerald-300" };
  return { punto: "bg-violet-500", texto: "text-violet-700 dark:text-violet-300" };
}

/** Punto de la prioridad clínica. */
const PRIORIDAD = {
  Alta: { orden: 0, punto: "bg-rose-500" },
  Mediana: { orden: 1, punto: "bg-amber-500" },
  Moderada: { orden: 2, punto: "bg-sky-500" },
} as Record<string, { orden: number; punto: string }>;

/** 2026-06-16 → 16/06/2026 */
const fechaDMA = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

type CampoOrden = "nombre" | "edad" | "fecha" | "prioridad" | "kine" | "estado";
const COLUMNAS_PREVIEW: Array<{ campo: CampoOrden | null; label: string; ancho: string; derecha?: boolean }> = [
  { campo: "nombre", label: "Paciente", ancho: "w-[230px]" },
  { campo: "edad", label: "Edad", ancho: "w-[64px]", derecha: true },
  { campo: "fecha", label: "Derivación", ancho: "w-[104px]" },
  { campo: null, label: "Diagnóstico", ancho: "" },
  { campo: "prioridad", label: "Prioridad", ancho: "w-[104px]" },
  { campo: null, label: "Sector", ancho: "w-[130px]" },
  { campo: "kine", label: "Profesional", ancho: "w-[150px]" },
  { campo: "estado", label: "Estado", ancho: "w-[170px]" },
];

function compararPacientes(a: ImportacionHistorialPaciente, b: ImportacionHistorialPaciente, campo: CampoOrden) {
  switch (campo) {
    case "edad":
      return (a.edad ?? 0) - (b.edad ?? 0);
    case "fecha":
      return (a.fecha_derivacion ?? "").localeCompare(b.fecha_derivacion ?? "");
    case "prioridad":
      return (PRIORIDAD[a.prioridad]?.orden ?? 9) - (PRIORIDAD[b.prioridad]?.orden ?? 9);
    case "kine":
      return (a.kine_asignado_nombre ?? "~").localeCompare(b.kine_asignado_nombre ?? "~", "es");
    case "estado":
      return a.estado_label.localeCompare(b.estado_label, "es");
    default:
      return (a.nombre ?? "").localeCompare(b.nombre ?? "", "es");
  }
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

/** Entrada escalonada: los KPI y los meses aparecen uno tras otro al cargar o cambiar de año. */
const SUAVE = [0.16, 1, 0.3, 1] as const;
const contenedorEscalonado: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.035 } },
};
const itemEscalonado: Variants = {
  oculto: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: SUAVE } },
};

/** Loader con la forma del calendario: 12 meses con título, barra y números (daisyUI skeleton). */
function CalendarioCargando() {
  return (
    <div className="relative min-h-0 flex-1 overflow-auto bg-slate-50/70 p-4 dark:bg-ink-black-900 sm:p-5" aria-busy="true" aria-label="Cargando cortes">
      {/* El kine animado encima del calendario en gris, como en Lista de espera. */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px] dark:bg-ink-black-900/60">
        <LoaderKine enLinea retrasoMs={0} texto="Cargando cortes…" />
      </div>
      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 min-[480px]:grid-cols-2 lg:h-full lg:min-h-[480px] lg:grid-cols-4 lg:grid-rows-3 dark:border-ink-black-600 dark:bg-ink-black-600">
        {MESES.map((mes) => (
          <li key={mes} className="flex min-h-[150px] flex-col gap-3 bg-white p-4 dark:bg-ink-black-800">
            <div className="flex items-center justify-between">
              <div className="d-skeleton h-5 w-24 rounded-md" />
              <div className="d-skeleton h-5 w-12 rounded-md" />
            </div>
            <div className="d-skeleton h-2 w-full rounded-full" />
            <div className="d-skeleton h-5 w-20 rounded-md" />
            <div className="mt-auto grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="d-skeleton h-7 rounded-md" />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
const porcentaje = (parte: number, total: number) => `${total > 0 ? Math.round((parte / total) * 100) : 0}%`;

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
  const [ordenPreview, setOrdenPreview] = useState<{ campo: CampoOrden; asc: boolean }>({ campo: "nombre", asc: true });
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
        // Solo suman las cargas vigentes: una reemplazada ya no tiene sus pacientes.
        const vigentes = grupo.items.filter((item) => item.estado !== "REEMPLAZADO");
        const cargas = vigentes.length > 0 ? vigentes : [activo];
        const suma = (fn: (item: ImportacionHistorialItem) => number) =>
          cargas.reduce((acc, item) => acc + fn(item), 0);
        return {
          grupo,
          activo,
          cargas,
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

  /** Pacientes en el sistema al cerrar cada mes: suma de todos los cortes hasta ese mes, incluidos años anteriores. */
  const acumuladoPorMes = useMemo(() => {
    const mapa = new Map<string, number>();
    let suma = 0;
    for (const r of resumenes) {
      suma += desglose(r.activo).total;
      mapa.set(r.grupo.key, suma);
    }
    return mapa;
  }, [resumenes]);

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
  const mesMayor = MESES[(delAnio.find((r) => desglose(r.activo).total === maximoAnio)?.grupo.mes ?? 1) - 1];

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
  // Estados presentes en el mes, con cuántos pacientes tiene cada uno (para los filtros).
  const estadosPreview = Array.from(
    pacientesDetalle
      .reduce((mapa, p) => {
        const actual = mapa.get(p.estado);
        mapa.set(p.estado, { label: p.estado_label, total: (actual?.total ?? 0) + 1 });
        return mapa;
      }, new Map<string, { label: string; total: number }>())
      .entries(),
  );
  const consulta = busquedaPreview.trim().toLocaleLowerCase("es-CL");
  const pacientesPreview = pacientesDetalle
    .filter((p) => {
      if (estadoPreview && p.estado !== estadoPreview) return false;
      if (!consulta) return true;
      return [p.nombre, p.rut, p.diagnostico, p.kine_asignado_nombre ?? "", p.sector_cesfam, p.sector_oficial]
        .join(" ")
        .toLocaleLowerCase("es-CL")
        .includes(consulta);
    })
    .sort((a, b) => compararPacientes(a, b, ordenPreview.campo) * (ordenPreview.asc ? 1 : -1));
  // Filas que no se cargaron por error y siguen pendientes: se abren en Revisión de carga.
  const erroresDetalle = (resumenDetalle?.cargas ?? []).flatMap((carga) =>
    (carga.observaciones_revision ?? [])
      .filter((o) => (o.estado_revision ?? "PENDIENTE") === "PENDIENTE" && (!o.tipo || o.tipo === "ERROR"))
      .map((o) => ({ ...o, corteId: carga.id })),
  );
  const erroresPreview =
    estadoPreview && estadoPreview !== "ERROR"
      ? []
      : erroresDetalle.filter(
          (o) => !consulta || [o.nombre, o.rut, o.diagnostico, o.motivo].join(" ").toLocaleLowerCase("es-CL").includes(consulta),
        );
  const pacientesVisibles = estadoPreview === "ERROR" ? [] : pacientesPreview;
  const ordenarPor = (campo: CampoOrden) =>
    setOrdenPreview((actual) => ({ campo, asc: actual.campo === campo ? !actual.asc : true }));
  const botonIcono =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

  return (
    <div className="ccr-dashboard-content mx-auto max-w-[1600px] space-y-4">
      <div className="ccr-waitlist-page flex h-[max(520px,calc(100dvh-64px-2rem))] flex-col overflow-hidden border border-slate-200 bg-white text-[13px] dark:border-ink-black-600 dark:bg-ink-black-800">
        <header className="ccr-waitlist-toolbar shrink-0 border-b border-slate-200 bg-white px-5 pt-3 dark:border-ink-black-600 dark:bg-ink-black-800">
          <h1 className="sr-only">Historial de cortes mensuales</h1>

          {/* Un año por pestaña, con cuántos meses tiene cargados. */}
          <div className="flex items-end gap-3">
            <div role="tablist" aria-label="Año" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden">
              {listaAnios.map(({ anio, meses }) => {
                const activo = anio === anioVista;
                return (
                  <button
                    key={anio}
                    type="button"
                    role="tab"
                    aria-selected={activo}
                    onClick={() => setAnioVista(anio)}
                    className={`relative flex shrink-0 items-baseline gap-2 px-3 pb-2.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                      activo
                        ? "text-slate-950 dark:text-white"
                        : "text-slate-400 hover:text-slate-700 dark:text-ink-black-400 dark:hover:text-ink-black-100"
                    }`}
                  >
                    <span className="text-xl font-black tabular-nums tracking-tight">{anio}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${activo ? "text-blue-600 dark:text-blue-300" : ""}`}>
                      {meses}/12
                    </span>
                    {/* La línea del año activo se desliza hasta la pestaña elegida. */}
                    {activo && (
                      <motion.span
                        layoutId="historial-anio-activo"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                        aria-hidden="true"
                      />
                    )}
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

        {/* Totales del año elegido, cada uno con su color; los puntos grises son la leyenda de las barras. */}
        <motion.dl
          variants={contenedorEscalonado}
          initial="oculto"
          animate="visible"
          className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-200 px-4 py-3 dark:border-ink-black-600 sm:grid-cols-3 sm:px-5 lg:grid-cols-6"
        >
          {KPIS.map((kpi) => (
            <motion.div key={kpi.label} variants={itemEscalonado} className={`rounded-xl ${kpi.fondo}`}>
              <InfoHover
                como="div"
                className="block px-3.5 py-2"
                info={<TarjetaInfo titulo={`${kpi.label} · ${anioVista}`} filas={[{ label: "Total del año", valor: num(totalesAnio[kpi.clave]), punto: kpi.punto ?? undefined, fuerte: true }]} nota={kpi.descripcion} />}
              >
                <dt className={`flex items-center gap-1.5 text-[11px] font-semibold ${kpi.etiqueta}`}>
                  {kpi.punto && <i className={`h-2 w-2 rounded-full ${kpi.punto}`} aria-hidden="true" />}
                  {kpi.label}
                </dt>
                <dd className={`text-xl font-black leading-tight tabular-nums ${kpi.valor}`}>
                  {loading ? <span className="d-loading d-loading-dots d-loading-sm opacity-60" aria-label="Cargando" /> : <NumeroAnimado value={totalesAnio[kpi.clave]} />}
                </dd>
              </InfoHover>
            </motion.div>
          ))}
        </motion.dl>

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
          <CalendarioCargando />
        ) : (
          <section
            aria-label={`Calendario de cortes ${anioVista}`}
            className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-4 dark:bg-ink-black-900 sm:p-5"
          >
            {/* key por año: al cambiar de año los meses vuelven a entrar escalonados. */}
            <motion.ol
              key={anioVista}
              variants={contenedorEscalonado}
              initial="oculto"
              animate="visible"
              className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 min-[480px]:grid-cols-2 lg:h-full lg:min-h-[480px] lg:grid-cols-4 lg:grid-rows-3 dark:border-ink-black-600 dark:bg-ink-black-600"
            >
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
                    <motion.li
                      key={mes}
                      variants={itemEscalonado}
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
                    </motion.li>
                  );
                }

                const { grupo, activo, erroresMes, pendientesRevision, reemplazado } = resumen;
                const d = desglose(activo);
                const color = COLOR_ESTADO[activo.estado] ?? COLOR_ESTADO_OTRO;
                const acumulado = acumuladoPorMes.get(grupo.key) ?? d.total;
                const anchoBarra = (d.total / maximoAnio) * 100;
                const subidos = resumen.registrosMes + resumen.recurrentesMes;

                return (
                  <motion.li
                    key={mes}
                    variants={itemEscalonado}
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
                            <InfoHover
                              className="flex p-1"
                              info={
                                <TarjetaInfo
                                  titulo={`Carga ${activo.estado_label.toLowerCase()}`}
                                  filas={[
                                    { label: "Filas en la planilla", valor: num(resumen.cargas.reduce((a, c) => a + c.total_registros, 0)) },
                                    { label: "Filas con error", valor: num(erroresMes) },
                                    { label: "Por revisar", valor: num(pendientesRevision) },
                                  ]}
                                  nota={erroresMes > 0 ? "Revisar en Revisión de carga." : "Sin errores."}
                                />
                              }
                            >
                              <i aria-label={activo.estado_label} className={`block h-2 w-2 shrink-0 rounded-full ${color.punto}`} />
                            </InfoHover>
                          </div>
                          {marcaActual}
                        </div>
                        <InfoHover
                          className="shrink-0"
                          info={
                            <TarjetaInfo
                              titulo={`+${num(d.total)} pacientes este mes`}
                              filas={[
                                { label: "Nuevos de la planilla", valor: num(Math.min(resumen.registrosMes, d.total)) },
                                { label: "Ingresados a mano", valor: num(Math.max(0, d.total - resumen.registrosMes)) },
                              ]}
                              nota="No incluye recurrentes."
                            />
                          }
                        >
                          <p className="text-[22px] font-black leading-none tabular-nums tracking-tight text-emerald-600 dark:text-emerald-300">
                            +<NumeroAnimado value={d.total} />
                          </p>
                        </InfoHover>
                      </div>

                      {/* Fila 2: barra a escala del mes más grande del año. */}
                      <InfoHover
                        className="mt-3 block w-full py-1"
                        info={
                          <TarjetaInfo
                            titulo={`${num(d.total)} pacientes`}
                            filas={TRAMOS.map((t) => ({
                              label: t.label,
                              punto: t.punto,
                              valor: `${num(d[t.clave])} · ${porcentaje(d[t.clave], d.total)}`,
                            }))}
                            nota={`Largo comparado con ${mesMayor} (${num(maximoAnio)}).`}
                          />
                        }
                      >
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-ink-black-700"
                        role="img"
                        aria-label={`${d.enLista} en espera, ${d.ingresados} ingresados, ${d.egresados} egresados`}
                      >
                        {/* La barra crece desde la izquierda al aparecer el mes. */}
                        <motion.div
                          className="flex h-full gap-px"
                          initial={{ width: 0 }}
                          animate={{ width: `${anchoBarra}%` }}
                          transition={{ duration: 0.7, ease: SUAVE, delay: 0.15 + indice * 0.035 }}
                        >
                          {TRAMOS.map((t) =>
                            d[t.clave] > 0 ? (
                              <i key={t.clave} className={`h-full first:rounded-l-full last:rounded-r-full ${t.color}`} style={{ width: `${(d[t.clave] / Math.max(1, d.total)) * 100}%` }} />
                            ) : null,
                          )}
                        </motion.div>
                      </div>
                      </InfoHover>

                      {/* Fila 3: pacientes acumulados en el sistema y cuántos sumó este mes. */}
                      <InfoHover
                        className="mt-2 flex w-fit items-baseline gap-2"
                        info={
                          <TarjetaInfo
                            titulo={`${num(acumulado)} pacientes en el sistema`}
                            filas={[
                              { label: "Hasta el mes anterior", valor: num(acumulado - d.total) },
                              { label: `${grupo.periodoLabel}`, valor: `+${num(d.total)}` },
                              { label: "Total al cerrar el mes", valor: num(acumulado), fuerte: true },
                            ]}
                            nota="Suma de todos los cortes."
                          />
                        }
                      >
                        <span className="text-[22px] font-black leading-none tabular-nums tracking-tight text-slate-900 dark:text-white">
                          <NumeroAnimado value={acumulado} duracion={0.9} />
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400 dark:text-ink-black-400">en total</span>
                      </InfoHover>

                      {/* Fila 4: subidos y dónde están hoy, en cuatro columnas iguales:
                          número arriba, detalle en gris abajo. La leyenda de los puntos está en los totales del año. */}
                      <dl className="mt-auto grid w-full grid-cols-4 gap-2 pt-4">
                        <InfoHover
                          como="div"
                          className="block min-w-0"
                          info={
                            <TarjetaInfo
                              titulo={`${num(subidos)} filas subidas`}
                              filas={[
                                { label: "Nuevos", valor: num(resumen.registrosMes) },
                                { label: "Recurrentes", valor: num(resumen.recurrentesMes) },
                                { label: "Con error", valor: num(erroresMes) },
                              ]}
                              nota="Recurrentes: ya estaban en el sistema."
                            />
                          }
                        >
                          <dt className="sr-only">Subidos</dt>
                          <dd className="flex items-center gap-1 text-sm font-black tabular-nums text-slate-800 dark:text-ink-black-100">
                            <FiUpload size={11} className="shrink-0 text-slate-400" aria-hidden="true" />
                            {num(subidos)}
                          </dd>
                          <dd className="pl-[15px] text-[10px] font-semibold text-slate-400 dark:text-ink-black-400">subidos</dd>
                        </InfoHover>
                        {TRAMOS.map((t) => (
                          <InfoHover
                            key={t.clave}
                            como="div"
                            className="block min-w-0"
                            info={
                              <TarjetaInfo
                                titulo={t.label}
                                filas={[
                                  { label: "Pacientes", valor: num(d[t.clave]), punto: t.punto },
                                  { label: `Del total del mes (${num(d.total)})`, valor: porcentaje(d[t.clave], d.total) },
                                ]}
                                nota={t.descripcion}
                              />
                            }
                          >
                            <dt className="sr-only">{t.label}</dt>
                            <dd className="flex items-center gap-1.5 text-sm font-black tabular-nums text-slate-800 dark:text-ink-black-100">
                              <i className={`h-2 w-2 shrink-0 rounded-full ${t.punto}`} aria-hidden="true" />
                              {num(d[t.clave])}
                            </dd>
                            <dd className="pl-3.5 text-[10px] font-semibold tabular-nums text-slate-400 dark:text-ink-black-400">
                              {porcentaje(d[t.clave], d.total)}
                            </dd>
                          </InfoHover>
                        ))}
                      </dl>
                    </button>

                    {/* La cuenta regresiva va en su propia línea para no apretar las acciones. */}
                    {activo.revertible && (
                      <div className="px-3 pb-1">
                        <RevertirCarga
                          corteId={activo.id}
                          hasta={activo.revertible_hasta}
                          descripcion={`${activo.periodo_label} · ${activo.archivo_nombre}`}
                          onRevertida={recargarTrasRevertir}
                          compacto
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-0.5 px-2 pb-1.5">
                      <InfoHover
                        className="min-w-0 flex-1 truncate px-2 text-[10px] font-bold tabular-nums text-slate-600 dark:text-ink-black-200"
                        info={
                          <TarjetaInfo
                            titulo={resumen.cargas.length > 1 ? `${resumen.cargas.length} cargas este mes` : "Última carga"}
                            filas={resumen.cargas.map((carga) => ({
                              label: `${fechaCorta(carga.fecha_subida)} · ${carga.usuario_nombre ?? "—"}`,
                              valor: `${num(carga.registros_importados)} nuevos`,
                            }))}
                            nota={activo.archivo_nombre ? `Archivo: ${activo.archivo_nombre}` : undefined}
                          />
                        }
                      >
                        {fechaCorta(activo.fecha_subida).split(",")[0]}
                        {activo.usuario_nombre && ` · ${activo.usuario_nombre}`}
                        {resumen.cargas.length > 1 && ` · ${resumen.cargas.length} cargas`}
                      </InfoHover>
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
                  </motion.li>
                );
              })}
            </motion.ol>
          </section>
        )}
      </div>

      {resumenDetalle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setExpandido(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: SUAVE }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="historial-detalle-titulo"
            onClick={(event) => event.stopPropagation()}
            className="flex h-[min(860px,calc(100dvh-48px))] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800"
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

            {/* Mismos KPI y colores que el encabezado del calendario, pero del mes. */}
            {(() => {
              const d = desglose(resumenDetalle.activo);
              const valores = {
                total: d.total,
                enLista: d.enLista,
                ingresados: d.ingresados,
                egresados: d.egresados,
                nuevos: resumenDetalle.registrosMes,
                recurrentes: resumenDetalle.recurrentesMes,
              };
              return (
                <motion.dl
                  variants={contenedorEscalonado}
                  initial="oculto"
                  animate="visible"
                  className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 dark:border-ink-black-700 sm:grid-cols-3 sm:px-6 lg:grid-cols-6"
                >
                  {KPIS.map((kpi) => (
                    <motion.div key={kpi.label} variants={itemEscalonado} className={`rounded-xl ${kpi.fondo}`}>
                      <InfoHover
                        como="div"
                        className="block px-3.5 py-2"
                        info={<TarjetaInfo titulo={`${kpi.label} · ${resumenDetalle.grupo.periodoLabel}`} filas={[{ label: "Del mes", valor: num(valores[kpi.clave]), punto: kpi.punto ?? undefined, fuerte: true }]} nota={kpi.descripcion} />}
                      >
                        <dt className={`flex items-center gap-1.5 text-[11px] font-semibold ${kpi.etiqueta}`}>
                          {kpi.punto && <i className={`h-2 w-2 rounded-full ${kpi.punto}`} aria-hidden="true" />}
                          {kpi.label}
                        </dt>
                        <dd className={`text-xl font-black leading-tight tabular-nums ${kpi.valor}`}>
                          <NumeroAnimado value={valores[kpi.clave]} />
                        </dd>
                      </InfoHover>
                    </motion.div>
                  ))}
                </motion.dl>
              );
            })()}

            {resumenDetalle.cargas.length > 1 && (
              <div className="shrink-0 border-b border-slate-100 px-5 py-3 dark:border-ink-black-700 sm:px-6">
                <h3 className="text-[11px] font-bold text-slate-500 dark:text-ink-black-300">
                  {resumenDetalle.cargas.length} cargas forman este mes
                </h3>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {resumenDetalle.cargas.map((carga) => (
                    <li key={carga.id} className="flex items-baseline gap-3 text-xs">
                      <span className="w-28 shrink-0 whitespace-nowrap tabular-nums text-slate-500 dark:text-ink-black-300">{fechaCorta(carga.fecha_subida)}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-white" title={carga.archivo_nombre}>
                        {carga.archivo_nombre || "Archivo sin nombre"}
                        {carga.usuario_nombre && <span className="font-normal text-slate-500 dark:text-ink-black-300"> · {carga.usuario_nombre}</span>}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-sky-700 dark:text-sky-200">
                        {num(carga.registros_importados)} {carga.registros_importados === 1 ? "nuevo" : "nuevos"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
              {/* Filtros por estado con su cantidad; el elegido lleva un fondo que se desliza. */}
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por estado">
                {[
                  ["", { label: "Todos", total: pacientesDetalle.length + erroresDetalle.length }] as [string, { label: string; total: number }],
                  ...estadosPreview,
                  ...(erroresDetalle.length > 0
                    ? [["ERROR", { label: "Con error", total: erroresDetalle.length }] as [string, { label: string; total: number }]]
                    : []),
                ].map(
                  ([valor, { label, total }]) => {
                    const elegido = estadoPreview === valor;
                    return (
                      <button
                        key={valor || "todos"}
                        type="button"
                        onClick={() => setEstadoPreview(valor)}
                        aria-pressed={elegido}
                        className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                          elegido ? "text-white dark:text-ink-black-900" : "text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                        }`}
                      >
                        {elegido && (
                          <motion.span
                            layoutId="preview-filtro-estado"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                            className="absolute inset-0 rounded-lg bg-slate-900 dark:bg-white"
                            aria-hidden="true"
                          />
                        )}
                        {valor && <i className={`relative h-2 w-2 rounded-full ${valor === "ERROR" ? "bg-red-500" : colorEstadoPaciente(valor).punto}`} aria-hidden="true" />}
                        <span className="relative">{label}</span>
                        <span className={`relative tabular-nums ${elegido ? "opacity-70" : "text-slate-400 dark:text-ink-black-400"}`}>{num(total)}</span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="min-h-[200px] flex-1 overflow-auto border-t border-slate-100 [scrollbar-gutter:stable] dark:border-ink-black-700">
              {cargandoDetalle && pacientesDetalle.length === 0 ? (
                <div className="p-4">
                  <TableSkeleton rows={6} />
                </div>
              ) : pacientesVisibles.length + erroresPreview.length > 0 ? (
                <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-xs">
                  {/* Encabezado fijo al hacer scroll; las columnas con flecha se ordenan al hacer clic. */}
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50/95 text-left backdrop-blur dark:bg-ink-black-900/95">
                      <th className="w-[44px] border-b border-slate-200 py-2.5 pl-5 pr-2 text-right text-[11px] font-semibold text-slate-400 dark:border-ink-black-600 dark:text-ink-black-400">#</th>
                      {COLUMNAS_PREVIEW.map((col) => {
                        const activa = col.campo !== null && ordenPreview.campo === col.campo;
                        return (
                          <th
                            key={col.label}
                            aria-sort={activa ? (ordenPreview.asc ? "ascending" : "descending") : undefined}
                            className={`${col.ancho} border-b border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-500 dark:border-ink-black-600 dark:text-ink-black-300 ${col.derecha ? "text-right" : ""}`}
                          >
                            {col.campo ? (
                              <button
                                type="button"
                                onClick={() => ordenarPor(col.campo as CampoOrden)}
                                className={`inline-flex items-center gap-1 rounded transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:text-white ${activa ? "text-slate-900 dark:text-white" : ""}`}
                              >
                                {col.label}
                                <span className={`text-[10px] ${activa ? "" : "opacity-0"}`} aria-hidden="true">
                                  {activa && !ordenPreview.asc ? "▼" : "▲"}
                                </span>
                              </button>
                            ) : (
                              col.label
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Filas con error, arriba: al hacer clic se abren en Revisión de carga para corregirlas. */}
                    {erroresPreview.map((obs) => {
                      const celda = "border-b border-red-100 px-3 py-2.5 dark:border-red-500/20";
                      const abrir = () => router.push(`/importar/revision?corte=${obs.corteId}&obs=${obs.revision_index}`);
                      return (
                        <tr
                          key={`error-${obs.corteId}-${obs.revision_index}`}
                          onClick={abrir}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") abrir();
                          }}
                          tabIndex={0}
                          title="Corregir en Revisión de carga"
                          className="cursor-pointer bg-red-50/60 transition-colors hover:bg-red-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/50 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                        >
                          <td className="border-b border-red-100 py-2.5 pl-5 pr-2 text-right dark:border-red-500/20">
                            <FiAlertTriangle size={12} className="ml-auto text-red-500" aria-label="Con error" />
                          </td>
                          <td className={celda}>
                            <p className="truncate font-bold text-slate-900 dark:text-white">{obs.nombre || "Sin nombre"}</p>
                            <p className="truncate text-[11px] tabular-nums text-slate-400 dark:text-ink-black-400">{obs.rut || "Sin RUT"}</p>
                          </td>
                          <td className={`${celda} text-right font-semibold tabular-nums text-slate-700 dark:text-ink-black-100`}>{obs.edad || "—"}</td>
                          <td className={`${celda} whitespace-nowrap tabular-nums text-slate-600 dark:text-ink-black-200`}>{obs.fecha_derivacion || obs.fecha_original || "—"}</td>
                          <td className={`${celda} truncate text-slate-700 dark:text-ink-black-100`}>{obs.diagnostico || "—"}</td>
                          <td className={`${celda} truncate text-slate-600 dark:text-ink-black-200`}>{obs.prioridad || "—"}</td>
                          <td className={`${celda} truncate text-slate-600 dark:text-ink-black-200`}>{obs.sector_cesfam || obs.sector_oficial || "—"}</td>
                          <td className={`${celda} truncate text-slate-400 dark:text-ink-black-400`}>Fila {obs.fila ?? "—"}</td>
                          <td className={celda}>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-bold text-red-700 dark:text-red-300">
                              <i className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
                              Corregir
                            </span>
                            <p className="truncate text-[11px] text-red-600/80 dark:text-red-300/80" title={obs.motivo}>{obs.motivo}</p>
                          </td>
                        </tr>
                      );
                    })}
                    {pacientesVisibles.map((paciente, fila) => {
                      const est = colorEstadoPaciente(paciente.estado);
                      const prio = PRIORIDAD[paciente.prioridad];
                      const celda = "border-b border-slate-100 px-3 py-2.5 dark:border-ink-black-700";
                      return (
                        <tr key={paciente.id} className="transition-colors odd:bg-white even:bg-slate-50/60 hover:!bg-blue-50/70 dark:odd:bg-ink-black-800 dark:even:bg-ink-black-900/40 dark:hover:!bg-blue-500/10">
                          <td className="border-b border-slate-100 py-2.5 pl-5 pr-2 text-right text-[11px] tabular-nums text-slate-400 dark:border-ink-black-700 dark:text-ink-black-400">{fila + 1}</td>
                          <td className={celda}>
                            <p className="truncate font-bold text-slate-900 dark:text-white" title={paciente.nombre}>{paciente.nombre || "Paciente sin nombre"}</p>
                            <p className="truncate text-[11px] tabular-nums text-slate-400 dark:text-ink-black-400">{paciente.rut || "Sin RUT"}</p>
                          </td>
                          <td className={`${celda} text-right font-semibold tabular-nums text-slate-700 dark:text-ink-black-100`}>{paciente.edad}</td>
                          <td className={`${celda} whitespace-nowrap tabular-nums text-slate-600 dark:text-ink-black-200`}>{fechaDMA(paciente.fecha_derivacion)}</td>
                          <td className={`${celda} truncate text-slate-700 dark:text-ink-black-100`} title={paciente.diagnostico}>{paciente.diagnostico || "—"}</td>
                          <td className={celda}>
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-ink-black-100">
                              <i className={`h-2 w-2 shrink-0 rounded-full ${prio?.punto ?? "bg-slate-300"}`} aria-hidden="true" />
                              {paciente.prioridad || "—"}
                            </span>
                          </td>
                          <td className={`${celda} truncate text-slate-600 dark:text-ink-black-200`} title={paciente.sector_cesfam || paciente.sector_oficial}>{paciente.sector_cesfam || paciente.sector_oficial || "—"}</td>
                          <td className={`${celda} truncate ${paciente.kine_asignado_nombre ? "text-slate-700 dark:text-ink-black-100" : "text-slate-400 dark:text-ink-black-400"}`} title={paciente.kine_asignado_nombre ?? ""}>
                            {paciente.kine_asignado_nombre || "Sin asignar"}
                          </td>
                          <td className={celda}>
                            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-bold ${est.texto}`}>
                              <i className={`h-2 w-2 shrink-0 rounded-full ${est.punto}`} aria-hidden="true" />
                              {paciente.estado_label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center px-4 text-center text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  {pacientesDetalle.length === 0 ? "Este mes no tiene pacientes para mostrar." : "Ningún paciente coincide con la búsqueda."}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-ink-black-700">
              <p className="mr-auto text-[11px] font-medium tabular-nums text-slate-500 dark:text-ink-black-300">
                Mostrando <b className="text-slate-800 dark:text-white">{num(pacientesVisibles.length)}</b> de {num(pacientesDetalle.length)} pacientes{erroresDetalle.length > 0 && <> · <b className="text-red-600 dark:text-red-300">{num(erroresDetalle.length)}</b> con error</>}
              </p>
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
          </motion.div>
        </motion.div>
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
