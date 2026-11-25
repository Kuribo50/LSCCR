"use client";

// Ventana para mantener el catálogo de diagnósticos: buscar, agregar, corregir y borrar.
// Corregir un nombre también lo cambia en los pacientes que lo tienen escrito igual;
// si el nombre corregido ya existe, los dos quedan unidos en uno.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiAlertTriangle, FiCheck, FiEdit2, FiGitMerge, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useAPI } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import { normalizeSearchText } from "@/lib/utils";

export interface Diagnostico {
  id: number;
  nombre: string;
  usos?: number;
}

/** Nombres parecidos que conviene unir; `sugerido` es el que se propone conservar. */
interface GrupoDuplicado {
  sugerido: number;
  diagnosticos: Required<Diagnostico>[];
}

/** Un grupo de nombres parecidos: se elige cuál queda y se unen los demás en él. */
function GrupoDuplicados({ grupo, onUnir }: { grupo: GrupoDuplicado; onUnir: (destino: Required<Diagnostico>) => void }) {
  const [destinoId, setDestinoId] = useState(grupo.sugerido);
  const destino = grupo.diagnosticos.find((d) => d.id === destinoId) ?? grupo.diagnosticos[0];
  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-ink-black-600">
      <p className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">Elige cuál queda</p>
      <div role="radiogroup" className="flex flex-col gap-1">
        {grupo.diagnosticos.map((d) => {
          const elegido = d.id === destino.id;
          return (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={elegido}
              onClick={() => setDestinoId(d.id)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                elegido ? "bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100" : "text-slate-600 hover:bg-slate-50 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  elegido ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-ink-black-500"
                }`}
                aria-hidden="true"
              >
                {elegido && <FiCheck size={10} />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${elegido ? "font-black" : "font-semibold line-through decoration-slate-300"}`}>{d.nombre}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{pacientes(d.usos)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onUnir(destino)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
        >
          <FiGitMerge size={12} /> Unir en {destino.nombre}
        </button>
      </div>
    </li>
  );
}

const pacientes = (n: number) => `${n} ${n === 1 ? "paciente" : "pacientes"}`;

function Fila({
  diagnostico,
  onCambio,
  onBorrar,
}: {
  diagnostico: Diagnostico;
  onCambio: () => void;
  onBorrar: (d: Diagnostico) => void;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(diagnostico.nombre);
  const [guardando, setGuardando] = useState(false);
  const cambiado = texto.trim() !== "" && texto.trim().toUpperCase() !== diagnostico.nombre;
  const usos = diagnostico.usos ?? 0;

  function cancelar() {
    setTexto(diagnostico.nombre);
    setEditando(false);
  }

  async function guardar() {
    if (!cambiado) return;
    setGuardando(true);
    try {
      const r = await api.patch<Diagnostico & { pacientes_actualizados: number; unido?: boolean }>(
        `/diagnosticos/${diagnostico.id}/`,
        { nombre: texto },
      );
      toast.success(
        `${r.unido ? "Unido con" : "Corregido a"} ${r.nombre}${r.pacientes_actualizados ? ` · ${pacientes(r.pacientes_actualizados)}` : ""}.`,
      );
      onCambio();
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo corregir."));
      setGuardando(false);
    }
  }

  return (
    <li className="border-b border-slate-100 px-5 last:border-b-0 dark:border-ink-black-700">
      <div className="flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-ink-black-100" title={diagnostico.nombre}>
          {diagnostico.nombre}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-ink-black-400">{pacientes(usos)}</span>
        <button
          type="button"
          onClick={() => (editando ? cancelar() : setEditando(true))}
          aria-expanded={editando}
          aria-label={`Editar ${diagnostico.nombre}`}
          title="Editar"
          className={`rounded-md p-1.5 transition-colors ${
            editando ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-black-700"
          }`}
        >
          <FiEdit2 size={13} />
        </button>
        <button
          type="button"
          onClick={() => onBorrar(diagnostico)}
          aria-label={`Borrar ${diagnostico.nombre}`}
          title="Borrar"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
        >
          <FiTrash2 size={13} />
        </button>
      </div>

      {/* Edición desplegable bajo la fila. */}
      <AnimatePresence initial={false}>
        {editando && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
          >
            <div className="flex items-center gap-2 pb-3">
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    cancelar();
                  }
                }}
                aria-label={`Nuevo nombre para ${diagnostico.nombre}`}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold uppercase text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-white"
              />
              <button type="button" onClick={cancelar} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!cambiado || guardando}
                className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
            {/* Aviso de cuántos pacientes cambian: visible desde que se abre la edición. */}
            {usos > 0 && (
              <p
                className={`mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold ${
                  cambiado
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"
                    : "bg-slate-50 text-slate-500 dark:bg-ink-black-700/60 dark:text-ink-black-300"
                }`}
              >
                <FiAlertTriangle size={12} className="shrink-0" aria-hidden="true" />
                {cambiado
                  ? `Se editará en ${pacientes(usos)}: ${diagnostico.nombre} → ${texto.trim().toUpperCase()}.`
                  : `Al guardar se editará en ${pacientes(usos)}.`}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function AdministrarDiagnosticos({
  abierto,
  onCerrar,
  diagnosticos,
  onCambio,
}: {
  abierto: boolean;
  onCerrar: () => void;
  diagnosticos: Diagnostico[];
  onCambio: () => void;
}) {
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [aBorrar, setABorrar] = useState<Diagnostico | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [vista, setVista] = useState<"todos" | "duplicados">("todos");
  const { data: duplicados, mutate: mutarDuplicados } = useAPI<GrupoDuplicado[]>(abierto ? "/diagnosticos/duplicados/" : null);
  const [aUnir, setAUnir] = useState<{ grupo: GrupoDuplicado; destino: Required<Diagnostico> } | null>(null);
  const otrosAUnir = aUnir ? aUnir.grupo.diagnosticos.filter((d) => d.id !== aUnir.destino.id) : [];
  const pacientesAUnir = otrosAUnir.reduce((suma, d) => suma + d.usos, 0);

  function refrescar() {
    onCambio();
    void mutarDuplicados();
  }

  // Unir = corregir cada nombre del grupo hacia el elegido (el backend actualiza pacientes y une).
  async function confirmarUnir() {
    if (!aUnir) return;
    setBorrando(true);
    try {
      for (const d of otrosAUnir) {
        await api.patch(`/diagnosticos/${d.id}/`, { nombre: aUnir.destino.nombre });
      }
      toast.success(`Unidos en ${aUnir.destino.nombre}${pacientesAUnir ? ` · ${pacientes(pacientesAUnir)}` : ""}.`);
      setAUnir(null);
      refrescar();
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo unir."));
      refrescar();
    } finally {
      setBorrando(false);
    }
  }
  const q = normalizeSearchText(busqueda);
  const visibles = q ? diagnosticos.filter((d) => normalizeSearchText(d.nombre).includes(q)) : diagnosticos;

  async function agregar() {
    if (!nuevo.trim()) return;
    try {
      const d = await api.post<Diagnostico>("/diagnosticos/", { nombre: nuevo });
      toast.success(`${d.nombre} agregado.`);
      setNuevo("");
      refrescar();
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo agregar."));
    }
  }

  async function confirmarBorrar() {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await api.delete(`/diagnosticos/${aBorrar.id}/`);
      toast.info(`${aBorrar.nombre} borrado.`);
      setABorrar(null);
      refrescar();
    } catch (e) {
      toast.error(getErrorMessage(e, "No se pudo borrar."));
    } finally {
      setBorrando(false);
    }
  }

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={onCerrar}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Diagnósticos"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-[min(680px,calc(100dvh-48px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800"
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-ink-black-700">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">Diagnósticos</h2>
                <p className="text-[11px] text-slate-500 dark:text-ink-black-300">Editar también cambia a los pacientes que lo tienen.</p>
              </div>
              <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-ink-black-700">
                <FiX size={16} />
              </button>
            </header>

            {/* Pestañas: todos los diagnósticos o solo los grupos de nombres parecidos. */}
            <div role="tablist" className="flex gap-1 border-b border-slate-100 px-5 dark:border-ink-black-700">
              {(
                [
                  ["todos", `Todos · ${diagnosticos.length}`],
                  ["duplicados", `Posibles duplicados · ${duplicados?.length ?? "…"}`],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={vista === valor}
                  onClick={() => setVista(valor)}
                  className={`relative px-3 py-2.5 text-xs font-bold transition-colors ${
                    vista === valor ? "text-slate-900 dark:text-white" : "text-slate-400 hover:text-slate-700 dark:text-ink-black-400"
                  }`}
                >
                  {etiqueta}
                  {vista === valor && (
                    <motion.span layoutId="diagnosticos-pestana" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-600" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>

            {vista === "duplicados" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <p className="mb-3 text-[11px] text-slate-500 dark:text-ink-black-300">
                  Nombres parecidos (tildes, «DE» de más, plural o un error de tipeo). Al unir, los pacientes pasan al nombre que queda.
                </p>
                {!duplicados ? (
                  <div className="flex justify-center py-8">
                    <span className="d-loading d-loading-dots d-loading-md text-slate-400" aria-label="Cargando" />
                  </div>
                ) : duplicados.length === 0 ? (
                  <p className="py-8 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <FiCheck className="mr-1 inline" /> No hay nombres parecidos.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {duplicados.map((g) => (
                      <GrupoDuplicados
                        key={g.diagnosticos.map((d) => d.id).join("-")}
                        grupo={g}
                        onUnir={(destino) => setAUnir({ grupo: g, destino })}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
            <>
            <div className="grid gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-2 dark:border-ink-black-700">
              <div className="relative">
                <FiSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" aria-label="Buscar diagnóstico" className="ccr-control-input w-full pl-8 text-xs" />
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void agregar();
                }}
              >
                <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nuevo diagnóstico" aria-label="Nuevo diagnóstico" className="ccr-control-input min-w-0 flex-1 text-xs uppercase" />
                <button
                  type="submit"
                  disabled={!nuevo.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <FiPlus size={13} /> Agregar
                </button>
              </form>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visibles.map((d) => (
                // key con el nombre: al corregir, la fila se rearma con el valor nuevo.
                <Fila key={`${d.id}-${d.nombre}`} diagnostico={d} onCambio={refrescar} onBorrar={setABorrar} />
              ))}
              {visibles.length === 0 && <li className="px-5 py-8 text-center text-xs text-slate-500">Sin resultados.</li>}
            </ul>

            <footer className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500 dark:border-ink-black-700 dark:text-ink-black-300">
              {visibles.length === diagnosticos.length ? `${diagnosticos.length} diagnósticos` : `${visibles.length} de ${diagnosticos.length} diagnósticos`}
            </footer>
            </>
            )}

            {/* Confirmación de unir un grupo. */}
            <AnimatePresence>
              {aUnir && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-6"
                  onClick={() => !borrando && setAUnir(null)}
                >
                  <motion.div
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={`Unir en ${aUnir.destino.nombre}`}
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-200">
                        <FiGitMerge size={16} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">¿Unir en {aUnir.destino.nombre}?</h3>
                        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-ink-black-300">
                          {otrosAUnir.map((d) => (
                            <li key={d.id}>
                              <span className="line-through">{d.nombre}</span> → {aUnir.destino.nombre}
                            </li>
                          ))}
                        </ul>
                        {pacientesAUnir > 0 && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
                            Se editará en {pacientes(pacientesAUnir)}.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={borrando}
                        onClick={() => setAUnir(null)}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={borrando}
                        onClick={() => void confirmarUnir()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <FiGitMerge size={12} /> {borrando ? "Uniendo…" : "Unir"}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Confirmación de borrado, encima de la lista. */}
            <AnimatePresence>
              {aBorrar && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-6"
                  onClick={() => !borrando && setABorrar(null)}
                >
                  <motion.div
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={`Borrar ${aBorrar.nombre}`}
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-ink-black-600 dark:bg-ink-black-800"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200">
                        <FiAlertTriangle size={16} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white">¿Borrar {aBorrar.nombre}?</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-ink-black-300">
                          Deja de aparecer en la lista.
                          {aBorrar.usos === 1 && " El paciente que lo tiene no cambia."}
                          {(aBorrar.usos ?? 0) > 1 && ` Los ${aBorrar.usos} pacientes que lo tienen no cambian.`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={borrando}
                        onClick={() => setABorrar(null)}
                        className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-ink-black-200 dark:hover:bg-ink-black-700"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={borrando}
                        onClick={() => void confirmarBorrar()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <FiTrash2 size={12} /> {borrando ? "Borrando…" : "Borrar"}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
