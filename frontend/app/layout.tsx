import type { Metadata } from 'next'
import { Manrope, Sora } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/lib/toast-context'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
})

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
})

export const metadata: Metadata = {
  title: 'Lista de Espera CCR',
  description: 'CESFAM Dr. Alberto Reyes – DISAM Tomé – Servicio de Salud Talcahuano',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var savedTheme = localStorage.getItem('ccr-theme');
                  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = savedTheme === 'dark' || savedTheme === 'light'
                    ? savedTheme
                    : (systemPrefersDark ? 'dark' : 'light');
                  var root = document.documentElement;
                  root.classList.toggle('dark', theme === 'dark');
                  root.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${manrope.variable} ${sora.variable}`}>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
