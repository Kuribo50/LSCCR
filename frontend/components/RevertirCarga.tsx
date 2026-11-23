"use client";

// Botón "Revertir carga" con cuenta regresiva. Una carga se puede revertir
// durante 10 minutos desde que se subió (backend: apps/importar/reversion.py);
// al vencer el plazo el botón desaparece y la carga queda consolidada.

import { useEffect, useState } from "react";
import { FiRotateCcw } from "react-icons/fi";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";

function restante(hasta: string, ahora: number) {
  return Math.max(0, Math.floor((Date.parse(hasta) - ahora) / 1000));
}

export function formatoRestante(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Segundos que quedan para `hasta`, actualizado cada segundo. */
export function useSegundosRestantes(hasta: string | undefined) {
  const [ahora, setAhora] = useState(() => Date.now());
  const segundos = hasta ? restante(hasta, ahora) : 0;
  useEffect(() => {
    if (!hasta || segundos <= 0) return;
    const t = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [hasta, segundos]);
  return segundos;
}

export default function RevertirCarga({
  corteId,
  hasta,
  descripcion,
  onRevertida,
  compacto = false,
}: {
  corteId: number;
  hasta: string;
  /** Qué se va a revertir, para el diálogo ("Noviembre 2026 · derivaciones.xlsx"). */
  descripcion: string;
  onRevertida: () => void;
  compacto?: boolean;
}) {
  const { toast } = useToast();
  const segundos = useSegundosRestantes(hasta);
  const [confirmando, setConfirmando] = useState(false);
  const [revirtiendo, setRevirtiendo] = useState(false);

  if (segundos <= 0) return null;

  async function revertir() {
    setRevirtiendo(true);
    try {
      const data = await api.delete<{ pacientes_eliminados: number }>(`/importar/historial/corte/${corteId}/`);
      toast.success(
        data.pacientes_eliminados === 1
          ? "Carga revertida: se quitó 1 paciente."
          : `Carga revertida: se quitaron ${data.pacientes_eliminados} pacientes.`,
      );
      setConfirmando(false);
      onRevertida();
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "No se pudo revertir la carga."));
    } finally {
      setRevirtiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className={`ccr-control-button inline-flex items-center gap-1.5 border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-400/30 dark:text-amber-200 dark:hover:bg-amber-400/10 ${compacto ? "px-2.5 py-1 text-[11px]" : ""}`}
        title="Disponible solo durante 10 minutos desde la carga"
      >
        <FiRotateCcw size={compacto ? 12 : 13} aria-hidden="true" />
        Revertir carga
        <span className="tabular-nums opacity-75">{formatoRestante(segundos)}</span>
      </button>
      <ConfirmDialog
        isOpen={confirmando}
        onCancel={() => setConfirmando(false)}
        onConfirm={() => void revertir()}
        title="¿Revertir esta carga?"
        message={`${descripcion}. Se quitarán los pacientes que creó y se deshará lo que cambió en pacientes que ya estaban (meses de espera, diagnóstico y teléfonos). Quedan ${formatoRestante(segundos)} para hacerlo.`}
        confirmLabel="Revertir carga"
        variant="warning"
        loading={revirtiendo}
      />
    </>
  );
}
