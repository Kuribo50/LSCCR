'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { Usuario, PerfilPaciente } from '@/lib/types'
import { ESTADO_LABELS } from '@/lib/types'
import { formatearRut } from '@/lib/rut'

const ROL_LABELS: Record<string, string> = {
  KINE: 'Kinesiólogo/a',
  ADMINISTRATIVO: 'Administrativo/a',
  ADMIN: 'Administrador/a',
}

export default function Topbar({ user }: { user: Usuario }) {
  const { logout } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [resultado, setResultado] = useState<PerfilPaciente | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  const normalizeRut = (rut: string) =>
    rut.replace(/\./g, '').replace(/-/g, '').toUpperCase().trim()

  const buscar = useCallback(async (rut: string) => {
    const norm = normalizeRut(rut)
    if (!norm || norm.length < 4) return
    setSearching(true)
    setNotFound(false)
    setResultado(null)
    try {
      const data = await api.get<PerfilPaciente>(`/pacientes/perfil/${norm}`)
      setResultado(data)
      setNotFound(false)
    } catch (e: unknown) {
      setResultado(null)
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setOpen(true)
    void buscar(query)
  }

  function verPerfil() {
    if (!resultado) return
    const norm = normalizeRut(resultado.rut)
    setOpen(false)
    setQuery('')
    router.push(`/paciente/${norm}`)
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header
      className="flex h-16 flex-shrink-0 items-center justify-between bg-white px-6 shadow-sm z-30 relative"
      style={{ borderBottom: '1px solid #E6EEE6' }}
    >
      <div className="flex items-center gap-6">
        <div className="text-sm font-bold text-gray-800">ListaEsperaCCR</div>

        {/* Search */}
        <div ref={containerRef} className="relative">
          <form onSubmit={handleSearch} className="flex relative items-center w-[320px]">
            <svg className="absolute left-3.5 h-4 w-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="12.345.678-9"
              value={query}
              onChange={e => {
                setQuery(formatearRut(e.target.value))
                setOpen(false)
              }}
              onFocus={() => { if (resultado || notFound) setOpen(true) }}
              className="w-full rounded-full border border-[#a8d4f0] bg-[#FAFCFA] px-4 py-2 pl-10 pr-10 text-sm outline-none transition focus:border-[#2694d9] focus:ring-1 focus:ring-[#2694d9]"
            />
            {searching && (
              <span className="absolute right-3.5 h-4 w-4 animate-spin rounded-full border-2 border-[#2694d9] border-t-transparent" />
            )}
          </form>

          {/* Dropdown result */}
          {open && (
            <div className="absolute top-[calc(100%+8px)] left-0 w-[360px] bg-white rounded-2xl shadow-xl border border-[#E6EEE6] z-50 overflow-hidden">
              {searching ? (
                <div className="px-5 py-4 text-sm text-gray-400 animate-pulse">Buscando…</div>
              ) : notFound ? (
                <div className="px-5 py-5 text-center">
                  <p className="text-2xl mb-1">🔍</p>
                  <p className="text-sm font-semibold text-gray-600">RUT no encontrado</p>
                  <p className="text-xs text-gray-400 mt-1">No hay pacientes registrados con el RUT <span className="font-mono font-semibold">{query}</span></p>
                </div>
              ) : resultado ? (
                <div>
                  <div className="bg-[#ecf5f8] px-5 py-3 border-b border-[#E6EEE6]">
                    <p className="text-xs font-bold text-[#335fdb] uppercase tracking-wider">Paciente encontrado</p>
                  </div>
                  <div className="px-5 py-4">
                    <p className="font-bold text-gray-800 text-sm">{resultado.nombre}</p>
                    <p className="font-mono text-xs text-gray-500 mt-0.5">{resultado.rut}</p>
                    <div className="mt-3 space-y-1.5">
                      {resultado.derivaciones.slice(0, 3).map(d => (
                        <div key={d.id} className="flex items-center justify-between text-xs rounded-lg bg-gray-50 px-3 py-2 border border-gray-100">
                          <span className="text-gray-600 truncate max-w-[180px]">{d.diagnostico}</span>
                          <span className="font-semibold text-gray-700 shrink-0 ml-2">{ESTADO_LABELS[d.estado] ?? d.estado}</span>
                        </div>
                      ))}
                      {resultado.derivaciones.length > 3 && (
                        <p className="text-[11px] text-gray-400 text-center">+{resultado.derivaciones.length - 3} derivaciones más</p>
                      )}
                    </div>
                    <button
                      onClick={verPerfil}
                      className="mt-4 w-full rounded-xl bg-[#335fdb] py-2.5 text-sm font-semibold text-white hover:bg-[#284fc0] transition"
                    >
                      Ver ficha completa →
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => router.push('/perfil')}
          className="text-right hover:opacity-80 transition"
        >
          <p className="text-sm font-bold text-gray-800 leading-tight">{user.nombre}</p>
          <p className="text-[11px] font-semibold text-[#2694d9] uppercase tracking-wider">{ROL_LABELS[user.rol] ?? user.rol}</p>
        </button>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-red-50 hover:text-red-600"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}
