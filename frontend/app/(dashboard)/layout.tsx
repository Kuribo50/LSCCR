'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, refreshUser } = useAuth()
  const router = useRouter()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:!bg-[#151515]">
        <div className="animate-pulse rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-medium text-gray-700 shadow-sm dark:!border-[#262626] dark:!bg-[#0f0f10] dark:!text-[#ecf5f8]">
          Cargando entorno...
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="ccr-dashboard-shell flex min-h-screen bg-slate-100 dark:!bg-[#151515]">
      <Sidebar
        rol={user.rol}
        userId={user.id}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="ccr-dashboard-main flex-1 overflow-y-auto bg-slate-100 dark:!bg-[#151515]">
          <div className="mx-auto w-full max-w-[1720px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
            {children}
          </div>
        </main>
      </div>
      {user.requiere_cambio_password && (
        <CambioPasswordObligatorio onLogout={logout} onPasswordChanged={refreshUser} />
      )}
    </div>
  )
}

function CambioPasswordObligatorio({
  onLogout,
  onPasswordChanged,
}: {
  onLogout: () => Promise<void>
  onPasswordChanged: () => Promise<unknown>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Completa todos los campos.')
      return
    }

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-password/', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      })
      await onPasswordChanged()
    } catch (err: unknown) {
      const values = err && typeof err === 'object' ? Object.values(err) : []
      const firstArray = values.find((value) => Array.isArray(value) && value.length > 0) as
        | string[]
        | undefined
      const detail = err && typeof err === 'object' && 'detail' in err ? String(err.detail) : ''
      setError(detail || firstArray?.[0] || 'No se pudo actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white p-6 shadow-2xl">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
            Cambio obligatorio
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Actualiza tu contraseña</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Tu clave fue restablecida. Para continuar, ingresa una nueva contraseña de al menos 6
            caracteres.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <PasswordField
            label="Contraseña actual"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField label="Nueva contraseña" value={newPassword} onChange={setNewPassword} />
          <PasswordField
            label="Confirmar nueva contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />

          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#335FDB] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#284FC0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  )
}
