"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type {
  Estado,
  HistorialAccionesPaciente,
  HistorialAccionPaciente,
  HistorialCompletoPaciente,
  InasistenciaPaciente,
  LlamadoPaciente,
  Paciente,
  Usuario,
} from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { useToast } from "@/lib/toast-context";
import {
  FiCalendar,
  FiAlertTriangle,
  FiClock,
  FiEdit2,
  FiFileText,
  FiPhone,
  FiPrinter,
  FiRefreshCw,
  FiUser,
  FiX,
} from "react-icons/fi";
import BadgeEstado from "./BadgeEstado";
import BadgePrioridad from "./BadgePrioridad";
import CambiarEstadoModal from "./CambiarEstadoModal";
import EditarPacienteModal from "./EditarPacienteModal";
import ProximaAtencionModal from "./ProximaAtencionModal";
import RegistrarContactoModal from "./RegistrarContactoModal";
import RegistrarInasistenciaModal from "./RegistrarInasistenciaModal";

interface Props {
  paciente: Paciente;
  usuario: Usuario;
  onClose: () => void;
  onRefresh: () => void;
}

function calcularDiasDesde(fecha: string | null | undefined) {
  if (!fecha) return 0;
  const inicio = new Date(fecha.includes("T") ? fecha : `${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  inicio.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoy.getTime() - inicio.getTime()) / 86400000));
}

function formatearFecha(fecha: string | null | undefined) {
  if (!fecha) return "-";
  const parsed = new Date(fecha.includes("T") ? fecha : `${fecha}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-CL");
}

function formatearFechaHora(fecha: string | null | undefined) {
  if (!fecha) return "-";
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 break-words text-base font-semibold text-slate-800">
        {displayValue}
      </div>
    </div>
  );
}

