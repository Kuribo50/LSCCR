"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { FiPrinter, FiRefreshCw, FiSearch } from "react-icons/fi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { Paciente } from "@/lib/types";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import PacienteTable from "@/components/PacienteTable";

function normalizeRut(value: string) {
  return value.toLowerCase().replace(/[^0-9k]/g, "");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

function calcularDiasDesde(fecha: string | null | undefined) {
  if (!fecha) return null;
  const inicio = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diffMs = hoy.getTime() - inicio.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86400000);
}

function diasEnLlamados(paciente: Paciente) {
  return calcularDiasDesde(paciente.fecha_cambio_estado) ?? paciente.dias_en_lista;
}

function formatearFechaImpresion() {
  return new Date().toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LlamadosPage() {
  const { user } = useAuth();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros locales de la cola de llamados.
  const [searchQuery, setSearchQuery] = useState("");
  const [prioridadFilter, setPrioridadFilter] = useState("TODAS");
  const [estadoFilter, setEstadoFilter] = useState("TODOS");
  const [ordering, setOrdering] = useState("-dias");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pendientes, rescate] = await Promise.all([
        api.get<Paciente[]>(`/pacientes/?estado=PENDIENTE`),
        api.get<Paciente[]>(`/pacientes/?estado=RESCATE`),
      ]);
      const todos = [...pendientes, ...rescate].filter((p) => {
        if (p.kine_asignado === null) return false;
        if (user?.rol === "KINE" && p.kine_asignado !== user.id) return false;
        return true;
      });
      
      const prioridadOrder: Record<string, number> = {
        ALTA: 1,
        MEDIANA: 2,
        MODERADA: 3,
        LICENCIA_MEDICA: 4,
      };
      
      todos.sort((a, b) => {
        const pA = prioridadOrder[a.prioridad] ?? 99;
        const pB = prioridadOrder[b.prioridad] ?? 99;
        if (pA !== pB) return pA - pB;
        if (ordering === "dias") {
          return diasEnLlamados(a) - diasEnLlamados(b);
        }
        return diasEnLlamados(b) - diasEnLlamados(a);
      });
      setPacientes(todos);
    } catch {
      setPacientes([]);
      setError("No se pudo cargar la cola de llamados.");
    } finally {
      setLoading(false);
    }
  }, [user, ordering]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Lista visible después de aplicar filtros locales.
  const pacientesFiltrados = useMemo(() => {
    return pacientes.filter((p) => {
      // Búsqueda por RUT o Nombre
      if (searchQuery) {
        const queryText = normalizeSearchText(searchQuery);
        const queryRut = normalizeRut(searchQuery);
        const matchesNombre = normalizeSearchText(p.nombre).includes(queryText);
        const matchesRut = normalizeRut(p.rut).includes(queryRut);
        if (!matchesNombre && !matchesRut) return false;
      }
      
      // Filtro por Prioridad
      if (prioridadFilter !== "TODAS" && p.prioridad !== prioridadFilter) {
        return false;
      }

      // Filtro por Estado
      if (estadoFilter !== "TODOS" && p.estado !== estadoFilter) {
        return false;
      }
      
      return true;
    });
  }, [pacientes, searchQuery, prioridadFilter, estadoFilter]);

  function clearFilters() {
    setSearchQuery("");
    setPrioridadFilter("TODAS");
    setEstadoFilter("TODOS");
  }

  if (!user) return null;

  return (
    <div className="space-y-3 text-[13px]">
      <header className="ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Cola de Llamados</h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Gestión de pacientes en estado pendiente o rescate.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void cargar()}
              className="ccr-button-refresh inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold sm:w-auto"
            >
              <FiRefreshCw size={13} />
              Recargar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="ccr-control-button inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold sm:w-auto"
            >
              <FiPrinter size={13} />
              Imprimir lista de llamados
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="relative">
              <FiSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A9585]"
                size={15}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="Buscar por nombre o RUT"
                className="ccr-control-input w-full px-9 py-2.5 text-xs"
                aria-label="Buscar pacientes"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                className="ccr-control-input px-3 py-2.5 text-xs"
                value={estadoFilter}
                onChange={(event) => setEstadoFilter(event.target.value)}
              >
                <option value="TODOS">Todos los estados</option>
                <option value="PENDIENTE">Solo pendientes</option>
                <option value="RESCATE">Solo rescates</option>
              </select>

              <select
                className="ccr-control-input px-3 py-2.5 text-xs"
                value={prioridadFilter}
                onChange={(event) => setPrioridadFilter(event.target.value)}
              >
                <option value="TODAS">Todas las prioridades</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIANA">Mediana</option>
                <option value="MODERADA">Moderada</option>
                <option value="LICENCIA_MEDICA">Lic. médica</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="ccr-control-button inline-flex h-[34px] w-full items-center justify-center px-3 text-[11px] sm:w-auto"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div
          className="ccr-panel rounded-2xl p-12 text-center text-sm text-gray-400 animate-pulse"
          style={{ border: "0.5px solid #a8d4f0" }}
        >
          Cargando…
        </div>
      ) : (
        <PacienteTable 
          pacientes={pacientesFiltrados} 
          usuario={user} 
          onRefresh={cargar} 
          ordering={ordering}
          daysMode="llamados"
          showProximaAtencion={false}
          onToggleDiasOrder={() => {
            setOrdering((prev) => (prev === "dias" ? "-dias" : "dias"));
          }}
        />
      )}
      <section className="ccr-llamados-print hidden">
        <h1>Lista de llamados CCR</h1>
        <p>Fecha de impresión: {formatearFechaImpresion()}</p>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Prioridad</th>
              <th>Responsable</th>
              <th>Teléfono</th>
              <th>Intentos contacto</th>
              <th>Estado</th>
              <th>Observación breve</th>
            </tr>
          </thead>
          <tbody>
            {pacientesFiltrados.map((paciente) => (
              <tr key={paciente.id}>
                <td>{paciente.nombre}</td>
                <td>{paciente.rut}</td>
                <td>{PRIORIDAD_LABELS[paciente.prioridad]}</td>
                <td>{paciente.kine_asignado_nombre ?? "Sin responsable"}</td>
                <td>{paciente.telefono || paciente.telefono_recados || "Sin teléfono"}</td>
                <td>{paciente.n_intentos_contacto}</td>
                <td>{ESTADO_LABELS[paciente.estado]}</td>
                <td>{paciente.observaciones || paciente.ultimo_llamado?.notas || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .ccr-llamados-print,
          .ccr-llamados-print * {
            visibility: visible !important;
          }
          .ccr-llamados-print {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 16px !important;
            background: white !important;
            color: #111827 !important;
          }
          .ccr-llamados-print h1 {
            font-size: 18px !important;
            font-weight: 700 !important;
            margin-bottom: 6px !important;
          }
          .ccr-llamados-print p {
            font-size: 11px !important;
            margin-bottom: 12px !important;
          }
          .ccr-llamados-print table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 10px !important;
          }
          .ccr-llamados-print th,
          .ccr-llamados-print td {
            border: 1px solid #d1d5db !important;
            padding: 5px !important;
            text-align: left !important;
            vertical-align: top !important;
          }
          .ccr-llamados-print th {
            background: #e7f3ec !important;
            font-weight: 700 !important;
          }
        }
      `}</style>
    </div>
  );
}
