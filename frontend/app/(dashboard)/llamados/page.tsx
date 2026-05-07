"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  FiX,
} from "react-icons/fi";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import { useToast } from "@/lib/toast-context";
import type { Paciente } from "@/lib/types";
import { ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import BadgeEstado from "@/components/BadgeEstado";
import EditarPacienteModal from "@/components/EditarPacienteModal";
import FichaPaciente from "@/components/FichaPaciente";

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

function fechaHoraLocalDefault() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
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

type AccionContacto = "CONTESTO" | "NO_CONTESTO";
const SEGUNDOS_CANCELAR_REGISTRO = 20;

const PRIORIDAD_ORDER: Record<string, number> = {
  ALTA: 1,
  MEDIANA: 2,
  MODERADA: 3,
  LICENCIA_MEDICA: 4,
};

interface ConfirmacionContacto {
  paciente: Paciente;
  accion: AccionContacto;
}

interface RegistroPendienteContacto {
  id: string;
  pacienteOriginal: Paciente;
  accion: AccionContacto;
  observacion: string;
  fechaAtencion: string;
}

function ordenarPacientesContactabilidad(pacientes: Paciente[], ordering: string) {
  return [...pacientes].sort((a, b) => {
    const pA = PRIORIDAD_ORDER[a.prioridad] ?? 99;
    const pB = PRIORIDAD_ORDER[b.prioridad] ?? 99;
    if (pA !== pB) return pA - pB;
    if (ordering === "dias") {
      return diasEnLlamados(a) - diasEnLlamados(b);
    }
    return diasEnLlamados(b) - diasEnLlamados(a);
  });
}

export default function LlamadosPage() {
  const { user } = useAuth();
  const { toast, error: toastError, info: toastInfo } = useToast();
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [observacionContacto, setObservacionContacto] = useState("");
  const [fechaAtencion, setFechaAtencion] = useState(fechaHoraLocalDefault());
  const [confirmacionContacto, setConfirmacionContacto] = useState<ConfirmacionContacto | null>(null);
  const [registroPendiente, setRegistroPendiente] = useState<RegistroPendienteContacto | null>(null);
  const [segundosCancelar, setSegundosCancelar] = useState(SEGUNDOS_CANCELAR_REGISTRO);
  const [accionLoading, setAccionLoading] = useState("");
  const [pacienteFicha, setPacienteFicha] = useState<Paciente | null>(null);
  const [pacienteEdicion, setPacienteEdicion] = useState<Paciente | null>(null);
  const timeoutRegistroRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRegistroRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filtros locales del módulo de cola de llamados.
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
      
      setPacientes(ordenarPacientesContactabilidad(todos, ordering));
    } catch (error) {
      setPacientes([]);
      const message = getErrorMessage(error, "No se pudo cargar la cola de llamados.");
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

  function aplicarPacienteContactabilidad(actualizado: Paciente) {
    const sigueEnCola = actualizado.estado === "PENDIENTE" || actualizado.estado === "RESCATE";
    setPacientes((prev) =>
      sigueEnCola
        ? prev.map((item) => (item.id === actualizado.id ? actualizado : item))
        : prev.filter((item) => item.id !== actualizado.id),
    );
    if (!sigueEnCola) {
      setSelectedId((actual) => (actual === actualizado.id ? null : actual));
    }
  }

  const limpiarTemporizadoresRegistro = useCallback(() => {
    if (timeoutRegistroRef.current) {
      clearTimeout(timeoutRegistroRef.current);
      timeoutRegistroRef.current = null;
    }
    if (intervalRegistroRef.current) {
      clearInterval(intervalRegistroRef.current);
      intervalRegistroRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => limpiarTemporizadoresRegistro();
  }, [limpiarTemporizadoresRegistro]);

  function restaurarPacienteEnCola(paciente: Paciente) {
    setPacientes((prev) => {
      const sinDuplicado = prev.filter((item) => item.id !== paciente.id);
      return ordenarPacientesContactabilidad([paciente, ...sinDuplicado], ordering);
    });
    setSelectedId(paciente.id);
  }

  function aplicarRegistroVisualPendiente(registro: RegistroPendienteContacto) {
    const paciente = registro.pacienteOriginal;

    if (registro.accion === "NO_CONTESTO" && paciente.estado === "PENDIENTE") {
      const pacienteVisual: Paciente = {
        ...paciente,
        estado: "RESCATE",
        n_intentos_contacto: paciente.n_intentos_contacto + 1,
        fecha_cambio_estado: new Date().toISOString(),
      };
      setPacientes((prev) =>
        prev.map((item) => (item.id === paciente.id ? pacienteVisual : item)),
      );
      setSelectedId(paciente.id);
      return;
    }

    setPacientes((prev) => prev.filter((item) => item.id !== paciente.id));
    setSelectedId((actual) => (actual === paciente.id ? null : actual));
  }

  function abrirConfirmacionContacto(paciente: Paciente, accion: AccionContacto) {
    if (registroPendiente) {
      toast.warning("Hay un registro pendiente. Cancélelo o espere que termine la cuenta regresiva.");
      return;
    }
    setConfirmacionContacto({ paciente, accion });
    setObservacionContacto("");
    setFechaAtencion(fechaHoraLocalDefault());
  }

  function cerrarConfirmacionContacto() {
    if (accionLoading) return;
    setConfirmacionContacto(null);
    setObservacionContacto("");
    setFechaAtencion(fechaHoraLocalDefault());
  }

  async function registrarNoContesto(paciente: Paciente, observacion: string) {
    const notas = observacion.trim();
    if (paciente.estado === "RESCATE" && !notas) {
      toast.warning("Debe registrar una observación para egreso administrativo.");
      return false;
    }

    setAccionLoading(`no-contesto-${paciente.id}`);
    try {
      const actualizado = await api.post<Paciente>(`/pacientes/${paciente.id}/registrar-llamado/`, {
        contesto: false,
        notas,
        telefono_usado: paciente.telefono || paciente.telefono_recados || "",
      });

      aplicarPacienteContactabilidad(actualizado);
      if (actualizado.estado === "EGRESO_ADMINISTRATIVO") {
        toast.warning("Segundo contacto sin respuesta. Paciente pasa a EGRESO ADMINISTRATIVO.");
      } else if (actualizado.estado === "RESCATE") {
        toast.warning("Contacto sin respuesta. Paciente pasa a RESCATE.");
      } else {
        toast.warning("Contacto sin respuesta registrado.");
      }
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo registrar el contacto."));
      return false;
    } finally {
      setAccionLoading("");
    }
  }

  async function registrarContesto(paciente: Paciente, observacion: string, fechaHora: string) {
    const notas = observacion.trim();
    if (!fechaHora) {
      toast.warning("Seleccione fecha y hora para programar la atención.");
      return false;
    }

    setAccionLoading(`contesto-${paciente.id}`);
    try {
      await api.post<Paciente>(`/pacientes/${paciente.id}/registrar-llamado/`, {
        contesto: true,
        notas,
        telefono_usado: paciente.telefono || paciente.telefono_recados || "",
      });

      const actualizado = await api.post<Paciente>(`/pacientes/${paciente.id}/programar-atencion/`, {
        fecha_hora: new Date(fechaHora).toISOString(),
      });

      aplicarPacienteContactabilidad(actualizado);
      toast.success("Contacto confirmado y atención programada.");
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo confirmar el contacto."));
      return false;
    } finally {
      setAccionLoading("");
    }
  }

  async function ejecutarRegistroPendiente(registro: RegistroPendienteContacto) {
    limpiarTemporizadoresRegistro();
    setSegundosCancelar(0);
    const guardado =
      registro.accion === "NO_CONTESTO"
        ? await registrarNoContesto(registro.pacienteOriginal, registro.observacion)
        : await registrarContesto(registro.pacienteOriginal, registro.observacion, registro.fechaAtencion);

    if (!guardado) {
      restaurarPacienteEnCola(registro.pacienteOriginal);
    }
    setRegistroPendiente((actual) => (actual?.id === registro.id ? null : actual));
    setSegundosCancelar(SEGUNDOS_CANCELAR_REGISTRO);
  }

  function programarRegistroPendiente(registro: RegistroPendienteContacto) {
    limpiarTemporizadoresRegistro();
    setRegistroPendiente(registro);
    setSegundosCancelar(SEGUNDOS_CANCELAR_REGISTRO);
    aplicarRegistroVisualPendiente(registro);
    setConfirmacionContacto(null);
    setObservacionContacto("");
    setFechaAtencion(fechaHoraLocalDefault());
    toast.info("Registro pendiente. Puede cancelarlo durante 20 segundos.");

    const creadoEn = Date.now();
    intervalRegistroRef.current = setInterval(() => {
      const restantes = Math.max(
        0,
        SEGUNDOS_CANCELAR_REGISTRO - Math.floor((Date.now() - creadoEn) / 1000),
      );
      setSegundosCancelar(restantes);
    }, 250);

    timeoutRegistroRef.current = setTimeout(() => {
      void ejecutarRegistroPendiente(registro);
    }, SEGUNDOS_CANCELAR_REGISTRO * 1000);
  }

  function cancelarRegistroPendiente() {
    if (!registroPendiente || accionLoading) return;
    limpiarTemporizadoresRegistro();
    restaurarPacienteEnCola(registroPendiente.pacienteOriginal);
    setRegistroPendiente(null);
    setSegundosCancelar(SEGUNDOS_CANCELAR_REGISTRO);
    toast.info("Registro cancelado. Paciente vuelve a la cola de llamados.");
  }

  function confirmarContacto() {
    if (!confirmacionContacto) return;
    if (registroPendiente) {
      toast.warning("Hay un registro pendiente. Cancélelo o espere que termine la cuenta regresiva.");
      return;
    }

    const { paciente, accion } = confirmacionContacto;
    if (accion === "NO_CONTESTO" && paciente.estado === "RESCATE" && !observacionContacto.trim()) {
      toast.warning("Debe registrar una observación para egreso administrativo.");
      return;
    }
    if (accion === "CONTESTO" && !fechaAtencion) {
      toast.warning("Seleccione fecha y hora para programar la atención.");
      return;
    }

    programarRegistroPendiente({
      id: `${accion}-${paciente.id}-${Date.now()}`,
      pacienteOriginal: paciente,
      accion,
      observacion: observacionContacto,
      fechaAtencion,
    });
  }

  if (!user) return null;

  return (
    <div className="space-y-3 text-[13px]">
      <header className="ccr-panel rounded-2xl p-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FiPhoneCall size={18} />
                </span>
                <div className="min-w-0">
                  <h1 className="text-lg font-black text-slate-950">Cola de llamados</h1>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    Bandeja para registrar si el paciente contestó o no contestó.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <ContactStat icon={<FiPhoneCall size={13} />} label="Cola" value={resumenContactabilidad.total} tone="blue" />
                <ContactStat icon={<FiMessageSquare size={13} />} label="Pendientes" value={resumenContactabilidad.pendientes} tone="slate" />
                <ContactStat icon={<FiPhoneMissed size={13} />} label="Rescate" value={resumenContactabilidad.rescate} tone="orange" />
                <ContactStat icon={<FiPhoneMissed size={13} />} label="Sin teléfono" value={resumenContactabilidad.sinTelefono} tone="red" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => void cargar()}
                className="ccr-button-refresh inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-bold"
              >
                <FiRefreshCw size={13} />
                Recargar
              </button>
              <button
                type="button"
                onClick={() => {
                  toastInfo("Preparando impresión de cola de llamados.");
                  window.print();
                }}
                className="ccr-control-button inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[11px] font-bold"
              >
                <FiPrinter size={13} />
                Imprimir
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(260px,1fr)_170px_170px_auto_auto]">
              <div className="relative">
                <FiSearch
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
                  size={14}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="Buscar por nombre o RUT"
                  className="ccr-control-input h-9 w-full px-9 text-xs"
                  aria-label="Buscar pacientes"
                />
              </div>

              <select
                className="ccr-control-input h-9 px-3 text-xs"
                value={estadoFilter}
                onChange={(event) => setEstadoFilter(event.target.value)}
              >
                <option value="TODOS">Todos los estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="RESCATE">Rescates</option>
              </select>

              <select
                className="ccr-control-input h-9 px-3 text-xs"
                value={prioridadFilter}
                onChange={(event) => setPrioridadFilter(event.target.value)}
              >
                <option value="TODAS">Todas las prioridades</option>
                <option value="ALTA">Alta</option>
                <option value="MEDIANA">Mediana</option>
                <option value="MODERADA">Moderada</option>
                <option value="LICENCIA_MEDICA">Lic. médica</option>
              </select>

              <button
                type="button"
                onClick={() => setOrdering((prev) => (prev === "dias" ? "-dias" : "dias"))}
                className="ccr-control-button inline-flex h-9 items-center justify-center whitespace-nowrap px-3 text-[11px]"
              >
                {ordering === "dias" ? "Más nuevos" : "Más antiguos"}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="ccr-control-button inline-flex h-9 items-center justify-center whitespace-nowrap px-3 text-[11px]"
              >
                Limpiar
              </button>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-800">
            <span className="inline-flex items-center gap-1.5"><FiPhoneMissed size={13} /> Pendiente sin respuesta pasa a Rescate</span>
            <span className="inline-flex items-center gap-1.5"><FiMessageSquare size={13} /> Rescate requiere observación</span>
            <span className="inline-flex items-center gap-1.5"><FiCheckCircle size={13} /> Contestó pasa a agenda</span>
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {registroPendiente && (
        <RegistroPendienteBanner
          registro={registroPendiente}
          segundos={segundosCancelar}
          loading={Boolean(accionLoading)}
          onCancel={cancelarRegistroPendiente}
        />
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
                    <h2 className="text-lg font-black text-slate-950">Cola de llamados</h2>
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
                        setObservacionContacto("");
                        setFechaAtencion(fechaHoraLocalDefault());
                      }}
                    />
                  ))}
                </div>
              </div>

              {pacienteSeleccionado && (
                <ContactabilidadDetail
                  paciente={pacienteSeleccionado}
                  loadingNoContesto={accionLoading === `no-contesto-${pacienteSeleccionado.id}`}
                  loadingContesto={accionLoading === `contesto-${pacienteSeleccionado.id}`}
                  registroPendienteActivo={Boolean(registroPendiente)}
                  onContesto={() => abrirConfirmacionContacto(pacienteSeleccionado, "CONTESTO")}
                  onNoContesto={() => abrirConfirmacionContacto(pacienteSeleccionado, "NO_CONTESTO")}
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

      {confirmacionContacto && (
        <ConfirmarContactoModal
          paciente={confirmacionContacto.paciente}
          accion={confirmacionContacto.accion}
          observacion={observacionContacto}
          fechaAtencion={fechaAtencion}
          loading={
            accionLoading ===
            `${confirmacionContacto.accion === "NO_CONTESTO" ? "no-contesto" : "contesto"}-${confirmacionContacto.paciente.id}`
          }
          onObservacionChange={setObservacionContacto}
          onFechaAtencionChange={setFechaAtencion}
          onCancel={cerrarConfirmacionContacto}
          onConfirm={() => void confirmarContacto()}
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
        <h1>Cola de llamados CCR</h1>
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
    <div className={`inline-flex h-7 items-center gap-2 rounded-full border px-2.5 ${tones[tone]}`}>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
        {icon}
        {label}
      </span>
      <strong className="text-xs">{value}</strong>
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
  loadingNoContesto,
  loadingContesto,
  registroPendienteActivo,
  onContesto,
  onNoContesto,
  onEditarContacto,
  onVerFicha,
}: {
  paciente: Paciente;
  loadingNoContesto: boolean;
  loadingContesto: boolean;
  registroPendienteActivo: boolean;
  onContesto: () => void;
  onNoContesto: () => void;
  onEditarContacto: () => void;
  onVerFicha: () => void;
}) {
  const telefonoPrincipal = paciente.telefono || paciente.telefono_recados || "Sin teléfono";
  const ultimoContacto = paciente.ultimo_llamado;
  const accionBloqueada = loadingNoContesto || loadingContesto || registroPendienteActivo;

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Paciente seleccionado</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-black leading-snug text-slate-950">
              {paciente.nombre}
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {paciente.id_ccr} · RUT {formatearRut(paciente.rut)}
            </p>
          </div>
          <div className="shrink-0">
            <BadgeEstado estado={paciente.estado} />
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="flex gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-800">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          {accionSugerida(paciente)}
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-100 py-3 text-xs">
          <p className="min-w-0">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-500">
              <FiPhone size={12} />
              Teléfono
            </span>
            <strong className="mt-0.5 block break-words text-slate-900">{telefonoPrincipal}</strong>
          </p>
          <p className="min-w-0">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-500">
              <FiUser size={12} />
              Responsable
            </span>
            <strong className="mt-0.5 block break-words text-slate-900">{responsablePaciente(paciente)}</strong>
          </p>
          <p className="col-span-2 min-w-0">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-500">
              <FiClock size={12} />
              Último contacto
            </span>
            <strong className="mt-0.5 block break-words text-slate-900">
              {ultimoContacto
                ? `${formatearFechaHora(ultimoContacto.fecha)} · ${ultimoContacto.resultado_label}`
                : "Sin contactos registrados"}
            </strong>
          </p>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
          El resultado se confirma en el siguiente paso. Luego tendrá 20 segundos para cancelar el registro.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onNoContesto}
            disabled={accionBloqueada}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#ED4E1D] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[#C93F16] disabled:opacity-50"
          >
            {loadingNoContesto ? <FiRefreshCw className="animate-spin" size={14} /> : <FiPhoneMissed size={14} />}
            No contestó
          </button>
          <button
            type="button"
            onClick={onContesto}
            disabled={accionBloqueada}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#335FDB] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[#284FC0] disabled:opacity-50"
          >
            {loadingContesto ? <FiRefreshCw className="animate-spin" size={14} /> : <FiCheckCircle size={14} />}
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
    </aside>
  );
}

