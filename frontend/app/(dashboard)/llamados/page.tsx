"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiCopy,
  FiEdit2,
  FiEye,
  FiMoreHorizontal,
  FiPhone,
  FiPhoneCall,
  FiPhoneMissed,
  FiPrinter,
  FiRefreshCw,
  FiRotateCcw,
  FiSearch,
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
import type { LlamadoPaciente, Paciente, ResultadoLlamado } from "@/lib/types";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearFecha, formatearFechaHoraCorta, normalizeRut, normalizeSearchText } from "@/lib/utils";

const RegistrarContactoModal = dynamic(() => import("@/components/RegistrarContactoModal"), { ssr: false });
const EditarPacienteModal = dynamic(() => import("@/components/EditarPacienteModal"), { ssr: false });
const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });

type Cola = { por_contactar: Paciente[]; por_citar: Paciente[] };
type Seccion = "contactar" | "citar";
type Grupo = { id: string; titulo: string; ayuda: string; pacientes: Paciente[] };
type UltimoRegistro = { paciente: Paciente; llamadoId: number; resultado: ResultadoLlamado; en: number };

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

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
  const esKine = user?.rol === "KINE";

  const { data, isLoading, error, mutate } = useAPI<Cola>(user ? "/pacientes/cola-llamados/" : null);
  const [seccion, setSeccion] = useState<Seccion>(searchParams.get("seccion") === "citar" ? "citar" : "contactar");
  const [busqueda, setBusqueda] = useState("");
  const [estados, setEstados] = useState<string[]>([]);
  const [prioridades, setPrioridades] = useState<string[]>([]);
  const [responsables, setResponsables] = useState<string[]>([]);
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

  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    return base.filter((p) => {
      if (seccion === "contactar" && estados.length && !estados.includes(p.estado)) return false;
      if (prioridades.length && !prioridades.includes(p.prioridad)) return false;
      if (responsables.length && !responsables.includes(String(p.kine_asignado))) return false;
      if (!q) return true;
      const texto = normalizeSearchText([p.nombre, p.id_ccr, p.diagnostico, p.sector_cesfam, p.telefono, p.telefono_recados].join(" "));
      return texto.includes(q) || (!!rut && normalizeRut(p.rut).includes(rut));
    });
  }, [base, busqueda, estados, prioridades, responsables, seccion]);

  const grupos = useMemo(() => agrupar(visibles), [visibles]);
  const orden = useMemo(() => grupos.flatMap((g) => g.pacientes), [grupos]);
  const seleccionado = orden.find((p) => p.id === seleccionId) ?? orden[0] ?? null;

  const paraHoy = (lista: Paciente[]) => agrupar(lista).find((g) => g.id === "hoy")?.pacientes.length ?? 0;

  // El "deshacer" vence a los 10 minutos.
  useEffect(() => {
    if (!ultimo) return;
    const resta = ultimo.en + MINUTOS_PARA_DESHACER * 60_000 - Date.now();
    const t = window.setTimeout(() => setUltimo(null), Math.max(0, resta));
    return () => window.clearTimeout(t);
  }, [ultimo]);

  // Flechas arriba/abajo para recorrer la lista.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modal || ficha || edicion) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = seleccionado ? orden.findIndex((p) => p.id === seleccionado.id) : -1;
      const sig = orden[Math.min(orden.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (sig) setSeleccionId(sig.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edicion, ficha, modal, orden, seleccionado]);

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

  const filtrosActivos = busqueda || estados.length || prioridades.length || responsables.length;

  return (
    <div className="flex flex-col gap-3 text-[13px] lg:h-[max(560px,calc(100dvh-64px-2rem))]">
      <header className="ccr-panel shrink-0 rounded-2xl px-5 py-4 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-950 dark:text-white">Llamados</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
              <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{paraHoy(porContactar) + paraHoy(porCitar)}</span> para llamar hoy
              {" · "}
              {porContactar.length} en lista de espera · {porCitar.length} ingresado{porCitar.length !== 1 ? "s" : ""} sin cita
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void mutate()} className="ccr-control-button" title="Volver a cargar">
              <FiRefreshCw size={13} aria-hidden="true" />
              Actualizar
            </button>
            <button type="button" onClick={() => window.print()} className="ccr-control-button">
              <FiPrinter size={13} aria-hidden="true" />
              Imprimir
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
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
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  seccion === id ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                }`}
              >
                {label}
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] tabular-nums leading-4 text-slate-600 dark:bg-ink-black-600 dark:text-ink-black-200">{total}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} aria-hidden="true" />
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
          <MultiSelectFiltro
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
            <MultiSelectFiltro label="Responsable" textoTodos values={responsables} opciones={opcionesResponsable} onChange={setResponsables} />
          )}
          {filtrosActivos ? (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                setEstados([]);
                setPrioridades([]);
                setResponsables([]);
              }}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:underline dark:text-ink-black-300"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </header>

      <AnimatePresence initial={false}>
        {ultimo && (
          <motion.div
            initial={reducir ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducir ? undefined : { opacity: 0, y: -6 }}
            role="status"
            className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm print:hidden dark:border-ink-black-600 dark:bg-ink-black-800"
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
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700 print:hidden">
          {getErrorMessage(error, "No se pudo cargar la cola de llamados.")}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 print:hidden lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* Lista */}
        <section
          aria-label="Pacientes por llamar"
          className={`ccr-panel min-h-0 flex-col overflow-hidden rounded-2xl ${verDetalleMovil ? "hidden lg:flex" : "flex"}`}
        >
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
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
                    {g.titulo} <span className="tabular-nums text-slate-400">{g.pacientes.length}</span>
                  </p>
                  <ul className="space-y-1">
                    {g.pacientes.map((p) => (
                      <li key={p.id}>
                        <ItemLista
                          paciente={p}
                          activo={seleccionado?.id === p.id}
                          onClick={() => {
                            setSeleccionId(p.id);
                            setVerDetalleMovil(true);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          {orden.length > 0 && (
            <p className="hidden shrink-0 border-t border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-400 dark:border-ink-black-700 lg:block">
              {orden.length} paciente{orden.length !== 1 ? "s" : ""} · usa ↑ ↓ para moverte
            </p>
          )}
        </section>

        {/* Detalle */}
        <section
          aria-label="Paciente seleccionado"
          className={`ccr-panel min-h-0 flex-col rounded-2xl lg:overflow-hidden ${verDetalleMovil ? "flex" : "hidden lg:flex"}`}
        >
          {seleccionado ? (
            <Detalle
              key={seleccionado.id}
              paciente={seleccionado}
              mostrarResponsable={!esKine}
              ocupado={ocupado}
              onVolver={() => setVerDetalleMovil(false)}
              onResultado={(resultado) => setModal({ paciente: seleccionado, resultado })}
              onNoContesta={() => void noContestaRapido(seleccionado)}
              onEditar={() => setEdicion(seleccionado)}
              onFicha={() => setFicha(seleccionado)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <FiPhoneCall className="text-slate-300" size={30} aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">Sin paciente seleccionado</p>
            </div>
          )}
        </section>
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

function Intentos({ paciente }: { paciente: Paciente }) {
  const umbral = paciente.intentos_umbral;
  if (!umbral) return null;
  const hechos = Math.min(paciente.intentos_estado ?? 0, umbral);
  return (
    <span className="inline-flex items-center gap-0.5" title={`${hechos} de ${umbral} intentos sin respuesta`} aria-label={`${hechos} de ${umbral} intentos sin respuesta`}>
      {Array.from({ length: umbral }).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < hechos ? "bg-amber-500" : "bg-slate-200 dark:bg-ink-black-600"}`} />
      ))}
    </span>
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
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">{p.dias_en_lista} d</span>
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-black-700"
        aria-label={`Copiar ${numero}`}
        title="Copiar"
      >
        <FiCopy size={14} />
      </button>
      <a href={`tel:${numero}`} className="ccr-control-button" aria-label={`Llamar al ${numero}`}>
        <FiPhone size={13} aria-hidden="true" />
        Llamar
      </a>
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

        {telefonos.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {telefonos.map((t) => (
              <Telefono key={t.etiqueta} etiqueta={t.etiqueta} numero={t.numero} />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
            <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-amber-900 dark:text-amber-100">Sin teléfono registrado. Consíguelo antes de llamar (CESFAM, ficha clínica).</p>
            <button type="button" onClick={onEditar} className="ccr-control-button">
              Agregar teléfono
            </button>
          </div>
        )}

        {(p.intentos_umbral || reprogramado) && (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[12.5px] font-semibold text-slate-700 dark:bg-ink-black-900 dark:text-ink-black-200">
            {reprogramado ? (
              <>
                <FiClock size={14} className="text-blue-600" aria-hidden="true" />
                Pidió que lo llamaran el {formatearFechaHoraCorta(p.proximo_llamado)}.
              </>
            ) : (
              <>
                <Intentos paciente={p} />
                {p.intentos_estado ?? 0} de {p.intentos_umbral} intentos sin respuesta en {p.estado === "RESCATE" ? "Rescate" : "Pendiente"}.
              </>
            )}
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
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-center text-xs font-medium text-slate-400 dark:border-ink-black-600">Todavía no se le ha llamado.</p>
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
                  <span className="hidden shrink-0 text-[11px] font-medium text-slate-400 sm:block">{ll.usuario_nombre ?? ""}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* En movil la barra queda fija al pie de la pantalla para tenerla siempre a mano. */}
      <footer className="fixed inset-x-0 bottom-0 z-30 shrink-0 border-t shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.35)] lg:shadow-none border-slate-200 bg-slate-50 px-5 py-3 dark:border-ink-black-600 dark:bg-ink-black-900 lg:static lg:bg-slate-50/70 lg:dark:bg-ink-black-900/60">
        {efectoNo.cambiaEstado && (
          <p className={`mb-2 text-[11.5px] font-semibold ${efectoNo.grave ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
            Si no contesta: {efectoNo.texto.replace(/^Intento \d+ de \d+( sin respuesta| en Rescate)?: /, "").toLowerCase()}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={ocupado} onClick={() => onResultado("CONTESTA_CONFIRMADO")} className="ccr-control-button-primary flex-1 justify-center disabled:opacity-50 sm:flex-none">
            <FiCheckCircle size={14} aria-hidden="true" />
            Contesta y agenda
          </button>
          <button type="button" disabled={ocupado} onClick={onNoContesta} className="ccr-control-button flex-1 justify-center disabled:opacity-50 sm:flex-none">
            <FiPhoneMissed size={14} aria-hidden="true" />
            No contesta
          </button>
          <button type="button" disabled={ocupado} onClick={() => onResultado("REAGENDAR_LLAMADO")} className="ccr-control-button flex-1 justify-center disabled:opacity-50 sm:flex-none">
            <FiClock size={14} aria-hidden="true" />
            Volver a llamar
          </button>
          <button type="button" disabled={ocupado} onClick={() => onResultado()} className="ccr-control-button justify-center disabled:opacity-50 sm:ml-auto">
            <FiMoreHorizontal size={14} aria-hidden="true" />
            Otro resultado
          </button>
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Impresion
// -----------------------------------------------------------------------------

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
