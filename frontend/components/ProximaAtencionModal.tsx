"use client";

import { useMemo, useState } from "react";
import type { Paciente } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { motion } from "framer-motion";
import { FiCalendar, FiClock, FiX, FiCheck, FiTrash2, FiRefreshCw, FiUser } from "react-icons/fi";

interface Props {
  paciente: Paciente;
  fechaInicial?: string;
  onClose: () => void;
  onConfirm: (fechaHora: string) => Promise<void>;
  onClear?: () => Promise<void>;
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fechaHoraLocalDefault() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 22, stiffness: 280 },
  },
  exit: { opacity: 0, scale: 0.98, y: 8 },
};

export default function ProximaAtencionModal({
  paciente,
  fechaInicial,
  onClose,
  onConfirm,
  onClear,
}: Props) {
  const [fechaHora, setFechaHora] = useState(
    toInputDateTime(fechaInicial) ||
      toInputDateTime(paciente.proxima_atencion) ||
      fechaHoraLocalDefault(),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fechaActual = useMemo(() => paciente.proxima_atencion ?? "", [paciente.proxima_atencion]);

  async function handleConfirm() {
    if (!fechaHora) {
      setError("Selecciona fecha y hora para continuar.");
      return;
    }
    const isoValue = new Date(fechaHora).toISOString();
    setLoading(true);
    setError("");
    try {
      await onConfirm(isoValue);
      onClose();
    } catch (e: unknown) {
      const errorData = e as { detail?: string };
      setError(errorData.detail || "Error al programar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!onClear) return;
    setLoading(true);
    setError("");
    try {
      await onClear();
      onClose();
    } catch {
      setError("No se pudo eliminar.");
    } finally {
      setLoading(false);
    }
  }

  function aplicarHorarioRapido(hora: string) {
    const base = fechaHora || fechaHoraLocalDefault();
    setFechaHora(`${base.slice(0, 10)}T${hora}`);
  }

  return (
    <motion.div
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        variants={modalVariants}
        className="ccr-schedule-modal relative w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_26px_64px_-30px_rgba(15,23,42,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="ccr-control-button absolute right-4 top-4 z-20 p-2"
          aria-label="Cerrar"
        >
          <FiX size={18} />
        </button>

        <div className="grid md:grid-cols-[34%_66%]">
          <aside className="ccr-schedule-modal-side border-b border-slate-200 bg-[linear-gradient(180deg,#ecf5f8_0%,#F8FBFF_100%)] p-6 md:border-b-0 md:border-r">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <FiCalendar size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Agenda clínica</p>
                <h3 className="text-lg font-black text-slate-900">Programar atención</h3>
              </div>
            </div>

            <div className="ccr-schedule-modal-card rounded-lg border border-blue-100 bg-white p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-500">
                <FiUser size={14} />
                <p className="text-[11px] font-bold uppercase tracking-wide">Paciente</p>
              </div>
              <p className="text-sm font-black leading-tight text-slate-900">{paciente.nombre}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{formatearRut(paciente.rut)}</p>
              {fechaActual && (
                <span className="mt-3 inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  Ya agendada
                </span>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Horarios sugeridos</p>
              <div className="grid grid-cols-3 gap-2">
                {["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => aplicarHorarioRapido(h)}
                    className="ccr-control-button px-2 py-1.5 text-[11px]"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="ccr-schedule-modal-main p-6 md:p-7">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {error}
              </div>
            )}

            <label className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
              <FiClock size={13} /> Fecha y hora de atención
            </label>
            <input
              type="datetime-local"
              value={fechaHora}
              onChange={(e) => setFechaHora(e.target.value)}
              className="ccr-control-input w-full px-4 py-3 text-sm font-semibold"
            />

            <p className="mt-3 text-xs text-slate-500">
              Al confirmar, el paciente quedará con esta cita programada en calendario.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="ccr-control-button px-4 py-2.5 text-xs"
                >
                  Cancelar
                </button>
                {onClear && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="ccr-table-action ccr-action-danger px-4 py-2.5 text-xs"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <FiTrash2 size={12} /> Eliminar
                    </span>
                  </button>
                )}
              </div>

              <button
                onClick={handleConfirm}
                disabled={loading}
                className="ccr-control-button ccr-control-button-primary px-5 py-2.5 text-sm disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  {loading ? <FiRefreshCw className="animate-spin" size={14} /> : <FiCheck size={15} />}
                  {loading ? "Guardando..." : "Confirmar cita"}
                </span>
              </button>
            </div>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
