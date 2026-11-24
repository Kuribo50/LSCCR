"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCopy,
  FiEdit2,
  FiEye,
  FiMoreHorizontal,
  FiPhoneCall,
  FiPhoneMissed,
  FiLink,
  FiList,
  FiPrinter,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
  FiSliders,
  FiX,
} from "react-icons/fi";
import BadgePrioridad from "@/components/BadgePrioridad";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import {
  consecuencia,
  deshacerLlamado,
  enCola,
  META_RESULTADO,
  MINUTOS_PARA_DESHACER,
  mensajeRegistro,
  registrarLlamado,
} from "@/lib/llamados";
import { formatearRut } from "@/lib/rut";
import { useAPI } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import MenuAcciones from "@/components/MenuAcciones";
import type { LlamadoPaciente, Paciente, ResultadoLlamado } from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearFecha, formatearFechaHoraCorta, normalizeRut, normalizeSearchText, nombreLegible } from "@/lib/utils";

const RegistrarContactoModal = dynamic(() => import("@/components/RegistrarContactoModal"), { ssr: false });
const EditarPacienteModal = dynamic(() => import("@/components/EditarPacienteModal"), { ssr: false });
const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });

type Cola = { por_contactar: Paciente[]; por_citar: Paciente[] };
type Seccion = "contactar" | "citar";
type Grupo = { id: string; titulo: string; ayuda: string; pacientes: Paciente[] };
type UltimoRegistro = { paciente: Paciente; llamadoId: number; resultado: ResultadoLlamado; en: number };

function tieneTelefono(p: Paciente) {
  return !!(p.telefono?.trim() || p.telefono_recados?.trim());
}

