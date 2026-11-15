"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCalendar,
  FiCheck,
  FiClock,
  FiEdit2,
  FiMapPin,
  FiPlus,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import { useAPI, unwrapResults } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import type {
  ActividadGrupal,
  AsistenciaActividad,
  GrupoPacientes,
  Paciente,
  PaginatedResponse,
  Usuario,
} from "@/lib/types";
import { TONO_CATEGORIA } from "./AgendaGrid";
import CampoFecha, { fechaHoyKey } from "./CampoFecha";
import SelectFiltro from "./SelectFiltro";
import { Bloque, type Candidato, candidatoDe, INPUT, ListaGrupos, nombreLegible, SelectorPacientes, useKines } from "./GruposPacientesVistas";

// Los grupos se administran en /grupos; aqui solo se eligen para citar o para sumar pacientes.
type Vista =
  | { tipo: "lista" }
  | { tipo: "form"; actividad?: ActividadGrupal; grupo?: GrupoPacientes }
  | { tipo: "detalle"; id: number }
  | { tipo: "elegirGrupo" };

/** Que hacer con los pacientes seleccionados en la tabla al abrir la ventana. */
export type AccionSeleccion = "actividad" | "agregar";


const HORAS = Array.from({ length: 53 }, (_, i) => {
  const minutos = 7 * 60 + i * 15; // 07:00 a 20:00 cada 15 minutos
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

const DURACIONES = [30, 45, 60, 90, 120].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} minutos` : m === 60 ? "1 hora" : `${m / 60} horas`.replace(".5", " y media"),
}));

const ESTADO_TONO: Record<ActividadGrupal["estado"], string> = {
  PROGRAMADA: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
  REALIZADA: "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200",
  CANCELADA: "bg-white text-slate-400 line-through ring-1 ring-inset ring-slate-200 dark:bg-transparent dark:ring-ink-black-600",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fechaKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function horaKey(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fechaLarga(iso: string) {
  const d = new Date(iso);
  const texto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} · ${horaKey(iso)}`;
}

/**
 * Actividades grupales: lista, creacion/edicion y asistencia.
 * Los grupos se administran en /grupos; esta ventana solo los usa para citar
 * a un grupo o para sumar los pacientes marcados en la tabla (`accionSeleccion: "agregar"`).
 */
