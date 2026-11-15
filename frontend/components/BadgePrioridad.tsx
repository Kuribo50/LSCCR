import type { Prioridad } from "@/lib/types";
import { PRIORIDAD_LABELS } from "@/lib/types";
import { TONO_CHIP, TONO_DOT, type Tono } from "@/lib/tonos";

const TONO_PRIORIDAD: Record<Prioridad, Tono> = {
  ALTA: "red",
  MEDIANA: "amber",
  MODERADA: "green",
  LICENCIA_MEDICA: "slate",
};

export default function BadgePrioridad({ prioridad }: { prioridad: Prioridad }) {
  const tono = TONO_PRIORIDAD[prioridad] ?? "slate";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight ${TONO_CHIP[tono]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONO_DOT[tono]}`} aria-hidden="true" />
      {PRIORIDAD_LABELS[prioridad] ?? prioridad}
    </span>
  );
}
