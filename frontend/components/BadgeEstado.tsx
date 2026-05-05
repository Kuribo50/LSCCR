import type { Estado } from '@/lib/types'
import { ESTADO_LABELS } from '@/lib/types'

const ESTILOS: Record<Estado, { bg: string; color: string }> = {
  PENDIENTE: { bg: '#feeecd', color: '#976502' },
  INGRESADO: { bg: '#cffce5', color: '#066031' },
  RESCATE: { bg: '#fff6e6', color: '#ca8702' },
  ABANDONO: { bg: '#ffe6e6', color: '#970502' },
  ALTA_MEDICA: { bg: '#ffe6e6', color: '#970502' },
  EGRESO_VOLUNTARIO: { bg: '#ffe6e6', color: '#970502' },
  EGRESO_ADMINISTRATIVO: { bg: '#e2e8f0', color: '#334155' },
  DERIVADO: { bg: '#ffe6e6', color: '#970502' },
}

export default function BadgeEstado({ estado }: { estado: Estado }) {
  const { bg, color } = ESTILOS[estado] ?? { bg: '#F5F5F5', color: '#616161' }
  return (
    <span
      className="inline-block rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold leading-tight whitespace-nowrap"
      style={{ backgroundColor: bg, color }}
    >
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  )
}
