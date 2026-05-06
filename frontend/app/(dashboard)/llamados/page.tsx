"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiEye,
  FiMessageSquare,
  FiPhone,
  FiPhoneCall,
  FiPhoneMissed,
  FiPrinter,
  FiRefreshCw,
  FiSearch,
  FiUser,
} from "react-icons/fi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import { useToast } from "@/lib/toast-context";
import type { Paciente } from "@/lib/types";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import BadgePrioridad from "@/components/BadgePrioridad";
import EditarPacienteModal from "@/components/EditarPacienteModal";
import FichaPaciente from "@/components/FichaPaciente";
import RegistrarContactoModal from "@/components/RegistrarContactoModal";

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

function formatearFechaHora(fecha: string | null | undefined) {
  if (!fecha) return "Sin registro";
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return "Sin registro";
  return parsed.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function responsablePaciente(paciente: Paciente) {
  return paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? "Sin responsable";
}

function accionSugerida(paciente: Paciente) {
  if (paciente.estado === "RESCATE") {
    return "Registrar segundo contacto con observación si no contesta.";
  }
  return "Registrar contacto; si no contesta pasa a RESCATE.";
}

export default function LlamadosPage() {
  const { user } = useAuth();
  const { toast, error: toastError, info: toastInfo } = useToast();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [observacionRapida, setObservacionRapida] = useState("");
  const [accionLoading, setAccionLoading] = useState("");
  const [pacienteFicha, setPacienteFicha] = useState<Paciente | null>(null);
  const [pacienteContacto, setPacienteContacto] = useState<Paciente | null>(null);
  const [pacienteEdicion, setPacienteEdicion] = useState<Paciente | null>(null);

  // Filtros locales del módulo de contactabilidad.
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
    } catch (error) {
      setPacientes([]);
      const message = getErrorMessage(error, "No se pudo cargar la lista de contactabilidad.");
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [user, ordering, toastError]);

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

  useEffect(() => {
    if (pacientesFiltrados.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !pacientesFiltrados.some((paciente) => paciente.id === selectedId)) {
      setSelectedId(pacientesFiltrados[0].id);
    }
  }, [pacientesFiltrados, selectedId]);

  const pacienteSeleccionado =
    pacientesFiltrados.find((paciente) => paciente.id === selectedId) ?? pacientesFiltrados[0] ?? null;

  const resumenContactabilidad = useMemo(
    () => ({
      total: pacientes.length,
      pendientes: pacientes.filter((p) => p.estado === "PENDIENTE").length,
      rescate: pacientes.filter((p) => p.estado === "RESCATE").length,
      sinTelefono: pacientes.filter((p) => !p.telefono && !p.telefono_recados).length,
    }),
    [pacientes],
  );

  function clearFilters() {
    setSearchQuery("");
    setPrioridadFilter("TODAS");
    setEstadoFilter("TODOS");
  }

  async function registrarNoContesto(paciente: Paciente) {
    const notas = observacionRapida.trim();
    if (paciente.estado === "RESCATE" && !notas) {
      toast.warning("Debe registrar una observación para egreso administrativo.");
      return;
    }

    setAccionLoading(`no-contesto-${paciente.id}`);
    try {
      const actualizado = await api.post<Paciente>(`/pacientes/${paciente.id}/registrar-llamado/`, {
        contesto: false,
        notas,
        telefono_usado: paciente.telefono || paciente.telefono_recados || "",
      });

      setPacientes((prev) => prev.map((item) => (item.id === actualizado.id ? actualizado : item)));
      setObservacionRapida("");
      if (actualizado.estado === "EGRESO_ADMINISTRATIVO") {
        toast.warning("Segundo contacto sin respuesta. Paciente pasa a EGRESO ADMINISTRATIVO.");
      } else {
        toast.warning("Contacto sin respuesta registrado.");
      }
      await cargar();
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo registrar el contacto."));
    } finally {
      setAccionLoading("");
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-3 text-[13px]">
      <header className="ccr-panel rounded-2xl p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FiPhoneCall size={18} />
                </span>
                <h1 className="text-lg font-bold text-gray-900">Contactabilidad</h1>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Gestión operativa de contactos para pacientes pendientes o en rescate.
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
              onClick={() => {
                toastInfo("Preparando impresión de contactabilidad.");
                window.print();
              }}
              className="ccr-control-button inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold sm:w-auto"
            >
              <FiPrinter size={13} />
              Imprimir lista de contactabilidad
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <ContactStat
              icon={<FiPhoneCall size={16} />}
              label="En cola"
              value={resumenContactabilidad.total}
              tone="blue"
            />
            <ContactStat
              icon={<FiMessageSquare size={16} />}
              label="Pendientes"
              value={resumenContactabilidad.pendientes}
              tone="slate"
            />
            <ContactStat
              icon={<FiPhoneMissed size={16} />}
              label="Rescate"
              value={resumenContactabilidad.rescate}
              tone="orange"
            />
            <ContactStat
              icon={<FiPhoneMissed size={16} />}
              label="Sin teléfono"
              value={resumenContactabilidad.sinTelefono}
              tone="red"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="relative">
              <FiSearch
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOrdering((prev) => (prev === "dias" ? "-dias" : "dias"))}
              className="ccr-control-button inline-flex h-[34px] w-full items-center justify-center px-3 text-[11px] sm:w-auto"
            >
              {ordering === "dias" ? "Menor antigüedad primero" : "Mayor antigüedad primero"}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="ccr-control-button inline-flex h-[34px] w-full items-center justify-center px-3 text-[11px] sm:w-auto"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] font-semibold text-blue-800 md:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <FiPhoneMissed size={14} />
              PENDIENTE sin respuesta pasa a RESCATE
            </span>
            <span className="inline-flex items-center gap-2">
              <FiMessageSquare size={14} />
              RESCATE sin respuesta requiere observación
            </span>
            <span className="inline-flex items-center gap-2">
              <FiCheckCircle size={14} />
              Contacto confirmado pasa a INGRESADO
            </span>
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
        <section className="grid min-h-[620px] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_430px]">
          {pacientesFiltrados.length === 0 ? (
            <div className="ccr-panel rounded-2xl p-10 text-center text-sm font-semibold text-slate-500 xl:col-span-2">
              Sin pacientes para los filtros seleccionados.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">Cola de contactabilidad</h2>
                    <p className="text-xs font-semibold text-slate-500">
                      {pacientesFiltrados.length} paciente{pacientesFiltrados.length !== 1 ? "s" : ""} visible{pacientesFiltrados.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    Registro manual
                  </span>
                </div>
                <div className="custom-scrollbar max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {pacientesFiltrados.map((paciente) => (
                    <ContactabilidadListItem
                      key={paciente.id}
                      paciente={paciente}
                      selected={pacienteSeleccionado?.id === paciente.id}
                      onSelect={() => {
                        setSelectedId(paciente.id);
                        setObservacionRapida("");
                      }}
                    />
                  ))}
                </div>
              </div>

              {pacienteSeleccionado && (
                <ContactabilidadDetail
                  paciente={pacienteSeleccionado}
                  observacion={observacionRapida}
                  loading={accionLoading === `no-contesto-${pacienteSeleccionado.id}`}
                  onObservacionChange={setObservacionRapida}
                  onContesto={() => setPacienteContacto(pacienteSeleccionado)}
                  onNoContesto={() => void registrarNoContesto(pacienteSeleccionado)}
                  onEditarContacto={() => setPacienteEdicion(pacienteSeleccionado)}
                  onVerFicha={() => setPacienteFicha(pacienteSeleccionado)}
                />
              )}
            </>
          )}
        </section>
      )}

      {pacienteFicha && (
        <FichaPaciente
          paciente={pacienteFicha}
          usuario={user}
          onClose={() => setPacienteFicha(null)}
          onRefresh={() => {
            void cargar();
            setPacienteFicha(null);
          }}
        />
      )}

      {pacienteContacto && (
        <RegistrarContactoModal
          paciente={pacienteContacto}
          startWithScheduler
          onClose={() => setPacienteContacto(null)}
          onSuccess={(actualizado) => {
            if (actualizado) {
              setPacientes((prev) =>
                prev.map((item) => (item.id === actualizado.id ? actualizado : item)),
              );
            }
            void cargar();
          }}
        />
      )}

      {pacienteEdicion && (
        <EditarPacienteModal
          paciente={pacienteEdicion}
          mode="contact-only"
          onClose={() => setPacienteEdicion(null)}
          onGuardado={(actualizado) => {
            setPacientes((prev) =>
              prev.map((item) => (item.id === actualizado.id ? actualizado : item)),
            );
            setPacienteEdicion(null);
          }}
        />
      )}
      <section className="ccr-llamados-print hidden">
        <h1>Lista de contactabilidad CCR</h1>
        <p>Fecha de impresión: {formatearFechaImpresion()}</p>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Prioridad</th>
              <th>Responsable CCR</th>
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
                <td>{paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? "Sin responsable"}</td>
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

function ContactStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "blue" | "slate" | "orange" | "red";
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
    red: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        {icon}
        {label}
      </span>
      <strong className="text-base">{value}</strong>
    </div>
  );
}

function ContactabilidadListItem({
  paciente,
  selected,
  onSelect,
}: {
  paciente: Paciente;
  selected: boolean;
  onSelect: () => void;
}) {
  const telefonoPrincipal = paciente.telefono || paciente.telefono_recados || "Sin teléfono";
  const ultimoContacto = paciente.ultimo_llamado;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border bg-white p-3 text-left transition ${
        selected
          ? "border-[#335FDB] shadow-[0_0_0_2px_rgba(51,95,219,0.18)]"
          : "border-slate-200 hover:border-blue-200 hover:bg-blue-50/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-slate-950">
            {paciente.nombre}
          </h2>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
            {paciente.id_ccr} · {telefonoPrincipal}
          </p>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
            {ultimoContacto ? ultimoContacto.resultado_label : "Sin contactos registrados"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
              paciente.estado === "RESCATE"
                ? "bg-orange-50 text-orange-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {ESTADO_LABELS[paciente.estado]}
          </span>
          <FiChevronRight className={selected ? "text-[#335FDB]" : "text-slate-300"} size={16} />
        </div>
      </div>
    </button>
  );
}

function ContactabilidadDetail({
  paciente,
  observacion,
  loading,
  onObservacionChange,
  onContesto,
  onNoContesto,
  onEditarContacto,
  onVerFicha,
}: {
  paciente: Paciente;
  observacion: string;
  loading: boolean;
  onObservacionChange: (value: string) => void;
  onContesto: () => void;
  onNoContesto: () => void;
  onEditarContacto: () => void;
  onVerFicha: () => void;
}) {
  const telefonoPrincipal = paciente.telefono || paciente.telefono_recados || "Sin teléfono";
  const ultimoContacto = paciente.ultimo_llamado;
  const requiereObservacion = paciente.estado === "RESCATE";

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Paciente seleccionado</p>
            <h2 className="mt-1 break-words text-xl font-black leading-tight text-slate-950">
              {paciente.nombre}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {paciente.id_ccr} · RUT {formatearRut(paciente.rut)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <BadgeEstado estado={paciente.estado} />
            <BadgePrioridad prioridad={paciente.prioridad} />
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <section className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-3">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-orange-700">
            <FiAlertTriangle />
            Acción requerida
          </p>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-800">
            {accionSugerida(paciente)}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-2">
          <ContactInfo icon={<FiPhone />} label="Teléfono" value={telefonoPrincipal} emphasis />
          <ContactInfo icon={<FiMessageSquare />} label="Recados" value={paciente.telefono_recados || "Sin teléfono de recados"} />
          <ContactInfo icon={<FiUser />} label="Responsable CCR" value={responsablePaciente(paciente)} />
          <ContactInfo
            icon={<FiClock />}
            label="Último contacto"
            value={
              ultimoContacto
                ? `${formatearFechaHora(ultimoContacto.fecha)} · ${ultimoContacto.resultado_label}`
                : "Sin contactos registrados"
            }
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wide text-slate-600">Registro manual</p>
            <span className="text-[10px] font-semibold text-slate-500">No realiza llamadas desde el PC</span>
          </div>
          <textarea
            value={observacion}
            onChange={(event) => onObservacionChange(event.target.value)}
            rows={3}
            placeholder={requiereObservacion ? "Observación obligatoria para egreso administrativo." : "Observación opcional del contacto."}
            className="ccr-control-input w-full resize-none px-3 py-2 text-sm"
          />
          {requiereObservacion && (
            <p className="mt-2 text-[11px] font-semibold text-orange-700">
              En RESCATE, un nuevo “No contestó” requiere observación.
            </p>
          )}
        </section>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-200 px-3 py-2">
            <p className="truncate text-sm font-black text-emerald-800">{paciente.nombre}</p>
            <span className="text-[11px] font-semibold text-emerald-700">{paciente.n_intentos_contacto} intento{paciente.n_intentos_contacto !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <button
              type="button"
              onClick={onNoContesto}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED4E1D] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[#C93F16] disabled:opacity-50"
            >
              {loading ? <FiRefreshCw className="animate-spin" size={14} /> : <FiPhoneMissed size={14} />}
              No contestó
            </button>
            <button
              type="button"
              onClick={onContesto}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#335FDB] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[#284FC0] disabled:opacity-50"
            >
              <FiCheckCircle size={14} />
              Contestó / agendar
            </button>
            <button
              type="button"
              onClick={onEditarContacto}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
            >
              <FiEdit2 size={14} />
              Editar contacto
            </button>
            <button
              type="button"
              onClick={onVerFicha}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50"
            >
              <FiEye size={14} />
              Ver ficha
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ContactInfo({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 break-words text-sm ${emphasis ? "font-black text-slate-950" : "font-semibold text-slate-700"}`}>
        {value}
      </p>
    </div>
  );
}
