'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { PerfilPaciente } from '@/lib/types'
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS, getKineRowBackground } from '@/lib/types'
import { formatearRut } from '@/lib/rut'

export default function PerfilPacientePage({ params }: { params: Promise<{ rut: string }> }) {
  const { rut } = use(params)
  const { user } = useAuth()
  const [perfil, setPerfil] = useState<PerfilPaciente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadPerfil() {
      try {
        setLoading(true)
        setError('')
        const data = await api.get<PerfilPaciente>(`/pacientes/perfil/${rut}/`)
        setPerfil(data)
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'detail' in e) {
          setError((e as { detail: string }).detail)
        } else {
          setError('Ocurrió un error al cargar el paciente.')
        }
      } finally {
        setLoading(false)
      }
    }
    void loadPerfil()
  }, [rut])

  if (!user) return null

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-sm font-medium text-gray-500">Cargando perfil...</div>
      </div>
    )
  }

  if (error || !perfil) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 pt-12">
        <p className="text-sm font-semibold text-red-600">{error || 'Paciente no encontrado.'}</p>
        <Link href="/lista-espera" className="text-sm text-[#2694d9] hover:underline">
          Volver a Lista de Espera
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header with Basic Info */}
      <div className="rounded-[10px] bg-white p-6" style={{ border: '0.5px solid #a8d4f0' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 uppercase tracking-wide">
              {perfil.nombre}
            </h1>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              RUT: <span className="font-mono">{formatearRut(perfil.rut)}</span>
            </p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Edad: <span className="font-semibold">{perfil.edad} años</span></p>
            <p>SectorCesfam: <span className="font-semibold">{perfil.sector_cesfam || 'Sin dato'}</span></p>
            <p>Sector oficial: <span className="font-semibold">{perfil.sector_oficial || 'Sin dato'}</span></p>
          </div>
        </div>
        {perfil.mayor_60 && (
          <span className="mt-4 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#F0FDF4', color: '#1B5E20' }}>
            +60 Años
          </span>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800">
          Historial de Derivaciones ({perfil.derivaciones.length})
        </h2>
        
        {perfil.derivaciones.map((derivacion) => (
          <div 
            key={derivacion.id} 
            className="overflow-hidden rounded-[10px] bg-white"
            style={{ border: '1px solid #E6EEE6' }}
          >
            {/* Derivacion Summary */}
            <div 
              className="p-5"
              style={{ backgroundColor: getKineRowBackground(derivacion.kine_asignado_nombre) }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">
                    Derivación {derivacion.id_ccr}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Fecha: <span className="font-medium text-gray-700">{derivacion.fecha_derivacion}</span> ({derivacion.dias_en_lista} días)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/60 px-3 py-1 text-[11px] font-semibold text-gray-700 shadow-sm border border-black/5">
                    {ESTADO_LABELS[derivacion.estado]}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide border shadow-sm ${
                    derivacion.prioridad === 'ALTA' 
                      ? 'bg-red-50 text-red-700 border-red-200' 
                      : derivacion.prioridad === 'MEDIANA' 
                      ? 'bg-amber-50 text-amber-700 border-amber-200' 
                      : 'bg-green-50 text-green-700 border-green-200'
                  }`}>
                    {PRIORIDAD_LABELS[derivacion.prioridad]}
                  </span>
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-700">
                 <div>
                  <p className="text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Diagnóstico Técnico</p>
                  <p>{CATEGORIA_LABELS[derivacion.categoria]}</p>
                 </div>
                 <div>
                   <p className="text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Diagnóstico Médico</p>
                   <p>{derivacion.diagnostico}</p>
                 </div>
                 <div>
                   <p className="text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Prof. Derivado</p>
                   <p>{derivacion.profesional}</p>
                 </div>
                 <div>
                   <p className="text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Responsable CCR</p>
                   <p className="font-medium">{derivacion.responsable_nombre || derivacion.kine_asignado_nombre || 'Sin asignar'}</p>
                 </div>
              </div>

              {derivacion.observaciones && (
                <div className="mt-4 rounded-lg bg-white/40 p-3 text-xs italic text-gray-600 border border-black/5">
                  <span className="font-semibold text-gray-500 not-italic mr-1">Observaciones:</span>
                  {derivacion.observaciones}
                </div>
              )}
            </div>

            {/* Movements / Activity Stream inside Derivacion */}
            <div className="bg-gray-50 p-5 border-t border-[#E6EEE6]">
              <h4 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
                Registro de Actividad y Días de Asistencia
              </h4>
              
              {derivacion.movimientos.length === 0 ? (
                <p className="text-xs text-gray-400">No hay movimientos registrados para esta derivación.</p>
              ) : (
                <div className="relative pl-4 space-y-4 before:absolute before:left-1.5 before:top-2 before:-bottom-2 before:w-[2px] before:bg-gray-200">
                  {derivacion.movimientos.map((mov) => (
                    <div key={mov.id} className="relative text-sm">
                      <div className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-[#2694d9]" />
                      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-gray-800 text-xs">
                            {mov.estado_anterior 
                              ? `${ESTADO_LABELS[mov.estado_anterior as keyof typeof ESTADO_LABELS] || mov.estado_anterior} → ${ESTADO_LABELS[mov.estado_nuevo as keyof typeof ESTADO_LABELS]}`
                              : `Registrado en ${ESTADO_LABELS[mov.estado_nuevo as keyof typeof ESTADO_LABELS]}`
                            }
                          </span>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {new Date(mov.fecha).toLocaleString('es-CL')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Operador: <span className="font-medium text-gray-700">{mov.usuario_nombre || 'Sistema'}</span>
                        </p>
                        {mov.notas && (
                          <div className="mt-2 rounded bg-gray-50 p-2 text-xs italic text-gray-600">
                            {mov.notas}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
