'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiMenu, FiLogOut, FiMoon, FiSun, FiUser } from 'react-icons/fi'
import { useAuth } from '@/lib/auth-context'
import type { Usuario } from '@/lib/types'
import { ROL_LABELS } from '@/lib/types'

export default function Navbar({
  user,
  onOpenSidebar,
}: {
  user: Usuario
  onOpenSidebar: () => void
}) {
  const { logout } = useAuth()
  const router = useRouter()
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false
    const root = document.documentElement
    const fromDataset = root.getAttribute('data-theme')
    return fromDataset === 'dark' || root.classList.contains('dark')
  })
  // "viernes, 13 de noviembre" -> "Viernes, 13 de noviembre" (solo la inicial).
  const fechaActual = useMemo(() => {
    const texto = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
    return texto.charAt(0).toUpperCase() + texto.slice(1)
  }, [])

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  function handleToggleTheme() {
    const nextDark = !isDark
    setIsDark(nextDark)
    const theme = nextDark ? 'dark' : 'light'
    const root = document.documentElement
    root.classList.toggle('dark', nextDark)
    root.setAttribute('data-theme', theme)
    localStorage.setItem('ccr-theme', theme)
  }

  const iniciales = user.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')

  const botonIcono =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 outline-none transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-950/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200 dark:hover:bg-ink-black-700'

  return (
    <header className="ccr-navbar sticky top-0 z-30 flex h-16 flex-shrink-0 items-center justify-between bg-[color:var(--bg-navbar)] px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenSidebar} className={`${botonIcono} lg:hidden`} aria-label="Abrir menú lateral">
          <FiMenu size={17} />
        </button>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-bold text-slate-950 dark:text-white">Centro Comunitario de Rehabilitación</p>
          <p className="text-xs font-medium text-slate-500 dark:text-ink-black-300">{fechaActual}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleTheme}
          className={botonIcono}
          aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
        >
          {isDark ? <FiSun size={16} /> : <FiMoon size={16} />}
        </button>

        <div className="flex h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-white pl-1 pr-1 dark:border-ink-black-600 dark:bg-ink-black-800 md:pr-3">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-[11px] font-bold text-white dark:bg-blue-500 dark:text-white"
          >
            {iniciales || <FiUser size={13} />}
          </span>
          <div className="hidden leading-tight md:block">
            <p className="text-xs font-bold text-slate-950 dark:text-white">{user.nombre}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-ink-black-300">{ROL_LABELS[user.rol] ?? user.rol}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-600/30 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        >
          <FiLogOut size={14} />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </button>
      </div>
    </header>
  )
}
