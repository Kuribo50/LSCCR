"use client";

// Ventana para mantener el catálogo de diagnósticos: buscar, agregar, corregir y borrar.
// Corregir un nombre también lo cambia en los pacientes que lo tienen escrito igual;
// si el nombre corregido ya existe, los dos quedan unidos en uno.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiAlertTriangle, FiEdit2, FiPlus, FiSearch, FiTrash2, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { normalizeSearchText } from "@/lib/utils";

export interface Diagnostico {
  id: number;
  nombre: string;
  usos?: number;
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
  const q = normalizeSearchText(busqueda);
  const visibles = q ? diagnosticos.filter((d) => normalizeSearchText(d.nombre).includes(q)) : diagnosticos;

  async function agregar() {
    if (!nuevo.trim()) return;
    try {
      const d = await api.post<Diagnostico>("/diagnosticos/", { nombre: nuevo });
      toast.success(`${d.nombre} agregado.`);
      setNuevo("");
      onCambio();
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
      onCambio();
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
                <Fila key={`${d.id}-${d.nombre}`} diagnostico={d} onCambio={onCambio} onBorrar={setABorrar} />
              ))}
              {visibles.length === 0 && <li className="px-5 py-8 text-center text-xs text-slate-500">Sin resultados.</li>}
            </ul>

            <footer className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500 dark:border-ink-black-700 dark:text-ink-black-300">
              {visibles.length === diagnosticos.length ? `${diagnosticos.length} diagnósticos` : `${visibles.length} de ${diagnosticos.length} diagnósticos`}
            </footer>

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
