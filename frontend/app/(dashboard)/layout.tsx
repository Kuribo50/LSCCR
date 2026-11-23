'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { useToast } from '@/lib/toast-context'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import CargasRevertibles from '@/components/CargasRevertibles'
import LoaderKine from '@/components/LoaderKine'
import { terminarNavegacion, useDestinoNavegacion } from '@/lib/navegacion'
import { puedeAbrirRuta } from '@/lib/roles'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, refreshUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const destino = useDestinoNavegacion()
  // Navegacion pedida desde el menu que todavia no llega.
  const pendiente = destino !== null && destino !== pathname
  const [loaderDesde, setLoaderDesde] = useState<number | null>(null)

  useEffect(() => {
    // Llego la pagina elegida: el menu vuelve a seguir la ruta real.
    if (destino === pathname) terminarNavegacion()
  }, [pathname, destino])

  useEffect(() => {
    // Seguridad: si la navegacion no llega (redireccion, error), soltar el destino.
    if (!destino) return
    const id = window.setTimeout(terminarNavegacion, 8000)
    return () => window.clearTimeout(id)
  }, [destino])

  useEffect(() => {
    // El loader solo aparece si la pagina demora mas de 300 ms en llegar.
    // Una vez visible se queda al menos 500 ms para que no parpadee.
    if (pendiente) {
      if (loaderDesde !== null) return
      const id = window.setTimeout(() => setLoaderDesde(Date.now()), 300)
      return () => window.clearTimeout(id)
    }
    if (loaderDesde === null) return
    const resto = Math.max(0, 500 - (Date.now() - loaderDesde))
    const id = window.setTimeout(() => setLoaderDesde(null), resto)
    return () => window.clearTimeout(id)
  }, [pendiente, loaderDesde])

  // La pagina queda montada (oculta) detras del loader, asi carga sus datos.
  const cargandoPagina = loaderDesde !== null

  useEffect(() => {
    // Segunda barrera de proteccion en cliente. El middleware ya protege rutas,
    // pero este fallback evita mostrar dashboard si el contexto quedo sin usuario.
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  const rutaPermitida = !user || puedeAbrirRuta(user, pathname)
  useEffect(() => {
    // Una ruta que no corresponde al rol (o al encargado) vuelve a Inicio.
    if (!rutaPermitida) router.replace('/inicio')
  }, [rutaPermitida, router])

  if (loading || !rutaPermitida) {
    return <LoaderKine pantallaCompleta retrasoMs={0} />
  }

  if (!user) return null

  return (
    <div className="ccr-dashboard-shell flex min-h-screen bg-[color:var(--bg-app)]">
      <Sidebar
        user={user}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="ccr-dashboard-main flex-1 overflow-y-auto bg-slate-100 dark:!bg-[#151515]">
          <div className="mx-auto w-full max-w-[1720px] px-3 py-3 sm:px-4 sm:py-4 lg:px-6">
            {cargandoPagina && <LoaderKine retrasoMs={0} />}
            <div className={cargandoPagina ? 'hidden' : undefined}>{children}</div>
          </div>
        </main>
      </div>
      {/* Cargas de derivaciones que aún se pueden revertir, en cualquier pantalla. */}
      <CargasRevertibles />
      {/* Backend bloquea la navegacion cuando admin exige cambio de clave. */}
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
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast()
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
      toastWarning('Completa todos los campos.')
      return
    }

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      toastWarning('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide.')
      toastWarning('La confirmación no coincide.')
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
      toastSuccess('Contraseña actualizada correctamente.')
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'No se pudo actualizar la contraseña.')
      setError(message)
      toastError(message)
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
              className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
