'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { Paciente, Usuario, Categoria, Prioridad, Estado } from '@/lib/types'
import { CATEGORIA_LABELS, PRIORIDAD_LABELS, ESTADO_LABELS } from '@/lib/types'
import PacienteTable from '@/components/PacienteTable'
import ColaDeLlamados from '@/components/ColaDeLlamados'

type Vista = 'tabla' | 'cola'

const CATEGORIAS = Object.entries(CATEGORIA_LABELS) as [Categoria, string][]
const PRIORIDADES = Object.entries(PRIORIDAD_LABELS) as [Prioridad, string][]
const ESTADOS = Object.entries(ESTADO_LABELS) as [Estado, string][]

export default function PacientesPage() {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [kines, setKines] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<Vista>(
    user?.rol === 'ADMINISTRATIVO' ? 'cola' : 'tabla'
  )
  const [mostrarModal, setMostrarModal] = useState(false)

  // Filtros
  const [search, setSearch] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroKine, setFiltroKine] = useState('')
  const [soloMios, setSoloMios] = useState(
    searchParams.get('solo_mios') === '1' || pathname === '/mis-pacientes'
  )
  const ordering = searchParams.get('ordering') ?? ''

  // Filtros de URL (mes y anio)
  const mes = searchParams.get('mes')
  const anio = searchParams.get('anio')

  const isEgresoParams = searchParams.get('is_egreso') === '1' || pathname === '/egresos'

  useEffect(() => {
    setSoloMios(searchParams.get('solo_mios') === '1' || pathname === '/mis-pacientes')
  }, [searchParams, pathname])

  const cargarKines = useCallback(async () => {
    try {
      const data = await api.get<Usuario[]>('/usuarios/')
      setKines(data.filter((u) => u.rol === 'KINE'))
    } catch {
      // solo admin puede ver usuarios
    }
  }, [])

  const cargarPacientes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filtroCategoria) params.set('categoria', filtroCategoria)
      if (filtroPrioridad) params.set('prioridad', filtroPrioridad)
      if (filtroEstado) params.set('estado', filtroEstado)
      if (filtroKine) params.set('kine', filtroKine)
      if (soloMios) params.set('solo_mios', '1')
      if (pathname === '/lista-espera') params.set('sin_asignar', '1')
      if (isEgresoParams) params.set('is_egreso', '1')
      if (ordering) params.set('ordering', ordering)
      if (mes) params.set('mes', mes)
      if (anio) params.set('anio', anio)
      
      const qs = params.toString()
      const data = await api.get<Paciente[]>(`/pacientes/${qs ? `?${qs}` : ''}`)
      setPacientes(data)
    } catch {
      setPacientes([])
    } finally {
      setLoading(false)
    }
  }, [search, filtroCategoria, filtroPrioridad, filtroEstado, filtroKine, soloMios, isEgresoParams, ordering, mes, anio])

  useEffect(() => {
    cargarPacientes()
  }, [cargarPacientes])

  useEffect(() => {
    if (user?.rol === 'ADMIN') cargarKines()
  }, [user, cargarKines])

  if (!user) return null

  const puedeVerCola = ['ADMINISTRATIVO', 'ADMIN'].includes(user.rol)
  const puedeCrear = ['ADMIN', 'KINE'].includes(user.rol)

  function toggleDiasOrdering() {
    const params = new URLSearchParams(searchParams.toString())
    const nextOrdering = ordering === 'dias' ? '-dias' : 'dias'
    params.set('ordering', nextOrdering)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">
            {isEgresoParams ? 'Egresos Históricos' : pathname === '/mis-pacientes' ? 'Mis Pacientes' : 'Lista de Espera'}
          </h1>
          {mes && anio && (
            <p className="mt-1 mb-1 text-xs text-[#335fdb] bg-[#e9f4fb] inline-block px-2 py-1 rounded-md font-medium" style={{ border: '0.5px solid #a8d4f0' }}>
              Mostrando ingresados en: {new Date(parseInt(anio), parseInt(mes) - 1).toLocaleString('es-CL', { month: 'long', year: 'numeric' })}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''}
            {loading ? ' · cargando…' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {puedeCrear && (
            <button
              onClick={() => setMostrarModal(true)}
              className="bg-verde-ccr text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-green-900 transition"
            >
              + Nuevo paciente
            </button>
          )}
          {puedeVerCola && (
            <div className="flex rounded-lg overflow-hidden border border-verde-ccr text-xs font-semibold">
              <button
                onClick={() => setVista('tabla')}
                className={`px-3 py-2 transition ${vista === 'tabla' ? 'bg-verde-ccr text-white' : 'text-verde-ccr hover:bg-green-50'}`}
              >
                Tabla
              </button>
              <button
                onClick={() => setVista('cola')}
                className={`px-3 py-2 transition ${vista === 'cola' ? 'bg-verde-ccr text-white' : 'text-verde-ccr hover:bg-green-50'}`}
              >
                Contactabilidad
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div
        className="bg-white rounded-[10px] px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ border: '0.5px solid #a8d4f0' }}
      >
        <input
          type="text"
          placeholder="Buscar por nombre, RUT o ID CCR…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-56 focus:outline-none focus:border-verde-ccr"
        />

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-verde-ccr"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-verde-ccr"
        >
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-verde-ccr"
        >
          {isEgresoParams ? (
            <>
              <option value="">Cualquier tipo de Egreso</option>
              <option value="ALTA_MEDICA">Alta Médica</option>
              <option value="EGRESO_VOLUNTARIO">Egreso Voluntario</option>
              <option value="EGRESO_ADMINISTRATIVO">Egreso administrativo</option>
              <option value="ABANDONO">Abandono</option>
              <option value="DERIVADO">Derivado</option>
            </>
          ) : (
            <>
              <option value="">Todos los estados</option>
              {ESTADOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </>
          )}
        </select>

        {kines.length > 0 && (
          <select
            value={filtroKine}
            onChange={(e) => setFiltroKine(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-verde-ccr"
          >
            <option value="">Todos los responsables</option>
            {kines.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
          </select>
        )}

        {user.rol === 'KINE' && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={soloMios}
              onChange={(e) => setSoloMios(e.target.checked)}
              className="accent-verde-ccr"
            />
            Solo mi cartera
          </label>
        )}

        <button
          onClick={() => {
            setSearch('')
            setFiltroCategoria('')
            setFiltroPrioridad('')
            setFiltroEstado('')
            setFiltroKine('')
            setSoloMios(false)
            if (mes || anio) {
              router.push(pathname)
            }
          }}
          className="text-xs text-gray-400 hover:text-gray-600 transition"
        >
          Limpiar
        </button>
      </div>

      {/* Vista principal */}
      {loading ? (
        <div className="bg-white rounded-[10px] p-12 text-center text-gray-400 text-sm animate-pulse" style={{ border: '0.5px solid #a8d4f0' }}>
          Cargando pacientes…
        </div>
      ) : vista === 'cola' ? (
        <ColaDeLlamados
          pacientes={pacientes}
          usuario={user}
          onRefresh={cargarPacientes}
        />
      ) : (
        <PacienteTable
          pacientes={pacientes}
          usuario={user}
          onRefresh={cargarPacientes}
          ordering={ordering}
          onToggleDiasOrder={toggleDiasOrdering}
          isMisPacientes={pathname === '/mis-pacientes' || pathname === '/egresos'}
        />
      )}

      {/* Modal nuevo paciente */}
      {mostrarModal && (
        <NuevoPacienteModal
          onClose={() => setMostrarModal(false)}
          onCreado={cargarPacientes}
        />
      )}
    </div>
  )
}

// Modal inline para crear nuevo paciente
function NuevoPacienteModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [form, setForm] = useState({
    nombre: '',
    rut: '',
    edad: '',
    fecha_derivacion: '',
    percapita_desde: '',
    diagnostico: '',
    profesional: '',
    prioridad: 'MODERADA' as Prioridad,
    categoria: 'BORRADOR' as Categoria,
    observaciones: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/pacientes/', {
        ...form,
        edad: parseInt(form.edad, 10),
      })
      onCreado()
      onClose()
    } catch (e: unknown) {
      if (e && typeof e === 'object') {
        const msgs = Object.entries(e as Record<string, string[]>)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ')
        setError(msgs || 'Error al crear paciente')
      } else {
        setError('Error desconocido')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-[10px] shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        style={{ border: '0.5px solid #a8d4f0' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-verde-ccr text-white px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold">Nuevo Paciente</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre completo *</label>
              <input required value={form.nombre} onChange={e => set('nombre', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">RUT *</label>
              <input required value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12345678K" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Edad *</label>
              <input required type="number" min={0} max={120} value={form.edad} onChange={e => set('edad', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha derivación *</label>
              <input required type="date" value={form.fecha_derivacion} onChange={e => set('fecha_derivacion', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Perscápita / Desde</label>
              <input value={form.percapita_desde} onChange={e => set('percapita_desde', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Diagnóstico *</label>
              <input required value={form.diagnostico} onChange={e => set('diagnostico', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Profesional derivador *</label>
              <input required value={form.profesional} onChange={e => set('profesional', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Prioridad *</label>
              <select value={form.prioridad} onChange={e => set('prioridad', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr">
                {PRIORIDADES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría *</label>
              <select value={form.categoria} onChange={e => set('categoria', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr">
                {CATEGORIAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Observaciones</label>
              <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-verde-ccr resize-none" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-verde-ccr text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-900 disabled:opacity-60">
              {loading ? 'Guardando…' : 'Crear paciente'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-gray-400 hover:text-gray-600 text-sm">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
