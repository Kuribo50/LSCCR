'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { useToast } from '@/lib/toast-context'
import { useAPI, unwrapResults } from '@/lib/swr'
import type { PaginatedResponse, Rol, Usuario } from '@/lib/types'
import { ROL_LABELS } from '@/lib/types'
import { formatearRut } from '@/lib/rut'

const ROL_ICONS: Record<Rol, string> = {
  KINE: '🩺',
  MEDICO: '📋',
  ADMIN: '⚙️',
}

// Tonos de color por rol, con su variante para modo oscuro.
type Tono = 'verde' | 'azul' | 'violeta'

const TONO_CLASES: Record<Tono, { chip: string; tarjeta: string; avatar: string }> = {
  verde: {
    chip: 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
    tarjeta: 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
    avatar: 'from-emerald-50 to-white dark:from-emerald-500/20 dark:to-[var(--bg-elevated)]',
  },
  azul: {
    chip: 'border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200',
    tarjeta: 'border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200',
    avatar: 'from-blue-50 to-white dark:from-blue-500/20 dark:to-[var(--bg-elevated)]',
  },
  violeta: {
    chip: 'border border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200',
    tarjeta: 'border border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-200',
    avatar: 'from-violet-50 to-white dark:from-violet-500/20 dark:to-[var(--bg-elevated)]',
  },
}

const ROL_TONO: Record<Rol, Tono> = {
  KINE: 'verde',
  MEDICO: 'azul',
  ADMIN: 'violeta',
}

