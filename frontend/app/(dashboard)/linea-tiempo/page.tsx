"use client";

import { Suspense, useDeferredValue, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertCircle,
  FiArrowRight,
  FiDownload,
  FiPhoneIncoming,
  FiPhoneMissed,
  FiRefreshCw,
  FiRepeat,
  FiSearch,
  FiShuffle,
  FiSlash,
  FiUserCheck,
  FiUsers,
  FiUserX,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import { useAPI } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import { descargarBlob } from "@/lib/utils";
import type { ActividadEquipoEvento, ActividadEquipoRespuesta, HistorialAccionTipo, Paciente } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import FiltroPildoras from "@/components/FiltroPildoras";
import LoaderKine from "@/components/LoaderKine";
import MenuAcciones from "@/components/MenuAcciones";
import { PILL, PUNTO, TIPO_META } from "@/components/TimelinePaciente";

const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });
const ActividadesGrupalesModal = dynamic(() => import("@/components/ActividadesGrupalesModal"), { ssr: false });

const PERIODOS = [
  { value: "1", label: "Hoy" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "365", label: "Último año" },
];

const POR_PAGINA = 50;

function fechaLocal(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function claveDia(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fechaLocal(d);
}

function etiquetaDia(clave: string) {
  if (!clave) return "Sin fecha";
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (clave === fechaLocal(hoy)) return "Hoy";
  if (clave === fechaLocal(ayer)) return "Ayer";
  const [a, m, d] = clave.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(a, m - 1, d));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function hora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Las inasistencias y actividades se guardan a medianoche: sin hora real, no se muestra.
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

// Cada persona tiene siempre el mismo color, para reconocerla de un vistazo.
const PERSONAS = [
  { avatar: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200", punto: "bg-blue-500" },
  { avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200", punto: "bg-emerald-500" },
  { avatar: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200", punto: "bg-violet-500" },
  { avatar: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", punto: "bg-amber-500" },
  { avatar: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200", punto: "bg-rose-500" },
  { avatar: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200", punto: "bg-teal-500" },
  { avatar: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200", punto: "bg-indigo-500" },
  { avatar: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200", punto: "bg-orange-500" },
];
const SISTEMA = { avatar: "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-100", punto: "bg-slate-400" };

function colorPersona(id: number | null) {
  return id == null ? SISTEMA : PERSONAS[id % PERSONAS.length];
}

function iniciales(nombre: string | null) {
  if (!nombre) return "S";
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Lo que pasó, como frase: "<acción> <paciente>". Quién lo hizo va a la derecha. */
function frase(e: ActividadEquipoEvento) {
  switch (e.tipo) {
    case "CAMBIO_ESTADO":
      return "Cambió el estado de";
    case "CONTACTO":
      return /confirmado/i.test(e.titulo) ? "Contactó a" : "Intentó contactar a";
    case "AGENDA_ASISTIO":
      return "Registró la asistencia de";
    case "AGENDA_NO_ASISTIO":
      return "Registró que no asistió";
    case "AGENDA_REAGENDADO":
      return "Reagendó la atención de";
    case "AGENDA_CANCELADO":
      return "Eliminó la cita de";
    case "INASISTENCIA":
      return "Registró una inasistencia de";
    case "ACTIVIDAD_GRUPAL":
      return "Actividad grupal";
    default:
      return "Registró";
  }
}

// Íconos propios de cada acción (más precisos que los genéricos del tipo):
// el contacto distingue si contestó y la agenda si asistió, no asistió o se movió.
function iconoEvento(e: ActividadEquipoEvento): IconType {
  switch (e.tipo) {
    case "CAMBIO_ESTADO":
      return FiShuffle;
    case "CONTACTO":
      return /confirmado/i.test(e.titulo) ? FiPhoneIncoming : FiPhoneMissed;
    case "AGENDA_ASISTIO":
      return FiUserCheck;
    case "AGENDA_NO_ASISTIO":
      return FiUserX;
    case "AGENDA_REAGENDADO":
      return FiRepeat;
    case "AGENDA_CANCELADO":
      return FiSlash;
    case "INASISTENCIA":
      return FiAlertCircle;
    case "ACTIVIDAD_GRUPAL":
      return FiUsers;
    default:
      return FiActivity;
  }
}

// Círculo con borde fino y el ícono en el color del tipo de evento.
const ICONO_EVENTO: Record<string, string> = {
  slate: "border-slate-200 text-slate-500 dark:border-ink-black-600 dark:text-ink-black-200",
  blue: "border-blue-200 text-blue-600 dark:border-blue-500/40 dark:text-blue-300",
  amber: "border-amber-200 text-amber-600 dark:border-amber-500/40 dark:text-amber-300",
  green: "border-green-200 text-green-600 dark:border-green-500/40 dark:text-green-300",
  red: "border-red-200 text-red-600 dark:border-red-500/40 dark:text-red-300",
  violet: "border-violet-200 text-violet-600 dark:border-violet-500/40 dark:text-violet-300",
  indigo: "border-indigo-200 text-indigo-600 dark:border-indigo-500/40 dark:text-indigo-300",
  rose: "border-rose-200 text-rose-600 dark:border-rose-500/40 dark:text-rose-300",
  sky: "border-sky-200 text-sky-600 dark:border-sky-500/40 dark:text-sky-300",
};

function corto(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

// useSearchParams necesita un límite de Suspense para el prerender.
export default function ActividadRecientePage() {
  return (
    <Suspense fallback={null}>
      <ActividadReciente />
    </Suspense>
  );
}

function ActividadReciente() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  // /linea-tiempo?rut=... (desde la ficha) muestra la actividad de ese paciente del último año.
  const rutParam = searchParams.get("rut") ?? "";

  const [busqueda, setBusqueda] = useState(rutParam);
  const [periodo, setPeriodo] = useState(rutParam ? "365" : "7");
  const [tipo, setTipo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [exportando, setExportando] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [refrescando, setRefrescando] = useState(false);
  const [ficha, setFicha] = useState<Paciente | null>(null);
  const [actividadAbierta, setActividadAbierta] = useState<number | null>(null);
  const buscado = useDeferredValue(busqueda.trim());

  const path = useMemo(() => {
    const hoy = new Date();
    const desde = new Date();
    desde.setDate(hoy.getDate() - (Number(periodo) - 1));
    const params = new URLSearchParams({ desde: fechaLocal(desde), hasta: fechaLocal(hoy), limite: String(limite) });
    if (tipo) params.set("tipo", tipo);
    if (usuario) params.set("usuario", usuario);
    if (buscado) params.set("search", buscado);
    return `/pacientes/actividad-reciente/?${params.toString()}`;
  }, [periodo, tipo, usuario, buscado, limite]);

  const { data, error, isLoading, mutate } = useAPI<ActividadEquipoRespuesta>(user ? path : null, { keepPreviousData: true });

  const acciones = useMemo(() => data?.acciones ?? [], [data]);
  const total = data?.total ?? 0;
  const porTipo = data?.por_tipo ?? {};

  const grupos = useMemo(() => {
    const lista: { clave: string; eventos: ActividadEquipoEvento[] }[] = [];
    for (const e of acciones) {
      const clave = claveDia(e.fecha);
      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.clave === clave) ultimo.eventos.push(e);
      else lista.push({ clave, eventos: [e] });
    }
    return lista;
  }, [acciones]);

  // Las personas ya vistas se recuerdan: al filtrar (por persona, tipo o paciente) la
  // respuesta trae menos gente, pero el filtro debe seguir ofreciendo a todas.
  const [personas, setPersonas] = useState<{ id: number; nombre: string }[]>([]);
  const nuevas = (data?.usuarios ?? []).filter((u) => !personas.some((p) => p.id === u.id));
  if (nuevas.length > 0) {
    setPersonas(
      [...personas, ...nuevas.map((u) => ({ id: u.id, nombre: u.nombre ?? "Sin nombre" }))].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    );
  }

  const hayFiltros = Boolean(busqueda || tipo || usuario);
  const cargando = (isLoading && !data) || refrescando;

  async function actualizar() {
    setRefrescando(true);
    try {
      await Promise.all([mutate(), new Promise((r) => setTimeout(r, 400))]);
    } finally {
      setRefrescando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const filas: ActividadEquipoEvento[] = [];
      const base = path.replace(/([?&])limite=\d+/, "$1limite=200");
      for (let offset = 0; offset < 5000; offset += 200) {
        const pagina = await api.get<ActividadEquipoRespuesta>(`${base}&offset=${offset}`);
        filas.push(...pagina.acciones);
        if (filas.length >= pagina.total || pagina.acciones.length === 0) break;
      }
      const celda = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const encabezado = ["Fecha", "Hora", "Profesional", "Acción", "Paciente", "RUT", "Detalle", "Observación"];
      const lineas = filas.map((e) => {
        const d = new Date(e.fecha);
        const detalle =
          e.tipo === "CAMBIO_ESTADO" ? e.descripcion.replace("->", "→") : e.descripcion.replace(/^Resultado:\s*/i, "");
        return [
          fechaLocal(d).split("-").reverse().join("-"),
          hora(e.fecha),
          e.usuario_nombre ?? "Automático",
          e.tipo === "ACTIVIDAD_GRUPAL" ? "Actividad grupal" : e.titulo,
          e.paciente_nombre ? nombreLegible(e.paciente_nombre) : e.titulo,
          e.paciente_rut ? formatearRut(e.paciente_rut) : "",
          detalle,
          e.observacion,
        ]
          .map(celda)
          .join(";");
      });
      // BOM + punto y coma: Excel en español lo abre con columnas y tildes correctas.
      const csv = "\uFEFF" + [encabezado.map(celda).join(";"), ...lineas].join("\r\n");
      descargarBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `actividad-ccr-${fechaLocal(new Date())}.csv`);
      toast.success(`Actividad exportada (${filas.length} evento${filas.length !== 1 ? "s" : ""}).`);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo exportar la actividad."));
    } finally {
      setExportando(false);
    }
  }

  async function abrirFicha(id: number) {
    try {
      setFicha(await api.get<Paciente>(`/pacientes/${id}/`));
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo abrir la ficha del paciente."));
    }
  }

  function limpiar() {
    setBusqueda("");
    setTipo("");
    setUsuario("");
    setLimite(POR_PAGINA);
  }

  if (!user) return null;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Actividad reciente</h1>

      <section className="ccr-panel overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#262626] dark:bg-[#0f0f10]">
        {/* Encabezado: búsqueda a la izquierda, filtros y acciones a la derecha */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 border-b border-slate-200 px-4 py-3 dark:border-[#262626]">
          <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} aria-hidden="true" />
            <input
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setLimite(POR_PAGINA);
              }}
              placeholder="Buscar paciente por nombre o RUT"
              aria-label="Buscar paciente"
              className="ccr-control-input w-full pl-9 pr-3"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="w-56">
              <FiltroPildoras
                etiqueta="Periodo"
                ariaLabel="Periodo"
                valor={periodo}
                onChange={(v) => {
                  setPeriodo(v || "7");
                  setLimite(POR_PAGINA);
                }}
                opciones={PERIODOS}
              />
            </div>
            <div className="w-56">
              <FiltroPildoras
                etiqueta="Evento"
                ariaLabel="Tipo de evento"
                valor={tipo}
                onChange={(v) => {
                  setTipo(v);
                  setLimite(POR_PAGINA);
                }}
                opciones={[
                  { value: "", label: "Todos" },
                  ...(Object.keys(TIPO_META) as HistorialAccionTipo[])
                    .filter((t) => (porTipo[t] ?? 0) > 0 || t === tipo)
                    .map((t) => ({ value: t, label: TIPO_META[t].etiqueta, dot: PUNTO[TIPO_META[t].tono], total: porTipo[t] ?? 0 })),
                ]}
              />
            </div>
            <div className="w-60">
              <FiltroPildoras
                etiqueta="Profesional"
                ariaLabel="Profesional"
                valor={usuario}
                onChange={(v) => {
                  setUsuario(v);
                  setLimite(POR_PAGINA);
                }}
                opciones={[
                  { value: "", label: "Todos" },
                  ...personas.map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                    // Con una persona elegida, el conteo de las demás no aplica: se omite en vez de mostrar 0.
                    total: usuario && usuario !== String(p.id) ? undefined : (data?.usuarios.find((u) => u.id === p.id)?.total ?? 0),
                  })),
                ]}
              />
            </div>
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiar}
                aria-label="Quitar todos los filtros"
                title="Quitar filtros"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-900/60 dark:bg-transparent dark:text-red-300"
              >
                <FiX size={15} aria-hidden="true" />
              </button>
            )}
            <MenuAcciones
              acciones={[
                {
                  label: "Actualizar",
                  detalle: "Vuelve a cargar la actividad",
                  tono: "azul",
                  icon: <FiRefreshCw size={13} aria-hidden="true" />,
                  onClick: () => void actualizar(),
                },
                {
                  label: exportando ? "Exportando…" : "Exportar Excel",
                  detalle: "Descarga la actividad filtrada",
                  tono: "verde",
                  icon: <FiDownload size={13} aria-hidden="true" />,
                  onClick: () => void exportar(),
                  disabled: exportando || total === 0,
                },
              ]}
            />
          </div>
        </div>

        {error && !data && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(error, "No se pudo cargar la actividad.")}
          </p>
        )}

        {/* Actividad agrupada por día */}
        {cargando ? (
          <div className="flex justify-center py-12">
            <LoaderKine enLinea retrasoMs={0} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <FiActivity className="mx-auto text-slate-300" size={28} aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">Sin actividad en este periodo</p>
            <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500">
              Prueba con un periodo más largo
              {busqueda || tipo || usuario ? " o quita los filtros" : ""}.
            </p>
          </div>
        ) : (
          <div>
            {grupos.map((grupo) => (
              <section key={grupo.clave} aria-label={etiquetaDia(grupo.clave)}>
                <h2 className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-white/95 px-5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur dark:border-ink-black-700 dark:bg-ink-black-800/95 dark:text-ink-black-300">
                  {etiquetaDia(grupo.clave)}
                  <span className="tabular-nums text-slate-500">{grupo.eventos.length}</span>
                </h2>
                <ul>
                  {grupo.eventos.map((e, i) => {
                    const meta = TIPO_META[e.tipo] ?? TIPO_META.CAMBIO_ESTADO;
                    const Icono = iconoEvento(e);
                    const h = hora(e.fecha);
                    const quien = e.usuario_nombre ?? "Sistema";
                    const resultado = e.tipo === "CONTACTO" ? e.descripcion.replace(/^Resultado:\s*/i, "") : "";
                    const persona = colorPersona(e.usuario_id);
                    const detalle = (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-bold ${PILL[meta.tono]}`}>
                              <Icono size={11} aria-hidden="true" />
                              {meta.etiqueta}
                            </span>
                            {e.tipo === "CAMBIO_ESTADO" && e.estado_nuevo && (
                              <span className="inline-flex items-center gap-1.5">
                                {e.estado_anterior ? <BadgeEstado estado={e.estado_anterior} /> : <span className="text-[11px] font-semibold text-slate-500">Sin estado</span>}
                                <FiArrowRight size={12} className="text-slate-400" aria-hidden="true" />
                                <BadgeEstado estado={e.estado_nuevo} />
                              </span>
                            )}
                            {resultado && (
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  /no contesta/i.test(resultado)
                                    ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                }`}
                              >
                                {resultado}
                              </span>
                            )}
                            {e.tipo === "INASISTENCIA" && (
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                  /^justificada/i.test(e.descripcion)
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                                    : "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                                }`}
                              >
                                {e.descripcion}
                              </span>
                            )}
                            {e.tipo === "AGENDA_REAGENDADO" && (e.fecha_programada || e.nueva_fecha) && (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:text-ink-black-200">
                                {e.fecha_programada && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 dark:bg-ink-black-700">{corto(e.fecha_programada)}</span>}
                                {e.fecha_programada && e.nueva_fecha && <FiArrowRight size={11} className="text-slate-400" aria-hidden="true" />}
                                {e.nueva_fecha && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">{corto(e.nueva_fecha)}</span>}
                              </span>
                            )}
                            {e.tipo === "ACTIVIDAD_GRUPAL" && (
                              <>
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{e.descripcion}</span>
                                {e.actividad_id && user?.rol !== "MEDICO" && (
                                  <button
                                    type="button"
                                    onClick={() => setActividadAbierta(e.actividad_id ?? null)}
                                    className="rounded-md px-2 py-0.5 text-[11px] font-bold text-blue-700 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/15"
                                  >
                                    Ver actividad
                                  </button>
                                )}
                              </>
                            )}
                            {(e.tipo === "AGENDA_ASISTIO" || e.tipo === "AGENDA_NO_ASISTIO" || e.tipo === "AGENDA_CANCELADO") && e.fecha_programada && (
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200">
                                Cita del {corto(e.fecha_programada)}
                              </span>
                            )}
                          </div>
                    );
                    return (
                      <li
                        key={`${e.tipo}-${e.fecha}-${e.paciente_id ?? "g"}-${i}`}
                        className="flex items-stretch border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-ink-black-700 dark:hover:bg-ink-black-700/50"
                      >
                        <div className="w-16 shrink-0 border-r border-slate-100 px-3 py-3 text-right text-[12px] font-bold tabular-nums text-slate-700 dark:border-ink-black-700 dark:text-ink-black-100">
                          {h || <span className="font-semibold text-slate-400">—</span>}
                        </div>
                        <div className="flex min-w-0 flex-1 gap-3 px-4 py-2.5">
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white dark:bg-ink-black-800 ${ICONO_EVENTO[meta.tono]}`} title={meta.etiqueta}>
                            <Icono size={13} strokeWidth={2.25} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-snug text-slate-600 dark:text-ink-black-200">
                              {frase(e)}{" "}
                              {e.paciente_id ? (
                                <button
                                  type="button"
                                  onClick={() => void abrirFicha(e.paciente_id as number)}
                                  className="text-left font-bold text-slate-950 outline-none hover:underline focus-visible:underline dark:text-white"
                                  title="Abrir la ficha"
                                >
                                  {nombreLegible(e.paciente_nombre ?? "")}
                                  <span className="ml-1.5 font-mono text-[12px] font-semibold">{formatearRut(e.paciente_rut ?? "")}</span>
                                </button>
                              ) : (
                                <span className="font-bold text-slate-950 dark:text-white">{e.titulo}</span>
                              )}
                            </p>
                            {detalle}
                            {e.observacion && (
                              <p className="mt-1.5 line-clamp-2 border-l-2 border-slate-200 pl-2.5 text-xs italic text-slate-500 dark:border-ink-black-600 dark:text-ink-black-300">
                                {e.observacion}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="hidden w-56 shrink-0 items-center gap-2.5 border-l border-slate-100 px-4 py-2.5 dark:border-ink-black-700 sm:flex">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${persona.avatar}`}
                            aria-hidden="true"
                          >
                            {iniciales(e.usuario_nombre)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12.5px] font-bold text-slate-900 dark:text-ink-black-50">{quien}</span>
                            <span className="block text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                              {e.usuario_id ? "Registró" : "Automático"}
                            </span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Pie con los totales */}
        {!cargando && grupos.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:border-[#262626] dark:bg-[#151515] dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Mostrando {acciones.length} de {total} evento{total !== 1 ? "s" : ""}
              {data && ` · del ${data.desde.split("-").reverse().join("-")} al ${data.hasta.split("-").reverse().join("-")}`}
            </p>
            {acciones.length < total && (
              <button type="button" onClick={() => setLimite((l) => l + POR_PAGINA)} className="ccr-control-button !h-8">
                Ver más
              </button>
            )}
          </div>
        )}
      </section>

      {ficha && <FichaPaciente paciente={ficha} usuario={user} onClose={() => setFicha(null)} onRefresh={() => void mutate()} />}
      {actividadAbierta && user && (
        <ActividadesGrupalesModal
          usuario={user}
          pacientesDisponibles={[]}
          actividadInicial={actividadAbierta}
          onClose={() => setActividadAbierta(null)}
          onCambio={() => void mutate()}
        />
      )}
    </div>
  );
}
