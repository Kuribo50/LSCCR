"use client";

import { useState } from "react";
import { FiPhone, FiX } from "react-icons/fi";
import type { Paciente } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { api } from "@/lib/api";

function fechaHoraLocalDefault() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

interface Props {
  paciente: Paciente;
  onClose: () => void;
  onSuccess: (paciente?: Paciente) => void;
}

export default function RegistrarContactoModal({
  paciente,
  onClose,
  onSuccess,
}: Props) {
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [showScheduler, setShowScheduler] = useState(false);
  const [fechaHora, setFechaHora] = useState(fechaHoraLocalDefault());

  async function handleSubmit(contesto: boolean) {
    if (contesto && !fechaHora) {
      setError("Selecciona fecha y hora para programar la atención.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      let actualizado = await api.post<Paciente>(`/pacientes/${paciente.id}/registrar-llamado/`, {
        contesto,
        notas,
        telefono_usado: paciente.telefono || paciente.telefono_recados || "",
      });

      if (contesto && fechaHora) {
        const isoValue = new Date(fechaHora).toISOString();
        actualizado = await api.post<Paciente>(`/pacientes/${paciente.id}/programar-atencion/`, {
          fecha_hora: isoValue,
        });
      }

      const mensaje =
        actualizado.estado === "INGRESADO"
          ? "Contacto confirmado. Paciente pasa a INGRESADO."
          : actualizado.estado === "RESCATE"
            ? "Segundo intento fallido. Paciente pasa a RESCATE."
            : "Llamado registrado.";
      setSuccess(mensaje);
      onSuccess(actualizado);
      window.setTimeout(onClose, 900);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "detail" in e
          ? (e as { detail: string }).detail
          : "Error al registrar contacto";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function aplicarHorarioRapido(hora: string) {
    const base = fechaHora || fechaHoraLocalDefault();
    const fecha = base.slice(0, 10);
    setFechaHora(`${fecha}T${hora}`);
  }

  const intentoUno = paciente.n_intentos_contacto === 1;
  const intentoDosOMas = paciente.n_intentos_contacto >= 2;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm dark:bg-black/70">
      <div 
        className="ccr-fade-up w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-[#2a2a2a] dark:bg-[#111111]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-4 dark:border-[#2a2a2a] dark:bg-[#181818]">
          <div className="flex items-center gap-2 text-blue-700 dark:text-white">
            <FiPhone className="text-xl" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.05em]">
              Registrar Contacto
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-blue-100 hover:text-gray-900 dark:text-[#b5d8e3] dark:hover:bg-[#242424] dark:hover:text-white"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              {success}
            </div>
          )}

          <div className="mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-white">{paciente.nombre}</h3>
            <p className="text-xs text-gray-500 dark:text-[#a3a3a3]">
              RUT: {formatearRut(paciente.rut)} • Teléfono:{" "}
              <span className="font-medium text-gray-700 dark:text-[#ecf5f8]">{paciente.telefono || "No especificado"}</span>
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-[#a3a3a3]">
              Recados:{" "}
              <span className="font-medium text-gray-700 dark:text-[#ecf5f8]">
                {paciente.telefono_recados || "No especificado"}
              </span>
            </p>
            {intentoUno && (
              <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                1 intento previo registrado
              </p>
            )}
            {intentoDosOMas && (
              <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-300">
                El próximo intento fallido mantiene al paciente en Rescate
              </p>
            )}
          </div>

          {!showScheduler ? (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-[#ecf5f8]">
                  Observaciones del llamado (opcional)
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Ej. Dejó mensaje, número equivocado, etc."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-white dark:placeholder:text-[#6b7280] dark:focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduler(true)}
                  disabled={loading}
                  className="rounded-lg bg-[#335fdb] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#284fc0] disabled:opacity-50"
                >
                  Contestó
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit(false)}
                  disabled={loading}
                  className={`rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                    intentoDosOMas ? "bg-[#D32F2F] hover:bg-red-800" : "bg-[#ED8121] hover:bg-[#C96B18]"
                  }`}
                >
                  No Contestó
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-[#2a2a2a] dark:bg-[#181818]">
                <p className="mb-2 text-xs font-semibold text-blue-700 dark:text-white">Paciente contestó</p>
                <p className="text-[11px] text-gray-600 dark:text-[#b5d8e3]">Ahora programa la fecha de su atención, el paciente pasará directo a estado INGRESADO.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#a3a3a3]">
                  Fecha y hora de atención
                </label>
                <input
                  type="datetime-local"
                  value={fechaHora}
                  onChange={(e) => setFechaHora(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#2694d9] dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-white"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => aplicarHorarioRapido("09:00")}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-white dark:bg-white dark:text-[#335fdb] dark:hover:bg-[#eef3ff]"
                  >
                    09:00
                  </button>
                  <button
                    type="button"
                    onClick={() => aplicarHorarioRapido("12:00")}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-white dark:bg-white dark:text-[#335fdb] dark:hover:bg-[#eef3ff]"
                  >
                    12:00
                  </button>
                  <button
                    type="button"
                    onClick={() => aplicarHorarioRapido("15:00")}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-white dark:bg-white dark:text-[#335fdb] dark:hover:bg-[#eef3ff]"
                  >
                    15:00
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-[#ecf5f8]">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-white dark:focus:ring-blue-500/20"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduler(false)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-[#ecf5f8] dark:hover:bg-[#242424]"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit(true)}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-[#335fdb] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#284fc0] disabled:opacity-50"
                >
                  {loading ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
