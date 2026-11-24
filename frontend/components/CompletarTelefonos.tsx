"use client";

// Completa teléfonos de pacientes desde un Excel de RUT + teléfono.
// Las planillas de derivación no traen teléfono: este panel es la vía para
// cargarlos en bloque. Primero previsualiza y solo guarda al confirmar; el
// backend nunca pisa un teléfono que ya existe.

import { useRef, useState } from "react";
import { FiCheckCircle, FiDownload, FiPhone, FiUploadCloud, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type { CompletarTelefonosResultado, ResultadoTelefono } from "@/lib/types";

const ETIQUETAS: Record<ResultadoTelefono, { label: string; clase: string }> = {
  ACTUALIZADO: { label: "Se completa", clase: "border-green-200 bg-green-50 text-green-800" },
  SIN_CAMBIOS: { label: "Sin cambios", clase: "border-slate-200 bg-slate-50 text-slate-600" },
  CONFLICTO: { label: "Ya tiene otro", clase: "border-amber-200 bg-amber-50 text-amber-800" },
  NO_ENCONTRADO: { label: "RUT no encontrado", clase: "border-slate-200 bg-slate-50 text-slate-600" },
  INVALIDO: { label: "Inválido", clase: "border-red-200 bg-red-50 text-red-700" },
};

const METRICAS: { key: keyof CompletarTelefonosResultado; label: string; resultado: ResultadoTelefono }[] = [
  { key: "actualizados", label: "Se completan", resultado: "ACTUALIZADO" },
  { key: "sin_cambios", label: "Sin cambios", resultado: "SIN_CAMBIOS" },
  { key: "conflictos", label: "Ya tienen otro", resultado: "CONFLICTO" },
  { key: "no_encontrados", label: "RUT no encontrado", resultado: "NO_ENCONTRADO" },
  { key: "invalidos", label: "Inválidos", resultado: "INVALIDO" },
];

export default function CompletarTelefonos() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<CompletarTelefonosResultado | null>(null);
  const [cargando, setCargando] = useState<"previa" | "aplicar" | "plantilla" | null>(null);
  const [error, setError] = useState("");

  async function enviar(file: File, aplicar: boolean) {
    setCargando(aplicar ? "aplicar" : "previa");
    setError("");
    try {
      const form = new FormData();
      form.append("archivo", file);
      form.append("aplicar", aplicar ? "true" : "false");
      const data = await api.postForm<CompletarTelefonosResultado>("/importar/telefonos/", form);
      setResultado(data);
      if (aplicar) {
        toast.success(
          data.actualizados === 1
            ? "Se completó el teléfono de 1 paciente."
            : `Se completaron los teléfonos de ${data.actualizados} pacientes.`,
        );
      }
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo leer el archivo de teléfonos.");
      setError(message);
      setResultado(null);
      toast.error(message);
    } finally {
      setCargando(null);
    }
  }

  function elegirArchivo(file: File | undefined) {
    if (!file) return;
    setArchivo(file);
    void enviar(file, false);
  }

  function limpiar() {
    setArchivo(null);
    setResultado(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function descargarPlantilla() {
    setCargando("plantilla");
    try {
      const blob = await api.getBlob("/importar/telefonos/plantilla/");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Completar_Telefonos_CCR.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "No se pudo descargar la planilla."));
    } finally {
      setCargando(null);
    }
  }

  const pendientesDeAplicar = resultado && !resultado.aplicado ? resultado.actualizados : 0;
  const filasConAviso = resultado?.detalle.filter((d) => d.resultado !== "SIN_CAMBIOS") ?? [];

  return (
    <section id="telefonos" className="ccr-panel ccr-dashboard-card scroll-mt-4 rounded-xl p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:!text-white">
            <FiPhone size={16} />
            Completar teléfonos
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-ink-black-200">
            Sube un Excel con columnas RUT y TELEFONO (opcional TELEFONO RECADOS). Solo se llenan
            teléfonos vacíos; un número ya registrado nunca se reemplaza.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void descargarPlantilla()}
          disabled={cargando !== null}
          className="ccr-control-button inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiDownload size={14} />
          {cargando === "plantilla" ? "Descargando..." : "Pacientes sin teléfono .xlsx"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="ccr-control-button inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-2 text-xs">
          <FiUploadCloud size={14} />
          {archivo ? "Cambiar archivo" : "Elegir Excel"}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(e) => elegirArchivo(e.target.files?.[0])}
          />
        </label>
        {archivo && (
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600 dark:!text-ink-black-200">
            <span className="truncate">{archivo.name}</span>
            <button type="button" onClick={limpiar} aria-label="Quitar archivo" className="rounded p-1 hover:bg-slate-100 dark:hover:!bg-[#202020]">
              <FiX size={13} />
            </button>
          </span>
        )}
        {cargando === "previa" && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Revisando archivo...</span>}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
      )}

      {resultado && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {METRICAS.map((m) => (
              <div key={m.key} className={`rounded-lg border px-3 py-2 ${ETIQUETAS[m.resultado].clase}`}>
                <p className="text-lg font-black">{resultado[m.key] as number}</p>
                <p className="text-[11px] font-semibold">{m.label}</p>
              </div>
            ))}
          </div>

          {filasConAviso.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-auto">
              {filasConAviso.map((d, i) => (
                <div key={`${d.rut}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs dark:!border-[#262626] dark:!bg-[#111111]">
                  <span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-bold ${ETIQUETAS[d.resultado].clase}`}>
                    {ETIQUETAS[d.resultado].label}
                  </span>
                  {d.fila != null && <span className="font-mono text-slate-500 dark:text-slate-400">Fila {d.fila}</span>}
                  <span className="font-semibold text-slate-800 dark:!text-white">{d.nombre ?? d.rut}</span>
                  {d.telefono && <span className="font-mono text-slate-600 dark:!text-ink-black-200">{d.telefono}</span>}
                  <span className="text-slate-500 dark:!text-ink-black-300">{d.motivo}</span>
                </div>
              ))}
            </div>
          )}

          {resultado.aplicado ? (
            <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
              <FiCheckCircle size={14} />
              Teléfonos guardados. Ya aparecen en la cola de llamados.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-slate-500 dark:!text-ink-black-200">
                Previsualización: todavía no se guardó nada.
              </p>
              <button
                type="button"
                disabled={!archivo || pendientesDeAplicar === 0 || cargando !== null}
                onClick={() => archivo && void enviar(archivo, true)}
                className="ccr-control-button ccr-control-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiCheckCircle size={14} />
                {cargando === "aplicar"
                  ? "Guardando..."
                  : pendientesDeAplicar === 1
                    ? "Completar 1 paciente"
                    : `Completar ${pendientesDeAplicar} pacientes`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
