"use client";

import { useCallback, useMemo, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import { FiCheck, FiEdit2, FiMessageSquare, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { BsPin, BsPinFill } from "react-icons/bs";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type { ObservacionPaciente, TipoObservacion, Usuario } from "@/lib/types";

// =============================================================================
// Tipos de observación
// =============================================================================

export const TIPOS_OBSERVACION: Array<{ value: TipoObservacion; label: string; clase: string }> = [
  { value: "GENERAL", label: "General", clase: "bg-slate-100 text-slate-700 dark:bg-ink-black-700 dark:text-ink-black-100" },
  { value: "CLINICA", label: "Clínica", clase: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100" },
  { value: "CONTACTO", label: "Contacto", clase: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-100" },
  { value: "ADMINISTRATIVA", label: "Administrativa", clase: "bg-amber-50 text-amber-800 dark:bg-amber-400/15 dark:text-amber-100" },
  { value: "IMPORTACION", label: "Importación", clase: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-100" },
];

const ESTILO_TIPO = Object.fromEntries(TIPOS_OBSERVACION.map((t) => [t.value, t]));

function fechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SelectorTipo({ value, onChange }: { value: TipoObservacion; onChange: (v: TipoObservacion) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TipoObservacion)}
      aria-label="Tipo de observación"
      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-100"
    >
      {TIPOS_OBSERVACION.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

// =============================================================================
// Componente
// =============================================================================

export default function ObservacionesPaciente({
  pacienteId,
  usuario,
  onCambio,
}: {
  pacienteId: number;
  usuario: Usuario;
  /** Se llama tras crear/editar/borrar (para refrescar el resumen del paciente). */
  onCambio?: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [items, setItems] = useState<ObservacionPaciente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<TipoObservacion | "TODOS">("TODOS");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [nuevo, setNuevo] = useState<{ texto: string; tipo: TipoObservacion; fijada: boolean }>({
    texto: "",
    tipo: "GENERAL",
    fijada: false,
  });
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<{ texto: string; tipo: TipoObservacion }>({ texto: "", tipo: "GENERAL" });
  const [confirmarBorrar, setConfirmarBorrar] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const puedeEscribir = usuario.rol === "ADMIN" || usuario.rol === "KINE";

  // Al cambiar de paciente se vuelve a mostrar la carga (ajuste durante el render).
  const [pacienteCargado, setPacienteCargado] = useState(pacienteId);
  if (pacienteCargado !== pacienteId) {
    setPacienteCargado(pacienteId);
    setCargando(true);
  }

  const traer = useCallback(async () => {
    try {
      setItems(await api.get<ObservacionPaciente[]>(`/observaciones-paciente/?paciente=${pacienteId}`));
    } catch (e) {
      toastError(getErrorMessage(e, "No se pudieron cargar las observaciones."));
    } finally {
      setCargando(false);
    }
  }, [pacienteId, toastError]);

  const cargar = useCallback(async () => {
    setCargando(true);
    await traer();
  }, [traer]);

  useCargaAlMontar(traer);

  const visibles = useMemo(
    () => (filtro === "TODOS" ? items : items.filter((o) => o.tipo === filtro)),
    [items, filtro],
  );
  const conteo = useMemo(() => {
    const c: Partial<Record<TipoObservacion, number>> = {};
    for (const o of items) c[o.tipo] = (c[o.tipo] ?? 0) + 1;
    return c;
  }, [items]);

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setGuardando(true);
    try {
      await accion();
      toastSuccess(mensaje);
      await cargar();
      onCambio?.();
    } catch (e) {
      toastError(getErrorMessage(e, "No se pudo guardar la observación."));
    } finally {
      setGuardando(false);
    }
  }

  async function crear() {
    if (!nuevo.texto.trim()) return;
    await ejecutar(
      () => api.post("/observaciones-paciente/", { paciente: pacienteId, ...nuevo, texto: nuevo.texto.trim() }),
      "Observación agregada.",
    );
    setNuevo({ texto: "", tipo: "GENERAL", fijada: false });
    setNuevoAbierto(false);
  }

  async function guardarEdicion(id: number) {
    if (!borrador.texto.trim()) return;
    await ejecutar(
      () => api.patch(`/observaciones-paciente/${id}/`, { texto: borrador.texto.trim(), tipo: borrador.tipo }),
      "Observación actualizada.",
    );
    setEditando(null);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-ink-black-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-300" aria-hidden="true">
            <FiMessageSquare size={15} />
          </span>
          <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">Observaciones</h3>
          {items.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200">
              {items.length}
            </span>
          )}
        </div>
        {puedeEscribir && !nuevoAbierto && (
          <button
            type="button"
            onClick={() => setNuevoAbierto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200"
          >
            <FiPlus size={12} /> Agregar
          </button>
        )}
      </div>

      <div className="space-y-2 px-4 py-3">
        {/* Nueva observación */}
        {nuevoAbierto && (
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-500/30 dark:bg-blue-500/5">
            <textarea
              autoFocus
              value={nuevo.texto}
              onChange={(e) => setNuevo({ ...nuevo, texto: e.target.value })}
              rows={2}
              placeholder="Escribe la observación..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-50"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <SelectorTipo value={nuevo.tipo} onChange={(tipo) => setNuevo({ ...nuevo, tipo })} />
                <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">
                  <input
                    type="checkbox"
                    checked={nuevo.fijada}
                    onChange={(e) => setNuevo({ ...nuevo, fijada: e.target.checked })}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  Fijar arriba
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNuevoAbierto(false)}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={guardando || !nuevo.texto.trim()}
                  onClick={() => void crear()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filtro por tipo */}
        {items.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {[{ value: "TODOS" as const, label: "Todas", n: items.length }, ...TIPOS_OBSERVACION.filter((t) => conteo[t.value]).map((t) => ({ value: t.value, label: t.label, n: conteo[t.value] ?? 0 }))].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFiltro(f.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  filtro === f.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-blue-50 dark:bg-ink-black-700 dark:text-ink-black-200"
                }`}
              >
                {f.label} <span className="tabular-nums opacity-75">{f.n}</span>
              </button>
            ))}
          </div>
        )}

        {cargando ? (
          <p className="py-2 text-[12px] font-medium text-slate-400">Cargando observaciones...</p>
        ) : visibles.length === 0 ? (
          <p className="py-2 text-[12px] font-medium text-slate-400">
            {items.length === 0 ? "Sin observaciones registradas." : "No hay observaciones de este tipo."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((o) => {
              const estilo = ESTILO_TIPO[o.tipo];
              const enEdicion = editando === o.id;
              return (
                <li
                  key={o.id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    o.fijada
                      ? "border-blue-200 bg-blue-50/50 dark:border-blue-500/30 dark:bg-blue-500/5"
                      : "border-slate-100 bg-white dark:border-ink-black-700 dark:bg-ink-black-800"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {o.fijada && <BsPinFill className="text-blue-600 dark:text-blue-300" size={11} aria-label="Fijada" />}
                      {enEdicion ? (
                        <SelectorTipo value={borrador.tipo} onChange={(tipo) => setBorrador({ ...borrador, tipo })} />
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${estilo?.clase ?? ""}`}>
                          {o.tipo_label}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-400">
                        {fechaHora(o.creado_en)}
                        {o.autor_nombre ? ` · ${o.autor_nombre}` : ""}
                      </span>
                    </div>
                    {o.puede_editar && !enEdicion && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() =>
                            void ejecutar(
                              () => api.patch(`/observaciones-paciente/${o.id}/`, { fijada: !o.fijada }),
                              o.fijada ? "Observación desfijada." : "Observación fijada arriba.",
                            )
                          }
                          title={o.fijada ? "Desfijar" : "Fijar arriba"}
                          aria-label={o.fijada ? "Desfijar observación" : "Fijar observación"}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-ink-black-700"
                        >
                          {o.fijada ? <BsPinFill size={12} /> : <BsPin size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(o.id);
                            setBorrador({ texto: o.texto, tipo: o.tipo });
                            setConfirmarBorrar(null);
                          }}
                          title="Editar"
                          aria-label="Editar observación"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-ink-black-700"
                        >
                          <FiEdit2 size={12} />
                        </button>
                        {confirmarBorrar === o.id ? (
                          <button
                            type="button"
                            disabled={guardando}
                            onClick={() => {
                              setConfirmarBorrar(null);
                              void ejecutar(() => api.delete(`/observaciones-paciente/${o.id}/`), "Observación eliminada.");
                            }}
                            className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmarBorrar(o.id)}
                            title="Eliminar"
                            aria-label="Eliminar observación"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          >
                            <FiTrash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {enEdicion ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        autoFocus
                        value={borrador.texto}
                        onChange={(e) => setBorrador({ ...borrador, texto: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-50"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                        >
                          <FiX size={12} /> Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={guardando || !borrador.texto.trim()}
                          onClick={() => void guardarEdicion(o.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <FiCheck size={12} /> Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 whitespace-pre-line text-[13px] font-medium leading-relaxed text-slate-700 dark:text-ink-black-100">
                      {o.texto}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