export default function ActividadesGrupalesModal({
  usuario,
  pacientesDisponibles,
  preseleccion,
  accionSeleccion = "actividad",
  actividadInicial,
  grupoParaCitar,
  onClose,
  onCambio,
}: {
  usuario: Usuario;
  /** Pacientes ingresados que se pueden sumar a una actividad o grupo. */
  pacientesDisponibles: Paciente[];
  preseleccion?: number[];
  accionSeleccion?: AccionSeleccion;
  /** Abre directamente el detalle de esta actividad (p. ej. desde la Agenda). */
  actividadInicial?: number;
  /** Abre directo el formulario para citar a este grupo. */
  grupoParaCitar?: GrupoPacientes;
  onClose: () => void;
  onCambio?: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const enPaginaGrupos = usePathname() === "/grupos";
  const conSeleccion = !!preseleccion?.length;
  const [vista, setVista] = useState<Vista>(() => {
    if (actividadInicial) return { tipo: "detalle", id: actividadInicial };
    if (grupoParaCitar) return { tipo: "form", grupo: grupoParaCitar };
    if (conSeleccion && accionSeleccion === "agregar") return { tipo: "elegirGrupo" };
    if (conSeleccion) return { tipo: "form" };
    return { tipo: "lista" };
  });
  const { data, isLoading, mutate } = useAPI<ActividadGrupal[] | PaginatedResponse<ActividadGrupal>>("/actividades-grupales/");
  const actividades = unwrapResults(data);
  const {
    data: dataGrupos,
    isLoading: cargandoGrupos,
    mutate: mutateGrupos,
  } = useAPI<GrupoPacientes[] | PaginatedResponse<GrupoPacientes>>("/grupos-pacientes/?incluir_inactivos=1");
  const grupos = unwrapResults(dataGrupos);

  async function recargar() {
    await Promise.all([mutate(), mutateGrupos()]);
    onCambio?.();
  }

  async function agregarSeleccionA(grupo: GrupoPacientes) {
    try {
      await api.post(`/grupos-pacientes/${grupo.id}/agregar/`, { paciente_ids: preseleccion });
      toast.success(`${preseleccion?.length} paciente${preseleccion?.length !== 1 ? "s" : ""} agregado${preseleccion?.length !== 1 ? "s" : ""} a "${grupo.nombre}".`);
      await recargar();
      onClose();
      router.push(`/grupos?id=${grupo.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudieron agregar los pacientes."));
    }
  }

  const titulo = {
    lista: "Actividades grupales",
    form: vista.tipo === "form" && vista.actividad ? "Editar actividad" : vista.tipo === "form" && vista.grupo ? `Citar a ${vista.grupo.nombre}` : "Nueva actividad grupal",
    detalle: "Detalle de la actividad",
    elegirGrupo: "Agregar a un grupo",
  }[vista.tipo];
  // Citar a un grupo o elegir donde agregar son tareas de una sola vista: no hay a donde volver.
  const esRaiz = vista.tipo === "lista" || vista.tipo === "elegirGrupo" || (vista.tipo === "form" && !!vista.grupo);

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
          aria-label={titulo}
          className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          <header className="border-b border-slate-200 px-6 pt-4 dark:border-ink-black-600">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                {!esRaiz && (
                  <button
                    type="button"
                    onClick={() => setVista({ tipo: "lista" })}
                    aria-label="Volver"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
                  >
                    <FiArrowLeft size={17} />
                  </button>
                )}
                <h2 className="truncate text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{titulo}</h2>
              </div>
              <div className="flex items-center gap-2">
                {vista.tipo === "lista" && (
                  <button type="button" onClick={() => setVista({ tipo: "form" })} className="ccr-control-button-primary">
                    <FiPlus size={14} aria-hidden="true" />
                    Nueva actividad
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>
            {vista.tipo === "lista" && !enPaginaGrupos && (
              <p className="-mt-1 pb-3 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
                Para crear o editar grupos de pacientes, ve a{" "}
                <Link href="/grupos" onClick={onClose} className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline dark:text-blue-300">
                  Grupos
                  <FiArrowRight size={12} aria-hidden="true" />
                </Link>
              </p>
            )}
          </header>

          {vista.tipo === "lista" && (
            <ListaActividades actividades={actividades} cargando={isLoading} onAbrir={(id) => setVista({ tipo: "detalle", id })} />
          )}
          {vista.tipo === "form" && (
            <FormularioActividad
              key={vista.grupo?.id ?? vista.actividad?.id ?? "nueva"}
              usuario={usuario}
              actividad={vista.actividad}
              grupoInicial={vista.grupo}
              grupos={grupos.filter((gr) => gr.activo)}
              pacientesDisponibles={pacientesDisponibles}
              preseleccion={vista.actividad || vista.grupo ? undefined : preseleccion}
              onCancelar={() =>
                vista.actividad
                  ? setVista({ tipo: "detalle", id: vista.actividad.id })
                  : vista.grupo
                    ? onClose()
                    : setVista({ tipo: "lista" })
              }
              onGuardada={async (guardada) => {
                await recargar();
                setVista({ tipo: "detalle", id: guardada.id });
              }}
            />
          )}
          {vista.tipo === "detalle" && (
            <DetalleActividad
              usuario={usuario}
              actividad={actividades.find((a) => a.id === vista.id)}
              onEditar={(a) => setVista({ tipo: "form", actividad: a })}
              onCambio={recargar}
              onEliminada={async () => {
                await recargar();
                setVista({ tipo: "lista" });
              }}
            />
          )}
          {vista.tipo === "elegirGrupo" && (
            <ListaGrupos
              grupos={grupos}
              cargando={cargandoGrupos}
              agregando={preseleccion?.length ?? 0}
              onAbrir={() => undefined}
              onCitar={() => undefined}
              onElegirParaAgregar={(gr) => void agregarSeleccionA(gr)}
            />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

// -----------------------------------------------------------------------------
// Lista
// -----------------------------------------------------------------------------

function ListaActividades({
  actividades,
  cargando,
  onAbrir,
}: {
  actividades: ActividadGrupal[];
  cargando: boolean;
  onAbrir: (id: number) => void;
}) {
  const [pestana, setPestana] = useState<"proximas" | "anteriores">("proximas");
  const hoy = fechaHoyKey();
  const proximas = actividades.filter((a) => fechaKey(a.fecha_hora) >= hoy && a.estado !== "CANCELADA");
  const anteriores = actividades
    .filter((a) => fechaKey(a.fecha_hora) < hoy || a.estado === "CANCELADA")
    .sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  const visibles = pestana === "proximas" ? proximas : anteriores;

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900" role="tablist">
        {(
          [
            ["proximas", `Próximas (${proximas.length})`],
            ["anteriores", `Anteriores (${anteriores.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={`h-8 rounded-md px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
              pestana === id ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm font-semibold text-slate-400">Cargando actividades…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-ink-black-600">
          <FiUsers className="mx-auto text-slate-300" size={26} aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">
            {pestana === "proximas" ? "No hay actividades programadas" : "Sin actividades anteriores"}
          </p>
          {pestana === "proximas" && (
            <p className="mt-1 text-xs font-medium text-slate-500">
              Crea una con &quot;Nueva actividad&quot; o selecciona pacientes en la tabla.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAbrir(a.id)}
                className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left outline-none transition-colors hover:border-blue-200 hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-ink-black-600 dark:bg-ink-black-800 dark:hover:bg-blue-500/10"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-100">
                  <span className="text-[10px] font-bold uppercase leading-none">
                    {new Intl.DateTimeFormat("es-CL", { month: "short" }).format(new Date(a.fecha_hora)).replace(".", "")}
                  </span>
                  <span className="text-lg font-extrabold leading-tight tabular-nums">{new Date(a.fecha_hora).getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-extrabold text-slate-900 dark:text-ink-black-50">{a.nombre}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_TONO[a.estado]}`}>{a.estado_label}</span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
                    <span className="inline-flex items-center gap-1">
                      <FiClock size={12} aria-hidden="true" /> {horaKey(a.fecha_hora)} · {a.duracion_minutos} min
                    </span>
                    {a.lugar && (
                      <span className="inline-flex items-center gap-1">
                        <FiMapPin size={12} aria-hidden="true" /> {a.lugar}
                      </span>
                    )}
                    {a.responsable_nombre && <span>{a.responsable_nombre}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-extrabold tabular-nums text-slate-900 dark:text-ink-black-50">{a.total_participantes}</p>
                  <p className="text-[10px] font-semibold text-slate-400">
                    {a.estado === "REALIZADA" ? `${a.total_asistentes} asistieron` : "pacientes"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Formulario
// -----------------------------------------------------------------------------

/** Pacientes del grupo que se pueden citar (solo ingresados). */
function citablesDe(grupo: GrupoPacientes) {
  return grupo.miembros.filter((m) => m.estado === "INGRESADO").map((m) => m.paciente_id);
}

function FormularioActividad({
  usuario,
  actividad,
  grupoInicial,
  grupos,
  pacientesDisponibles,
  preseleccion,
  onCancelar,
  onGuardada,
}: {
  usuario: Usuario;
  actividad?: ActividadGrupal;
  grupoInicial?: GrupoPacientes;
  grupos: GrupoPacientes[];
  pacientesDisponibles: Paciente[];
  preseleccion?: number[];
  onCancelar: () => void;
  onGuardada: (actividad: ActividadGrupal) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const esAdmin = usuario.rol === "ADMIN";
  const [nombre, setNombre] = useState(actividad?.nombre ?? grupoInicial?.nombre ?? "");
  const [grupoId, setGrupoId] = useState(String(actividad?.grupo ?? grupoInicial?.id ?? ""));
  const [fecha, setFecha] = useState(actividad ? fechaKey(actividad.fecha_hora) : fechaHoyKey());
  const [hora, setHora] = useState(actividad ? horaKey(actividad.fecha_hora) : "10:00");
  const [duracion, setDuracion] = useState(String(actividad?.duracion_minutos ?? 60));
  const [lugar, setLugar] = useState(actividad?.lugar ?? "");
  const [descripcion, setDescripcion] = useState(actividad?.descripcion ?? "");
  const [responsable, setResponsable] = useState(actividad?.responsable ? String(actividad.responsable) : String(usuario.id));
  const [seleccion, setSeleccion] = useState<number[]>(
    actividad ? actividad.participantes.map((p) => p.paciente_id) : grupoInicial ? citablesDe(grupoInicial) : (preseleccion ?? []),
  );
  const kines = useKines(usuario);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Incluye participantes y miembros de grupos aunque no figuren en la tabla actual.
  const candidatos = useMemo(() => {
    const mapa = new Map<number, Candidato>();
    actividad?.participantes.forEach((p) => mapa.set(p.paciente_id, { id: p.paciente_id, nombre: p.nombre, rut: p.rut, categoria: p.categoria }));
    grupos.forEach((gr) =>
      gr.miembros
        .filter((m) => m.estado === "INGRESADO")
        .forEach((m) => mapa.set(m.paciente_id, { id: m.paciente_id, nombre: m.nombre, rut: m.rut, categoria: m.categoria })),
    );
    pacientesDisponibles.forEach((p) => mapa.set(p.id, candidatoDe(p)));
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [actividad, grupos, pacientesDisponibles]);

  const grupoElegido = grupos.find((gr) => String(gr.id) === grupoId) ?? (grupoInicial && String(grupoInicial.id) === grupoId ? grupoInicial : undefined);
  const excluidos = grupoElegido ? grupoElegido.total_miembros - citablesDe(grupoElegido).length : 0;

  function usarGrupo(id: string) {
    setGrupoId(id);
    const gr = grupos.find((x) => String(x.id) === id);
    if (!gr) return;
    setSeleccion(citablesDe(gr));
    if (!nombre.trim()) setNombre(gr.nombre);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return setError("Ingresa un nombre para la actividad.");
    if (!fecha) return setError("Elige la fecha de la actividad.");
    if (seleccion.length === 0) return setError("Selecciona al menos un paciente.");
    setGuardando(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        fecha_hora: `${fecha}T${hora}`,
        duracion_minutos: Number(duracion),
        lugar: lugar.trim(),
        descripcion: descripcion.trim(),
        paciente_ids: seleccion,
        grupo: grupoId ? Number(grupoId) : null,
        ...(esAdmin ? { responsable: Number(responsable) } : {}),
      };
      const guardada = actividad
        ? await api.patch<ActividadGrupal>(`/actividades-grupales/${actividad.id}/`, payload)
        : await api.post<ActividadGrupal>("/actividades-grupales/", payload);
      toast.success(actividad ? "Actividad actualizada." : `Actividad creada con ${seleccion.length} paciente${seleccion.length !== 1 ? "s" : ""}.`);
      await onGuardada(guardada);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar la actividad."));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <Bloque titulo="Actividad" descripcion="Qué se hará y dónde.">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Taller de columna, Caminata grupal"
              className={INPUT}
              autoFocus
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">Lugar</span>
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej: Gimnasio CCR" className={INPUT} />
          </label>
          {esAdmin && kines.length > 0 ? (
            <div className="self-end">
              <SelectFiltro
                label="Responsable"
                value={responsable}
                opciones={kines.map((k) => ({ value: String(k.id), label: k.nombre }))}
                onChange={setResponsable}
              />
            </div>
          ) : (
            <div />
          )}
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">Descripción (opcional)</span>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Indicaciones para los pacientes o notas del equipo"
              className={`${INPUT} h-auto resize-none py-2.5 leading-snug`}
            />
          </label>
        </Bloque>

        <Bloque titulo="Fecha y hora" descripcion="Cuándo se realiza la actividad.">
          <CampoFecha label="Fecha" value={fecha} onChange={setFecha} opcional={false} />
          <SelectFiltro label="Hora de inicio" value={hora} opciones={HORAS} onChange={setHora} />
          <SelectFiltro label="Duración" value={duracion} opciones={DURACIONES} onChange={setDuracion} />
        </Bloque>

        <Bloque titulo="Participantes" descripcion={`${seleccion.length} paciente${seleccion.length !== 1 ? "s" : ""} seleccionado${seleccion.length !== 1 ? "s" : ""}.`}>
          {grupos.length > 0 && (
            <div className="sm:col-span-2">
              <SelectFiltro
                label="Usar un grupo guardado"
                value={grupoId}
                opciones={[
                  { value: "", label: "Sin grupo (elegir pacientes)" },
                  ...grupos.map((gr) => ({ value: String(gr.id), label: `${gr.nombre} · ${gr.total_miembros} pacientes` })),
                ]}
                onChange={usarGrupo}
              />
              {excluidos > 0 && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  {excluidos} paciente{excluidos !== 1 ? "s" : ""} del grupo no se incluye{excluidos !== 1 ? "n" : ""} porque ya no está{excluidos !== 1 ? "n" : ""} ingresado{excluidos !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
          )}
          <div className="sm:col-span-2">
            <SelectorPacientes candidatos={candidatos} seleccion={seleccion} onChange={setSeleccion} />
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
          {guardando ? "Guardando…" : actividad ? "Guardar cambios" : "Crear actividad"}
        </button>
      </footer>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Detalle y asistencia
// -----------------------------------------------------------------------------

const OPCIONES_ASISTENCIA: { value: AsistenciaActividad; label: string; activo: string }[] = [
  { value: "PENDIENTE", label: "Pendiente", activo: "bg-white text-slate-700 shadow-sm dark:bg-ink-black-700 dark:text-ink-black-100" },
  { value: "ASISTIO", label: "Asistió", activo: "bg-green-500 text-white shadow-sm" },
  { value: "NO_ASISTIO", label: "No asistió", activo: "bg-amber-500 text-white shadow-sm" },
];

function DetalleActividad({
  usuario,
  actividad,
  onEditar,
  onCambio,
  onEliminada,
}: {
  usuario: Usuario;
  actividad?: ActividadGrupal;
  onEditar: (actividad: ActividadGrupal) => void;
  onCambio: () => Promise<void>;
  onEliminada: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  if (!actividad) {
    return <p className="flex-1 px-6 py-10 text-center text-sm font-semibold text-slate-400">Cargando actividad…</p>;
  }
  const a = actividad;
  const puedeEditar = usuario.rol === "ADMIN" || a.responsable === usuario.id;

  async function accion(clave: string, fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(clave);
    try {
      await fn();
      await onCambio();
      if (mensaje) toast.success(mensaje);
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo guardar el cambio."));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-extrabold text-slate-950 dark:text-ink-black-50">{a.nombre}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_TONO[a.estado]}`}>{a.estado_label}</span>
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-slate-600 dark:text-ink-black-200">
              <span className="inline-flex items-center gap-1.5">
                <FiCalendar size={14} className="text-slate-400" aria-hidden="true" /> {fechaLarga(a.fecha_hora)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FiClock size={14} className="text-slate-400" aria-hidden="true" /> {a.duracion_minutos} min
              </span>
              {a.lugar && (
                <span className="inline-flex items-center gap-1.5">
                  <FiMapPin size={14} className="text-slate-400" aria-hidden="true" /> {a.lugar}
                </span>
              )}
            </p>
            {(a.responsable_nombre || a.grupo_nombre) && (
              <p className="mt-1 text-[12px] font-medium text-slate-500">
                {[a.responsable_nombre ? `Responsable: ${a.responsable_nombre}` : "", a.grupo_nombre ? `Grupo: ${a.grupo_nombre}` : ""].filter(Boolean).join(" · ")}
              </p>
            )}
            {a.descripcion && (
              <p className="mt-3 border-l-2 border-slate-200 pl-3 text-[13px] leading-relaxed text-slate-600 dark:border-ink-black-600 dark:text-ink-black-200">
                {a.descripcion}
              </p>
            )}
          </div>
          {puedeEditar && a.estado !== "CANCELADA" && (
            <button type="button" onClick={() => onEditar(a)} className="ccr-control-button">
              <FiEdit2 size={13} aria-hidden="true" />
              Editar
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h4 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">
            Participantes <span className="font-semibold text-slate-400">({a.total_participantes})</span>
          </h4>
          <span className="text-[12px] font-semibold text-slate-500">
            <span className="font-bold text-green-700 dark:text-green-300">{a.total_asistentes}</span> asistieron
          </span>
        </div>
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-ink-black-700 dark:border-ink-black-600">
          {a.participantes.map((p) => (
            <li key={p.paciente_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_CATEGORIA[p.categoria]?.dot ?? "bg-slate-400"}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-900 dark:text-ink-black-50">{nombreLegible(p.nombre)}</p>
                <p className="text-[11px] font-medium tabular-nums text-slate-500">
                  {formatearRut(p.rut)}
                  {p.telefono ? ` · ${p.telefono}` : ""}
                </p>
              </div>
              {puedeEditar && a.estado !== "CANCELADA" ? (
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-ink-black-900" role="radiogroup" aria-label={`Asistencia de ${nombreLegible(p.nombre)}`}>
                  {OPCIONES_ASISTENCIA.map((op) => {
                    const activo = p.asistencia === op.value;
                    return (
                      <button
                        key={op.value}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        disabled={ocupado !== null}
                        onClick={() =>
                          !activo &&
                          void accion(
                            `asis-${p.paciente_id}`,
                            () => api.post(`/actividades-grupales/${a.id}/asistencia/`, { paciente_id: p.paciente_id, asistencia: op.value }),
                            "",
                          )
                        }
                        className={`h-7 rounded-md px-2.5 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-wait ${
                          activo ? op.activo : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                        }`}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200">
                  {p.asistencia_label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {puedeEditar && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-3 dark:border-ink-black-600 dark:bg-ink-black-900/60">
          {confirmarEliminar ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
              ¿Eliminar la actividad? No se puede deshacer.
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() =>
                  void (async () => {
                    setOcupado("eliminar");
                    try {
                      await api.delete(`/actividades-grupales/${a.id}/`);
                      toast.success("Actividad eliminada.");
                      await onEliminada();
                    } catch (err) {
                      toast.error(getErrorMessage(err, "No se pudo eliminar la actividad."));
                      setOcupado(null);
                    }
                  })()
                }
                className="rounded-md bg-red-600 px-2.5 py-1 font-bold text-white hover:bg-red-700"
              >
                Sí, eliminar
              </button>
              <button type="button" onClick={() => setConfirmarEliminar(false)} className="rounded-md px-2 py-1 font-bold text-slate-600 hover:bg-slate-100">
                No
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmarEliminar(true)} className="ccr-button-cancel">
              <FiTrash2 size={13} aria-hidden="true" />
              Eliminar
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {a.estado === "PROGRAMADA" && (
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => void accion("cancelar", () => api.patch(`/actividades-grupales/${a.id}/`, { estado: "CANCELADA" }), "Actividad cancelada.")}
                className="ccr-control-button disabled:opacity-60"
              >
                Cancelar actividad
              </button>
            )}
            {a.estado !== "PROGRAMADA" && (
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => void accion("reabrir", () => api.patch(`/actividades-grupales/${a.id}/`, { estado: "PROGRAMADA" }), "Actividad marcada como programada.")}
                className="ccr-control-button disabled:opacity-60"
              >
                Volver a programada
              </button>
            )}
            {a.estado === "PROGRAMADA" && (
              <button
                type="button"
                disabled={ocupado !== null}
                onClick={() => void accion("realizada", () => api.patch(`/actividades-grupales/${a.id}/`, { estado: "REALIZADA" }), "Actividad marcada como realizada.")}
                className="ccr-control-button-primary disabled:opacity-60"
              >
                <FiCheck size={14} aria-hidden="true" />
                Marcar realizada
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
