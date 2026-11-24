"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FiAlertTriangle,
  FiArchive,
  FiCalendar,
  FiChevronRight,
  FiPhone,
  FiCheck,
  FiEdit2,
  FiPlus,
  FiRotateCcw,
  FiSearch,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import { useAPI, unwrapResults } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import type { Categoria, GrupoPacientes, HistorialGrupo, MovimientoGrupoTipo, Paciente, Usuario } from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearFechaHoraCorta, normalizeRut, normalizeSearchText, nombreLegible } from "@/lib/utils";
import { TONO_CATEGORIA } from "./AgendaGrid";
import CampoFecha from "./CampoFecha";
import SelectFiltro from "./SelectFiltro";

// -----------------------------------------------------------------------------
// Piezas compartidas entre actividades y grupos
// -----------------------------------------------------------------------------

export const INPUT =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-50";

export function Bloque({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3 border-b border-slate-100 py-5 first:pt-0 last:border-b-0 last:pb-0 dark:border-ink-black-700 md:grid-cols-[170px_minmax(0,1fr)] md:gap-6">
      <div>
        <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{titulo}</h3>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-500 dark:text-ink-black-300">{descripcion}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export type Candidato = { id: number; nombre: string; rut: string; categoria: Categoria };

/** Mapa paciente -> grupos activos a los que pertenece (un paciente puede estar en varios). */
export function gruposPorPaciente(grupos: GrupoPacientes[]) {
  const mapa = new Map<number, { id: number; nombre: string }[]>();
  grupos
    .filter((g) => g.activo)
    .forEach((g) => g.miembros.forEach((m) => mapa.set(m.paciente_id, [...(mapa.get(m.paciente_id) ?? []), { id: g.id, nombre: g.nombre }])));
  return mapa;
}

export function candidatoDe(p: Paciente): Candidato {
  return { id: p.id, nombre: p.nombre, rut: p.rut, categoria: p.categoria };
}

/** Lista con buscador y casillas para elegir pacientes. Los elegidos van primero. */
export function SelectorPacientes({
  candidatos,
  seleccion,
  onChange,
  vacio = "Sin pacientes para mostrar.",
  autoFocus = false,
}: {
  candidatos: Candidato[];
  seleccion: number[];
  onChange: (ids: number[]) => void;
  vacio?: string;
  autoFocus?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    const lista = q
      ? candidatos.filter((c) => normalizeSearchText(c.nombre).includes(q) || (!!rut && normalizeRut(c.rut).includes(rut)))
      : candidatos;
    return [...lista].sort((a, b) => Number(seleccion.includes(b.id)) - Number(seleccion.includes(a.id)));
  }, [busqueda, candidatos, seleccion]);

  return (
    <div>
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} aria-hidden="true" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar paciente por nombre o RUT"
          aria-label="Buscar paciente"
          autoFocus={autoFocus}
          className={`${INPUT} pl-9`}
        />
      </div>
      <ul className="custom-scrollbar mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-ink-black-600">
        {visibles.length === 0 && <li className="px-3 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400">{vacio}</li>}
        {visibles.map((c) => {
          const marcado = seleccion.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={marcado}
                onClick={() => onChange(marcado ? seleccion.filter((v) => v !== c.id) : [...seleccion, c.id])}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:bg-slate-100 ${
                  marcado ? "bg-blue-50 dark:bg-blue-500/15" : "hover:bg-slate-50 dark:hover:bg-ink-black-700"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    marcado ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white dark:border-ink-black-500 dark:bg-ink-black-900"
                  }`}
                >
                  {marcado && <FiCheck size={11} strokeWidth={3} />}
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_CATEGORIA[c.categoria]?.dot ?? "bg-slate-400"}`} aria-hidden="true" />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${marcado ? "font-bold text-slate-900 dark:text-ink-black-50" : "font-medium text-slate-700 dark:text-ink-black-200"}`}>
                  {nombreLegible(c.nombre)}
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">{formatearRut(c.rut)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Kines activos (y el propio usuario) para elegir responsable. Solo admin consulta. */
export function useKines(usuario: Usuario) {
  const esAdmin = usuario.rol === "ADMIN";
  const [kines, setKines] = useState<Usuario[]>([]);
  useEffect(() => {
    if (!esAdmin) return;
    let activo = true;
    api
      .get<Usuario[]>("/usuarios/")
      .then((data) => {
        if (activo) setKines(unwrapResults<Usuario>(data).filter((u) => u.is_active !== false && (u.rol === "KINE" || u.id === usuario.id)));
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [esAdmin, usuario.id]);
  return kines;
}

function formatoFecha(key: string) {
  const d = new Date(`${key}T00:00:00`);
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric" }).format(d).replace(".", "");
}

export function BadgeTipoGrupo({ grupo }: { grupo: GrupoPacientes }) {
  if (!grupo.activo) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-ink-black-700 dark:text-ink-black-300">Archivado</span>;
  }
  if (grupo.tipo === "TEMPORAL") {
    return grupo.vencido ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
        Venció el {grupo.vigente_hasta ? formatoFecha(grupo.vigente_hasta) : ""}
      </span>
    ) : (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
        Temporal · hasta {grupo.vigente_hasta ? formatoFecha(grupo.vigente_hasta) : ""}
      </span>
    );
  }
  return <span className="rounded-full bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200 px-2 py-0.5 text-[10px] font-bold">Permanente</span>;
}

// -----------------------------------------------------------------------------
// Lista de grupos
// -----------------------------------------------------------------------------

export function ListaGrupos({
  grupos,
  cargando,
  agregando,
  onAbrir,
  onCitar,
  onElegirParaAgregar,
}: {
  grupos: GrupoPacientes[];
  cargando: boolean;
  /** Cantidad de pacientes a agregar: la lista pasa a modo "elegir grupo". */
  agregando?: number;
  onAbrir: (id: number) => void;
  onCitar: (grupo: GrupoPacientes) => void;
  onElegirParaAgregar: (grupo: GrupoPacientes) => void;
}) {
  const [verArchivados, setVerArchivados] = useState(false);
  const visibles = grupos.filter((g) => (verArchivados ? !g.activo : g.activo));
  const archivados = grupos.filter((g) => !g.activo).length;

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
      {agregando ? (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
          Elige el grupo al que quieres agregar {agregando} paciente{agregando !== 1 ? "s" : ""}.
        </p>
      ) : (
        archivados > 0 && (
          <button
            type="button"
            onClick={() => setVerArchivados((v) => !v)}
            className="mb-3 text-xs font-bold text-slate-500 hover:text-slate-900 hover:underline dark:text-ink-black-300"
          >
            {verArchivados ? "← Ver grupos activos" : `Ver archivados (${archivados})`}
          </button>
        )
      )}

      {cargando ? (
        <p className="py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Cargando grupos…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-ink-black-600">
          <FiUsers className="mx-auto text-slate-300" size={26} aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">{verArchivados ? "Sin grupos archivados" : "Aún no hay grupos guardados"}</p>
          {!verArchivados && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              Crea uno con &quot;Nuevo grupo&quot; o selecciona pacientes en la tabla y usa &quot;Guardar como grupo&quot;.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((g, i) => (
            <motion.li
              key={g.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(i, 10) * 0.03 }}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pr-3 transition-colors hover:border-blue-200 dark:border-ink-black-600 dark:bg-ink-black-800"
            >
              <button
                type="button"
                onClick={() => (agregando ? onElegirParaAgregar(g) : onAbrir(g.id))}
                className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                <FiUsers size={17} className="shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-extrabold text-slate-900 dark:text-ink-black-50">{g.nombre}</span>
                    <BadgeTipoGrupo grupo={g} />
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
                    {g.total_miembros} paciente{g.total_miembros !== 1 ? "s" : ""}
                    {g.responsable_nombre ? ` · ${g.responsable_nombre}` : ""}
                    {g.total_actividades > 0 ? ` · ${g.total_actividades} actividad${g.total_actividades !== 1 ? "es" : ""}` : ""}
                  </span>
                </span>
              </button>
              {agregando ? (
                <button type="button" onClick={() => onElegirParaAgregar(g)} className="ccr-control-button-primary shrink-0">
                  <FiUserPlus size={13} aria-hidden="true" />
                  Agregar aquí
                </button>
              ) : (
                g.activo &&
                g.total_miembros > 0 && (
                  <button type="button" onClick={() => onCitar(g)} className="ccr-control-button shrink-0">
                    <FiCalendar size={13} aria-hidden="true" />
                    Citar
                  </button>
                )
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Formulario de grupo
// -----------------------------------------------------------------------------

export function FormularioGrupo({
  usuario,
  grupo,
  candidatos,
  preseleccion,
  onCancelar,
  onGuardado,
}: {
  usuario: Usuario;
  grupo?: GrupoPacientes;
  candidatos: Candidato[];
  preseleccion?: number[];
  onCancelar: () => void;
  onGuardado: (grupo: GrupoPacientes) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const kines = useKines(usuario);
  const esAdmin = usuario.rol === "ADMIN";
  const [nombre, setNombre] = useState(grupo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(grupo?.descripcion ?? "");
  const [tipo, setTipo] = useState<GrupoPacientes["tipo"]>(grupo?.tipo ?? "PERMANENTE");
  const [vigenteHasta, setVigenteHasta] = useState(grupo?.vigente_hasta ?? "");
  const [responsable, setResponsable] = useState(grupo?.responsable ? String(grupo.responsable) : String(usuario.id));
  const [seleccion, setSeleccion] = useState<number[]>(grupo ? grupo.miembros.map((m) => m.paciente_id) : (preseleccion ?? []));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Miembros actuales que ya no figuran entre los disponibles (p. ej. egresados).
  const todos = useMemo(() => {
    const mapa = new Map<number, Candidato>();
    grupo?.miembros.forEach((m) => mapa.set(m.paciente_id, { id: m.paciente_id, nombre: m.nombre, rut: m.rut, categoria: m.categoria }));
    candidatos.forEach((c) => mapa.set(c.id, c));
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [grupo, candidatos]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return setError("Ingresa un nombre para el grupo.");
    if (tipo === "TEMPORAL" && !vigenteHasta) return setError("Indica hasta qué fecha dura el grupo temporal.");
    setGuardando(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        tipo,
        vigente_hasta: tipo === "TEMPORAL" ? vigenteHasta : null,
        paciente_ids: seleccion,
        ...(esAdmin ? { responsable: Number(responsable) } : {}),
      };
      const guardado = grupo
        ? await api.patch<GrupoPacientes>(`/grupos-pacientes/${grupo.id}/`, payload)
        : await api.post<GrupoPacientes>("/grupos-pacientes/", payload);
      toast.success(grupo ? "Grupo actualizado correctamente." : `Grupo creado correctamente.`);
      await onGuardado(guardado);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el grupo."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <Bloque titulo="Grupo" descripcion="Un nombre que identifique al grupo.">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Columna martes, Taller adulto mayor" className={INPUT} autoFocus />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">Descripción (opcional)</span>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Para qué es el grupo o cada cuánto se reúne"
              className={`${INPUT} h-auto resize-none py-2.5 leading-snug`}
            />
          </label>
          {esAdmin && kines.length > 0 && (
            <div className="sm:col-span-2">
              <SelectFiltro label="Responsable" value={responsable} opciones={kines.map((k) => ({ value: String(k.id), label: k.nombre }))} onChange={setResponsable} />
            </div>
          )}
        </Bloque>

        <Bloque titulo="Duración" descripcion="Permanente se mantiene hasta que lo archives; temporal vence en una fecha.">
          <div className="inline-flex h-12 w-full rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900" role="radiogroup" aria-label="Tipo de grupo">
            {(
              [
                ["PERMANENTE", "Permanente"],
                ["TEMPORAL", "Temporal"],
              ] as const
            ).map(([valor, label]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={tipo === valor}
                onClick={() => {
                  setTipo(valor);
                  if (valor === "TEMPORAL" && !vigenteHasta) {
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    setVigenteHasta(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                  }
                }}
                className={`flex-1 rounded-md text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  tipo === valor ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {tipo === "TEMPORAL" ? (
            <CampoFecha label="Vigente hasta" value={vigenteHasta} onChange={setVigenteHasta} opcional={false} />
          ) : (
            <div />
          )}
        </Bloque>

        <Bloque titulo="Pacientes" descripcion={`${seleccion.length} en el grupo. Puedes agregar o quitar después.`}>
          <div className="sm:col-span-2">
            <SelectorPacientes candidatos={todos} seleccion={seleccion} onChange={setSeleccion} />
          </div>
        </Bloque>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-3 dark:border-ink-black-600 dark:bg-ink-black-900/60">
        <button type="button" onClick={onCancelar} className="ccr-button-cancel">
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className="ccr-control-button-primary disabled:opacity-60">
          <FiCheck size={14} aria-hidden="true" />
          {guardando ? "Guardando…" : grupo ? "Guardar cambios" : "Guardar grupo"}
        </button>
      </footer>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Detalle de grupo: resumen, pacientes, actividades e historial
// -----------------------------------------------------------------------------

const NEUTRO_ICONO = "border border-slate-200 bg-white text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-300";

const MOVIMIENTO_META: Record<MovimientoGrupoTipo, { icon: IconType; tono: string }> = {
  CREADO: { icon: FiPlus, tono: NEUTRO_ICONO },
  EDITADO: { icon: FiEdit2, tono: NEUTRO_ICONO },
  MIEMBROS_AGREGADOS: { icon: FiUserPlus, tono: NEUTRO_ICONO },
  MIEMBROS_QUITADOS: { icon: FiUserMinus, tono: NEUTRO_ICONO },
  ARCHIVADO: { icon: FiArchive, tono: NEUTRO_ICONO },
  REACTIVADO: { icon: FiRotateCcw, tono: NEUTRO_ICONO },
  CITADO: { icon: FiCalendar, tono: "border border-blue-200 bg-white text-blue-600 dark:border-blue-500/40 dark:bg-ink-black-800 dark:text-blue-300" },
};

const ESTADO_ACTIVIDAD: Record<string, string> = {
  PROGRAMADA: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
  REALIZADA: "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200",
  CANCELADA: "bg-white text-slate-500 dark:text-slate-400 line-through ring-1 ring-inset ring-slate-200 dark:bg-transparent dark:ring-ink-black-600",
};

function fechaCorta(iso: string) {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short" }).format(d).replace(/[.,]/g, "");
  return `${dia} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Indicador({ label, valor, detalle }: { label: string; valor: ReactNode; detalle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="min-w-0 px-4 py-3"
    >
      <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{label}</p>
      <p className="mt-0.5 truncate text-[17px] font-extrabold tabular-nums text-slate-950 dark:text-white">{valor}</p>
      {detalle && <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{detalle}</p>}
    </motion.div>
  );
}

type PestanaGrupo = "pacientes" | "actividades" | "historial";

export function DetalleGrupo({
  usuario,
  grupo,
  candidatos,
  otrosGrupos,
  onAbrirGrupo,
  onAbrirActividad,
  onAbrirPaciente,
  onEditar,
  onCitar,
  onCambio,
}: {
  usuario: Usuario;
  grupo?: GrupoPacientes;
  candidatos: Candidato[];
  /** Grupos de cada paciente, para mostrar en cuales otros esta. */
  otrosGrupos?: Map<number, { id: number; nombre: string }[]>;
  onAbrirGrupo?: (id: number) => void;
  onAbrirActividad?: (id: number) => void;
  /** Abre la ficha completa del paciente. */
  onAbrirPaciente?: (id: number) => void;
  onEditar: (grupo: GrupoPacientes) => void;
  onCitar: (grupo: GrupoPacientes) => void;
  onCambio: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [pestana, setPestana] = useState<PestanaGrupo>("pacientes");
  const [agregando, setAgregando] = useState(false);
  const [nuevos, setNuevos] = useState<number[]>([]);
  const [filtroMiembros, setFiltroMiembros] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ahora] = useState(() => Date.now());
  const reducir = useReducedMotion();
  const { data: historial, mutate: recargarHistorial } = useAPI<HistorialGrupo>(grupo ? `/grupos-pacientes/${grupo.id}/historial/` : null);
  const cajaAgregarRef = useRef<HTMLDivElement>(null);

  // Al abrir "Agregar pacientes" se lleva la caja a la vista.
  useEffect(() => {
    if (agregando) cajaAgregarRef.current?.scrollIntoView({ block: "nearest", behavior: reducir ? "auto" : "smooth" });
  }, [agregando, reducir]);

  if (!grupo) {
    return <p className="flex-1 px-6 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Cargando grupo…</p>;
  }
  const g = grupo;
  const puedeEditar = usuario.rol === "ADMIN" || g.responsable === usuario.id;
  const idsMiembros = new Set(g.miembros.map((m) => m.paciente_id));
  const disponibles = candidatos.filter((c) => !idsMiembros.has(c.id));
  const citables = g.miembros.filter((m) => m.estado === "INGRESADO").length;
  const actividades = historial?.actividades ?? [];
  const movimientos = historial?.movimientos ?? [];
  const proxima = actividades
    .filter((a) => a.estado === "PROGRAMADA" && new Date(a.fecha_hora).getTime() >= ahora)
    .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))[0];
  const realizadas = actividades.filter((a) => a.estado === "REALIZADA");
  const citados = realizadas.reduce((t, a) => t + a.total_participantes, 0);
  const asistencia = citados ? Math.round((realizadas.reduce((t, a) => t + a.total_asistentes, 0) / citados) * 100) : null;

  // Asistencia de cada paciente en las actividades realizadas de este grupo.
  const asistenciaPorPaciente = new Map<number, { asistio: number; total: number }>();
  realizadas.forEach((a) =>
    a.participantes.forEach((p) => {
      const actual = asistenciaPorPaciente.get(p.paciente_id) ?? { asistio: 0, total: 0 };
      asistenciaPorPaciente.set(p.paciente_id, {
        asistio: actual.asistio + (p.asistencia === "ASISTIO" ? 1 : 0),
        total: actual.total + 1,
      });
    }),
  );

  const q = normalizeSearchText(filtroMiembros);
  const rutQ = normalizeRut(filtroMiembros);
  const miembrosVisibles = q
    ? g.miembros.filter((m) => normalizeSearchText(m.nombre).includes(q) || (!!rutQ && normalizeRut(m.rut).includes(rutQ)))
    : g.miembros;

  async function accion(clave: string, fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(clave);
    try {
      await fn();
      await Promise.all([onCambio(), recargarHistorial()]);
      if (mensaje) toast.success(mensaje);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo guardar el cambio."));
    } finally {
      setOcupado(null);
    }
  }

  const pestanas: { id: PestanaGrupo; label: string; total: number }[] = [
    { id: "pacientes", label: "Pacientes", total: g.total_miembros },
    { id: "actividades", label: "Actividades", total: actividades.length },
    { id: "historial", label: "Historial", total: movimientos.length },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {/* Bloque: resumen */}
        <section className="rounded-xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{g.nombre}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-slate-500">
                  <BadgeTipoGrupo grupo={g} />
                  <span>{g.responsable_nombre ? `Responsable: ${g.responsable_nombre}` : "Sin responsable"}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {puedeEditar && (
                <button type="button" onClick={() => onEditar(g)} className="ccr-control-button">
                  <FiEdit2 size={13} aria-hidden="true" />
                  Editar
                </button>
              )}
              {g.activo && (
                <button
                  type="button"
                  disabled={citables === 0}
                  onClick={() => onCitar(g)}
                  className="ccr-control-button-primary disabled:opacity-50"
                  title={citables === 0 ? "No hay pacientes ingresados para citar" : undefined}
                >
                  <FiCalendar size={14} aria-hidden="true" />
                  Citar al grupo
                </button>
              )}
            </div>
          </div>
          {g.activo && g.vencido && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10"
            >
              <FiAlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-amber-900 dark:text-amber-100">
                Este grupo temporal venció el {g.vigente_hasta ? formatoFecha(g.vigente_hasta) : ""}.
                <span className="font-medium text-amber-800/90 dark:text-amber-200/90">
                  {puedeEditar ? " Archívalo si ya terminó o extiende su fecha si sigue en curso." : " Su responsable puede archivarlo o extender la fecha."}
                </span>
              </p>
              {puedeEditar && (
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => onEditar(g)} className="ccr-control-button">
                    <FiCalendar size={13} aria-hidden="true" />
                    Extender fecha
                  </button>
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => void accion("archivar", () => api.patch(`/grupos-pacientes/${g.id}/`, { activo: false }), "Grupo archivado.")}
                    className="ccr-control-button-primary disabled:opacity-60"
                  >
                    <FiArchive size={13} aria-hidden="true" />
                    Archivar
                  </button>
                </div>
              )}
            </div>
          )}
          {g.descripcion && (
            <p className="border-t border-slate-100 px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:border-ink-black-700 dark:text-ink-black-200">{g.descripcion}</p>
          )}
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 dark:divide-ink-black-700 dark:border-ink-black-700 min-[1400px]:grid-cols-4 min-[1400px]:divide-y-0">
            <Indicador label="Pacientes" valor={g.total_miembros} detalle={citables < g.total_miembros ? `${citables} citables` : "todos ingresados"} />
            <Indicador label="Actividades" valor={actividades.length} detalle={`${realizadas.length} realizada${realizadas.length !== 1 ? "s" : ""}`} />
            <Indicador label="Asistencia" valor={asistencia === null ? "—" : `${asistencia}%`} detalle={asistencia === null ? "sin actividades realizadas" : `${citados} citaciones`} />
            <Indicador
              label="Próxima actividad"
              valor={proxima ? fechaCorta(proxima.fecha_hora).split(" · ")[0] : "—"}
              detalle={proxima ? `${fechaCorta(proxima.fecha_hora).split(" · ")[1]} · ${proxima.nombre}` : "sin programar"}
            />
          </div>
        </section>

        {/* Bloque: pestañas */}
        <section className="rounded-xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 dark:border-ink-black-700">
            <div className="-mb-px flex gap-5" role="tablist" aria-label="Secciones del grupo">
              {pestanas.map((p) => {
                const activa = pestana === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => setPestana(p.id)}
                    className={`relative inline-flex items-center gap-1.5 py-3 text-[13px] font-bold outline-none transition-colors focus-visible:text-blue-700 ${
                      activa ? "text-blue-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                    }`}
                  >
                    {activa && (
                      <motion.span
                        layoutId={`grupo-pestana-${g.id}`}
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      />
                    )}
                    {p.label}
                    <span className={`rounded-full px-1.5 text-[10px] tabular-nums leading-4 ${activa ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-ink-black-700"}`}>{p.total}</span>
                  </button>
                );
              })}
            </div>
            {pestana === "pacientes" && puedeEditar && g.activo && !agregando && (
              <button type="button" onClick={() => setAgregando(true)} className="ccr-control-button my-2">
                <FiPlus size={13} aria-hidden="true" />
                Agregar pacientes
              </button>
            )}
          </div>

          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pestana}
            initial={reducir ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducir ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
          {pestana === "pacientes" && (
            <div className="p-3">
              {agregando && (
                <div
                  ref={cajaAgregarRef}
                  className="mb-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3 pb-0 dark:border-blue-500/30 dark:bg-blue-500/10"
                >
                  <p className="mb-2 text-[12px] font-bold text-slate-700 dark:text-ink-black-100">Agregar pacientes al grupo</p>
                  <SelectorPacientes
                    autoFocus
                    candidatos={disponibles}
                    seleccion={nuevos}
                    onChange={setNuevos}
                    vacio="Todos los pacientes disponibles ya están en el grupo."
                  />
                  {/* Barra fija: queda a la vista aunque la lista sea larga. */}
                  <div className="sticky bottom-0 z-10 -mx-3 mt-2 flex items-center justify-end gap-2 rounded-b-xl border-t border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-500/30 dark:bg-ink-black-800">
                    <span className="mr-auto text-[11.5px] font-semibold tabular-nums text-slate-600 dark:text-ink-black-200">
                      {nuevos.length === 0 ? "Marca los pacientes a sumar" : `${nuevos.length} seleccionado${nuevos.length !== 1 ? "s" : ""}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAgregando(false);
                        setNuevos([]);
                      }}
                      className="ccr-control-button"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={nuevos.length === 0 || ocupado !== null}
                      onClick={() =>
                        void accion(
                          "agregar",
                          async () => {
                            await api.post(`/grupos-pacientes/${g.id}/agregar/`, { paciente_ids: nuevos });
                            setNuevos([]);
                            setAgregando(false);
                          },
                          `${nuevos.length} paciente${nuevos.length !== 1 ? "s" : ""} agregado${nuevos.length !== 1 ? "s" : ""}.`,
                        )
                      }
                      className="ccr-control-button-primary disabled:opacity-50"
                    >
                      <FiUserPlus size={13} aria-hidden="true" />
                      Agregar {nuevos.length > 0 ? `(${nuevos.length})` : ""}
                    </button>
                  </div>
                </div>
              )}

              {g.miembros.length > 6 && (
                <div className="relative mb-2">
                  <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={13} aria-hidden="true" />
                  <input
                    value={filtroMiembros}
                    onChange={(e) => setFiltroMiembros(e.target.value)}
                    placeholder={`Buscar entre los ${g.total_miembros} pacientes`}
                    aria-label="Buscar paciente del grupo"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-900"
                  />
                </div>
              )}

              {g.miembros.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400 dark:border-ink-black-600">
                  El grupo no tiene pacientes todavía.
                </p>
              ) : miembrosVisibles.length === 0 ? (
                <p className="px-4 py-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Sin coincidencias.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-1.5 min-[1500px]:grid-cols-2">
                  {miembrosVisibles.map((m, i) => {
                    const otros = (otrosGrupos?.get(m.paciente_id) ?? []).filter((o) => o.id !== g.id);
                    const asis = asistenciaPorPaciente.get(m.paciente_id);
                    const tono = TONO_CATEGORIA[m.categoria];
                    return (
                      <motion.li
                        key={m.paciente_id}
                        layout={!reducir}
                        initial={reducir ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.18, delay: reducir ? 0 : Math.min(i, 12) * 0.025 }}
                        className="group relative flex items-stretch rounded-lg border border-slate-200 bg-white transition-colors hover:border-blue-200 hover:shadow-[0_6px_18px_-12px_rgba(59,116,232,0.45)] dark:border-ink-black-600 dark:bg-ink-black-800"
                      >
                        <button
                          type="button"
                          disabled={!onAbrirPaciente}
                          onClick={() => onAbrirPaciente?.(m.paciente_id)}
                          title={onAbrirPaciente ? "Ver ficha completa" : undefined}
                          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                        >
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tono?.dot ?? "bg-slate-400"}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-bold text-slate-900 group-hover:text-blue-700 dark:text-ink-black-50 dark:group-hover:text-blue-200">
                                {nombreLegible(m.nombre)}
                              </span>
                              {m.estado !== "INGRESADO" && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" title="No se incluye al citar al grupo">
                                  {ESTADO_LABELS[m.estado] ?? m.estado}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] font-medium tabular-nums text-slate-500">
                              {formatearRut(m.rut)}
                              {m.edad ? ` · ${m.edad} años` : ""}
                              {` · ${CATEGORIA_LABELS[m.categoria] ?? m.categoria}`}
                              {m.prioridad ? ` · ${PRIORIDAD_LABELS[m.prioridad] ?? m.prioridad}` : ""}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-semibold text-slate-500">
                              {m.telefono && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <FiPhone size={10} aria-hidden="true" />
                                  {m.telefono}
                                </span>
                              )}
                              {usuario.rol !== "KINE" && m.kine_nombre && <span>{m.kine_nombre}</span>}
                              {asis && (
                                <span className={asis.asistio === asis.total ? "text-slate-600" : "text-amber-700 dark:text-amber-300"}>
                                  Asistió {asis.asistio}/{asis.total}
                                </span>
                              )}
                              {m.proxima_atencion && (
                                <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300">
                                  <FiCalendar size={10} aria-hidden="true" />
                                  {fechaCorta(m.proxima_atencion)}
                                </span>
                              )}
                            </span>
                            {otros.length > 0 && (
                              <span className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                También en
                                {otros.map((o) => (
                                  <span
                                    key={o.id}
                                    onClick={(e) => {
                                      if (!onAbrirGrupo) return;
                                      e.stopPropagation();
                                      onAbrirGrupo(o.id);
                                    }}
                                    title={`Ver grupo ${o.nombre}`}
                                    className={`max-w-[140px] truncate rounded-full bg-slate-100 px-1.5 py-px text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200 ${onAbrirGrupo ? "cursor-pointer hover:bg-slate-200 dark:hover:bg-ink-black-600" : ""}`}
                                  >
                                    {o.nombre}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          {onAbrirPaciente && (
                            <FiChevronRight
                              size={15}
                              className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                        {puedeEditar && (
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() => void accion(`quitar-${m.paciente_id}`, () => api.post(`/grupos-pacientes/${g.id}/quitar/`, { paciente_ids: [m.paciente_id] }), "Paciente quitado del grupo.")}
                            aria-label={`Quitar a ${nombreLegible(m.nombre)} del grupo`}
                            title="Quitar del grupo"
                            className="mr-1.5 mt-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 outline-none transition hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:opacity-40"
                          >
                            <FiX size={14} aria-hidden="true" />
                          </button>
                        )}
                      </motion.li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {pestana === "actividades" && (
            <div className="p-3">
              {actividades.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400 dark:border-ink-black-600">
                  Este grupo aún no ha sido citado a ninguna actividad.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {actividades.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={!onAbrirActividad}
                        onClick={() => onAbrirActividad?.(a.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left outline-none transition-colors enabled:hover:border-blue-200 enabled:hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-ink-black-700"
                      >
                        <span className="w-[118px] shrink-0 text-[12px] font-bold tabular-nums text-slate-700 dark:text-ink-black-100">{fechaCorta(a.fecha_hora)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-slate-900 dark:text-ink-black-50">{a.nombre}</span>
                          {a.lugar && <span className="block truncate text-[11px] font-medium text-slate-500">{a.lugar}</span>}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_ACTIVIDAD[a.estado] ?? ""}`}>{a.estado_label}</span>
                        <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500">
                          {a.estado === "REALIZADA" ? `${a.total_asistentes}/${a.total_participantes}` : `${a.total_participantes} pac.`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {pestana === "historial" && (
            <div className="px-4 py-3">
              {movimientos.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-medium text-slate-500 dark:text-slate-400 dark:border-ink-black-600">
                  Sin movimientos registrados.
                </p>
              ) : (
                <ol>
                  {movimientos.map((mv, i) => {
                    const meta = MOVIMIENTO_META[mv.tipo] ?? MOVIMIENTO_META.EDITADO;
                    const Icon = meta.icon;
                    const ultimo = i === movimientos.length - 1;
                    return (
                      <li key={`${mv.tipo}-${mv.fecha}-${i}`} className="relative flex gap-3">
                        {!ultimo && <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-7 w-px bg-slate-200 dark:bg-ink-black-600" />}
                        <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tono}`}>
                          <Icon size={12} aria-hidden="true" />
                        </span>
                        <div className={`min-w-0 flex-1 ${ultimo ? "" : "pb-3.5"}`}>
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-ink-black-50">{mv.titulo}</p>
                            <time dateTime={mv.fecha} className="ml-auto text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                              {formatearFechaHoraCorta(mv.fecha)}
                            </time>
                          </div>
                          {mv.descripcion && <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-ink-black-200">{mv.descripcion}</p>}
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{mv.usuario_nombre ?? "Sistema"}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
          </motion.div>
          </AnimatePresence>
        </section>
      </div>

      {puedeEditar && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-ink-black-600 dark:bg-ink-black-900/60">
          <p className="text-[11px] font-medium text-slate-500">
            {g.activo ? "Archivar lo saca de la lista sin borrar su historial." : "Este grupo está archivado."}
          </p>
          {g.activo ? (
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => void accion("archivar", () => api.patch(`/grupos-pacientes/${g.id}/`, { activo: false }), "Grupo archivado.")}
              className="ccr-control-button disabled:opacity-60"
            >
              <FiArchive size={13} aria-hidden="true" />
              Archivar grupo
            </button>
          ) : (
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => void accion("reactivar", () => api.patch(`/grupos-pacientes/${g.id}/`, { activo: true }), "Grupo reactivado.")}
              className="ccr-control-button disabled:opacity-60"
            >
              <FiRotateCcw size={13} aria-hidden="true" />
              Reactivar grupo
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modal para crear o editar un grupo (mismo formato que "Editar paciente")
// -----------------------------------------------------------------------------

export function GrupoModal({
  usuario,
  grupo,
  candidatos,
  preseleccion,
  onClose,
  onGuardado,
}: {
  usuario: Usuario;
  grupo?: GrupoPacientes;
  candidatos: Candidato[];
  preseleccion?: number[];
  onClose: () => void;
  onGuardado: (grupo: GrupoPacientes) => void | Promise<void>;
}) {
  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/45 px-4 py-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-3xl">
        <Dialog
          aria-label={grupo ? "Editar grupo" : "Nuevo grupo"}
          className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-ink-black-600">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{grupo ? "Editar grupo" : "Nuevo grupo"}</p>
              <h2 className="mt-0.5 truncate text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{grupo?.nombre ?? "Grupo de pacientes"}</h2>
              {grupo && (
                <p className="mt-1 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
                  {grupo.total_miembros} paciente{grupo.total_miembros !== 1 ? "s" : ""} · {grupo.tipo_label}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
            >
              <FiX size={18} />
            </button>
          </header>
          <FormularioGrupo
            usuario={usuario}
            grupo={grupo}
            candidatos={candidatos}
            preseleccion={preseleccion}
            onCancelar={onClose}
            onGuardado={onGuardado}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export { nombreLegible };