function RegistroPendienteBanner({
  registro,
  segundos,
  loading,
  onCancel,
}: {
  registro: RegistroPendienteContacto;
  segundos: number;
  loading: boolean;
  onCancel: () => void;
}) {
  const esNoContesto = registro.accion === "NO_CONTESTO";
  const accionLabel = esNoContesto ? "No contestó" : "Contestó / agendar";

  return (
    <div
      role="status"
      className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">
            Registro pendiente
          </p>
          <p className="mt-1 break-words text-sm font-bold text-slate-900">
            {accionLabel}: {registro.pacienteOriginal.nombre}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">
            Se guardará automáticamente en {segundos}s. Si cancela, el paciente vuelve a la cola de llamados.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-4 text-xs font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
        >
          <FiX size={14} />
          Cancelar registro ({segundos}s)
        </button>
      </div>
    </div>
  );
}

function ConfirmarContactoModal({
  paciente,
  accion,
  observacion,
  fechaAtencion,
  loading,
  onObservacionChange,
  onFechaAtencionChange,
  onCancel,
  onConfirm,
}: {
  paciente: Paciente;
  accion: AccionContacto;
  observacion: string;
  fechaAtencion: string;
  loading: boolean;
  onObservacionChange: (value: string) => void;
  onFechaAtencionChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const esNoContesto = accion === "NO_CONTESTO";
  const requiereObservacion = esNoContesto && paciente.estado === "RESCATE";
  const confirmDisabled = loading || (requiereObservacion && !observacion.trim()) || (!esNoContesto && !fechaAtencion);
  const titulo = esNoContesto ? "Confirmar no contestó" : "Confirmar contacto";
  const descripcion = esNoContesto
    ? paciente.estado === "RESCATE"
      ? "Se registrará un segundo contacto sin respuesta y el paciente pasará a EGRESO ADMINISTRATIVO."
      : "Se registrará contacto sin respuesta y el paciente pasará a RESCATE."
    : "Se confirmará que el paciente contestó y se programará su atención.";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar confirmación"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Confirmación</p>
            <h2 className="mt-1 text-base font-black text-slate-950">{titulo}</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{descripcion}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="Cancelar"
          >
            <FiX size={16} />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="break-words text-sm font-black text-slate-950">{paciente.nombre}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {paciente.id_ccr} · RUT {formatearRut(paciente.rut)}
            </p>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Observación {requiereObservacion ? "obligatoria" : "opcional"}
            <textarea
              autoFocus
              value={observacion}
              onChange={(event) => onObservacionChange(event.target.value)}
              rows={3}
              placeholder={
                requiereObservacion
                  ? "Ingrese la observación antes de confirmar."
                  : "Ingrese una observación si corresponde."
              }
              className="ccr-control-input mt-1 w-full resize-none px-3 py-2 text-xs normal-case tracking-normal"
            />
          </label>

          {!esNoContesto && (
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Fecha y hora de atención
              <input
                type="datetime-local"
                value={fechaAtencion}
                onChange={(event) => onFechaAtencionChange(event.target.value)}
                className="ccr-control-input mt-1 h-9 w-full px-3 text-xs normal-case tracking-normal"
              />
            </label>
          )}

          {requiereObservacion && (
            <p className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-[11px] font-semibold text-orange-800">
              Para RESCATE la observación es obligatoria antes de confirmar.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-black text-white transition disabled:opacity-50 ${
              esNoContesto ? "bg-[#ED4E1D] hover:bg-[#C93F16]" : "bg-[#335FDB] hover:bg-[#284FC0]"
            }`}
          >
            {loading && <FiRefreshCw className="animate-spin" size={14} />}
            {esNoContesto ? "Confirmar no contestó" : "Confirmar y agendar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
