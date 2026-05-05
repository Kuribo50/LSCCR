'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiMenu, FiLogOut, FiMoon, FiSun, FiUser } from 'react-icons/fi'
import { useAuth } from '@/lib/auth-context'
import type { Usuario } from '@/lib/types'

const ROL_LABELS: Record<string, string> = {
  KINE: 'Kinesiólogo/a',
  ADMINISTRATIVO: 'Administrativo/a',
  ADMIN: 'Administrador/a',
}

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
  const fechaActual = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CL', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }).format(new Date()),
    [],
  )

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

  return (
    <header className="ccr-navbar sticky top-0 z-30 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm transition-colors dark:!border-[#262626] dark:!bg-[#111111] sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 hover:shadow-md dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#ecf5f8] dark:hover:!bg-[#262626] lg:hidden"
          aria-label="Abrir menú lateral"
        >
          <FiMenu size={20} />
        </button>
        <div className="hidden sm:block">
          <p className="text-sm font-extrabold tracking-tight text-gray-800 dark:!text-white">CCR Sistema de Gestión</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400 opacity-70 dark:!text-[#b5d8e3]">
            {fechaActual}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-6">
        <button
          type="button"
          onClick={handleToggleTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-yellow-300 dark:hover:!bg-[#262626]"
          aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
        >
          {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
        </button>

        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-1.5 transition-all hover:bg-gray-100 dark:!border-[#262626] dark:!bg-[#202020] dark:hover:!bg-[#262626]">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm dark:!border-[#262626] dark:!bg-[#262626] dark:!text-[#ecf5f8]">
            <FiUser size={16} />
          </div>
          <div className="hidden md:block text-right">
            <p className="text-xs font-bold leading-none text-gray-800 dark:!text-white">{user.nombre}</p>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-0.5 dark:!text-[#8fc4d6]">
              {ROL_LABELS[user.rol] ?? user.rol}
            </p>
          </div>
        </div>

        <div className="mx-1 hidden h-8 w-px bg-gray-200 dark:!bg-[#262626] sm:block" />

        <button
          onClick={handleLogout}
          className="ccr-logout-button group flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all hover:shadow-sm"
        >
          <span className="hidden sm:inline">Cerrar sesión</span>
          <FiLogOut size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </header>
  )
}
