import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function decodeExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(normalized))
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

function tokenEsValido(token: string | undefined): boolean {
  if (!token) return false
  const exp = decodeExp(token)
  if (!exp) return false
  const now = Math.floor(Date.now() / 1000)
  return exp > now + 5
}

async function refrescarToken(refreshToken: string): Promise<{ access?: string; refresh?: string }> {
  const backend = process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000'
  const resp = await fetch(`${backend}/api/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  })
  if (!resp.ok) return {}
  return (await resp.json()) as { access?: string; refresh?: string }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname.startsWith('/login')) {
    return NextResponse.next()
  }

  const accessToken = request.cookies.get('access-token')?.value
  const refreshToken = request.cookies.get('refresh-token')?.value

  if (tokenEsValido(accessToken)) {
    return NextResponse.next()
  }

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const refreshed = await refrescarToken(refreshToken)
    if (!tokenEsValido(refreshed.access)) {
      const redirect = NextResponse.redirect(new URL('/login', request.url))
      redirect.cookies.delete('access-token')
      redirect.cookies.delete('refresh-token')
      return redirect
    }

    const response = NextResponse.next()
    const secure = process.env.NODE_ENV !== 'development'
    const sameSite = 'lax' as const
    response.cookies.set('access-token', refreshed.access!, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    if (refreshed.refresh) {
      response.cookies.set('refresh-token', refreshed.refresh, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: 60 * 60 * 24 * 14,
      })
    }
    return response
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
