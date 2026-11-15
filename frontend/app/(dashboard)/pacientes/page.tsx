'use client'

import { useState, useEffect, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FiPhone, FiPlus, FiSearch, FiTable, FiX } from 'react-icons/fi'
import { useAuth } from '@/lib/auth-context'
import { useAPI, unwrapResults } from '@/lib/swr'
import type { Paciente, PaginatedResponse, Usuario, Categoria, Prioridad, Estado } from '@/lib/types'
import { CATEGORIA_LABELS, PRIORIDAD_LABELS, ESTADO_LABELS } from '@/lib/types'
import PacienteTable from '@/components/PacienteTable'
import ColaDeLlamados from '@/components/ColaDeLlamados'
import { TableSkeleton } from '@/components/Skeleton'
import CrearPacienteModal from '@/components/CrearPacienteModal'

type Vista = 'tabla' | 'cola'

const LISTA_ESPERA_ESTADOS = new Set<Estado>(['PENDIENTE', 'RESCATE'])
const CATEGORIAS = Object.entries(CATEGORIA_LABELS) as [Categoria, string][]
const PRIORIDADES = Object.entries(PRIORIDAD_LABELS) as [Prioridad, string][]
const ESTADOS = Object.entries(ESTADO_LABELS) as [Estado, string][]

