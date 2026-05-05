'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import type { Paciente, Usuario } from '@/lib/types'
import { getKineColor } from '@/lib/types'
import BadgePrioridad from './BadgePrioridad'

interface Props {
  pacientes: Paciente[]
  usuario: Usuario
  onRefresh: () => void
}

export default function ColaDeLlamados({ pacientes, usuario, onRefresh }: Props) {
  const [llamandoId, setLlamandoId] = useState<number | null>(null)
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const prioridadOrder: Record<string, number> = {
    ALTA: 1,
    MEDIANA: 2,
    MODERADA: 3,
    LICENCIA_MEDICA: 4,
  }

  const cola = pacientes
    .filter(
      (p) =>
        p.kine_asignado !== null &&
        ['PENDIENTE', 'RESCATE'].includes(p.estado)
    )
    .sort((a, b) => {
      const pA = prioridadOrder[a.prioridad] || 99
      const pB = prioridadOrder[b.prioridad] || 99
      if (pA !== pB) return pA - pB
      return b.dias_en_lista - a.dias_en_lista
    })

  if (!['ADMINISTRATIVO', 'ADMIN', 'KINE'].includes(usuario.rol)) {
    return (
      <div className="bg-white rounded-[10px] p-6 text-sm text-gray-500" style={{ border: '0.5px solid #a8d4f0' }}>
        Esta vista está disponible para perfil administrativo.
      </div>
    )
  }

  async function registrarLlamado(paciente: Paciente, contesto: boolean) {
    if (!contesto && paciente.estado === 'RESCATE' && !notas.trim()) {
      setError('Debe registrar una observación para egreso administrativo.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await api.post(`/pacientes/${paciente.id}/registrar-llamado/`, {
        contesto,
        notas,
      })
      setLlamandoId(null)
      setNotas('')
      onRefresh()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'detail' in e
          ? (e as { detail: string }).detail
          : 'Error al registrar contacto'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (cola.length === 0) {
    return (
      <div className="bg-white rounded-[10px] p-12 text-center text-gray-400 text-sm" style={{ border: '0.5px solid #a8d4f0' }}>
        No hay pacientes en contactabilidad.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}
      {cola.map((p) => {
        const responsableNombre = p.responsable_nombre ?? p.kine_asignado_nombre
        const kineColor = getKineColor(responsableNombre)
        const abriendo = llamandoId === p.id
        const intentoUno = p.n_intentos_contacto === 1
        const requiereNotaEgreso = p.estado === 'RESCATE'

        return (
          <div
            key={p.id}
            className="bg-white rounded-[10px] overflow-hidden"
            style={{
              border: '0.5px solid #a8d4f0',
              borderLeft: `3px solid ${kineColor}`,
            }}
          >
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-800">{p.nombre}</span>
                  <BadgePrioridad prioridad={p.prioridad} />
                  {intentoUno && (
                    <span className="rounded bg-[#FFE0B2] px-1.5 py-0.5 text-[11px] font-semibold text-[#E65100]">
                      1 intento previo
                    </span>
                  )}
                  {requiereNotaEgreso && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      Próximo: egreso administrativo
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{p.diagnostico}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: kineColor }}
                    />
                    {responsableNombre ?? '—'}
                  </span>
                  <span className={p.dias_en_lista > 90 ? 'text-red-500 font-semibold' : ''}>
                    {p.dias_en_lista} días
                  </span>
                </div>
              </div>

              <div className="flex-shrink-0 text-right">
                <div className="mb-1 flex justify-end gap-1">
                  <IntentoDot filled={p.n_intentos_contacto >= 1} />
                  <IntentoDot filled={p.n_intentos_contacto >= 2} />
                </div>
              </div>

              {!abriendo && (
                <button
                  onClick={() => {
                    setLlamandoId(p.id)
                    setNotas('')
                    setError('')
                  }}
                  className="flex-shrink-0 bg-verde-ccr text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-900 transition"
                >
                  Contactar
                </button>
              )}
            </div>

            {abriendo && (
              <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-2">
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder={
                    requiereNotaEgreso
                      ? "Observación obligatoria para egreso administrativo..."
                      : "Observación operativa del contacto (opcional)..."
                  }
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-verde-ccr resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => registrarLlamado(p, true)}
                    disabled={loading}
                    className="flex-1 bg-[#1B5E3B] text-white rounded-lg py-2 text-xs font-semibold hover:bg-[#256B47] disabled:opacity-60"
                  >
                    Contestó y confirma
                  </button>
                  <button
                    onClick={() => registrarLlamado(p, false)}
                    disabled={loading}
                    className={`flex-1 text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-60 ${
                      requiereNotaEgreso
                        ? 'bg-slate-700 hover:bg-slate-800'
                        : 'bg-orange-500 hover:bg-orange-600'
                    }`}
                  >
                    No contestó
                  </button>
                  <button
                    onClick={() => setLlamandoId(null)}
                    className="px-3 py-2 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IntentoDot({ filled }: { filled: boolean }) {
  return (
    <span
      className="inline-flex h-2.5 w-2.5 rounded-full border"
      style={{
        backgroundColor: filled ? '#E65100' : '#FFFFFF',
        borderColor: filled ? '#E65100' : '#9CA3AF',
      }}
      aria-hidden
    />
  )
}
