"use client";

import ImportarPage from '../../importar/page'
import { useAuth } from '@/lib/auth-context'

export default function DerivacionesPage() {
  const { user } = useAuth()

  if (!user) return null

  if (!['ADMIN', 'ADMINISTRATIVO'].includes(user.rol)) {
    return (
      <div className="max-w-xl rounded-xl border border-[#a8d4f0] bg-white p-6">
        <h1 className="text-base font-bold text-gray-800">Derivaciones</h1>
        <p className="mt-2 text-sm text-gray-500">
          Esta pagina existe, pero tu perfil no tiene permisos para cargar derivaciones.
        </p>
      </div>
    )
  }

  return <ImportarPage />
}
