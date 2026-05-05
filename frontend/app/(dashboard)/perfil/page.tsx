'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { Rol, Usuario } from '@/lib/types'
import { formatearRut } from '@/lib/rut'

const ROL_LABELS: Record<Rol, string> = {
  KINE: 'Kinesiólogo/a',
  ADMINISTRATIVO: 'Administrativo/a',
  ADMIN: 'Administrador/a',
}

const ROL_ICONS: Record<Rol, string> = {
  KINE: '🩺',
  ADMINISTRATIVO: '📋',
  ADMIN: '⚙️',
}

const ROL_COLORS: Record<Rol, { bg: string; text: string; border: string }> = {
  KINE: { bg: '#ECFDF5', text: '#065F46', border: '#6EE7B7' },
  ADMINISTRATIVO: { bg: '#ecf5f8', text: '#335fdb', border: '#BFDBFE' },
  ADMIN: { bg: '#F5F3FF', text: '#5B21B6', border: '#C4B5FD' },
}

export default function PerfilPage() {
  const { user, logout } = useAuth()
  const [todosUsuarios, setTodosUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(false)
  const [contadores, setContadores] = useState<{total: number; mios: number; egresos: number} | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const cargarContadores = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const [lista, mios, egresos] = await Promise.all([
        api.get<unknown[]>('/pacientes/?sin_asignar=1'),
        api.get<unknown[]>(`/pacientes/?kine=${user.id}`),
        api.get<unknown[]>('/pacientes/?is_egreso=1'),
      ])
      setContadores({ total: lista.length, mios: mios.length, egresos: egresos.length })
      if (user.rol === 'ADMIN') {
        const usuarios = await api.get<Usuario[]>('/usuarios/')
        setTodosUsuarios(usuarios)
      }
    } catch {
      setContadores(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { cargarContadores() }, [cargarContadores])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Completa todos los campos.')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('La confirmación no coincide.')
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
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      const values = err && typeof err === 'object' ? Object.values(err) : []
      const firstArray = values.find((v) => Array.isArray(v) && v.length > 0) as string[] | undefined
      const fallback = err?.detail || firstArray?.[0] || 'No se pudo actualizar la contraseña.'
      setPasswordError(String(fallback))
    } finally {
      setPasswordLoading(false)
    }
  }

  if (!user) return null

  const colors = ROL_COLORS[user.rol]
  const kinesActivos = todosUsuarios.filter(u => u.rol === 'KINE' && u.is_active).length
  const adminActivos = todosUsuarios.filter(u => u.rol === 'ADMIN' && u.is_active).length
  const adminstrativosActivos = todosUsuarios.filter(u => u.rol === 'ADMINISTRATIVO' && u.is_active).length

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Mi Perfil</h1>

      {/* Profile Card */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E6EEE6' }}>
        <div className="h-24" style={{ background: 'linear-gradient(135deg, #335fdb 0%, #2694d9 100%)' }} />
        <div className="bg-white px-6 pb-6">
          <div className="-mt-10 flex items-end justify-between gap-4 mb-6">
            <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-3xl"
              style={{ background: `linear-gradient(135deg, ${colors.bg}, white)` }}>
              {ROL_ICONS[user.rol]}
            </div>
            <button
              onClick={() => logout()}
              className="mb-2 text-xs text-gray-400 hover:text-red-500 rounded-lg border border-gray-200 px-3 py-1.5 transition hover:bg-red-50 hover:border-red-200">
              Cerrar sesión
            </button>
          </div>

          <div>
            <h2 className="text-2xl font-black text-gray-800">{user.nombre}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="rounded-full px-3 py-0.5 text-xs font-bold"
                style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                {ROL_LABELS[user.rol]}
              </span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 pt-5 border-t border-gray-100">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">RUT</p>
              <p className="font-mono text-gray-700 font-semibold mt-0.5">{formatearRut(user.rut)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Registrado</p>
              <p className="text-gray-700 font-semibold mt-0.5">
                {new Date(user.date_joined).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats based on role */}
      {contadores && !loading && (
        <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #E6EEE6' }}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">Mi actividad en el sistema</h3>
          <div className={`grid gap-4 ${user.rol === 'KINE' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {user.rol === 'KINE' && <>
              <Stat label="Mis pacientes activos" value={contadores.mios} color="#065F46" bg="#ECFDF5" />
              <Stat label="Lista de espera global" value={contadores.total} color="#335fdb" bg="#ecf5f8" />
            </>}
            {user.rol === 'ADMINISTRATIVO' && <>
              <Stat label="En lista de espera" value={contadores.total} color="#335fdb" bg="#ecf5f8" />
              <Stat label="Egresos registrados" value={contadores.egresos} color="#065F46" bg="#ECFDF5" />
            </>}
            {user.rol === 'ADMIN' && <>
              <Stat label="En lista de espera" value={contadores.total} color="#335fdb" bg="#ecf5f8" />
              <Stat label="Egresos registrados" value={contadores.egresos} color="#065F46" bg="#ECFDF5" />
            </>}
          </div>
        </div>
      )}

      {/* Admin panel: user list */}
      {user.rol === 'ADMIN' && todosUsuarios.length > 0 && (
        <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #E6EEE6' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">Resumen del equipo</h3>
            <a href="/usuarios" className="text-xs font-semibold text-[#335fdb] hover:underline">Gestionar usuarios →</a>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Kinesiólogos activos" value={kinesActivos} color="#065F46" bg="#ECFDF5" />
            <Stat label="Administrativos" value={adminstrativosActivos} color="#335fdb" bg="#ecf5f8" />
            <Stat label="Administradores" value={adminActivos} color="#5B21B6" bg="#F5F3FF" />
          </div>
          <div className="space-y-2">
            {todosUsuarios.slice(0, 5).map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{u.nombre}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{formatearRut(u.rut)}</p>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: ROL_COLORS[u.rol].bg, color: ROL_COLORS[u.rol].text, border: `1px solid ${ROL_COLORS[u.rol].border}` }}>
                  {ROL_LABELS[u.rol]}
                </span>
              </div>
            ))}
            {todosUsuarios.length > 5 && (
              <p className="text-xs text-center text-gray-400 pt-1">+ {todosUsuarios.length - 5} usuarios más en el sistema</p>
            )}
          </div>
        </div>
      )}

      {/* Administrativo: quick links */}
      {user.rol === 'ADMINISTRATIVO' && (
        <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #E6EEE6' }}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">Accesos rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Importar derivaciones', href: '/importar', icon: '📁' },
              { label: 'Historial mensual', href: '/historial-mensual', icon: '📅' },
              { label: 'Cola de llamadas', href: '/llamados', icon: '📞' },
              { label: 'Estadísticas', href: '/analisis/estadisticas', icon: '📊' },
            ].map(link => (
              <a key={link.href} href={link.href}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:bg-[#ecf5f8] hover:border-[#C8E6C9] transition">
                <span className="text-xl">{link.icon}</span>
                <span className="text-sm font-semibold text-gray-700">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6" style={{ border: '1px solid #E6EEE6' }}>
        <h3 className="text-sm font-bold text-gray-700 mb-4">Cambiar contraseña</h3>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {passwordError && (
            <p className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="md:col-span-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
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

function Stat({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: bg, border: `1px solid ${color}22` }}>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-xs font-semibold mt-0.5" style={{ color, opacity: 0.8 }}>{label}</p>
    </div>
  )
}
