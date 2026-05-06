"use client";

import { useState } from "react";
import { FiAlertTriangle, FiCalendar, FiRefreshCw, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type { InasistenciaPaciente, Paciente } from "@/lib/types";

interface RegistrarInasistenciaResponse {
  inasistencia: InasistenciaPaciente;
  paciente: Paciente;
  alerta_abandono: boolean;
  mensaje: string;
}

interface Props {
  paciente: Paciente;
  onClose: () => void;
  onSuccess: (paciente: Paciente) => void;
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarInasistenciaModal({
  paciente,
  onClose,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(fechaHoy());
  const [justificada, setJustificada] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alerta, setAlerta] = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setAlerta("");
    try {
      const response = await api.post<RegistrarInasistenciaResponse>(
        `/pacientes/${paciente.id}/registrar-inasistencia/`,
        { fecha, justificada, motivo },
      );
      onSuccess(response.paciente);
      if (response.alerta_abandono) {
        const mensaje =
          response.mensaje ||
          "Paciente tiene 2 inasistencias no justificadas. Evaluar marcar como ABANDONO.";
        setAlerta(mensaje);
        toast.warning(mensaje);
        return;
      }
      toast.success("Inasistencia registrada correctamente.");
      onClose();
    } catch (e: unknown) {
      const detail = getErrorMessage(e, "No se pudo registrar la inasistencia.");
      setError(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-blue-700">
              <FiCalendar size={14} />
              Ficha operativa
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              Registrar inasistencia
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {paciente.nombre} · {paciente.id_ccr}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Cerrar"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          {alerta && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <div className="flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                <span>{alerta}</span>
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.05em] text-slate-600">
              Fecha
            </span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="ccr-control-input w-full px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={justificada}
              onChange={(e) => setJustificada(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#335FDB] focus:ring-[#335FDB]"
            />
            Inasistencia justificada
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.05em] text-slate-600">
              Motivo recomendado
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="No asiste a sesión programada"
              className="ccr-control-input w-full resize-none px-3 py-2 text-sm"
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="ccr-control-button px-4 py-2 text-xs disabled:opacity-50"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !fecha}
              className="inline-flex items-center gap-2 rounded-md bg-[#335FDB] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-60"
            >
              {loading ? <FiRefreshCw className="animate-spin" size={13} /> : <FiCalendar size={13} />}
              {loading ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
