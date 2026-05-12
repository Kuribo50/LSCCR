'use client'

import { useState } from 'react'

import { api } from '@/lib/api'
import { formatearRut, rutParaApi } from '@/lib/rut'
import type { ImportacionResultado } from '@/lib/types'

type EstadoFila = 'ok' | 'incompleta' | 'error'
type CampoEditable =
  | 'fecha_derivacion'
  | 'nombre'
  | 'rut'
  | 'edad'
  | 'sector_oficial'
  | 'sector_cesfam'
  | 'diagnostico'
  | 'prioridad'
  | 'observaciones'

interface FilaManual {
  id: string
  fecha_derivacion: string
  nombre: string
  rut: string
  edad: string
  sector_oficial: string
  sector_cesfam: string
  diagnostico: string
  profesional: string
  prioridad: string
  observaciones: string
}

const COLUMNAS: { key: CampoEditable; label: string; placeholder: string }[] = [
  { key: 'fecha_derivacion', label: 'FECHA', placeholder: '31/01/2026' },
  { key: 'nombre', label: 'NOMBRE', placeholder: 'Nombre completo' },
  { key: 'rut', label: 'RUT', placeholder: '11.111.111-K' },
  { key: 'edad', label: 'EDAD', placeholder: '65' },
  { key: 'sector_oficial', label: 'SECTOR OFICIAL', placeholder: 'AZUL' },
  { key: 'sector_cesfam', label: 'SectorCesfam', placeholder: 'AZUL' },
  { key: 'diagnostico', label: 'DIAGNOSTICO', placeholder: 'Diagnostico' },
  { key: 'prioridad', label: 'PRIORIDAD', placeholder: 'MODERADA' },
  { key: 'observaciones', label: 'OBSERVACIONES', placeholder: 'Observaciones' },
]

function limpiarCeldasFinales(celdas: string[]) {
  const copia = [...celdas]
  while (copia.length > 0 && copia[copia.length - 1].trim() === '') {
    copia.pop()
  }
  return copia
}

function esRutProbable(valor: string) {
  const limpio = rutParaApi(valor)
  return limpio.length >= 7 && limpio.length <= 9
}

function pareceVarianteA(celdas: string[]) {
  const columna2 = (celdas[1] ?? '').trim()
  const columna4 = celdas[3] ?? ''
  return (columna2 === '' || /^[0-9]+$/.test(columna2) || columna2.toUpperCase() === 'N°') && esRutProbable(columna4)
}

function crearFila(celdas: string[], index: number): FilaManual {
  const limpias = limpiarCeldasFinales(celdas)
  const baseId = `${Date.now()}-${index}`

  if (limpias.length >= 14) {
    return {
      id: baseId,
      fecha_derivacion: (limpias[0] ?? '').trim(),
      sector_oficial: (limpias[1] ?? '').trim(),
      sector_cesfam: (limpias[2] ?? '').trim(),
      nombre: (limpias[3] ?? '').trim(),
      rut: formatearRut(limpias[4] ?? ''),
      edad: (limpias[5] ?? '').trim(),
      diagnostico: (limpias[6] ?? '').trim(),
      profesional: (limpias[7] ?? 'KINESIOLOGO').trim() || 'KINESIOLOGO',
      prioridad: (limpias[8] ?? '').trim(),
      observaciones: (limpias[9] ?? '').trim(),
    }
  }

  if (limpias.length >= 10 || pareceVarianteA(limpias)) {
    return {
      id: baseId,
      fecha_derivacion: (limpias[0] ?? '').trim(),
      nombre: (limpias[2] ?? '').trim(),
      rut: formatearRut(limpias[3] ?? ''),
      edad: (limpias[4] ?? '').trim(),
      sector_oficial: '',
      sector_cesfam: (limpias[5] ?? '').trim(),
      diagnostico: (limpias[6] ?? '').trim(),
      profesional: (limpias[7] ?? 'KINESIOLOGO').trim() || 'KINESIOLOGO',
      prioridad: (limpias[8] ?? '').trim(),
      observaciones: (limpias[9] ?? '').trim(),
    }
  }

  if (limpias.length >= 9) {
    return {
      id: baseId,
      fecha_derivacion: (limpias[0] ?? '').trim(),
      nombre: (limpias[1] ?? '').trim(),
      rut: formatearRut(limpias[2] ?? ''),
      edad: (limpias[3] ?? '').trim(),
      sector_oficial: '',
      sector_cesfam: (limpias[4] ?? '').trim(),
      diagnostico: (limpias[5] ?? '').trim(),
      profesional: (limpias[6] ?? 'KINESIOLOGO').trim() || 'KINESIOLOGO',
      prioridad: (limpias[7] ?? '').trim(),
      observaciones: (limpias[8] ?? '').trim(),
    }
  }

  return {
    id: baseId,
    fecha_derivacion: (limpias[0] ?? '').trim(),
    nombre: (limpias[1] ?? '').trim(),
    rut: formatearRut(limpias[2] ?? ''),
    edad: (limpias[3] ?? '').trim(),
    sector_oficial: '',
    sector_cesfam: (limpias[4] ?? '').trim(),
    diagnostico: (limpias[5] ?? '').trim(),
    profesional: 'KINESIOLOGO',
    prioridad: (limpias[6] ?? '').trim(),
    observaciones: (limpias[7] ?? '').trim(),
  }
}

