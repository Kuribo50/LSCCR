'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { Usuario, Rol } from '@/lib/types'
import { formatearRut } from '@/lib/rut'

const ROL_LABELS: Record<Rol, string> = {
  KINE: 'Kinesiólogo/a',
  ADMINISTRATIVO: 'Administrativo/a',
  ADMIN: 'Administrador/a',
}

export default function UsuariosPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'crear' | Usuario>(null)

  useEffect(() => {
    if (user && user.rol !== 'ADMIN') {
      router.replace('/pacientes')
    }
  }, [user, router])

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Usuario[]>('/usuarios/')
      setUsuarios(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function handleEliminar(id: number) {
    if (!window.confirm("¿Seguro que deseas eliminar este usuario?")) return;
    try {
      await api.delete(`/usuarios/${id}/`);
      cargar();
    } catch (e) {
      alert("No se pudo eliminar el usuario. Es posible que tenga registros asociados.");
    }
  }

  if (!user || user.rol !== 'ADMIN') return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Usuarios</h1>
          <p className="text-xs text-gray-400 mt-0.5">{usuarios.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => setModal('crear')}
          className="bg-verde-ccr text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-green-900 transition"
        >
          + Nuevo usuario
        </button>
      </div>

      <div className="bg-white rounded-[10px] overflow-hidden" style={{ border: '0.5px solid #a8d4f0' }}>
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm animate-pulse">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Nombre</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">RUT</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Rol</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{u.nombre}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{formatearRut(u.rut)}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{ROL_LABELS[u.rol]}</td>
                  <td className="px-5 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={
                        u.is_active
                          ? { backgroundColor: '#E8F5E9', color: '#2E7D32' }
                          : { backgroundColor: '#F5F5F5', color: '#9E9E9E' }
                      }
                    >
                      {u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setModal(u)}
                        className="text-xs font-semibold text-verde-ccr hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleEliminar(u.id)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UsuarioModal
          usuario={modal === 'crear' ? null : modal}
          onClose={() => setModal(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  )
}

function UsuarioModal({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null
  onClose: () => void
  onGuardado: () => void
}) {
  const editando = usuario !== null
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    rut: usuario?.rut ?? '',
    rol: (usuario?.rol ?? 'KINE') as Rol,
    password: '',
    is_active: usuario?.is_active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        nombre: form.nombre,
        rol: form.rol,
        is_active: form.is_active,
      }
      if (!editando) {
        body.rut = form.rut
        body.password = form.password
      } else if (form.password) {
        body.password = form.password
      }

      if (editando) {
        await api.patch(`/usuarios/${usuario!.id}/`, body)
      } else {
        await api.post('/usuarios/', body)
      }
      onGuardado()
      onClose()
    } catch (e: unknown) {
      if (e && typeof e === 'object') {
        const msgs = Object.entries(e as Record<string, string[]>)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ')
        setError(msgs || 'Error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-[10px] shadow-xl w-full max-w-md mx-4"
        style={{ border: '0.5px solid #a8d4f0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-verde-ccr text-white px-5 py-4 flex items-center justify-between rounded-t-[10px]">
          <h2 className="font-bold">{editando ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={e => set('nombre', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
          </div>

          {!editando && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">RUT *</label>
              <input required value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12345678K" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Rol *</label>
            <select value={form.rol} onChange={e => set('rol', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr">
              {(Object.entries(ROL_LABELS) as [Rol, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              {editando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
            </label>
            <input
              type="password"
              required={!editando}
              minLength={8}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr"
            />
          </div>

          {editando && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                className="accent-verde-ccr"
              />
              Usuario activo
            </label>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-verde-ccr text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-900 disabled:opacity-60">
              {loading ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-gray-400 hover:text-gray-600 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
