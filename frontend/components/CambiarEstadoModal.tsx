"use client";

import { useMemo, useState } from "react";
import type { Estado, Paciente, Rol } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import BadgeEstado from "./BadgeEstado";

const ESTADOS_NOTA_OBLIGATORIA = new Set<Estado>([
  "ABANDONO",
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "DERIVADO",
]);

const ESTADOS_EGRESO = new Set<Estado>([
  "ABANDONO",
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "DERIVADO",
]);

const ESTADO_DESCRIPTIONS: Partial<Record<Estado, string>> = {
  PENDIENTE: "Paciente en espera de contacto.",
  INGRESADO: "Paciente asistió a la CCR.",
  RESCATE: "Se requiere un nuevo esfuerzo de contacto.",
  ABANDONO: "El paciente abandonó el tratamiento. Requiere notas.",
  ALTA_MEDICA: "Alta médica dada por el profesional. Requiere notas.",
  EGRESO_VOLUNTARIO:
    "El paciente decidió terminar por voluntad propia. Requiere notas.",
  DERIVADO: "Cierre por derivación a otro dispositivo. Requiere notas.",
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
      return ["INGRESADO", "RESCATE"] as Estado[];
    }

    if (ESTADOS_EGRESO.has(paciente.estado)) {
      return ["PENDIENTE", "INGRESADO", "RESCATE"] as Estado[];
    }

    if (paciente.estado === "PENDIENTE") {
      return ["INGRESADO", "RESCATE"] as Estado[];
    }

    if (paciente.estado === "RESCATE") {
      return ["INGRESADO", "PENDIENTE"] as Estado[];
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

  const notaObligatoria = estadoNuevo
    ? ESTADOS_NOTA_OBLIGATORIA.has(estadoNuevo) || ESTADOS_EGRESO.has(paciente.estado)
    : false;
  const esEgreso =
    estadoNuevo &&
    ["ABANDONO", "ALTA_MEDICA", "EGRESO_VOLUNTARIO", "DERIVADO"].includes(estadoNuevo);

  async function handleConfirm() {
    if (!estadoNuevo) {
      setError("Selecciona un estado para continuar.");
      return;
    }
    if (notaObligatoria && !notas.trim()) {
      setError("Las notas son obligatorias para este tipo de egreso.");
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-4 backdrop-blur-sm dark:bg-black/75"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-[#2a2a2a] dark:bg-[#111111]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-6 py-4 dark:border-[#2a2a2a] dark:bg-[#181818]">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            Cambiar Estado del Paciente
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-[#a3a3a3]">
            <span className="font-semibold text-gray-700 dark:text-[#ecf5f8]">
              {paciente.nombre}
            </span>
            {" — "}
            <span className="font-mono">{paciente.id_ccr}</span>
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {/* Current state */}
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-[#2a2a2a] dark:bg-[#181818]">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-[#a3a3a3]">
              Estado actual
            </span>
            <BadgeEstado estado={paciente.estado} />
          </div>

          {/* State selector */}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-[#ecf5f8]">
              Nuevo Estado
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {estadosPermitidos
                .filter((e) => e !== paciente.estado)
                .map((estado) => (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => setEstadoNuevo(estado)}
                    className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition border-2 ${
                      estadoNuevo === estado
                        ? "border-[#335fdb] bg-[#335fdb] text-white shadow-sm"
                        : "border-gray-100 bg-white text-gray-600 hover:border-[#2694d9] hover:bg-blue-50 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-[#ecf5f8] dark:hover:border-[#335fdb] dark:hover:bg-[#202020]"
                    }`}
                  >
                    {ESTADO_LABELS[estado]}
                    {ESTADOS_NOTA_OBLIGATORIA.has(estado) && (
                      <span className="ml-1 text-[10px] font-normal text-orange-500 dark:text-amber-300">
                        * notas requeridas
                      </span>
                    )}
                  </button>
                ))}
            </div>
            {estadoNuevo && ESTADO_DESCRIPTIONS[estadoNuevo] && (
              <p className="mt-2 text-[11px] italic text-gray-500 dark:text-[#a3a3a3]">
                {ESTADO_DESCRIPTIONS[estadoNuevo]}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-[#ecf5f8]">
              Notas{" "}
              {notaObligatoria ? (
                <span className="text-orange-500 dark:text-amber-300">*</span>
              ) : (
                <span className="text-gray-300 dark:text-[#6b7280]">(opcional)</span>
              )}
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder={
                notaObligatoria
                  ? `Describe el motivo del ${esEgreso ? "egreso" : "cambio de estado"}…`
                  : "Notas adicionales (opcional)"
              }
              className={`w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 dark:placeholder:text-[#6b7280] ${
                notaObligatoria && !notas.trim()
                  ? "border-orange-300 bg-orange-50 text-gray-900 focus:border-orange-500 dark:border-amber-700/70 dark:bg-amber-950/25 dark:text-white"
                  : "border-gray-200 bg-white text-gray-900 focus:border-[#2694d9] dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-white"
              }`}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-[#2a2a2a] dark:bg-[#181818] sm:flex-row">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !estadoNuevo}
            className="flex-1 rounded-xl bg-[#335fdb] py-2.5 text-sm font-bold text-white transition hover:bg-[#284fc0] disabled:cursor-not-allowed disabled:bg-[#263f88] disabled:text-white/65"
          >
            {loading
              ? "Guardando…"
              : `Confirmar → ${estadoNuevo ? ESTADO_LABELS[estadoNuevo] : "..."}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-[#ecf5f8] dark:hover:bg-[#242424]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