function parsearTextoPegado(texto: string) {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.trimEnd())
    .filter((linea) => linea.trim() !== '')
    .map((linea, index) => crearFila(linea.split('\t'), index))
}

function fechaDesdeSerial(valor: number) {
  if (!Number.isFinite(valor)) return null
  const ms = Math.round((valor - 25569) * 86400 * 1000)
  const fecha = new Date(ms)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

function normalizarFecha(valor: string) {
  const texto = valor.trim()
  if (!texto) return null

  if (/^\d+(\.\d+)?$/.test(texto)) {
    const fechaSerial = fechaDesdeSerial(Number(texto))
    if (!fechaSerial) return null
    return fechaSerial.toISOString().slice(0, 10)
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const latam = texto.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/)
  if (latam) return `${latam[3]}-${latam[2]}-${latam[1]}`

  return null
}

function obtenerEstadoFila(fila: FilaManual): EstadoFila {
  const faltanObligatorios = !fila.fecha_derivacion || !fila.nombre || !fila.rut || !fila.diagnostico
  if (faltanObligatorios) {
    return 'incompleta'
  }

  const fechaValida = Boolean(normalizarFecha(fila.fecha_derivacion))
  const rutValido = esRutProbable(fila.rut)
  const edadValida = fila.edad.trim() === '' || /^[0-9]+$/.test(fila.edad.trim())

  if (!fechaValida || !rutValido || !edadValida) {
    return 'error'
  }

  return 'ok'
}

function coloresFila(estado: EstadoFila) {
  if (estado === 'ok') {
    return '#F0FDF4'
  }
  if (estado === 'incompleta') {
    return '#FFFBEB'
  }
  return '#FEF2F2'
}

export default function IngresoManual() {
  const [mostrarPegado, setMostrarPegado] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')
  const [filas, setFilas] = useState<FilaManual[]>([])
  const [resultado, setResultado] = useState<ImportacionResultado | null>(null)
  const [error, setError] = useState('')
  const [importando, setImportando] = useState(false)

  const resumen = filas.reduce(
    (acc, fila) => {
      const estado = obtenerEstadoFila(fila)
      acc[estado] += 1
      return acc
    },
    { ok: 0, incompleta: 0, error: 0 }
  )
  const filasValidas = resumen.ok

  function manejarPegado(texto: string) {
    setTextoPegado(texto)
    setResultado(null)
    setError('')
    setFilas(parsearTextoPegado(texto))
  }

  function actualizarCelda(id: string, campo: CampoEditable, valor: string) {
    setResultado(null)
    setError('')
    setFilas((prev) =>
      prev.map((fila) =>
        fila.id === id
          ? {
              ...fila,
              [campo]: campo === 'rut' ? formatearRut(valor) : valor,
            }
          : fila
      )
    )
  }

  async function importarFilas() {
    if (filas.length === 0) return

    setImportando(true)
    setError('')
    setResultado(null)

    try {
      const payload = filas.map((fila) => ({
        fecha_derivacion: normalizarFecha(fila.fecha_derivacion) ?? fila.fecha_derivacion.trim(),
        nombre: fila.nombre.trim(),
        rut: rutParaApi(fila.rut),
        edad: fila.edad.trim() === '' ? 0 : Number(fila.edad),
        sector_oficial: fila.sector_oficial.trim().toUpperCase(),
        sector_cesfam: fila.sector_cesfam.trim().toUpperCase(),
        diagnostico: fila.diagnostico.trim(),
        profesional: fila.profesional.trim() || 'KINESIOLOGO',
        prioridad: fila.prioridad.trim(),
        observaciones: fila.observaciones.trim(),
      }))

      const data = await api.post<ImportacionResultado>('/pacientes/ingreso-masivo/', {
        pacientes: payload,
      })
      setResultado(data)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'detail' in err) {
        setError((err as { detail: string }).detail)
      } else {
        setError('No se pudo completar el ingreso manual.')
      }
    } finally {
      setImportando(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-700">
          O ingresa manualmente copiando desde Excel
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Pega filas copiadas desde Excel y revísalas antes de importarlas.
        </p>
      </div>

      <div className="rounded-[10px] bg-white p-5" style={{ border: '0.5px solid #a8d4f0' }}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMostrarPegado((prev) => !prev)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: '#335fdb' }}
          >
            Pegar desde Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setTextoPegado('')
              setFilas([])
              setResultado(null)
              setError('')
            }}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            style={{ borderColor: '#a8d4f0' }}
          >
            Limpiar
          </button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: '#F0FDF4' }}>
              {resumen.ok} filas listas
            </span>
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: '#FFFBEB' }}>
              {resumen.incompleta} incompletas
            </span>
            <span className="rounded-full px-2.5 py-1" style={{ backgroundColor: '#FEF2F2' }}>
              {resumen.error} con error
            </span>
          </div>
        </div>

        {mostrarPegado && (
          <div className="mt-4">
            <textarea
              value={textoPegado}
              onChange={(e) => manejarPegado(e.target.value)}
              placeholder="Pega aqui filas copiadas desde Excel (TSV)."
              className="min-h-[140px] w-full rounded-xl border p-3 text-sm text-gray-700 outline-none"
              style={{ borderColor: '#a8d4f0', backgroundColor: '#FAFCFA' }}
            />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {filas.length > 0 && (
          <>
            <div
              className="mt-4 overflow-x-auto rounded-[10px]"
              style={{ border: '0.5px solid #a8d4f0', backgroundColor: '#FFFFFF' }}
            >
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead style={{ backgroundColor: '#FAFCFA', color: '#7A9A7A' }}>
                  <tr>
                    {COLUMNAS.map((columna) => (
                      <th
                        key={columna.key}
                        className="px-3 py-3 text-left text-[11px] font-semibold tracking-[0.2px]"
                        style={{ borderBottom: '0.5px solid #a8d4f0' }}
                      >
                        {columna.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => {
                    const estado = obtenerEstadoFila(fila)
                    return (
                      <tr key={fila.id} style={{ backgroundColor: coloresFila(estado) }}>
                        {COLUMNAS.map((columna) => (
                          <td
                            key={columna.key}
                            className="px-2 py-2 align-top"
                            style={{ borderTop: '0.5px solid #a8d4f0' }}
                          >
                            <input
                              value={fila[columna.key]}
                              onChange={(e) => actualizarCelda(fila.id, columna.key, e.target.value)}
                              placeholder={columna.placeholder}
                              className="w-full rounded-md border bg-white px-2 py-2 text-sm text-gray-700 outline-none"
                              style={{ borderColor: '#a8d4f0' }}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {filasValidas} fila{filasValidas !== 1 ? 's' : ''} listas para importar de un total de {filas.length}. Las filas amarillas o rojas conviene corregirlas antes de enviar.
              </p>
              <button
                type="button"
                onClick={importarFilas}
                disabled={importando || filasValidas === 0}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: '#335fdb' }}
              >
                {importando ? 'Importando...' : `Importar ${filas.length} registros`}
              </button>
            </div>
          </>
        )}
      </div>

      {resultado && (
        <div className="rounded-[10px] bg-white p-5 space-y-4" style={{ border: '0.5px solid #a8d4f0' }}>
          <h3 className="text-sm font-bold text-gray-700">Resultado del ingreso manual</h3>

          <div className="grid gap-3 text-center sm:grid-cols-3">
            <div className="rounded-lg p-3" style={{ backgroundColor: '#F9FAFB' }}>
              <p className="text-2xl font-bold text-gray-700">{resultado.total}</p>
              <p className="text-xs text-gray-400">Total enviado</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: '#F0FDF4' }}>
              <p className="text-2xl font-bold text-green-700">{resultado.importados}</p>
              <p className="text-xs text-gray-400">Importados</p>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ backgroundColor: resultado.duplicados > 0 ? '#FFFBEB' : '#F9FAFB' }}
            >
              <p
                className="text-2xl font-bold"
                style={{ color: resultado.duplicados > 0 ? '#976502' : '#6B7280' }}
              >
                {resultado.duplicados}
              </p>
              <p className="text-xs text-gray-400">Duplicados</p>
            </div>
          </div>

          {resultado.errores.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-700">Errores por fila</p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {resultado.errores.map((item, index) => (
                  <div key={`${item.fila}-${index}`} className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    Fila {item.fila}: {item.motivo}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
