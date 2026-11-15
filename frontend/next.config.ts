import type { NextConfig } from 'next'

const outputMode = process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined
const distDir = process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next')

const nextConfig: NextConfig = {
  // Evita 308 en POST /api/.../ que rompia el login via proxy local.
  skipTrailingSlashRedirect: true,
  distDir,
  outputFileTracingRoot: process.cwd(),
  ...(outputMode ? { output: outputMode } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
  async rewrites() {
    // En desarrollo local (sin docker), proxea /api al backend por defecto.
    // Se puede forzar con NEXT_PUBLIC_API_PROXY=1 o desactivar con NEXT_PUBLIC_API_PROXY=0.
    const proxyApi =
      process.env.NEXT_PUBLIC_API_PROXY === '1' ||
      (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_API_PROXY !== '0')
    const apiTarget = process.env.NEXT_API_PROXY_TARGET || 'http://localhost:8000'

    return proxyApi
      ? [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }]
      : []
  },
}

export default nextConfig
