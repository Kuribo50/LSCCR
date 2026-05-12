'use server'

import { cookies } from 'next/headers'

export async function setAuthCookies(access: string, refresh: string) {
  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV !== 'development'
  const sameSite = 'lax' as const
  cookieStore.set('access-token', access, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7 días
  })
  cookieStore.set('refresh-token', refresh, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 60 * 60 * 24 * 14 // 14 días
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete('access-token')
  cookieStore.delete('refresh-token')
}

export async function getAccessToken() {
  const cookieStore = await cookies()
  return cookieStore.get('access-token')?.value || null
}

export async function refreshAuthToken() {
  const cookieStore = await cookies()
  const refresh = cookieStore.get('refresh-token')?.value
  if (!refresh) return null

  const backend = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000'
  try {
    const res = await fetch(`${backend}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    })
    if (res.ok) {
      const data = await res.json()
      const secure = process.env.NODE_ENV !== 'development'
      const sameSite = 'lax' as const
      cookieStore.set('access-token', data.access, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: 60 * 60 * 24 * 7
      })
      return data.access
    }
  } catch {
    return null
  }
  return null
}
