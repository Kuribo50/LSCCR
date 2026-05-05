"use client";

import { useMemo, useState } from "react";
import type { Estado, Paciente, Rol } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import BadgeEstado from "./BadgeEstado";

const ESTADOS_NOTA_OBLIGATORIA = new Set<Estado>([
  "ABANDONO",
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "EGRESO_ADMINISTRATIVO",
  "DERIVADO",
]);

const ESTADOS_EGRESO = new Set<Estado>([
  "ABANDONO",
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "EGRESO_ADMINISTRATIVO",
  "DERIVADO",
]);

const ESTADO_DESCRIPCIONES: Partial<Record<Estado, string>> = {
  PENDIENTE: "Retoma seguimiento para nuevo intento de contacto.",
  INGRESADO: "Paciente confirma asistencia e inicia seguimiento CCR.",
  RESCATE: "Contactabilidad fallida antes del ingreso.",
  ABANDONO: "Cierre posterior al ingreso por abandono evaluado.",
  ALTA_MEDICA: "Cierre por alta indicada por el profesional.",
  EGRESO_VOLUNTARIO: "Cierre porque el paciente decide terminar el proceso.",
  EGRESO_ADMINISTRATIVO: "Cierre operativo por contactabilidad fallida antes del ingreso.",
  DERIVADO: "Cierre por derivacion a otro dispositivo o nivel de atencion.",
};

interface Props {
  paciente: Paciente;
  rol: Rol;
  onClose: () => void;
  onConfirm: (estado: Estado, notas: string) => Promise<void>;
}

export default function CambiarEstadoModal({
  paciente,
  rol,
  onClose,
  onConfirm,
}: Props) {
  const [estadoNuevo, setEstadoNuevo] = useState<Estado | "">("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const estadosPermitidos = useMemo(() => {
    if (rol === "ADMINISTRATIVO") {
      return ["INGRESADO", "RESCATE", "EGRESO_ADMINISTRATIVO"] as Estado[];
    }

    if (ESTADOS_EGRESO.has(paciente.estado)) {
      return ["PENDIENTE", "INGRESADO", "RESCATE"] as Estado[];
    }

    if (paciente.estado === "PENDIENTE") {
      return ["INGRESADO", "RESCATE"] as Estado[];
    }

    if (paciente.estado === "RESCATE") {
      return ["INGRESADO", "EGRESO_ADMINISTRATIVO", "PENDIENTE"] as Estado[];
    }

    if (paciente.estado === "INGRESADO") {
      return [
        "ALTA_MEDICA",
        "EGRESO_VOLUNTARIO",
        "DERIVADO",
        "ABANDONO",
      ] as Estado[];
    }

    return [] as Estado[];
  }, [paciente.estado, rol]);

  const requiereNota = estadoNuevo
    ? ESTADOS_NOTA_OBLIGATORIA.has(estadoNuevo) ||
      ESTADOS_EGRESO.has(paciente.estado)
    : false;
  const puedeConfirmar = Boolean(estadoNuevo) && (!requiereNota || Boolean(notas.trim()));

  async function handleConfirm() {
    if (!estadoNuevo) {
      setError("Selecciona un estado para continuar.");
      return;
    }
    if (requiereNota && !notas.trim()) {
      setError("Las notas son obligatorias para este cambio de estado.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onConfirm(estadoNuevo, notas.trim());
      onClose();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "detail" in e
          ? (e as { detail: string }).detail
          : "No se pudo cambiar el estado.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#D4E4D4] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado del modal */}
        <div className="shrink-0 border-b border-[#D4E4D4] bg-[#E7F3EC] px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B5E3B]">
                Cambiar estado operativo
              </p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">
                {paciente.id_ccr} · {paciente.nombre}
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-600">
                RUT {paciente.rut ? formatearRut(paciente.rut) : "No registrado"}
              </p>
            </div>
            <BadgeEstado estado={paciente.estado} />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {/* Estado actual del paciente */}
          <div className="rounded-lg border border-[#D4E4D4] bg-white px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
              Vista previa
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <BadgeEstado estado={paciente.estado} />
              <span className="text-sm font-semibold text-slate-400">→</span>
              {estadoNuevo ? (
                <BadgeEstado estado={estadoNuevo} />
              ) : (
                <span className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-500">
                  Selecciona nuevo estado
                </span>
              )}
            </div>
          </div>

          {/* Opciones de cambio permitidas */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-slate-600">
              Nuevo estado
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {estadosPermitidos
                .filter((estado) => estado !== paciente.estado)
                .map((estado) => {
                  const notaEstado =
                    ESTADOS_NOTA_OBLIGATORIA.has(estado) ||
                    ESTADOS_EGRESO.has(paciente.estado);
                  const seleccionado = estadoNuevo === estado;

                  return (
                    <button
                      key={estado}
                      type="button"
                      onClick={() => {
                        setEstadoNuevo(estado);
                        setError("");
                      }}
                      className={`rounded-lg border p-4 text-left transition ${
                        seleccionado
                          ? "border-[#1B5E3B] bg-[#E7F3EC] shadow-sm"
                          : "border-[#D4E4D4] bg-white hover:border-[#256B47] hover:bg-[#F4FAF6]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {ESTADO_LABELS[estado]}
                        </span>
                        {notaEstado && (
                          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                            Requiere nota
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {ESTADO_DESCRIPCIONES[estado] ?? "Cambio de estado operativo."}
                      </p>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Notas del cambio */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.06em] text-slate-600">
              Notas{" "}
              {requiereNota ? (
                <span className="text-amber-700">*</span>
              ) : (
                <span className="text-slate-400">(opcional)</span>
              )}
            </label>
            <textarea
              value={notas}
              onChange={(e) => {
                setNotas(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              placeholder={
                requiereNota
                  ? "Describe el motivo del cambio para mantener trazabilidad."
                  : "Notas adicionales del cambio."
              }
              className={`w-full resize-none rounded-lg border px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 ${
                requiereNota && !notas.trim()
                  ? "border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  : "border-slate-200 bg-white focus:border-[#1B5E3B] focus:ring-2 focus:ring-[#E7F3EC]"
              }`}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Acciones del modal */}
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-[#D4E4D4] bg-slate-50 px-6 py-4 sm:flex-row">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !puedeConfirmar}
            className="flex-1 rounded-lg bg-[#1B5E3B] py-2.5 text-sm font-bold text-white transition hover:bg-[#256B47] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {loading ? "Guardando..." : "Confirmar cambio"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