export default function PacientesPage() {
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [vista, setVista] = useState<Vista>(
    user?.rol === 'ADMINISTRATIVO' ? 'cola' : 'tabla'
  )
  const [crearPacienteOpen, setCrearPacienteOpen] = useState(false)
  const searchUrl = searchParams.get('search') ?? ''

  const [search, setSearch] = useState(searchUrl)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroKine, setFiltroKine] = useState('')
  const [soloMios, setSoloMios] = useState(
    searchParams.get('solo_mios') === '1' || pathname === '/mis-pacientes'
  )
  const ordering = searchParams.get('ordering') ?? ''

  const mes = searchParams.get('mes')
  const anio = searchParams.get('anio')

  const isEgresoParams = searchParams.get('is_egreso') === '1' || pathname === '/egresos'
  const isSearchResults = pathname === '/pacientes' && Boolean(searchUrl)

  useEffect(() => {
    setSoloMios(searchParams.get('solo_mios') === '1' || pathname === '/mis-pacientes')
  }, [searchParams, pathname])

  useEffect(() => {
    setSearch(searchUrl)
  }, [searchUrl])

  // SWR: construir path dinamico a partir de los filtros activos.
  const swrPath = useMemo(() => {
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
    return `/pacientes/${qs ? `?${qs}` : ''}`
  }, [search, filtroCategoria, filtroPrioridad, filtroEstado, filtroKine, soloMios, isEgresoParams, ordering, mes, anio, pathname])

  const {
    data: swrPacientesData,
    isLoading: loading,
    mutate: mutatePacientes,
  } = useAPI<Paciente[] | PaginatedResponse<Paciente>>(swrPath)

  const pacientes = useMemo(() => {
    const rawList = unwrapResults(swrPacientesData)
    if (user?.rol === 'KINE' && pathname === '/pacientes') {
      return rawList.filter((paciente) =>
        LISTA_ESPERA_ESTADOS.has(paciente.estado) || paciente.kine_asignado === user.id
      )
    }
    return rawList
  }, [swrPacientesData, user, pathname])

  // SWR: usuarios (kines) para filtro de responsable.
  const kinesEndpoint = user?.rol === 'ADMIN' ? '/usuarios/' : null
  const { data: swrKinesData } = useAPI<Usuario[] | PaginatedResponse<Usuario>>(kinesEndpoint)
  const kines = useMemo(
    () => unwrapResults(swrKinesData).filter((u) => u.rol === 'KINE'),
    [swrKinesData],
  )

  const categoriaOptions = CATEGORIAS.filter(
    ([value]) => filtroCategoria === value || pacientes.some((paciente) => paciente.categoria === value),
  )
  const prioridadOptions = PRIORIDADES.filter(
    ([value]) => filtroPrioridad === value || pacientes.some((paciente) => paciente.prioridad === value),
  )
  const estadoOptions = ESTADOS.filter(
    ([value]) => filtroEstado === value || pacientes.some((paciente) => paciente.estado === value),
  )
  const kineOptions = useMemo(() => {
    const fromPatients = new Map<number, string>()
    pacientes.forEach((paciente) => {
      const nombre = paciente.kine_asignado_nombre || paciente.responsable_nombre
      if (paciente.kine_asignado && nombre) {
        fromPatients.set(paciente.kine_asignado, nombre)
      }
    })

    if (filtroKine) {
      const selected = kines.find((item) => String(item.id) === filtroKine)
      if (selected?.rol === 'KINE' && selected.is_active && !/administrativo/i.test(selected.nombre)) {
        fromPatients.set(selected.id, selected.nombre)
      }
    }

    return Array.from(fromPatients.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filtroKine, kines, pacientes])
  const hasActiveFilters = Boolean(
    search ||
      filtroCategoria ||
      filtroPrioridad ||
      filtroEstado ||
      filtroKine ||
      soloMios,
  )

  if (!user) return null

  const puedeVerCola = ['ADMINISTRATIVO', 'ADMIN'].includes(user.rol)
  const puedeCrear = ['ADMIN', 'KINE'].includes(user.rol)

  function toggleDiasOrdering() {
    const params = new URLSearchParams(searchParams.toString())
    const nextOrdering = ordering === 'dias' ? '-dias' : 'dias'
    params.set('ordering', nextOrdering)
    router.replace(`${pathname}?${params.toString()}`)
  }

  function limpiarFiltros() {
    setSearch('')
    setFiltroCategoria('')
    setFiltroPrioridad('')
    setFiltroEstado('')
    setFiltroKine('')
    setSoloMios(false)

    const params = new URLSearchParams(searchParams.toString())
    ;['search', 'categoria', 'prioridad', 'estado', 'kine', 'solo_mios', 'ordering'].forEach((key) =>
      params.delete(key),
    )
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname)
  }

  return (
    <div className={`space-y-4 ${vista === 'cola' ? '' : 'ccr-page-fill'}`}>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
            Índice de pacientes
          </p>
          <h1 className="mt-1 text-xl font-black text-slate-950">
            {isSearchResults
              ? 'Resultados de búsqueda'
              : isEgresoParams
                ? 'Egresos Históricos'
                : pathname === '/mis-pacientes'
                  ? 'Mis pacientes'
                  : pathname === '/pacientes'
                  ? 'Pacientes'
                  : 'Lista de Espera'}
          </h1>
          {isSearchResults && (
            <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-500">
              <FiSearch size={12} />
              <span className="truncate">Búsqueda: {searchUrl}</span>
            </p>
          )}
          {mes && anio && (
            <p className="mt-2 inline-block rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-500">
              Mostrando ingresados en: {new Date(parseInt(anio), parseInt(mes) - 1).toLocaleString('es-CL', { month: 'long', year: 'numeric' })}
            </p>
          )}
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''}
            {loading ? ' · cargando…' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeCrear && (
            <button
              type="button"
              onClick={() => setCrearPacienteOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <FiPlus size={14} />
              Nuevo paciente
            </button>
          )}
          {puedeVerCola && (
            <div className="flex overflow-hidden rounded-lg border border-blue-200 bg-white text-xs font-black shadow-sm">
              <button
                type="button"
                onClick={() => setVista('tabla')}
                className={`inline-flex items-center gap-1 px-3 py-2 transition focus:outline-none focus:ring-2 focus:ring-blue-100 ${vista === 'tabla' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-50'}`}
              >
                <FiTable size={13} />
                Tabla
              </button>
              <button
                type="button"
                onClick={() => setVista('cola')}
                className={`inline-flex items-center gap-1 px-3 py-2 transition focus:outline-none focus:ring-2 focus:ring-blue-100 ${vista === 'cola' ? 'bg-blue-500 text-white' : 'text-blue-500 hover:bg-blue-50'}`}
              >
                <FiPhone size={13} />
                Contactabilidad
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="grid gap-2 rounded-xl border border-blue-100 bg-white px-4 py-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(150px,1fr))_auto]"
      >
        <input
          type="text"
          placeholder="Buscar por nombre, RUT, sector o diagnóstico…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todas las categorías</option>
          {categoriaOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value)}
          className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todas las prioridades</option>
          {prioridadOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
              {estadoOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </>
          )}
        </select>

        {kineOptions.length > 0 && (
          <select
            value={filtroKine}
            onChange={(e) => setFiltroKine(e.target.value)}
            className="min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todos los kines asignados</option>
            {kineOptions.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}
          </select>
        )}

        {user.rol === 'KINE' && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={soloMios}
              onChange={(e) => setSoloMios(e.target.checked)}
              className="accent-blue-500"
            />
            Solo mis pacientes
          </label>
        )}

        <button
          type="button"
          onClick={limpiarFiltros}
          disabled={!hasActiveFilters}
          className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <FiX size={13} />
          Limpiar
        </button>
      </div>

      {loading ? (
        <div className="ccr-fill ccr-panel ccr-data-table rounded-lg bg-white p-3">
          <TableSkeleton rows={7} />
        </div>
      ) : vista === 'cola' ? (
        <ColaDeLlamados
          pacientes={pacientes}
          usuario={user}
          onRefresh={() => void mutatePacientes()}
        />
      ) : (
        <PacienteTable
          pacientes={pacientes}
          usuario={user}
          onRefresh={() => void mutatePacientes()}
          ordering={ordering}
          onToggleDiasOrder={toggleDiasOrdering}
          isMisPacientes={pathname === '/mis-pacientes' || pathname === '/egresos'}
        />
      )}

      <CrearPacienteModal
        isOpen={crearPacienteOpen}
        onOpenChange={setCrearPacienteOpen}
        onSuccess={() => {
          void mutatePacientes()
        }}
      />
    </div>
  )
}