export default function PerfilPage() {
  const { user, logout } = useAuth()
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // SWR: contadores de pacientes para la seccion de actividad.
  const { data: swrLista, isLoading: loadingLista } = useAPI<unknown[] | PaginatedResponse<unknown>>(
    user ? '/pacientes/?sin_asignar=1' : null,
  )
  const { data: swrMios, isLoading: loadingMios } = useAPI<unknown[] | PaginatedResponse<unknown>>(
    user ? `/pacientes/?kine=${user.id}` : null,
  )
  const { data: swrEgresos, isLoading: loadingEgresos } = useAPI<unknown[] | PaginatedResponse<unknown>>(
    user ? '/pacientes/?is_egreso=1' : null,
  )
  const { data: swrUsuarios } = useAPI<Usuario[] | PaginatedResponse<Usuario>>(
    user?.rol === 'ADMIN' ? '/usuarios/' : null,
  )

  const loading = loadingLista || loadingMios || loadingEgresos
  const contadores = swrLista && swrMios && swrEgresos
    ? {
        total: unwrapResults(swrLista as unknown[] | PaginatedResponse<unknown>).length,
        mios: unwrapResults(swrMios as unknown[] | PaginatedResponse<unknown>).length,
        egresos: unwrapResults(swrEgresos as unknown[] | PaginatedResponse<unknown>).length,
      }
    : null
  const todosUsuarios = unwrapResults(swrUsuarios)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Completa todos los campos.')
      toastWarning('Completa todos los campos.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      toastWarning('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmación no coincide.')
      toastWarning('La confirmación no coincide.')
      return
    }

    setPasswordLoading(true)
    try {
      await api.post<{ detail: string }>('/auth/change-password/', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      setPasswordSuccess('Contraseña actualizada correctamente.')
      toastSuccess('Contraseña actualizada correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const fallback = getErrorMessage(err, 'No se pudo actualizar la contraseña.')
      setPasswordError(fallback)
      toastError(fallback)
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!user) return null

  const tono = TONO_CLASES[ROL_TONO[user.rol]]
  const kinesActivos = todosUsuarios.filter(u => u.rol === 'KINE' && u.is_active).length
  const adminActivos = todosUsuarios.filter(u => u.rol === 'ADMIN' && u.is_active).length
  const medicosActivos = todosUsuarios.filter(u => u.rol === 'MEDICO' && u.is_active).length

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="sr-only">Mi perfil</h1>

      <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)]">
        <div className="h-24 bg-gradient-to-br from-blue-500 to-cornflower-ocean-500 dark:from-blue-700/70 dark:to-blue-900/70" />
        <div className="bg-white dark:bg-[var(--bg-card)] px-6 pb-6">
          <div className="-mt-10 flex items-end justify-between gap-4 mb-6">
            <div className={`w-20 h-20 rounded-2xl border-4 border-white dark:border-[var(--bg-card)] shadow-lg flex items-center justify-center text-3xl bg-gradient-to-br ${tono.avatar}`}>
              {ROL_ICONS[user.rol]}
            </div>
            <button
              onClick={() => logout()}
              className="mb-2 text-xs text-gray-500 dark:text-[color:var(--text-muted)] hover:text-red-500 rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] px-3 py-1.5 transition hover:bg-red-50 dark:hover:bg-red-500/15 hover:border-red-200 dark:hover:border-red-400/30">
              Cerrar sesión
            </button>
          </div>

          <div>
            <h2 className="text-2xl font-black text-gray-800 dark:text-[color:var(--text-primary)]">{user.nombre}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${tono.chip}`}>
                {ROL_LABELS[user.rol]}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-gray-100 dark:border-[var(--border-subtle)]">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-[color:var(--text-muted)] font-semibold">RUT</p>
              <p className="font-mono text-gray-700 dark:text-[color:var(--text-secondary)] font-semibold mt-0.5">{formatearRut(user.rut)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-[color:var(--text-muted)] font-semibold">Registrado</p>
              <p className="text-gray-700 dark:text-[color:var(--text-secondary)] font-semibold mt-0.5">
                {new Date(user.date_joined).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {contadores && !loading && (
        <div className="rounded-2xl bg-white dark:bg-[var(--bg-card)] p-6 border border-gray-200 dark:border-[var(--border-subtle)]">
          <h3 className="text-sm font-bold text-gray-700 dark:text-[color:var(--text-secondary)] mb-4">Mi actividad en el sistema</h3>
          <div className={`grid gap-4 ${user.rol === 'KINE' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {user.rol === 'KINE' && <>
              <Stat label="Mis pacientes activos" value={contadores.mios} tono="verde" />
              <Stat label="Lista de espera global" value={contadores.total} tono="azul" />
            </>}
            {user.rol === 'MEDICO' && <>
              <Stat label="En lista de espera" value={contadores.total} tono="azul" />
              <Stat label="Egresos registrados" value={contadores.egresos} tono="verde" />
            </>}
            {user.rol === 'ADMIN' && <>
              <Stat label="En lista de espera" value={contadores.total} tono="azul" />
              <Stat label="Egresos registrados" value={contadores.egresos} tono="verde" />
            </>}
          </div>
        </div>
      )}

      {user.rol === 'ADMIN' && todosUsuarios.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-[var(--bg-card)] p-6 border border-gray-200 dark:border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-[color:var(--text-secondary)]">Resumen del equipo</h3>
            <Link href="/usuarios" className="text-xs font-semibold text-blue-500 hover:underline">Gestionar usuarios →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Stat label="Responsables CCR activos" value={kinesActivos} tono="verde" />
            <Stat label="Médicos" value={medicosActivos} tono="azul" />
            <Stat label="Administradores" value={adminActivos} tono="violeta" />
          </div>
          <div className="space-y-2">
            {todosUsuarios.slice(0, 5).map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-[var(--bg-elevated)] px-4 py-2.5 border border-gray-100 dark:border-[var(--border-subtle)]">
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-[color:var(--text-primary)]">{u.nombre}</p>
                  <p className="text-[11px] text-gray-500 dark:text-[color:var(--text-muted)] font-mono">{formatearRut(u.rut)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONO_CLASES[ROL_TONO[u.rol]].chip}`}>
                  {ROL_LABELS[u.rol]}
                </span>
              </div>
            ))}
            {todosUsuarios.length > 5 && (
              <p className="text-xs text-center text-gray-500 dark:text-[color:var(--text-muted)] pt-1">+ {todosUsuarios.length - 5} usuarios más en el sistema</p>
            )}
          </div>
        </div>
      )}

      {user.rol === 'MEDICO' && (
        <div className="rounded-2xl bg-white dark:bg-[var(--bg-card)] p-6 border border-gray-200 dark:border-[var(--border-subtle)]">
          <h3 className="text-sm font-bold text-gray-700 dark:text-[color:var(--text-secondary)] mb-4">Accesos rápidos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Importar derivaciones', href: '/importar', icon: '📁' },
              { label: 'Historial mensual', href: '/historial-mensual', icon: '📅' },
              { label: 'Lista de espera', href: '/lista-espera', icon: '📋' },
              { label: 'Estadísticas', href: '/analisis/estadisticas', icon: '📊' },
            ].map(link => (
              <Link key={link.href} href={link.href}
                className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-[var(--border-subtle)] bg-gray-50 dark:bg-[var(--bg-elevated)] px-4 py-3 hover:bg-ink-black-50 hover:border-[#C8E6C9] transition">
                <span className="text-xl">{link.icon}</span>
                <span className="text-sm font-semibold text-gray-700 dark:text-[color:var(--text-secondary)]">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-[var(--bg-card)] p-6 border border-gray-200 dark:border-[var(--border-subtle)]">
        <h3 className="text-sm font-bold text-gray-700 dark:text-[color:var(--text-secondary)] mb-4">Cambiar contraseña</h3>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-[color:var(--text-secondary)]">Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-[color:var(--text-secondary)]">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-[color:var(--text-secondary)]">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {passwordError && (
            <p className="md:col-span-2 rounded-lg border border-red-200 dark:border-red-400/30 bg-red-50 dark:bg-red-500/15 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="md:col-span-2 rounded-lg border border-green-200 dark:border-emerald-400/30 bg-green-50 dark:bg-emerald-500/15 px-3 py-2 text-xs font-medium text-green-700 dark:text-emerald-200">
              {passwordSuccess}
            </p>
          )}
          <div className="md:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              disabled={passwordLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {passwordLoading ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Stat({ label, value, tono }: { label: string; value: number; tono: Tono }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${TONO_CLASES[tono].tarjeta}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs font-semibold opacity-80">{label}</p>
    </div>
  )
}
