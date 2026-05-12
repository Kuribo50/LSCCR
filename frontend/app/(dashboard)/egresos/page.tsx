'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import { FiFilter, FiRefreshCw, FiSearch } from 'react-icons/fi'
import { formatearRut } from '@/lib/rut'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import type { Estado, Paciente } from '@/lib/types'
import { CATEGORIA_LABELS, ESTADO_LABELS } from '@/lib/types'
import FichaPaciente from '@/components/FichaPaciente'
import BadgePrioridad from '@/components/BadgePrioridad'
import BadgeEstado from '@/components/BadgeEstado'
import EmptyState from '@/components/EmptyState'
import { TableSkeleton } from '@/components/Skeleton'

type EgresoState = Extract<Estado, 'ALTA_MEDICA' | 'EGRESO_VOLUNTARIO' | 'EGRESO_ADMINISTRATIVO' | 'ABANDONO' | 'DERIVADO'>

const EGRESO_STATES: EgresoState[] = [
  'ALTA_MEDICA',
  'EGRESO_VOLUNTARIO',
  'EGRESO_ADMINISTRATIVO',
  'ABANDONO',
  'DERIVADO',
]

const MESES = [
  { value: '', label: 'Todos los meses' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

function normalizeRut(value: string) {
  return value.toLowerCase().replace(/[^0-9k]/g, '')
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CL')
    .trim()
}

function toCapitalizedWords(value: string) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-CL')
  return normalized.replace(/\p{L}+/gu, (word) => {
    const [first = '', ...rest] = Array.from(word)
    return `${first.toLocaleUpperCase('es-CL')}${rest.join('')}`
  })
}

function calcularDiasDesde(fecha: string | null | undefined) {
  if (!fecha) return null
  const inicio = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(inicio.getTime())) return null

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diffMs = hoy.getTime() - inicio.getTime()
  if (diffMs < 0) return 0
  return Math.floor(diffMs / 86400000)
}

function calcularDiferenciaDias(
  desde: string | null | undefined,
  hasta: string | null | undefined,
) {
  if (!desde || !hasta) return null
  const inicio = new Date(`${desde}T00:00:00`)
  const fin = new Date(`${hasta}T00:00:00`)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return null

  const diffMs = fin.getTime() - inicio.getTime()
  if (diffMs < 0) return 0
  return Math.floor(diffMs / 86400000)
}

function calcularDiasAtendido(paciente: Paciente) {
  if (!paciente.fecha_ingreso) return paciente.dias_en_lista
  const diasAtendido = calcularDiferenciaDias(
    paciente.fecha_ingreso,
    paciente.fecha_egreso ?? paciente.fecha_cambio_estado,
  )
  if (diasAtendido !== null) return diasAtendido

  const diasDesdeIngreso = calcularDiasDesde(paciente.fecha_ingreso)
  return diasDesdeIngreso ?? paciente.dias_en_lista
}

