'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api, setMemoryToken } from './api'
import { setAuthCookies, clearAuthCookies, getAccessToken } from '@/app/actions'
import type { Usuario } from './types'

interface AuthCtx {
  user: Usuario | null
  loading: boolean
  login: (rut: string, password: string) => Promise<Usuario>
  logout: () => Promise<void>
  refreshUser: () => Promise<Usuario | null>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const hardStop = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 6500)

    async function bootstrapAuth() {
      try {
        const access = await getAccessToken()
        if (access) setMemoryToken(access)
      } catch {
        // Si falla la hidratación, seguimos con /auth/me/
      }

      api
        .get<Usuario>('/auth/me/')
        .then((u) => {
          if (mounted) setUser(u)
        })
        .catch(() => {
          if (mounted) setUser(null)
        })
        .finally(() => {
          clearTimeout(hardStop)
          if (mounted) setLoading(false)
        })
    }

    void bootstrapAuth()

    return () => {
      mounted = false
      clearTimeout(hardStop)
    }
  }, [])

  async function refreshUser() {
    const u = await api.get<Usuario>('/auth/me/')
    setUser(u)
    return u
  }

  async function login(rut: string, password: string) {
    const tokens = await api.post<{access: string, refresh: string}>('/auth/login/', { rut, password })
    await setAuthCookies(tokens.access, tokens.refresh)
    setMemoryToken(tokens.access)
    const u = await refreshUser()
    return u
  }

  async function logout() {
    await clearAuthCookies()
    setMemoryToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
