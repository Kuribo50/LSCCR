import type { Prioridad } from '@/lib/types'
import { PRIORIDAD_LABELS } from '@/lib/types'

const ESTILOS: Record<Prioridad, { bg: string; color: string }> = {
  ALTA:           { bg: '#ffe6e6', color: '#970502' },
  MEDIANA:        { bg: '#fff6e6', color: '#976502' },
  MODERADA:       { bg: '#cffce5', color: '#066031' },
  LICENCIA_MEDICA:{ bg: '#F1F5F9', color: '#334155' },
}

export default function BadgePrioridad({ prioridad }: { prioridad: Prioridad }) {
  const { bg, color } = ESTILOS[prioridad] ?? { bg: '#F5F5F5', color: '#616161' }
  return (
    <span
      className="inline-block rounded-md border border-black/5 px-2 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap"
      style={{ backgroundColor: bg, color }}
    >
      {PRIORIDAD_LABELS[prioridad] ?? prioridad}
    </span>
  )
}