function PrintField({ label, value }: { label: string; value: ReactNode }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;
  return (
    <div className="border-b border-slate-200 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">
        {displayValue}
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-blue-700">
        {icon}
        <h3 className="text-base font-black uppercase tracking-[0.06em]">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

export default function FichaPaciente({
  paciente: pacienteInicial,
  usuario,
  onClose,
  onRefresh,
}: Props) {
  const { warning: toastWarning, info: toastInfo } = useToast();
  const [paciente, setPaciente] = useState<Paciente>(pacienteInicial);
  const [llamados, setLlamados] = useState<LlamadoPaciente[]>([]);
  const [inasistencias, setInasistencias] = useState<InasistenciaPaciente[]>([]);
  const [acciones, setAcciones] = useState<HistorialAccionPaciente[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [error, setError] = useState("");
  const [mostrarCambioEstado, setMostrarCambioEstado] = useState(false);
  const [mostrarContacto, setMostrarContacto] = useState(false);
  const [mostrarInasistencia, setMostrarInasistencia] = useState(false);
  const [mostrarProgramacion, setMostrarProgramacion] = useState(false);
  const [mostrarEdicion, setMostrarEdicion] = useState(false);

  const diasEnLista = paciente.dias_en_lista ?? calcularDiasDesde(paciente.fecha_derivacion);
  const ultimoLlamado = llamados[0] ?? paciente.ultimo_llamado ?? null;
  const ultimaInasistencia =
    inasistencias[0] ?? paciente.ultima_inasistencia ?? null;
  const totalLlamados = paciente.llamados_count ?? llamados.length;
  const totalInasistencias =
    paciente.inasistencias_count ?? inasistencias.length;
  const alertaPosibleAbandono =
    paciente.estado === "INGRESADO" && (paciente.n_inasistencias ?? 0) >= 2;

  const puedeCambiarEstado = useMemo(() => {
    if (usuario.rol === "KINE" || usuario.rol === "ADMIN") return true;
    return usuario.rol === "ADMINISTRATIVO" && Boolean(paciente.kine_asignado);
  }, [usuario.rol, paciente.kine_asignado]);

  const puedeRegistrarLlamado =
    ["PENDIENTE", "RESCATE"].includes(paciente.estado) &&
    paciente.kine_asignado !== null &&
    (usuario.rol === "ADMIN" ||
      usuario.rol === "ADMINISTRATIVO" ||
      usuario.rol === "KINE");

  const puedeProgramar =
    ["PENDIENTE", "RESCATE", "INGRESADO"].includes(paciente.estado) &&
    paciente.kine_asignado !== null &&
    (usuario.rol === "ADMIN" ||
      (usuario.rol === "KINE" && paciente.kine_asignado === usuario.id));

  const cargarHistorial = useCallback(async (id: number) => {
    setLoadingHistorial(true);
    setError("");
    try {
      const data = await api.get<HistorialCompletoPaciente>(
        `/pacientes/${id}/historial-completo/`,
      );
      setPaciente(data.paciente);
      setLlamados(data.llamados);
      setInasistencias(data.inasistencias);
    } catch {
      setLlamados([]);
      setInasistencias([]);
      const message =
        "No se pudo cargar el historial completo. Se mantienen los datos básicos del paciente.";
      setError(message);
      toastWarning(message);
    }

    try {
      const data = await api.get<HistorialAccionesPaciente>(
        `/pacientes/${id}/historial-acciones/`,
      );
      setAcciones(data.acciones);
    } catch {
      setAcciones([]);
      const message =
        "No se pudo cargar el historial de acciones. Se mantienen los datos básicos del paciente.";
      setError((prev) => prev || message);
      toastWarning(message);
    } finally {
      setLoadingHistorial(false);
    }
  }, [toastWarning]);

  useEffect(() => {
    setPaciente(pacienteInicial);
  }, [pacienteInicial]);

  useEffect(() => {
    void cargarHistorial(pacienteInicial.id);
  }, [cargarHistorial, pacienteInicial.id]);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  async function handleCambiarEstado(estado: Estado, notas: string) {
    const actualizado = await api.post<Paciente>(
      `/pacientes/${paciente.id}/cambiar-estado/`,
      { estado, notas },
    );
    setPaciente(actualizado);
    onRefresh();
    await cargarHistorial(paciente.id);
  }

  function imprimirFicha() {
    toastInfo("Preparando impresión de ficha operativa.");
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <div
      className="ccr-ficha-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="ccr-ficha-printable h-[min(92vh,920px)] w-full max-w-6xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ccr-ficha-screen">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 pr-12 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                Ficha operativa CCR
              </p>
              <h2 className="mt-1 break-words text-xl font-semibold leading-tight text-slate-950">
                {paciente.id_ccr} · {paciente.nombre}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                RUT {formatearRut(paciente.rut)} · {diasEnLista} días en lista
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BadgeEstado estado={paciente.estado} />
              <BadgePrioridad prioridad={paciente.prioridad} />
              <button
                type="button"
                onClick={() => setMostrarEdicion(true)}
                className="ccr-no-print inline-flex items-center gap-1 rounded-md bg-[#335FDB] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0]"
              >
                <FiEdit2 size={14} />
                Editar
              </button>
              <button
                type="button"
                onClick={imprimirFicha}
                className="ccr-no-print inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
              >
                <FiPrinter size={14} />
                Imprimir ficha operativa
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ccr-no-print absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
            aria-label="Cerrar ficha"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="space-y-4 bg-slate-50/60 p-5">
          {error && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {error}
            </p>
          )}
          {alertaPosibleAbandono && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <div className="flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                <span>
                  Paciente tiene {paciente.n_inasistencias} inasistencias no justificadas.
                  Evaluar marcar como ABANDONO.
                </span>
              </div>
            </div>
          )}

          <div className="ccr-no-print flex flex-wrap gap-2">
            {puedeCambiarEstado && (
              <button
                type="button"
                onClick={() => setMostrarCambioEstado(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[#335FDB] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#284FC0]"
              >
                <FiRefreshCw size={14} />
                Cambiar estado
              </button>
            )}
            {puedeRegistrarLlamado && (
              <button
                type="button"
                onClick={() => setMostrarContacto(true)}
                className="inline-flex items-center gap-2 rounded-md bg-[#335FDB] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#284FC0]"
              >
                <FiPhone size={14} />
                Registrar contacto
              </button>
            )}
            {paciente.estado === "INGRESADO" && puedeCambiarEstado && (
              <button
                type="button"
                onClick={() => setMostrarInasistencia(true)}
                className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
              >
                <FiCalendar size={14} />
                Registrar inasistencia
              </button>
            )}
            {puedeProgramar && (
              <button
                type="button"
                onClick={() => setMostrarProgramacion(true)}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                <FiClock size={14} />
                {paciente.proxima_atencion ? "Reprogramar atención" : "Programar atención"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Section icon={<FiUser />} title="Datos generales">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nombre" value={paciente.nombre} />
                <Field label="RUT" value={formatearRut(paciente.rut)} />
                <Field label="Edad" value={`${paciente.edad} años`} />
                <Field label="Mayor 60" value={paciente.mayor_60 ? "Sí" : "No"} />
                <Field label="Usuario preferente" value="No registrado" />
                <Field
                  label="Responsable CCR"
                  value={paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? "Sin asignar"}
                />
              </div>
            </Section>

            <Section icon={<FiFileText />} title="Derivación">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Fecha derivación" value={formatearFecha(paciente.fecha_derivacion)} />
                <Field label="Desde" value={paciente.percapita_desde || "-"} />
                <Field label="Profesional" value={paciente.profesional || "-"} />
                <Field label="Categoría" value={CATEGORIA_LABELS[paciente.categoria]} />
                <Field label="Prioridad" value={PRIORIDAD_LABELS[paciente.prioridad]} />
                <Field label="Diagnóstico" value={paciente.diagnostico || "-"} />
              </div>
            </Section>

            <Section icon={<FiPhone />} title="Contacto">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Teléfono" value={paciente.telefono || "Sin teléfono"} />
                <Field
                  label="Teléfono recados"
                  value={paciente.telefono_recados || "Sin teléfono de recados"}
                />
                <Field label="Email" value={paciente.email || "Sin email"} />
                <Field
                  label="Intentos contacto"
                  value={paciente.n_intentos_contacto}
                />
                <Field
                  label="Último contacto"
                  value={
                    ultimoLlamado
                      ? `${formatearFechaHora(ultimoLlamado.fecha)} · ${ultimoLlamado.resultado_label}`
                      : "Sin contactos"
                  }
                />
                <Field label="Total contactos" value={totalLlamados} />
                <Field
                  label="Próxima acción"
                  value={ultimoLlamado?.proxima_accion || "-"}
                />
              </div>
            </Section>

            <Section icon={<FiCalendar />} title="Gestión CCR">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Estado actual" value={ESTADO_LABELS[paciente.estado]} />
                <Field
                  label="Fecha cambio estado"
                  value={formatearFechaHora(paciente.fecha_cambio_estado)}
                />
                <Field label="Fecha ingreso" value={formatearFecha(paciente.fecha_ingreso)} />
                <Field label="Fecha egreso" value={formatearFecha(paciente.fecha_egreso)} />
                <Field
                  label="Próxima atención"
                  value={formatearFechaHora(paciente.proxima_atencion)}
                />
                <Field
                  label="Inasistencias"
                  value={paciente.n_inasistencias ?? 0}
                />
                <Field
                  label="Total inasistencias"
                  value={totalInasistencias}
                />
                <Field
                  label="Última inasistencia"
                  value={
                    ultimaInasistencia
                      ? `${formatearFecha(ultimaInasistencia.fecha)} · ${
                          ultimaInasistencia.justificada ? "Justificada" : "No justificada"
                        }`
                      : "Sin inasistencias"
                  }
                />
                <Field
                  label="Motivo última inasistencia"
                  value={paciente.motivo_ultima_inasistencia || ultimaInasistencia?.motivo || "-"}
                />
              </div>
            </Section>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-blue-700">
                <FiClock />
                <h3 className="text-base font-black uppercase tracking-[0.06em]">
                  Historial de acciones
                </h3>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                {acciones.length} evento{acciones.length !== 1 ? "s" : ""}
              </span>
            </div>
            {loadingHistorial ? (
              <p className="text-sm text-slate-500">Cargando historial...</p>
            ) : (
              <HistorialAcciones items={acciones} />
            )}
          </section>
        </div>
        </div>

        <div className="ccr-ficha-print-only hidden bg-white p-8 text-slate-900">
          <div className="mb-6 border-b-2 border-[#1B5E3B] pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#1B5E3B]">
              Ficha operativa CCR
            </p>
            <h1 className="mt-2 text-2xl font-black">
              {paciente.id_ccr} · {paciente.nombre}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Documento operativo interno. No reemplaza Trak ni ficha clínica institucional.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <PrintField label="ID CCR" value={paciente.id_ccr} />
            <PrintField label="Nombre" value={paciente.nombre} />
            <PrintField label="RUT" value={formatearRut(paciente.rut)} />
            <PrintField label="Edad" value={`${paciente.edad} años`} />
            <PrintField label="Mayor 60" value={paciente.mayor_60 ? "Sí" : "No"} />
            <PrintField
              label="Responsable CCR"
              value={paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? "Sin asignar"}
            />
            <PrintField label="Fecha derivación" value={formatearFecha(paciente.fecha_derivacion)} />
            <PrintField label="Desde" value={paciente.percapita_desde || "-"} />
            <PrintField label="Diagnóstico" value={paciente.diagnostico || "-"} />
            <PrintField label="Profesional" value={paciente.profesional || "-"} />
            <PrintField label="Categoría" value={CATEGORIA_LABELS[paciente.categoria]} />
            <PrintField label="Prioridad" value={PRIORIDAD_LABELS[paciente.prioridad]} />
            <PrintField label="Estado actual" value={ESTADO_LABELS[paciente.estado]} />
            <PrintField label="Fecha ingreso" value={formatearFecha(paciente.fecha_ingreso)} />
            <PrintField label="Próxima atención" value={formatearFechaHora(paciente.proxima_atencion)} />
            <PrintField label="Fecha egreso" value={formatearFecha(paciente.fecha_egreso)} />
            <PrintField label="Teléfono" value={paciente.telefono || "Sin teléfono"} />
            <PrintField label="Teléfono recados" value={paciente.telefono_recados || "Sin teléfono de recados"} />
            <PrintField label="Email" value={paciente.email || "Sin email"} />
            <div className="col-span-2">
              <PrintField label="Observaciones operativas" value={paciente.observaciones || "-"} />
            </div>
          </div>
        </div>
      </aside>

      {mostrarCambioEstado && (
        <CambiarEstadoModal
          paciente={paciente}
          rol={usuario.rol}
          onClose={() => setMostrarCambioEstado(false)}
          onConfirm={handleCambiarEstado}
        />
      )}

      {mostrarContacto && (
        <RegistrarContactoModal
          paciente={paciente}
          onClose={() => setMostrarContacto(false)}
          onSuccess={(actualizado) => {
            if (actualizado) setPaciente(actualizado);
            onRefresh();
            void cargarHistorial(paciente.id);
          }}
        />
      )}

      {mostrarInasistencia && (
        <RegistrarInasistenciaModal
          paciente={paciente}
          onClose={() => setMostrarInasistencia(false)}
          onSuccess={(actualizado) => {
            setPaciente(actualizado);
            onRefresh();
            void cargarHistorial(paciente.id);
          }}
        />
      )}

      {mostrarProgramacion && (
        <ProximaAtencionModal
          paciente={paciente}
          onClose={() => setMostrarProgramacion(false)}
          onConfirm={async (fechaHora, observacion) => {
            const actualizado = paciente.proxima_atencion
              ? await api.post<Paciente>(
                  `/pacientes/${paciente.id}/reagendar-atencion/`,
                  {
                    fecha_programada: paciente.proxima_atencion,
                    nueva_fecha: fechaHora,
                    observacion: observacion || "Atención reagendada desde ficha operativa.",
                  },
                )
              : await api.post<Paciente>(
                  `/pacientes/${paciente.id}/programar-atencion/`,
                  { fecha_hora: fechaHora },
                );
            setPaciente(actualizado);
            onRefresh();
            await cargarHistorial(actualizado.id);
            setMostrarProgramacion(false);
          }}
          onClear={
            paciente.proxima_atencion
              ? async () => {
                  const actualizado = await api.post<Paciente>(
                    `/pacientes/${paciente.id}/eliminar-cita/`,
                    {
                      fecha_programada: paciente.proxima_atencion,
                      observacion: "Cita eliminada desde ficha operativa.",
                    },
                  );
                  setPaciente(actualizado);
                  onRefresh();
                  await cargarHistorial(actualizado.id);
                  setMostrarProgramacion(false);
                }
              : undefined
          }
          successMessage={
            paciente.proxima_atencion
              ? "Atención reagendada correctamente."
              : "Atención programada correctamente."
          }
          clearSuccessMessage="Cita eliminada. Paciente vuelve a pendientes de agenda."
        />
      )}

      {mostrarEdicion && (
        <EditarPacienteModal
          paciente={paciente}
          mode="contact-only"
          onClose={() => setMostrarEdicion(false)}
          onGuardado={(actualizado) => {
            setPaciente(actualizado);
            setMostrarEdicion(false);
            onRefresh();
          }}
        />
      )}
      <style jsx global>{`
        @media print {
          @page {
            size: letter;
            margin: 14mm;
          }
          html,
          body {
            overflow: visible !important;
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .ccr-ficha-printable,
          .ccr-ficha-printable * {
            visibility: visible !important;
          }
          .ccr-ficha-screen {
            display: none !important;
            visibility: hidden !important;
          }
          .ccr-ficha-print-only {
            display: block !important;
            visibility: visible !important;
          }
          .ccr-ficha-overlay {
            position: static !important;
            display: block !important;
            background: white !important;
            padding: 0 !important;
            backdrop-filter: none !important;
          }
          .ccr-ficha-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            overflow: visible !important;
            border: 0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          .ccr-no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function badgeAccion(tipo: HistorialAccionPaciente["tipo"]) {
  if (tipo === "CONTACTO") {
    return "border-blue-100 bg-blue-50 text-blue-700";
  }
  if (tipo === "INASISTENCIA") {
    return "border-amber-100 bg-amber-50 text-amber-800";
  }
  if (tipo.startsWith("AGENDA_")) {
    if (tipo === "AGENDA_NO_ASISTIO") return "border-amber-100 bg-amber-50 text-amber-800";
    if (tipo === "AGENDA_CANCELADO") return "border-red-100 bg-red-50 text-red-700";
    if (tipo === "AGENDA_REAGENDADO") return "border-blue-100 bg-blue-50 text-blue-700";
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-100 bg-slate-50 text-slate-700";
}

function labelAccion(tipo: HistorialAccionPaciente["tipo"]) {
  if (tipo === "CONTACTO") return "Contacto";
  if (tipo === "INASISTENCIA") return "Inasistencia";
  if (tipo.startsWith("AGENDA_")) return "Agenda";
  return "Estado";
}

function HistorialAcciones({ items }: { items: HistorialAccionPaciente[] }) {
  if (items.length === 0) {
    return <p className="text-base font-semibold text-slate-500">Sin acciones registradas.</p>;
  }
  return (
    <div className="custom-scrollbar overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-[920px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-[150px] px-4 py-3">Fecha</th>
            <th className="w-[120px] px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Acción</th>
            <th className="w-[150px] px-4 py-3">Usuario</th>
            <th className="w-[230px] px-4 py-3">Observación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-base">
          {items.map((accion, index) => (
            <tr key={`${accion.tipo}-${accion.fecha}-${index}`} className="align-top hover:bg-blue-50/40">
              <td className="px-4 py-3 font-semibold text-slate-700">
                {formatearFechaHora(accion.fecha)}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${badgeAccion(accion.tipo)}`}>
                  {labelAccion(accion.tipo)}
                </span>
              </td>
              <td className="px-4 py-3">
                <p className="font-black text-slate-950">{accion.titulo}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{accion.descripcion}</p>
                {(accion.fecha_programada || accion.nueva_fecha) && (
                  <div className="mt-2 space-y-1 text-sm font-semibold text-slate-500">
                    {accion.fecha_programada && (
                      <p>Programada: {formatearFechaHora(accion.fecha_programada)}</p>
                    )}
                    {accion.nueva_fecha && (
                      <p>Nueva fecha: {formatearFechaHora(accion.nueva_fecha)}</p>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 font-semibold text-slate-700">
                {accion.usuario_nombre ?? "Sistema"}
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                {accion.observacion || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
