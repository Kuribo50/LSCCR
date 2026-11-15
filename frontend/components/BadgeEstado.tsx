import type { Estado } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import { TONO_CHIP, TONO_DOT, type Tono } from "@/lib/tonos";

const TONO_ESTADO: Record<Estado, Tono> = {
  PENDIENTE: "amber",
  INGRESADO: "green",
  RESCATE: "orange",
  ABANDONO: "red",
  ALTA_MEDICA: "red",
  EGRESO_VOLUNTARIO: "red",
  EGRESO_ADMINISTRATIVO: "slate",
  DERIVADO: "red",
};

export default function BadgeEstado({ estado }: { estado: Estado }) {
  const tono = TONO_ESTADO[estado] ?? "slate";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight ${TONO_CHIP[tono]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONO_DOT[tono]}`} aria-hidden="true" />
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  );
}
