'use client'

import { useState, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FiLink, FiPhone, FiPlus, FiRefreshCw, FiSearch, FiTable, FiX } from 'react-icons/fi'
import { useAuth } from '@/lib/auth-context'
import { useAPI, unwrapResults } from '@/lib/swr'
import type { Paciente, PaginatedResponse, Usuario, Categoria, Prioridad, Estado } from '@/lib/types'
import { CATEGORIA_LABELS, PRIORIDAD_LABELS, ESTADO_LABELS } from '@/lib/types'
import PacienteTable from '@/components/PacienteTable'
import ColaDeLlamados from '@/components/ColaDeLlamados'
import { TableSkeleton } from '@/components/Skeleton'
import CrearPacienteModal from '@/components/CrearPacienteModal'
import FiltroPildoras from '@/components/FiltroPildoras'
import MenuAcciones from '@/components/MenuAcciones'
import { useToast } from '@/lib/toast-context'

type Vista = 'tabla' | 'cola'

const LISTA_ESPERA_ESTADOS = new Set<Estado>(['PENDIENTE', 'RESCATE'])
const CATEGORIAS = Object.entries(CATEGORIA_LABELS) as [Categoria, string][]
const PRIORIDADES = Object.entries(PRIORIDAD_LABELS) as [Prioridad, string][]
const ESTADOS = Object.entries(ESTADO_LABELS) as [Estado, string][]

export default function PacientesPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [vista, setVista] = useState<Vista>(
    'tabla'
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

  // Sincroniza el estado con la URL durante el render (en vez de efectos).
  const soloMiosUrl = searchParams.get('solo_mios') === '1' || pathname === '/mis-pacientes'
  const [soloMiosAplicado, setSoloMiosAplicado] = useState(soloMiosUrl)
  if (soloMiosAplicado !== soloMiosUrl) {
    setSoloMiosAplicado(soloMiosUrl)
    setSoloMios(soloMiosUrl)
  }

  const [searchUrlAplicada, setSearchUrlAplicada] = useState(searchUrl)
  if (searchUrlAplicada !== searchUrl) {
    setSearchUrlAplicada(searchUrl)
    setSearch(searchUrl)
  }

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

  const [refrescando, setRefrescando] = useState(false)

  // Actualizar de verdad: vuelve a pedir los pacientes y muestra el loader mientras llegan.
  async function actualizarPacientes() {
    setRefrescando(true)
    try {
      await Promise.all([mutatePacientes(), new Promise((r) => setTimeout(r, 400))])
    } finally {
      setRefrescando(false)
    }
  }

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

  const puedeVerCola = user.rol === 'ADMIN'
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
      <h1 className="sr-only">
        {isSearchResults ? "Resultados de búsqueda" : isEgresoParams ? "Egresos históricos" : pathname === "/mis-pacientes" ? "Mis pacientes" : "Pacientes"}
      </h1>

      <div className="ccr-panel rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar por nombre, RUT, sector o diagnóstico"
              aria-label="Buscar pacientes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ccr-control-input w-full pl-9 pr-3"
            />
          </div>

          <div className="w-48 shrink-0">
            <FiltroPildoras
              ariaLabel="Filtrar por categoría"
              valor={filtroCategoria}
              onChange={setFiltroCategoria}
              opciones={[
                { value: "", label: "Todas las categorías" },
                ...categoriaOptions.map(([k, v]) => ({ value: k, label: v })),
              ]}
            />
          </div>
          <div className="w-44 shrink-0">
            <FiltroPildoras
              ariaLabel="Filtrar por prioridad"
              valor={filtroPrioridad}
              onChange={setFiltroPrioridad}
              opciones={[
                { value: "", label: "Todas las prioridades" },
                ...prioridadOptions.map(([k, v]) => ({ value: k, label: v })),
              ]}
            />
          </div>
          <div className="w-48 shrink-0">
            <FiltroPildoras
              ariaLabel="Filtrar por estado"
              valor={filtroEstado}
              onChange={setFiltroEstado}
              opciones={
                isEgresoParams
                  ? [
                      { value: "", label: "Cualquier egreso" },
                      { value: "ALTA_MEDICA", label: "Alta médica" },
                      { value: "EGRESO_VOLUNTARIO", label: "Egreso voluntario" },
                      { value: "EGRESO_ADMINISTRATIVO", label: "Egreso administrativo" },
                      { value: "ABANDONO", label: "Abandono" },
                      { value: "DERIVADO", label: "Derivado" },
                    ]
                  : [{ value: "", label: "Todos los estados" }, ...estadoOptions.map(([k, v]) => ({ value: k, label: v }))]
              }
            />
          </div>
          {kineOptions.length > 0 && (
            <div className="w-52 shrink-0">
              <FiltroPildoras
                ariaLabel="Filtrar por profesional"
                valor={filtroKine}
                onChange={setFiltroKine}
                opciones={[
                  { value: "", label: "Todos los profesionales" },
                  ...kineOptions.map((k) => ({ value: String(k.id), label: k.nombre })),
                ]}
              />
            </div>
          )}
          {user.rol === "KINE" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-[color:var(--text-secondary)]">
              <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} className="accent-blue-500" />
              Solo mis pacientes
            </label>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {puedeVerCola && (
              <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900" role="tablist" aria-label="Vista">
                {(
                  [
                    ["tabla", "Tabla", FiTable],
                    ["cola", "Contactabilidad", FiPhone],
                  ] as const
                ).map(([id, label, Icono]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={vista === id}
                    onClick={() => setVista(id)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                      vista === id ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                    }`}
                  >
                    <Icono size={12} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={limpiarFiltros}
                aria-label="Quitar todos los filtros"
                title="Quitar filtros"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-900/60 dark:bg-transparent dark:text-red-300"
              >
                <FiX size={15} aria-hidden="true" />
              </button>
            )}
            {puedeCrear && (
              <button type="button" onClick={() => setCrearPacienteOpen(true)} className="ccr-control-button-primary">
                <FiPlus size={14} aria-hidden="true" />
                Nuevo paciente
              </button>
            )}
            <MenuAcciones
              acciones={[
                {
                  label: "Actualizar",
                  detalle: `${pacientes.length} paciente${pacientes.length !== 1 ? "s" : ""} en la vista`,
                  tono: "azul",
                  icon: <FiRefreshCw size={13} aria-hidden="true" />,
                  onClick: () => void actualizarPacientes(),
                },
                {
                  label: "Copiar enlace",
                  detalle: "De esta vista con sus filtros",
                  tono: "gris",
                  icon: <FiLink size={13} aria-hidden="true" />,
                  onClick: () => {
                    void navigator.clipboard?.writeText(window.location.href).then(() => toast.info("Enlace copiado."));
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>

      {loading || refrescando ? (
        <div className="ccr-fill ccr-panel ccr-data-table rounded-lg bg-white dark:bg-[var(--bg-card)] p-3">
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