function finDeHoy() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function haceDias(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

/** Pidio que lo llamen mas adelante (fecha futura). */
function reprogramadoAFuturo(p: Paciente) {
  return !!p.proximo_llamado && new Date(p.proximo_llamado).getTime() > Date.now();
}

/** Separa la seccion en: para llamar hoy, reprogramados a futuro y sin telefono. */
function agrupar(pacientes: Paciente[]): Grupo[] {
  const limite = finDeHoy();
  const reprogramados: Paciente[] = [];
  const sinTelefono: Paciente[] = [];
  const vencidos: Paciente[] = [];
  const resto: Paciente[] = [];
  pacientes.forEach((p) => {
    const cuando = p.proximo_llamado ? new Date(p.proximo_llamado).getTime() : null;
    if (cuando !== null && cuando > limite) reprogramados.push(p);
    else if (!tieneTelefono(p)) sinTelefono.push(p);
    else if (cuando !== null) vencidos.push(p);
    else resto.push(p);
  });
  const porFecha = (a: Paciente, b: Paciente) => (a.proximo_llamado ?? "").localeCompare(b.proximo_llamado ?? "");
  return [
    { id: "hoy", titulo: "Para llamar", ayuda: "Por prioridad y antigüedad. Primero los que pidieron que los llamaran hoy.", pacientes: [...vencidos.sort(porFecha), ...resto] },
    { id: "reprogramados", titulo: "Reprogramados", ayuda: "Pidieron que los llamaran otro día.", pacientes: reprogramados.sort(porFecha) },
    { id: "sin-telefono", titulo: "Sin teléfono", ayuda: "Hay que conseguir un número antes de llamar.", pacientes: sinTelefono },
  ].filter((g) => g.pacientes.length > 0);
}

/** ¿El paciente sigue perteneciendo a esta seccion despues de un cambio? */
function perteneceA(seccion: Seccion, p: Paciente) {
  return seccion === "contactar" ? enCola(p) : p.estado === "INGRESADO" && !p.proxima_atencion;
}

export default function LlamadosPage() {
  return (
    <Suspense fallback={null}>
      <Llamados />
    </Suspense>
  );
}

function Llamados() {
  const { user } = useAuth();
  const { toast } = useToast();
  const reducir = useReducedMotion();
  const searchParams = useSearchParams();
  const router = useRouter();
  const esKine = user?.rol === "KINE";

  const { data, isLoading, error, mutate } = useAPI<Cola>(user ? "/pacientes/cola-llamados/" : null);
  const [refrescando, setRefrescando] = useState(false);

  // Actualizar de verdad: vuelve a pedir la cola y muestra el estado de carga mientras llega.
  async function actualizarCola() {
    setRefrescando(true);
    try {
      await Promise.all([mutate(), new Promise((r) => setTimeout(r, 400))]);
    } finally {
      setRefrescando(false);
    }
  }
  const [seccion, setSeccion] = useState<Seccion>(searchParams.get("seccion") === "citar" ? "citar" : "contactar");
  const [busqueda, setBusqueda] = useState("");
  const [masFiltros, setMasFiltros] = useState(false);
  const [estados, setEstados] = useState<string[]>([]);
  const [prioridades, setPrioridades] = useState<string[]>([]);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [sectores, setSectores] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [antiguedades, setAntiguedades] = useState<string[]>([]);
  const [historiales, setHistoriales] = useState<string[]>([]);
  const [seleccionId, setSeleccionId] = useState<number | null>(null);
  const [verDetalleMovil, setVerDetalleMovil] = useState(false);
  const [modal, setModal] = useState<{ paciente: Paciente; resultado?: ResultadoLlamado } | null>(null);
  const [ultimo, setUltimo] = useState<UltimoRegistro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ficha, setFicha] = useState<Paciente | null>(null);
  const [edicion, setEdicion] = useState<Paciente | null>(null);

  const porContactar = useMemo(() => data?.por_contactar ?? [], [data]);
  const porCitar = useMemo(() => data?.por_citar ?? [], [data]);
  const base = seccion === "contactar" ? porContactar : porCitar;

  const opcionesResponsable = useMemo(() => {
    const mapa = new Map<string, { label: string; total: number }>();
    base.forEach((p) => {
      if (!p.kine_asignado) return;
      const k = String(p.kine_asignado);
      mapa.set(k, { label: p.responsable_nombre ?? "Sin nombre", total: (mapa.get(k)?.total ?? 0) + 1 });
    });
    return Array.from(mapa.entries()).map(([value, v]) => ({ value, ...v })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [base]);

  const opcionesSector = useMemo(() => {
    const c = new Map<string, number>();
    base.forEach((p) => p.sector_cesfam && c.set(p.sector_cesfam, (c.get(p.sector_cesfam) ?? 0) + 1));
    return Array.from(c.entries()).map(([value, total]) => ({ value, label: value, total })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [base]);
  const opcionesCategoria = useMemo(() => {
    const c = new Map<string, number>();
    base.forEach((p) => p.categoria && c.set(p.categoria, (c.get(p.categoria) ?? 0) + 1));
    return Array.from(c.entries())
      .map(([value, total]) => ({ value, label: CATEGORIA_LABELS[value as keyof typeof CATEGORIA_LABELS] ?? value, total }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [base]);
  const tramoAntiguedad = (d: number) => (d >= 365 ? "ANIO" : d >= 180 ? "SEMESTRE" : "RECIENTE");

  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    return base.filter((p) => {
      if (seccion === "contactar" && estados.length && !estados.includes(p.estado)) return false;
      if (prioridades.length && !prioridades.includes(p.prioridad)) return false;
      if (responsables.length && !responsables.includes(String(p.kine_asignado))) return false;
      if (sectores.length && !sectores.includes(p.sector_cesfam)) return false;
      if (categorias.length && !categorias.includes(p.categoria)) return false;
      if (antiguedades.length && !antiguedades.includes(tramoAntiguedad(p.dias_en_lista))) return false;
      if (historiales.length && !historiales.includes(p.ultimo_llamado ? "CON" : "SIN")) return false;
      if (!q) return true;
      const texto = normalizeSearchText([p.nombre, p.id_ccr, p.diagnostico, p.sector_cesfam, p.telefono, p.telefono_recados].join(" "));
      return texto.includes(q) || (!!rut && normalizeRut(p.rut).includes(rut));
    });
  }, [base, busqueda, estados, prioridades, responsables, sectores, categorias, antiguedades, historiales, seccion]);

  const grupos = useMemo(() => agrupar(visibles), [visibles]);
  const orden = useMemo(() => grupos.flatMap((g) => g.pacientes), [grupos]);
  // Posicion en la lista completa: escalona la entrada de las filas.
  const posicion = useMemo(() => new Map(orden.map((p, i) => [p.id, i])), [orden]);
  const seleccionado = orden.find((p) => p.id === seleccionId) ?? orden[0] ?? null;

  const paraHoy = (lista: Paciente[]) => agrupar(lista).find((g) => g.id === "hoy")?.pacientes.length ?? 0;

  // El "deshacer" vence a los 10 minutos.
  useEffect(() => {
    if (!ultimo) return;
    const resta = ultimo.en + MINUTOS_PARA_DESHACER * 60_000 - Date.now();
    const t = window.setTimeout(() => setUltimo(null), Math.max(0, resta));
    return () => window.clearTimeout(t);
  }, [ultimo]);

  // Teclado: flechas para recorrer la lista; 1-4 para registrar el resultado del
  // llamado al paciente seleccionado; Ctrl+Z para deshacer el último.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modal || ficha || edicion) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (!ultimo || ocupado) return;
        e.preventDefault();
        void deshacer();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = seleccionado ? orden.findIndex((p) => p.id === seleccionado.id) : -1;
        const sig = orden[Math.min(orden.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (sig) setSeleccionId(sig.id);
        return;
      }

      if (!seleccionado || ocupado || e.repeat) return;
      if (e.key === "1") setModal({ paciente: seleccionado, resultado: "CONTESTA_CONFIRMADO" });
      else if (e.key === "2") void noContestaRapido(seleccionado);
      else if (e.key === "3") setModal({ paciente: seleccionado, resultado: "REAGENDAR_LLAMADO" });
      else if (e.key === "4") setModal({ paciente: seleccionado });
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // deshacer y noContestaRapido leen el estado actual; se recrean en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edicion, ficha, modal, ocupado, orden, seleccionado, ultimo]);

  /** Aplica el paciente actualizado a la cola y deja seleccionado al siguiente. */
  function aplicarRegistro(antes: Paciente, despues: Paciente, resultado: ResultadoLlamado) {
    const i = orden.findIndex((p) => p.id === antes.id);
    const siguiente = orden.filter((p) => p.id !== antes.id)[Math.max(0, i)] ?? null;
    void mutate(
      (d) =>
        d && {
          por_contactar: d.por_contactar.flatMap((p) => (p.id !== despues.id ? [p] : enCola(despues) ? [despues] : [])),
          por_citar: d.por_citar.flatMap((p) => (p.id !== despues.id ? [p] : perteneceA("citar", despues) ? [despues] : [])),
        },
      { revalidate: true },
    );
    // Tras registrar se pasa al siguiente de la lista, como en una bandeja de trabajo.
    setSeleccionId(siguiente?.id ?? null);
    if (despues.ultimo_llamado) setUltimo({ paciente: antes, llamadoId: despues.ultimo_llamado.id, resultado, en: Date.now() });
  }

  async function noContestaRapido(p: Paciente) {
    const efecto = consecuencia(p, "NO_CONTESTA");
    if (efecto.requiereNota) {
      setModal({ paciente: p, resultado: "NO_CONTESTA" });
      return;
    }
    setOcupado(true);
    try {
      const despues = await registrarLlamado(p, { resultado: "NO_CONTESTA" });
      aplicarRegistro(p, despues, "NO_CONTESTA");
      const mensaje = mensajeRegistro(p, despues, "NO_CONTESTA");
      if (despues.estado !== p.estado) toast.warning(mensaje);
      else toast.info(mensaje);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo registrar el llamado."));
    } finally {
      setOcupado(false);
    }
  }

  async function deshacer() {
    if (!ultimo) return;
    setOcupado(true);
    try {
      await deshacerLlamado(ultimo.paciente.id, ultimo.llamadoId);
      await mutate();
      setSeccion(enCola(ultimo.paciente) ? "contactar" : "citar");
      setSeleccionId(ultimo.paciente.id);
      toast.info(`Se deshizo el llamado a ${nombreLegible(ultimo.paciente.nombre)}.`);
      setUltimo(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo deshacer el llamado."));
    } finally {
      setOcupado(false);
    }
  }

  if (!user) return null;

  const nExtra = prioridades.length + responsables.length + sectores.length + categorias.length + antiguedades.length + historiales.length;
  const filtrosActivos = busqueda || estados.length || nExtra;

  return (
    <div className="flex flex-col gap-3 text-[13px] lg:h-[max(560px,calc(100dvh-64px-2rem))]">
      <div className="ccr-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl print:hidden">
      <header className="shrink-0 px-5 py-4 print:hidden">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="sr-only">Llamados</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-ink-black-300">
                <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{paraHoy(porContactar) + paraHoy(porCitar)}</span> para llamar hoy · mostrando{" "}
                <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{orden.length}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} aria-hidden="true" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="ccr-control-input w-full pl-9 pr-3"
                placeholder="Nombre, RUT, teléfono o diagnóstico"
                aria-label="Buscar paciente"
              />
            </div>
          {seccion === "contactar" && (
            <MultiSelectFiltro
                sinAnimacion
              label="Estado"
              textoTodos
              values={estados}
              opciones={[
                { value: "PENDIENTE", label: "Pendiente", total: porContactar.filter((p) => p.estado === "PENDIENTE").length },
                { value: "RESCATE", label: "Rescate", total: porContactar.filter((p) => p.estado === "RESCATE").length },
              ]}
              onChange={setEstados}
            />
          )}
            <button
              type="button"
              aria-expanded={masFiltros}
              aria-controls="llamados-mas-filtros"
              onClick={() => setMasFiltros((v) => !v)}
              className="ccr-control-button ml-auto"
            >
              <FiSliders size={13} aria-hidden="true" />
              Filtros
              {nExtra > 0 && <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">{nExtra}</span>}
            </button>
            {filtrosActivos ? (
              <button
                type="button"
                aria-label="Limpiar filtros"
                title="Limpiar filtros"
                onClick={() => {
                  setBusqueda("");
                  setEstados([]);
                  setPrioridades([]);
                  setResponsables([]);
                  setSectores([]);
                  setCategorias([]);
                  setAntiguedades([]);
                  setHistoriales([]);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <FiX size={14} aria-hidden="true" />
              </button>
            ) : null}
            <MenuAcciones
              acciones={[
                {
                  label: "Actualizar",
                  detalle: "Vuelve a cargar la cola",
                  tono: "azul",
                  icon: <FiRefreshCw size={13} aria-hidden="true" />,
                  onClick: () => void actualizarCola(),
                },
                {
                  label: "Imprimir",
                  detalle: "Lista de pacientes por llamar",
                  tono: "verde",
                  icon: <FiPrinter size={13} aria-hidden="true" />,
                  onClick: () => window.print(),
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
                {
                  label: "Ir a Lista de espera",
                  detalle: "Ver todos los pacientes",
                  tono: "gris",
                  icon: <FiList size={13} aria-hidden="true" />,
                  onClick: () => router.push("/lista-espera"),
                },
              ]}
            />
          </div>

          {masFiltros && (
            <div id="llamados-mas-filtros" className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 dark:border-ink-black-700 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <MultiSelectFiltro
            anchoCompleto
            sinAnimacion
            label="Prioridad"
            values={prioridades}
            opciones={(["ALTA", "MEDIANA", "MODERADA", "LICENCIA_MEDICA"] as const).map((v) => ({
              value: v,
              label: PRIORIDAD_LABELS[v],
              total: base.filter((p) => p.prioridad === v).length,
            }))}
            onChange={setPrioridades}
          />
          {!esKine && opcionesResponsable.length > 1 && (
            <MultiSelectFiltro anchoCompleto sinAnimacion label="Responsable" textoTodos values={responsables} opciones={opcionesResponsable} onChange={setResponsables} />
          )}
          {opcionesSector.length > 1 && (
            <MultiSelectFiltro anchoCompleto sinAnimacion label="Sector" textoTodos values={sectores} opciones={opcionesSector} onChange={setSectores} />
          )}
          {opcionesCategoria.length > 1 && (
            <MultiSelectFiltro anchoCompleto sinAnimacion label="Categoría" values={categorias} opciones={opcionesCategoria} onChange={setCategorias} />
          )}
          <MultiSelectFiltro
            anchoCompleto
            sinAnimacion
            label="Antigüedad"
            values={antiguedades}
            opciones={[
              { value: "ANIO", label: "1 año o más", total: base.filter((p) => tramoAntiguedad(p.dias_en_lista) === "ANIO").length },
              { value: "SEMESTRE", label: "6 a 12 meses", total: base.filter((p) => tramoAntiguedad(p.dias_en_lista) === "SEMESTRE").length },
              { value: "RECIENTE", label: "Menos de 6 meses", total: base.filter((p) => tramoAntiguedad(p.dias_en_lista) === "RECIENTE").length },
            ]}
            onChange={setAntiguedades}
          />
          <MultiSelectFiltro
            anchoCompleto
            sinAnimacion
            label="Llamados"
            textoTodos
            values={historiales}
            opciones={[
              { value: "SIN", label: "Sin llamados previos", total: base.filter((p) => !p.ultimo_llamado).length },
              { value: "CON", label: "Ya llamados", total: base.filter((p) => !!p.ultimo_llamado).length },
            ]}
            onChange={setHistoriales}
          />
            </div>
          )}
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-2.5 dark:border-ink-black-600 dark:bg-ink-black-900/40 print:hidden">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900" role="tablist" aria-label="Sección">
            {(
              [
                ["contactar", "Por contactar", porContactar.length],
                ["citar", "Ingresados por citar", porCitar.length],
              ] as const
            ).map(([id, label, total]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={seccion === id}
                onClick={() => {
                  setSeccion(id);
                  setSeleccionId(null);
                  setEstados([]);
                }}
                className={`relative inline-flex h-7 items-center rounded-md px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  seccion === id ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                }`}
              >
                <span className="relative z-10 inline-flex items-center gap-1.5">
                  {label}
                  <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] tabular-nums leading-4 text-slate-600 dark:bg-ink-black-600 dark:text-ink-black-200">{total}</span>
                </span>
              </button>
            ))}
          </div>
      </div>

      <AnimatePresence initial={false}>
        {ultimo && (
          <motion.div
            initial={reducir ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducir ? undefined : { opacity: 0, y: -6 }}
            role="status"
            className="mx-4 mb-3 flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm print:hidden dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            <FiCheckCircle size={15} className="shrink-0 text-blue-600 dark:text-blue-300" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-700 dark:text-ink-black-100">
              {META_RESULTADO[ultimo.resultado].corto}: <span className="font-bold">{nombreLegible(ultimo.paciente.nombre)}</span>
            </p>
            <button type="button" disabled={ocupado} onClick={() => void deshacer()} className="ccr-control-button disabled:opacity-50">
              <FiRotateCcw size={13} aria-hidden="true" />
              Deshacer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="mx-4 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 print:hidden">
          {getErrorMessage(error, "No se pudo cargar la cola de llamados.")}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-slate-200 print:hidden dark:border-ink-black-600 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* Lista */}
        <section
          aria-label="Pacientes por llamar"
          className={`min-h-0 flex-col overflow-hidden lg:border-r lg:border-slate-200 dark:lg:border-ink-black-600 ${verDetalleMovil ? "hidden lg:flex" : "flex"}`}
        >
          {/* Sin initial={false}: así las filas también entran escalonadas al abrir la página. */}
          <AnimatePresence mode="wait">
          <motion.div
            key={seccion}
            // "Por contactar" entra desde la izquierda e "Ingresados" desde la
            // derecha, siguiendo la posicion de la pestaña.
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            exit={undefined}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
          >
            {isLoading || refrescando ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[58px] animate-pulse rounded-xl bg-slate-100 dark:bg-ink-black-700" />
                ))}
              </div>
            ) : orden.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FiPhoneCall className="mx-auto text-slate-300" size={26} aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">
                  {filtrosActivos ? "Nadie coincide con los filtros" : seccion === "contactar" ? "No hay pacientes por contactar" : "Todos los ingresados tienen cita"}
                </p>
              </div>
            ) : (
              grupos.map((g) => (
                <div key={g.id} className="mb-2 last:mb-0">
                  <p className="sticky top-0 z-10 bg-white/95 px-2 pb-1 pt-1.5 text-[11px] font-bold text-slate-500 backdrop-blur dark:bg-ink-black-800/95 dark:text-ink-black-300" title={g.ayuda}>
                    {g.titulo} <span className="tabular-nums text-slate-500">{g.pacientes.length}</span>
                  </p>
                  <ul className="space-y-1">
                    {g.pacientes.map((p) => (
                      <motion.li
                        key={p.id}
                        layout={reducir ? false : "position"}
                        initial={reducir ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.2,
                          delay: reducir ? 0 : Math.min(posicion.get(p.id) ?? 0, 10) * 0.035,
                          layout: { duration: 0.25, ease: "easeOut" },
                        }}
                      >
                        <ItemLista
                          paciente={p}
                          activo={seleccionado?.id === p.id}
                          onClick={() => {
                            setSeleccionId(p.id);
                            setVerDetalleMovil(true);
                          }}
                        />
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </motion.div>
          </AnimatePresence>
          {orden.length > 0 && (
            <p className="hidden shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 dark:border-ink-black-700 lg:block">
              {orden.length} paciente{orden.length !== 1 ? "s" : ""} · usa ↑ ↓ para moverte
            </p>
          )}
        </section>

        {/* Detalle */}
        <section
          aria-label="Paciente seleccionado"
          className={`min-h-0 flex-col lg:overflow-hidden ${verDetalleMovil ? "flex" : "hidden lg:flex"}`}
        >
          <AnimatePresence mode="wait" initial={false}>
          {seleccionado ? (
            <motion.div
              key={seleccionado.id}
              initial={reducir ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducir ? undefined : { opacity: 0, x: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Detalle
                paciente={seleccionado}
                mostrarResponsable={!esKine}
                ocupado={ocupado}
                onVolver={() => setVerDetalleMovil(false)}
                onResultado={(resultado) => setModal({ paciente: seleccionado, resultado })}
                onNoContesta={() => void noContestaRapido(seleccionado)}
                onEditar={() => setEdicion(seleccionado)}
                onFicha={() => setFicha(seleccionado)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="vacio"
              initial={reducir ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducir ? undefined : { opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center"
            >
              <FiPhoneCall className="text-slate-300" size={30} aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">Sin paciente seleccionado</p>
            </motion.div>
          )}
          </AnimatePresence>
        </section>
      </div>
      </div>

      {modal && (
        <RegistrarContactoModal
          paciente={modal.paciente}
          resultadoInicial={modal.resultado}
          onClose={() => setModal(null)}
          onSuccess={(despues, resultado) => {
            if (despues && resultado) aplicarRegistro(modal.paciente, despues, resultado);
          }}
        />
      )}

      {edicion && (
        <EditarPacienteModal
          paciente={edicion}
          mode="contact-only"
          onClose={() => setEdicion(null)}
          onGuardado={() => {
            setEdicion(null);
            void mutate();
          }}
        />
      )}

      {ficha && <FichaPaciente paciente={ficha} usuario={user} onClose={() => setFicha(null)} onRefresh={() => void mutate()} />}

      <TablaImpresion titulo={seccion === "contactar" ? "Pacientes por contactar" : "Ingresados por citar"} pacientes={orden} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Lista
// -----------------------------------------------------------------------------

/** Intentos sin respuesta en el estado actual y si el proximo cambia el estado. */
function intentosDe(p: Paciente) {
  const umbral = p.intentos_umbral ?? null;
  const hechos = umbral ? Math.min(p.intentos_estado ?? 0, umbral) : 0;
  return { umbral, hechos, ultimo: umbral !== null && hechos === umbral - 1 };
}

function tonoIntentos(hechos: number, ultimo: boolean) {
  if (ultimo) return "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30";
  if (hechos > 0) return "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30";
  return "bg-slate-50 text-slate-500 ring-slate-200 dark:bg-ink-black-800 dark:text-ink-black-300 dark:ring-ink-black-600";
}

/** Insignia "Intentos 2/3" de la lista. Ingresados por citar: total de llamados. */
function Intentos({ paciente }: { paciente: Paciente }) {
  const { umbral, hechos, ultimo } = intentosDe(paciente);
  if (!umbral) {
    const total = paciente.llamados_count ?? 0;
    if (!total) return null;
    return (
      <span className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-bold tabular-nums ring-1 ring-inset ${tonoIntentos(0, false)}`}>
        {total} {total === 1 ? "llamado" : "llamados"}
      </span>
    );
  }
  const texto = `${hechos} de ${umbral} intentos sin respuesta`;
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-bold tabular-nums ring-1 ring-inset ${tonoIntentos(hechos, ultimo)}`}
      title={ultimo ? `${texto}. El próximo sin respuesta cambia el estado.` : texto}
      aria-label={texto}
    >
      Intentos {hechos}/{umbral}
    </span>
  );
}

/** Contadores grandes del panel de detalle. */
function ContadorIntentos({ paciente: p }: { paciente: Paciente }) {
  const { umbral, hechos, ultimo } = intentosDe(p);
  const total = p.llamados_count ?? 0;
  const enRescate = p.estado === "RESCATE";
  return (
    <div className="grid grid-cols-2 gap-2">
      {umbral ? (
        <div className={`rounded-xl px-4 py-2.5 ring-1 ring-inset ${tonoIntentos(hechos, ultimo)}`}>
          <p className="text-[11px] font-semibold">Intentos sin respuesta</p>
          <p className="text-[20px] font-extrabold leading-tight tabular-nums">
            {hechos} <span className="text-[13px] font-bold">de {umbral}</span>
          </p>
          <p className="text-[11px] font-semibold">
            {ultimo
              ? `Si no contesta: ${enRescate ? "egreso administrativo" : "pasa a Rescate"}`
              : `En ${enRescate ? "Rescate" : "Pendiente"}`}
          </p>
        </div>
      ) : (
        <div className={`rounded-xl px-4 py-2.5 ring-1 ring-inset ${tonoIntentos(0, false)}`}>
          <p className="text-[11px] font-semibold">Intentos sin respuesta</p>
          <p className="text-[20px] font-extrabold leading-tight">—</p>
          <p className="text-[11px] font-semibold">No aplica a ingresados</p>
        </div>
      )}
      <div className={`rounded-xl px-4 py-2.5 ring-1 ring-inset ${tonoIntentos(0, false)}`}>
        <p className="text-[11px] font-semibold">Llamados totales</p>
        <p className="text-[20px] font-extrabold leading-tight tabular-nums text-slate-900 dark:text-ink-black-50">{total}</p>
        <p className="text-[11px] font-semibold">
          {p.n_intentos_contacto ? `${p.n_intentos_contacto} sin respuesta en total` : "Ninguno sin respuesta"}
        </p>
      </div>
    </div>
  );
}

function ItemLista({ paciente: p, activo, onClick }: { paciente: Paciente; activo: boolean; onClick: () => void }) {
  const ultimo = p.ultimo_llamado;
  const reprogramado = reprogramadoAFuturo(p);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? "true" : undefined}
      className={`w-full rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
        activo
          ? "border-blue-300 bg-blue-50/70 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-ink-black-600 dark:hover:bg-ink-black-700"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{nombreLegible(p.nombre)}</span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{p.dias_en_lista} d</span>
      </span>
      <span className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.prioridad === "ALTA" ? "bg-red-500" : p.prioridad === "MEDIANA" ? "bg-amber-500" : p.prioridad === "MODERADA" ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
        {p.estado === "RESCATE" && <span className="rounded bg-amber-50 px-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Rescate</span>}
        <Intentos paciente={p} />
        <span className="min-w-0 truncate">
          {reprogramado
            ? `Llamar ${formatearFechaHoraCorta(p.proximo_llamado)}`
            : ultimo
              ? `${META_RESULTADO[ultimo.resultado]?.corto ?? ultimo.resultado_label} ${haceDias(ultimo.fecha)}`
              : "Sin llamados"}
        </span>
      </span>
    </button>
  );
}

// -----------------------------------------------------------------------------
// Detalle
// -----------------------------------------------------------------------------

function Telefono({ etiqueta, numero }: { etiqueta: string; numero: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-ink-black-600">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-slate-500">{etiqueta}</p>
        <p className="truncate text-[15px] font-extrabold tabular-nums text-slate-900 dark:text-ink-black-50">{numero}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(numero).then(() => toast.info("Número copiado."));
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-black-700"
        aria-label={`Copiar ${numero}`}
        title="Copiar"
      >
        <FiCopy size={14} />
      </button>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-bold text-slate-800 dark:text-ink-black-100">{children}</dd>
    </div>
  );
}

function Detalle({
  paciente: p,
  mostrarResponsable,
  ocupado,
  onVolver,
  onResultado,
  onNoContesta,
  onEditar,
  onFicha,
}: {
  paciente: Paciente;
  mostrarResponsable: boolean;
  ocupado: boolean;
  onVolver: () => void;
  onResultado: (resultado?: ResultadoLlamado) => void;
  onNoContesta: () => void;
  onEditar: () => void;
  onFicha: () => void;
}) {
  const { data: historial } = useAPI<{ llamados: LlamadoPaciente[] }>(`/pacientes/${p.id}/historial-completo/`);
  const llamados = historial?.llamados ?? [];
  const efectoNo = consecuencia(p, "NO_CONTESTA");
  const reprogramado = reprogramadoAFuturo(p);
  const telefonos = [
    { etiqueta: "Principal", numero: p.telefono?.trim() },
    { etiqueta: "Recados", numero: p.telefono_recados?.trim() },
  ].filter((t): t is { etiqueta: string; numero: string } => !!t.numero);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 px-5 pb-36 pt-4 lg:overflow-y-auto lg:pb-4">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 lg:hidden">
          <FiArrowLeft size={13} aria-hidden="true" /> Volver a la lista
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{nombreLegible(p.nombre)}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-slate-500">
              <span className="tabular-nums">{p.id_ccr} · {formatearRut(p.rut)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.estado === "RESCATE" ? "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" : "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200"}`}>
                {ESTADO_LABELS[p.estado] ?? p.estado}
              </span>
              <BadgePrioridad prioridad={p.prioridad} />
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onEditar} className="ccr-control-button">
              <FiEdit2 size={13} aria-hidden="true" />
              Editar contacto
            </button>
            <button type="button" onClick={onFicha} className="ccr-control-button">
              <FiEye size={13} aria-hidden="true" />
              Ficha
            </button>
          </div>
        </div>

        <ContadorIntentos paciente={p} />

        {telefonos.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {telefonos.map((t) => (
              <Telefono key={t.etiqueta} etiqueta={t.etiqueta} numero={t.numero} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
            <p className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-100">Sin teléfono registrado. Consíguelo antes de llamar (CESFAM, ficha clínica).</p>
            <button type="button" onClick={onEditar} className="ccr-control-button">
              Agregar teléfono
            </button>
          </div>
        )}

        {reprogramado && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 dark:bg-ink-black-900 dark:text-ink-black-200">
            <FiClock size={14} className="text-blue-600" aria-hidden="true" />
            Pidió que lo llamaran el {formatearFechaHoraCorta(p.proximo_llamado)}.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dato label="Diagnóstico">{p.diagnostico || "—"}</Dato>
          {p.estado === "INGRESADO" ? (
            <Dato label="Ingresó">{formatearFecha(p.fecha_ingreso) || "—"}</Dato>
          ) : (
            <Dato label="En lista">{p.dias_en_lista} días</Dato>
          )}
          <Dato label="Sector">{p.sector_cesfam || p.sector_oficial || "—"}</Dato>
          {mostrarResponsable && <Dato label="Responsable">{p.responsable_nombre ?? "—"}</Dato>}
          <Dato label="Edad">{p.edad ? `${p.edad} años` : "—"}</Dato>
        </dl>
        {p.observaciones && (
          <p className="rounded-xl border border-slate-100 px-4 py-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:border-ink-black-700 dark:text-ink-black-200">{p.observaciones}</p>
        )}

        <section>
          <h3 className="mb-2 text-[12px] font-bold text-slate-700 dark:text-ink-black-100">Llamados anteriores</h3>
          {llamados.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400 dark:border-ink-black-600">Todavía no se le ha llamado.</p>
          ) : (
            <ol className="space-y-1.5">
              {llamados.slice(0, 8).map((ll) => (
                <li key={ll.id} className="flex gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-ink-black-700">
                  <span className="w-[92px] shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">{formatearFechaHoraCorta(ll.fecha)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-bold text-slate-800 dark:text-ink-black-100">
                      {META_RESULTADO[ll.resultado]?.label ?? ll.resultado_label}
                      {ll.volver_a_llamar ? ` · ${formatearFechaHoraCorta(ll.volver_a_llamar)}` : ""}
                    </span>
                    {ll.notas && <span className="block text-[12px] text-slate-600 dark:text-ink-black-200">{ll.notas}</span>}
                  </span>
                  <span className="hidden shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:block">{ll.usuario_nombre ?? ""}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* En movil la barra queda fija al pie de la pantalla para tenerla siempre a mano. */}
      <footer className="fixed inset-x-0 bottom-0 z-30 shrink-0 border-t border-slate-200 bg-white px-5 py-3.5 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800 lg:static lg:bg-slate-50/70 lg:shadow-none lg:dark:bg-ink-black-900/60">
        {efectoNo.cambiaEstado && (
          <p className={`mb-3 text-[11.5px] font-semibold ${efectoNo.grave ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
            Si no contesta: {efectoNo.texto.replace(/^Intento \d+ de \d+( sin respuesta| en Rescate)?: /, "").toLowerCase()}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" disabled={ocupado} onClick={() => onResultado("CONTESTA_CONFIRMADO")} className="ccr-control-button-primary h-10 flex-1 justify-center px-5 disabled:opacity-50 sm:flex-none">
            <FiCheckCircle size={14} aria-hidden="true" />
            Contesta y agenda
            <Atajo tecla="1" />
          </button>
          <div className="flex flex-1 flex-wrap items-center gap-2.5 sm:flex-none">
            <button type="button" disabled={ocupado} onClick={onNoContesta} className="ccr-control-button h-10 flex-1 justify-center px-4 disabled:opacity-50 sm:flex-none">
              <FiPhoneMissed size={14} aria-hidden="true" />
              No contesta
              <Atajo tecla="2" />
            </button>
            <button type="button" disabled={ocupado} onClick={() => onResultado("REAGENDAR_LLAMADO")} className="ccr-control-button h-10 flex-1 justify-center px-4 disabled:opacity-50 sm:flex-none">
              <FiClock size={14} aria-hidden="true" />
              Volver a llamar
              <Atajo tecla="3" />
            </button>
          </div>
          <button type="button" disabled={ocupado} onClick={() => onResultado()} className="h-10 justify-center rounded-lg px-3 text-[12.5px] font-bold text-slate-600 inline-flex items-center gap-1.5 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-50 dark:text-ink-black-200 dark:hover:bg-ink-black-700 sm:ml-auto">
            <FiMoreHorizontal size={14} aria-hidden="true" />
            Otro resultado
            <Atajo tecla="4" />
          </button>
        </div>
        <p className="mt-3 hidden text-[10.5px] font-medium text-slate-500 dark:text-slate-400 lg:block">
          Teclado: ↑ ↓ recorrer la lista · 1–4 registrar el resultado · Ctrl+Z deshacer el último
        </p>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Impresion
// -----------------------------------------------------------------------------

/** Indicador de la tecla de atajo; solo en pantallas con teclado. */
function Atajo({ tecla }: { tecla: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="ml-1 hidden rounded border border-current/25 px-1 text-[10px] font-bold leading-4 opacity-70 lg:inline-block"
    >
      {tecla}
    </kbd>
  );
}

function TablaImpresion({ titulo, pacientes }: { titulo: string; pacientes: Paciente[] }) {
  return (
    <section className="ccr-llamados-print hidden">
      {/* Al imprimir solo se ve esta tabla, no el resto de la app. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .ccr-llamados-print, .ccr-llamados-print * { visibility: visible !important; }
        .ccr-llamados-print { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 16px; background: white; color: #111827; }
      }`}</style>
      <h1 className="text-lg font-bold">{titulo}</h1>
      <p className="mb-3 text-[11px]">Impreso el {new Date().toLocaleString("es-CL")}</p>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            {["Nombre", "RUT", "Prioridad", "Estado", "Responsable", "Teléfono", "Recados", "Intentos", "Último llamado", "Anotar resultado"].map((h) => (
              <th key={h} className="border border-slate-300 bg-slate-100 px-1 py-0.5 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => (
            <tr key={p.id}>
              <td className="border border-slate-300 px-1 py-0.5">{p.nombre}</td>
              <td className="border border-slate-300 px-1 py-0.5">{formatearRut(p.rut)}</td>
              <td className="border border-slate-300 px-1 py-0.5">{PRIORIDAD_LABELS[p.prioridad]}</td>
              <td className="border border-slate-300 px-1 py-0.5">{ESTADO_LABELS[p.estado]}</td>
              <td className="border border-slate-300 px-1 py-0.5">{p.responsable_nombre ?? ""}</td>
              <td className="border border-slate-300 px-1 py-0.5">{p.telefono}</td>
              <td className="border border-slate-300 px-1 py-0.5">{p.telefono_recados}</td>
              <td className="border border-slate-300 px-1 py-0.5">{p.intentos_umbral ? `${p.intentos_estado ?? 0}/${p.intentos_umbral}` : ""}</td>
              <td className="border border-slate-300 px-1 py-0.5">{p.ultimo_llamado ? `${p.ultimo_llamado.resultado_label} ${formatearFechaHoraCorta(p.ultimo_llamado.fecha)}` : ""}</td>
              <td className="w-[18%] border border-slate-300 px-1 py-0.5" />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
