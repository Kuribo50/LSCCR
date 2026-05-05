"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import type {
  Estado,
  HistorialCompletoPaciente,
  InasistenciaPaciente,
  LlamadoPaciente,
  MovimientoPaciente,
  Paciente,
  Usuario,
} from "@/lib/types";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import {
  FiCalendar,
  FiAlertTriangle,
  FiClock,
  FiEdit2,
  FiFileText,
  FiPhone,
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

type TabHistorial = "movimientos" | "llamados" | "inasistencias";

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
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-slate-800">
        {value || "-"}
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
    <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-emerald-800">
        {icon}
        <h3 className="text-sm font-semibold uppercase tracking-[0.06em]">
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
  const [paciente, setPaciente] = useState<Paciente>(pacienteInicial);
  const [movimientos, setMovimientos] = useState<MovimientoPaciente[]>([]);
  const [llamados, setLlamados] = useState<LlamadoPaciente[]>([]);
  const [inasistencias, setInasistencias] = useState<InasistenciaPaciente[]>([]);
  const [tab, setTab] = useState<TabHistorial>("movimientos");
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
      setMovimientos(data.movimientos);
      setLlamados(data.llamados);
      setInasistencias(data.inasistencias);
    } catch {
      setMovimientos([]);
      setLlamados([]);
      setInasistencias([]);
      setError(
        "No se pudo cargar el historial completo. Se mantienen los datos básicos del paciente.",
      );
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="h-[min(92vh,920px)] w-full max-w-6xl overflow-y-auto rounded-xl border border-emerald-100 bg-emerald-50 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-emerald-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 pr-12 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
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
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <FiEdit2 size={14} />
                Editar contacto
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100"
            aria-label="Cerrar ficha"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
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

          <div className="flex flex-wrap gap-2">
            {puedeCambiarEstado && (
              <button
                type="button"
                onClick={() => setMostrarCambioEstado(true)}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-900"
              >
                <FiRefreshCw size={14} />
                Cambiar estado
              </button>
            )}
            {puedeRegistrarLlamado && (
              <button
                type="button"
                onClick={() => setMostrarContacto(true)}
                className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-800"
              >
                <FiPhone size={14} />
                Registrar llamado
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
                className="inline-flex items-center gap-2 rounded-md border border-emerald-700 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
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
                  label="Responsable"
                  value={paciente.kine_asignado_nombre ?? "Sin asignar"}
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
                  label="Último llamado"
                  value={
                    ultimoLlamado
                      ? `${formatearFechaHora(ultimoLlamado.fecha)} · ${ultimoLlamado.resultado_label}`
                      : "Sin llamados"
                  }
                />
                <Field label="Total llamados" value={totalLlamados} />
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

          <Section icon={<FiClock />} title="Historial">
            <div className="mb-4 flex flex-wrap gap-2">
              {(["movimientos", "llamados", "inasistencias"] as TabHistorial[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                      tab === item
                        ? "bg-emerald-800 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {item === "movimientos"
                      ? `Movimientos (${movimientos.length})`
                      : item === "llamados"
                        ? `Llamados (${llamados.length})`
                        : `Inasistencias (${inasistencias.length})`}
                  </button>
                ),
              )}
            </div>

            {loadingHistorial ? (
              <p className="text-sm text-slate-500">Cargando historial...</p>
            ) : tab === "movimientos" ? (
              <HistorialMovimientos items={movimientos} />
            ) : tab === "llamados" ? (
              <HistorialLlamados items={llamados} />
            ) : (
              <HistorialInasistencias items={inasistencias} />
            )}
          </Section>
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
          onConfirm={async (fechaHora) => {
            const actualizado = await api.post<Paciente>(
              `/pacientes/${paciente.id}/programar-atencion/`,
              { fecha_hora: fechaHora },
            );
            setPaciente(actualizado);
            onRefresh();
            setMostrarProgramacion(false);
          }}
          onClear={
            paciente.proxima_atencion
              ? async () => {
                  const actualizado = await api.delete<Paciente>(
                    `/pacientes/${paciente.id}/programar-atencion/`,
                  );
                  setPaciente(actualizado);
                  onRefresh();
                  setMostrarProgramacion(false);
                }
              : undefined
          }
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
    </div>
  );
}

function HistorialMovimientos({ items }: { items: MovimientoPaciente[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Sin movimientos registrados.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((mov) => (
        <li key={mov.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-slate-800">
            {mov.estado_anterior
              ? `${ESTADO_LABELS[mov.estado_anterior as Estado] ?? mov.estado_anterior} -> ${
                  ESTADO_LABELS[mov.estado_nuevo as Estado] ?? mov.estado_nuevo
                }`
              : ESTADO_LABELS[mov.estado_nuevo as Estado] ?? mov.estado_nuevo}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatearFechaHora(mov.fecha)} · {mov.usuario_nombre ?? "Sistema"}
          </p>
          {mov.notas && <p className="mt-2 text-xs text-slate-700">{mov.notas}</p>}
        </li>
      ))}
    </ol>
  );
}

function HistorialLlamados({ items }: { items: LlamadoPaciente[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Sin llamados registrados.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((llamado) => (
        <li key={llamado.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-slate-800">
            {llamado.resultado_label}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatearFechaHora(llamado.fecha)} · {llamado.usuario_nombre ?? "Sistema"} ·{" "}
            {llamado.telefono_usado || "Sin teléfono registrado"}
          </p>
          {llamado.notas && <p className="mt-2 text-xs text-slate-700">{llamado.notas}</p>}
        </li>
      ))}
    </ol>
  );
}

function HistorialInasistencias({ items }: { items: InasistenciaPaciente[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Sin inasistencias registradas.</p>;
  }
  return (
    <ol className="space-y-3">
      {items.map((inasistencia) => (
        <li
          key={inasistencia.id}
          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3"
        >
          <p className="text-xs font-semibold text-slate-800">
            {formatearFecha(inasistencia.fecha)} ·{" "}
            {inasistencia.justificada ? "Justificada" : "No justificada"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Registrada por {inasistencia.usuario_nombre ?? "Sistema"} ·{" "}
            {formatearFechaHora(inasistencia.creado_en)}
          </p>
          {inasistencia.motivo && (
            <p className="mt-2 text-xs text-slate-700">{inasistencia.motivo}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
