'use client'

import { use, useCallback, useState } from 'react'
import { useCargaAlMontar } from '@/lib/useCargaAlMontar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiEdit3, FiPhone, FiRefreshCw } from 'react-icons/fi'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Estado, Paciente, PacienteConMovimientos, PerfilPaciente } from '@/lib/types'
import { CATEGORIA_LABELS, ESTADO_LABELS, getKineRowBackground } from '@/lib/types'
import { formatearRut } from '@/lib/rut'
import { puedeCorregirDatos } from '@/lib/roles'
import EditarPacienteModal from '@/components/EditarPacienteModal'
import CambiarEstadoModal from '@/components/CambiarEstadoModal'
import RegistrarContactoModal from '@/components/RegistrarContactoModal'
import BadgeEstado from '@/components/BadgeEstado'
import BadgePrioridad from '@/components/BadgePrioridad'

export default function PerfilPacientePage({ params }: { params: Promise<{ rut: string }> }) {
  const { rut } = use(params)
  const { user } = useAuth()
  const router = useRouter()
  const [perfil, setPerfil] = useState<PerfilPaciente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Modal state — tracks which derivacion (paciente record) is being acted on
  const [editarPaciente, setEditarPaciente] = useState<PacienteConMovimientos | null>(null)
  const [cambiarEstadoPaciente, setCambiarEstadoPaciente] = useState<PacienteConMovimientos | null>(null)
  const [registrarContactoPaciente, setRegistrarContactoPaciente] = useState<PacienteConMovimientos | null>(null)

  // Al cambiar de paciente se vuelve a mostrar la carga (ajuste durante el render).
  const [rutCargado, setRutCargado] = useState(rut)
  if (rutCargado !== rut) {
    setRutCargado(rut)
    setLoading(true)
    setError('')
  }

  const traerPerfil = useCallback(async () => {
    try {
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
  }, [rut])

  const loadPerfil = useCallback(async () => {
    setLoading(true)
    setError('')
    await traerPerfil()
  }, [traerPerfil])

  useCargaAlMontar(traerPerfil)

  async function handleCambiarEstado(estado: Estado, notas: string) {
    if (!cambiarEstadoPaciente) return
    await api.post<Paciente>(
      `/pacientes/${cambiarEstadoPaciente.id}/cambiar-estado/`,
      { estado, notas },
    )
    // Refresh the full profile to pick up the new state across all derivaciones
    void loadPerfil()
  }

  if (!user) return null

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-sm font-medium text-[color:var(--text-muted)]">Cargando perfil...</div>
      </div>
    )
  }

  if (error || !perfil) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 pt-12">
        <p className="text-sm font-semibold text-red-600 dark:text-red-300">{error || 'Paciente no encontrado.'}</p>
        <Link href="/lista-espera" className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
          Volver a Lista de Espera
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="ccr-control-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
        >
          <FiArrowLeft size={14} />
          Volver
        </button>
      </div>

      <header className="ccr-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold uppercase tracking-wide text-[color:var(--text-primary)]">
              {perfil.nombre}
            </h1>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text-muted)]">
              RUT: <span className="font-mono">{formatearRut(perfil.rut)}</span>
            </p>
            {perfil.mayor_60 && (
              <span className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                +60 años
              </span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-sm">
            <dt className="text-[color:var(--text-muted)]">Edad</dt>
            <dd className="font-semibold text-[color:var(--text-primary)]">{perfil.edad} años</dd>
            <dt className="text-[color:var(--text-muted)]">Sector</dt>
            <dd className="font-semibold text-[color:var(--text-primary)]">{perfil.sector_cesfam || 'Sin dato'}</dd>
            <dt className="text-[color:var(--text-muted)]">Sector territorial</dt>
            <dd className="font-semibold text-[color:var(--text-primary)]">{perfil.sector_oficial || 'Sin dato'}</dd>
          </dl>
        </div>
      </header>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
          Historial de derivaciones ({perfil.derivaciones.length})
        </h2>

        {perfil.derivaciones.map((derivacion) => {
          const puedeRegistrarLlamado =
            ['PENDIENTE', 'RESCATE'].includes(derivacion.estado) &&
            derivacion.kine_asignado !== null

          return (
            <article
              key={derivacion.id}
              className="ccr-panel overflow-hidden"
              // El color identifica al profesional responsable; solo marca el borde izquierdo.
              style={{ borderLeft: `4px solid ${getKineRowBackground(derivacion.kine_asignado_nombre)}` }}
            >
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Derivación {derivacion.id_ccr}
                    </h3>
                    <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
                      Fecha: <span className="font-medium text-[color:var(--text-secondary)]">{derivacion.fecha_derivacion}</span> ({derivacion.dias_en_lista} días)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgeEstado estado={derivacion.estado} />
                    <BadgePrioridad prioridad={derivacion.prioridad} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {/* El Médico solo carga derivaciones: no edita ni cambia estados. */}
                  {user?.rol !== 'MEDICO' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditarPaciente(derivacion)}
                        className="ccr-control-button-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                      >
                        <FiEdit3 size={13} />
                        Editar paciente
                      </button>
                      <button
                        type="button"
                        onClick={() => setCambiarEstadoPaciente(derivacion)}
                        className="ccr-control-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                      >
                        <FiRefreshCw size={13} />
                        Cambiar estado
                      </button>
                    </>
                  )}
                  {puedeRegistrarLlamado && (
                    <button
                      type="button"
                      onClick={() => setRegistrarContactoPaciente(derivacion)}
                      className="ccr-control-button inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                    >
                      <FiPhone size={13} />
                      Registrar llamado
                    </button>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
                  <Dato etiqueta="Diagnóstico técnico">{CATEGORIA_LABELS[derivacion.categoria]}</Dato>
                  <Dato etiqueta="Diagnóstico médico">{derivacion.diagnostico}</Dato>
                  <Dato etiqueta="Prof. derivado">{derivacion.profesional}</Dato>
                  <Dato etiqueta="Responsable CCR">
                    <span className="font-medium">{derivacion.responsable_nombre || derivacion.kine_asignado_nombre || 'Sin asignar'}</span>
                  </Dato>
                </dl>

                {derivacion.observaciones && (
                  <div className="mt-4 rounded-xl bg-[var(--bg-elevated)] p-3 text-xs italic text-[color:var(--text-secondary)]">
                    <span className="mr-1 font-semibold not-italic text-[color:var(--text-muted)]">Observaciones:</span>
                    {derivacion.observaciones}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                  Registro de actividad y días de asistencia
                </h4>

                {derivacion.movimientos.length === 0 ? (
                  <p className="text-xs text-[color:var(--text-muted)]">No hay movimientos registrados para esta derivación.</p>
                ) : (
                  <div className="relative space-y-4 pl-4 before:absolute before:-bottom-2 before:left-1.5 before:top-2 before:w-[2px] before:bg-[var(--border-default)]">
                    {derivacion.movimientos.map((mov) => (
                      <div key={mov.id} className="relative text-sm">
                        <div className="absolute -left-[15px] top-1.5 h-2 w-2 rounded-full bg-[var(--brand)]" />
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[color:var(--text-primary)]">
                              {mov.estado_anterior
                                ? `${ESTADO_LABELS[mov.estado_anterior as keyof typeof ESTADO_LABELS] || mov.estado_anterior} → ${ESTADO_LABELS[mov.estado_nuevo as keyof typeof ESTADO_LABELS]}`
                                : `Registrado en ${ESTADO_LABELS[mov.estado_nuevo as keyof typeof ESTADO_LABELS]}`
                              }
                            </span>
                            <span className="font-mono text-[11px] text-[color:var(--text-subtle)]">
                              {new Date(mov.fecha).toLocaleString('es-CL')}
                            </span>
                          </div>
                          <p className="text-xs text-[color:var(--text-muted)]">
                            Operador: <span className="font-medium text-[color:var(--text-secondary)]">{mov.usuario_nombre || 'Sistema'}</span>
                          </p>
                          {mov.notas && (
                            <div className="mt-2 rounded-lg bg-[var(--bg-elevated)] p-2 text-xs italic text-[color:var(--text-secondary)]">
                              {mov.notas}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* Modals */}
      {editarPaciente && (
        <EditarPacienteModal
          paciente={editarPaciente}
          mode={puedeCorregirDatos(user) ? 'full' : 'contact-only'}
          onClose={() => setEditarPaciente(null)}
          onGuardado={() => {
            setEditarPaciente(null)
            void loadPerfil()
          }}
        />
      )}

      {cambiarEstadoPaciente && user && (
        <CambiarEstadoModal
          paciente={cambiarEstadoPaciente}
          rol={user.rol}
          onClose={() => setCambiarEstadoPaciente(null)}
          onConfirm={async (estado, notas) => {
            await handleCambiarEstado(estado, notas)
            setCambiarEstadoPaciente(null)
          }}
        />
      )}

      {registrarContactoPaciente && (
        <RegistrarContactoModal
          paciente={registrarContactoPaciente}
          onClose={() => setRegistrarContactoPaciente(null)}
          onSuccess={() => {
            setRegistrarContactoPaciente(null)
            void loadPerfil()
          }}
        />
      )}
    </div>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 text-xs font-semibold uppercase text-[color:var(--text-muted)]">{etiqueta}</dt>
      <dd className="text-[color:var(--text-secondary)]">{children}</dd>
    </div>
  )
}