export default function EgresosPage() {
  const { user } = useAuth()
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<EgresoState | ''>('')
  const [filtroKine, setFiltroKine] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()))
  const [showTableFilters, setShowTableFilters] = useState(false)
  const [seleccionado, setSeleccionado] = useState<Paciente | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (user?.rol === 'KINE') {
        const data = await api.get<Paciente[]>('/pacientes/?solo_mios=1')
        setPacientes(data.filter((p) => EGRESO_STATES.includes(p.estado as EgresoState)))
      } else {
        const data = await api.get<Paciente[]>('/pacientes/?is_egreso=1')
        setPacientes(data)
      }
    } catch {
      setPacientes([])
      setError('No se pudo cargar el historial de egresos.')
    } finally {
      setLoading(false)
    }
  }, [user?.rol])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const kineOptions = useMemo(
    () =>
      Array.from(
        new Set(
          pacientes
            .map((p) => p.kine_asignado_nombre?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'es')),
    [pacientes],
  )

  const pacientesBaseFiltrados = useMemo(() => {
    const queryText = normalizeSearchText(search)
    const queryRut = normalizeRut(search)

    return pacientes
      .filter((p) => {
        if (filtroKine && (p.kine_asignado_nombre ?? '') !== filtroKine) return false
        if (filtroMes || filtroAnio) {
          if (!p.fecha_egreso) return false
          const fechaEgreso = new Date(`${p.fecha_egreso}T00:00:00`)
          if (Number.isNaN(fechaEgreso.getTime())) return false
          if (filtroMes && fechaEgreso.getMonth() + 1 !== Number(filtroMes)) return false
          if (filtroAnio && fechaEgreso.getFullYear() !== Number(filtroAnio)) return false
        }

        if (!queryText && !queryRut) return true

        const matchesText =
          normalizeSearchText(p.nombre).includes(queryText) ||
          normalizeSearchText(p.id_ccr).includes(queryText) ||
          normalizeSearchText(p.diagnostico).includes(queryText) ||
          normalizeSearchText(p.sector_cesfam).includes(queryText) ||
          normalizeSearchText(p.sector_oficial).includes(queryText) ||
          normalizeSearchText(p.kine_asignado_nombre ?? '').includes(queryText) ||
          normalizeSearchText(p.responsable_nombre ?? '').includes(queryText) ||
          normalizeSearchText(p.observaciones ?? '').includes(queryText)
        const matchesRut = Boolean(queryRut) && normalizeRut(p.rut).includes(queryRut)

        return matchesText || matchesRut
      })
  }, [pacientes, filtroAnio, filtroKine, filtroMes, search])

  const pacientesFiltrados = useMemo(
    () =>
      pacientesBaseFiltrados
        .filter((p) => (filtroEstado ? p.estado === filtroEstado : true))
        .sort((a, b) => calcularDiasAtendido(b) - calcularDiasAtendido(a)),
    [pacientesBaseFiltrados, filtroEstado],
  )

  const resumenEgresos = useMemo(
    () =>
      EGRESO_STATES.map((estado) => ({
        estado,
        total: pacientesBaseFiltrados.filter((paciente) => paciente.estado === estado).length,
      })),
    [pacientesBaseFiltrados],
  )

  const activeFilterCount = [
    search.trim(),
    filtroEstado,
    filtroKine,
    filtroMes,
    filtroAnio,
  ].filter(Boolean).length

  function clearFilters() {
    setSearch('')
    setFiltroEstado('')
    setFiltroKine('')
    setFiltroMes('')
    setFiltroAnio(String(new Date().getFullYear()))
  }

  if (!user) return null

  return (
    <div className="space-y-3 text-[13px]">
      <header className="ccr-waitlist-toolbar ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:!text-white">Historial de egresos</h1>
              <p className="mt-0.5 text-xs font-semibold text-gray-500 dark:!text-[#b5d8e3]">
                Derivaciones concluidas por tipo de egreso.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="grid grid-cols-3 gap-2 sm:flex">
                <span className="ccr-waitlist-stat">
                  <span>Total</span>
                  <strong>{pacientes.length}</strong>
                </span>
                <span className="ccr-waitlist-stat">
                  <span>Vista</span>
                  <strong>{pacientesFiltrados.length}</strong>
                </span>
                <span className="ccr-waitlist-stat">
                  <span>Filtros</span>
                  <strong>{activeFilterCount}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void cargar()}
                className="ccr-button-refresh inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-auto"
              >
                <FiRefreshCw size={13} />
                Recargar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <FiSearch
                className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={15}
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault()
                }}
                placeholder="Buscar por nombre, RUT, sector o diagnóstico"
                className="ccr-control-input w-full px-9 py-2.5 text-xs"
                aria-label="Buscar egresos"
              />
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="ccr-control-button inline-flex h-[42px] w-full items-center justify-center px-3 text-xs sm:w-auto"
            >
              Limpiar filtros
            </button>

            <button
              type="button"
              onClick={() => setShowTableFilters((open) => !open)}
              className={
                showTableFilters
                  ? 'inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 outline-none transition hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-auto'
                  : 'ccr-control-button inline-flex h-[42px] w-full items-center justify-center gap-2 px-3 text-xs sm:w-auto'
              }
              aria-expanded={showTableFilters}
              aria-controls="egresos-table-filters"
            >
              <FiFilter size={13} />
              Filtros
            </button>
          </div>

          {showTableFilters && (
            <div id="egresos-table-filters" className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
                  Filtros de tabla
                </p>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                  {pacientesFiltrados.length} resultado{pacientesFiltrados.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <label className="text-[11px] font-semibold text-slate-500">
                  Tipo de egreso
                  <select
                    value={filtroEstado}
                    onChange={(event) => setFiltroEstado(event.target.value as EgresoState | '')}
                    className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                  >
                    <option value="">Todos los tipos</option>
                    {EGRESO_STATES.map((estado) => (
                      <option key={estado} value={estado}>
                        {ESTADO_LABELS[estado]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  Responsable
                  <select
                    value={filtroKine}
                    onChange={(event) => setFiltroKine(event.target.value)}
                    className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                  >
                    <option value="">Todos</option>
                    {kineOptions.map((kine) => (
                      <option key={kine} value={kine}>
                        {toCapitalizedWords(kine)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  Mes
                  <select
                    value={filtroMes}
                    onChange={(event) => setFiltroMes(event.target.value)}
                    className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                  >
                    {MESES.map((mes) => (
                      <option key={mes.value || 'todos'} value={mes.value}>
                        {mes.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-semibold text-slate-500">
                  Año
                  <input
                    type="number"
                    value={filtroAnio}
                    onChange={(event) => setFiltroAnio(event.target.value)}
                    className="ccr-control-input mt-1 w-full px-3 py-2 text-xs"
                    placeholder="Año"
                    aria-label="Año de egreso"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="ccr-panel rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-2">
          <EgresoFilterChip
            active={!filtroEstado}
            label="Todos"
            total={pacientesBaseFiltrados.length}
            onClick={() => setFiltroEstado('')}
          />
          {resumenEgresos.map(({ estado, total }) => (
            <EgresoFilterChip
              key={estado}
              active={filtroEstado === estado}
              label={ESTADO_LABELS[estado]}
              total={total}
              onClick={() => setFiltroEstado(estado)}
            />
          ))}
        </div>
      </section>

      {error && (
        <EmptyState variant="error" compact message={error} />
      )}

      {loading ? (
        <div className="ccr-panel ccr-data-table ccr-operational-table rounded-lg bg-white p-4">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <section className="ccr-panel ccr-data-table ccr-operational-table relative overflow-hidden rounded-lg bg-white dark:bg-[#0f0f10]">
          <div className="ccr-table-scroll min-h-[320px] max-h-[clamp(320px,calc(100dvh-335px),860px)] overflow-auto border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]">
            <table className="w-full min-w-[1660px] table-fixed border-collapse text-[12px]">
              <colgroup>
                <col style={{ width: 180 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 125 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 70 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="ccr-table-head border-b border-gray-200 bg-gray-50/80 dark:border-[#262626] dark:bg-[#202020]">
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Paciente
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    RUT
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Responsable CCR
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Sector CESFAM
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Sector oficial
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Diagnóstico
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Gravedad
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Categoría
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Tipo egreso
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Fecha egreso
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Observación operativa
                  </th>
                  <th className="border-r border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Días
                  </th>
                </tr>
              </thead>
              <tbody>
                {pacientesFiltrados.length === 0 ? (
                  <tr className="bg-white dark:bg-[#151515]">
                    <td colSpan={12} className="h-[260px] border-r border-gray-100 px-4 py-6 align-middle dark:border-[#262626]">
                      <EmptyState
                        variant="search"
                        compact
                        message="No hay egresos que coincidan con los filtros."
                      />
                    </td>
                  </tr>
                ) : pacientesFiltrados.map((paciente) => {
                  const diasAtendido = calcularDiasAtendido(paciente)

                  return (
                    <tr
                      key={paciente.id}
                      className="ccr-table-row cursor-pointer border-b border-gray-100 bg-white transition hover:bg-blue-50/50 dark:border-[#262626] dark:bg-[#151515] dark:hover:bg-[#202020]"
                      onClick={() => setSeleccionado(paciente)}
                    >
                      <td className="max-w-[190px] border-r border-gray-100 px-2 py-1 align-middle dark:border-[#262626]">
                        <div className="truncate font-bold text-gray-900 dark:text-white">
                          {toCapitalizedWords(paciente.nombre)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1 align-middle font-mono text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        {formatearRut(paciente.rut)}
                      </td>
                      <td className="max-w-[150px] border-r border-gray-100 px-2 py-1 align-middle text-gray-700 dark:border-[#262626] dark:text-[#daebf1]">
                        <div className="truncate">
                          {toCapitalizedWords(paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? 'Sin asignar')}
                        </div>
                      </td>
                      <td className="max-w-[150px] border-r border-gray-100 px-2 py-1 align-middle text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        <div className="truncate" title={paciente.sector_cesfam || '-'}>
                          {paciente.sector_cesfam || '-'}
                        </div>
                      </td>
                      <td className="max-w-[150px] border-r border-gray-100 px-2 py-1 align-middle text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        <div className="truncate" title={paciente.sector_oficial || '-'}>
                          {paciente.sector_oficial || '-'}
                        </div>
                      </td>
                      <td className="max-w-[210px] border-r border-gray-100 px-2 py-1 align-middle text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        <div className="truncate" title={paciente.diagnostico || 'Sin diagnóstico'}>
                          {paciente.diagnostico || 'Sin diagnóstico'}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-1 align-middle dark:border-[#262626]">
                        <BadgePrioridad prioridad={paciente.prioridad} />
                      </td>
                      <td className="border-r border-gray-100 px-2 py-1 align-middle text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        <span className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {toCapitalizedWords(CATEGORIA_LABELS[paciente.categoria] ?? paciente.categoria)}
                        </span>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-1 align-middle dark:border-[#262626]">
                        <BadgeEstado estado={paciente.estado} />
                      </td>
                      <td className="whitespace-nowrap border-r border-gray-100 px-2 py-1 align-middle font-semibold text-gray-700 dark:border-[#262626] dark:text-white">
                        {paciente.fecha_egreso
                          ? new Date(`${paciente.fecha_egreso}T00:00:00`).toLocaleDateString('es-CL')
                          : 'Sin fecha'}
                      </td>
                      <td className="max-w-[220px] border-r border-gray-100 px-2 py-1 align-middle text-gray-600 dark:border-[#262626] dark:text-[#b5d8e3]">
                        <div className="line-clamp-1">
                          {paciente.observaciones || 'Sin observación registrada'}
                        </div>
                      </td>
                      <td className="border-r border-gray-100 px-2 py-1 align-middle text-center font-semibold text-gray-700 dark:border-[#262626] dark:text-white">
                        {diasAtendido}d
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-1 border-t border-gray-200 bg-gray-50/50 px-4 py-2 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-[#b5d8e3] sm:flex-row sm:items-center sm:justify-between">
            <p>
              {pacientesFiltrados.length} egreso
              {pacientesFiltrados.length !== 1 ? 's' : ''} en la tabla
            </p>
            <p className="text-gray-400">
              Mostrando {pacientesFiltrados.length} de {pacientes.length}
            </p>
          </div>
        </section>
      )}

      {seleccionado && (
        <FichaPaciente
          paciente={seleccionado}
          usuario={user}
          onClose={() => setSeleccionado(null)}
          onRefresh={() => {
            void cargar()
            setSeleccionado(null)
          }}
        />
      )}
    </div>
  )
}

function EgresoFilterChip({
  active,
  label,
  total,
  onClick,
}: {
  active: boolean
  label: string
  total: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700'
          : 'inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50'
      }
    >
      <span>{label}</span>
      <span className={active ? 'rounded-full bg-red-100 px-2 py-0.5 text-[10px]' : 'rounded-full bg-gray-100 px-2 py-0.5 text-[10px]'}>
        {total}
      </span>
    </button>
  )
}
