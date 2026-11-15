"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalOverlay, Dialog } from "react-aria-components";
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
import {
  calcularDiasDesde,
  formatearFecha,
  formatearFechaHoraCorta,
} from "@/lib/utils";
import { useToast } from "@/lib/toast-context";
import {
  FiActivity,
  FiCalendar,
  FiChevronRight,
  FiMessageSquare,
  FiAlertTriangle,
  FiClock,
  FiCopy,
  FiEdit2,
  FiExternalLink,
  FiFileText,
  FiGitCommit,
  FiList,
  FiPhone,
  FiPhoneCall,
  FiRefreshCw,
  FiUser,
  FiTrash2,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";
import dynamic from "next/dynamic";
import BadgeEstado from "./BadgeEstado";
import BadgePrioridad from "./BadgePrioridad";
import TimelinePaciente from "./TimelinePaciente";
import SectorBadge from "./SectorBadge";

// Sub-modals rendered only when the user clicks an action — lazy-loaded.
const CambiarEstadoModal = dynamic(() => import("./CambiarEstadoModal"), {
  ssr: false,
});
const EditarPacienteModal = dynamic(() => import("./EditarPacienteModal"), {
  ssr: false,
});
const ProximaAtencionModal = dynamic(() => import("./ProximaAtencionModal"), {
  ssr: false,
});
const RegistrarContactoModal = dynamic(() => import("./RegistrarContactoModal"), {
  ssr: false,
});
const RegistrarInasistenciaModal = dynamic(() => import("./RegistrarInasistenciaModal"), {
  ssr: false,
});

interface Props {
  paciente: Paciente;
  usuario: Usuario;
  onClose: () => void;
  onRefresh: () => void;
  /** Accion para que un kine tome al paciente desde la lista de espera. */
  onTomar?: () => void;
  /** Eliminacion definitiva (solo administradores). */
  onEliminar?: () => void;
}

function Field({ label, value, full = false }: { label: string; value: ReactNode; full?: boolean }) {
  const vacio = value === null || value === undefined || value === "";
  const displayValue = vacio ? <span className="font-medium text-slate-400 dark:text-ink-black-400">Sin dato</span> : value;
  if (full) {
    return (
      <div className="border-b border-slate-100 py-2.5 last:border-b-0 dark:border-ink-black-700">
        <dt className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{label}</dt>
        <dd className="mt-1 break-words text-[13px] font-semibold leading-snug text-slate-900 dark:text-ink-black-50">{displayValue}</dd>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0 dark:border-ink-black-700">
      <dt className="shrink-0 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[13px] font-semibold text-slate-900 dark:text-ink-black-50">{displayValue}</dd>
    </div>
  );
}

function Indicador({ label, value, detalle, alerta = false }: { label: string; value: ReactNode; detalle?: string; alerta?: boolean }) {
  return (
    <div className="min-w-0 px-5 py-3">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-extrabold tabular-nums ${alerta ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-ink-black-50"}`}>{value}</p>
      {detalle && <p className="truncate text-[11px] font-medium text-slate-400 dark:text-ink-black-400">{detalle}</p>}
    </div>
  );
}

function Section({ icon, title, children, accion }: { icon: ReactNode; title: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-ink-black-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-300" aria-hidden="true">{icon}</span>
          <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{title}</h3>
        </div>
        {accion}
      </div>
      <dl className="px-4 py-1">{children}</dl>
    </section>
  );
}

function AccionFicha({
  icon,
  label,
  onClick,
  href,
  externo = false,
  tono = "neutro",
  disabled = false,
  titulo,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  externo?: boolean;
  tono?: "neutro" | "verde" | "ambar";
  disabled?: boolean;
  titulo?: string;
}) {
  const chip = {
    neutro: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    verde: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    ambar: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  }[tono];
  const clase = `group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
    disabled
      ? "cursor-not-allowed text-slate-400 dark:text-ink-black-500"
      : "text-slate-800 hover:bg-white dark:text-ink-black-100 dark:hover:bg-ink-black-700"
  }`;
  const contenido = (
    <>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${disabled ? "bg-slate-100 text-slate-400 dark:bg-ink-black-700" : chip}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!disabled && <FiChevronRight size={14} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} className={clase} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {contenido}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titulo} className={clase}>
      {contenido}
    </button>
  );
}

function GrupoAcciones({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-2 text-[11px] font-bold text-slate-500 dark:text-ink-black-300">{titulo}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

type FiltroHistorial = "TODOS" | "ESTADO" | "CONTACTO" | "AGENDA" | "INASISTENCIA";

function grupoAccion(tipo: HistorialAccionPaciente["tipo"]): Exclude<FiltroHistorial, "TODOS"> {
  if (tipo === "CONTACTO") return "CONTACTO";
  if (tipo === "INASISTENCIA") return "INASISTENCIA";
  if (tipo.startsWith("AGENDA_") || tipo === "ACTIVIDAD_GRUPAL") return "AGENDA";
  return "ESTADO";
}

const FILTROS_HISTORIAL: { id: FiltroHistorial; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "ESTADO", label: "Estado" },
  { id: "CONTACTO", label: "Contactos" },
  { id: "AGENDA", label: "Agenda" },
  { id: "INASISTENCIA", label: "Inasistencias" },
];

export default function FichaPaciente({
  paciente: pacienteInicial,
  usuario,
  onClose,
  onRefresh, onTomar, onEliminar }: Props) {
  const { warning: toastWarning, success: toastSuccess } = useToast();
  const [paciente, setPaciente] = useState<Paciente>(pacienteInicial);
  const [llamados, setLlamados] = useState<LlamadoPaciente[]>([]);
  const [inasistencias, setInasistencias] = useState<InasistenciaPaciente[]>([]);
  const [acciones, setAcciones] = useState<HistorialAccionPaciente[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [vistaHistorial, setVistaHistorial] = useState<"timeline" | "tabla">("timeline");
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>("TODOS");
  const router = useRouter();
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
  const inasistenciasNoJustificadas =
    inasistencias.length > 0
      ? inasistencias.filter((item) => !item.justificada).length
      : paciente.n_inasistencias ?? 0;
  const motivoUltimaInasistencia =
    ultimaInasistencia?.motivo || paciente.motivo_ultima_inasistencia || "";
  const alertaPosibleAbandono =
    paciente.estado === "INGRESADO" && inasistenciasNoJustificadas >= 2;

  const telLimpio = (paciente.telefono || "").replace(/\D/g, "");
  const waUrl = telLimpio
    ? `https://wa.me/${telLimpio.startsWith("56") ? telLimpio : `56${telLimpio}`}`
    : null;

  function copiarResumen() {
    const resumen = [
      `${paciente.id_ccr} · ${paciente.nombre}`,
      `RUT: ${formatearRut(paciente.rut)}`,
      `Estado: ${ESTADO_LABELS[paciente.estado]}`,
      `Sector CESFAM: ${paciente.sector_cesfam || "-"}`,
      `Diagnóstico: ${paciente.diagnostico || "-"}`,
    ].join("\n");
    void navigator.clipboard?.writeText(resumen).then(
      () => toastSuccess("Resumen copiado al portapapeles."),
      () => toastWarning("No se pudo copiar al portapapeles."),
    );
  }

  const conteoHistorial = useMemo(() => {
    const conteo: Record<FiltroHistorial, number> = { TODOS: acciones.length, ESTADO: 0, CONTACTO: 0, AGENDA: 0, INASISTENCIA: 0 };
    for (const accion of acciones) conteo[grupoAccion(accion.tipo)] += 1;
    return conteo;
  }, [acciones]);
  const accionesVisibles = useMemo(
    () => (filtroHistorial === "TODOS" ? acciones : acciones.filter((a) => grupoAccion(a.tipo) === filtroHistorial)),
    [acciones, filtroHistorial],
  );
  const kineNombre = paciente.responsable_nombre ?? paciente.kine_asignado_nombre ?? null;
  const edadTexto = paciente.edad > 0 ? `${paciente.edad} años` : "Edad sin dato";

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
    setLlamados([]);
    setInasistencias([]);
    setAcciones([]);
    setError("");
    setLoadingHistorial(true);
    void cargarHistorial(pacienteInicial.id);
  }, [cargarHistorial, pacienteInicial]);

  // Scroll locking is handled by react-aria ModalOverlay.

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
    <ModalOverlay
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      className="ccr-ficha-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-6xl">
        <Dialog aria-label="Ficha del paciente" className="ccr-ficha-printable flex h-[min(92vh,900px)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.5)] outline-none dark:border-ink-black-600 dark:bg-ink-black-800">
        {/* ----- Cabecera ----- */}
        <header className="shrink-0 border-b border-slate-200 px-6 py-4 dark:border-ink-black-600">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
                Ficha del paciente <span className="text-slate-300">·</span> {paciente.id_ccr}
              </p>
              <h2 className="mt-0.5 break-words text-xl font-extrabold leading-tight text-slate-950 dark:text-ink-black-50">
                {paciente.nombre}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600 dark:text-ink-black-200">
                <span className="font-bold tabular-nums text-slate-900 dark:text-ink-black-50">{formatearRut(paciente.rut)}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className={paciente.edad > 0 ? "font-bold text-slate-900 dark:text-ink-black-50" : "font-medium text-slate-400"}>{edadTexto}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-semibold">{CATEGORIA_LABELS[paciente.categoria]}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <BadgeEstado estado={paciente.estado} />
                <BadgePrioridad prioridad={paciente.prioridad} />
                <SectorBadge sector={paciente.sector_cesfam} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => router.push(`/paciente/${paciente.rut}`)} className="ccr-control-button">
                <FiExternalLink size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Ficha completa</span>
              </button>
              <button type="button" onClick={() => setMostrarEdicion(true)} className="ccr-control-button-primary">
                <FiEdit2 size={14} aria-hidden="true" />
                Editar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
                aria-label="Cerrar ficha"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* ----- Indicadores ----- */}
        <div className="grid shrink-0 grid-cols-2 divide-x divide-slate-100 border-b border-slate-200 bg-slate-50/60 dark:divide-ink-black-700 dark:border-ink-black-600 dark:bg-ink-black-900/40 sm:grid-cols-4">
          <Indicador label="Días en lista" value={diasEnLista} detalle={`Desde ${formatearFecha(paciente.fecha_derivacion)}`} />
          <Indicador label="Intentos de contacto" value={paciente.n_intentos_contacto} detalle={`${totalLlamados} contacto${totalLlamados !== 1 ? "s" : ""} registrado${totalLlamados !== 1 ? "s" : ""}`} />
          <Indicador
            label="Inasistencias"
            value={inasistenciasNoJustificadas}
            detalle={`${totalInasistencias} en total`}
            alerta={inasistenciasNoJustificadas >= 2}
          />
          <Indicador
            label="Próxima atención"
            value={paciente.proxima_atencion ? formatearFecha(paciente.proxima_atencion) : "Sin agenda"}
            detalle={paciente.proxima_atencion ? formatearFechaHoraCorta(paciente.proxima_atencion) : "Pendiente de agendar"}
          />
        </div>

        {/* ----- Cuerpo ----- */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_260px] lg:overflow-hidden">
          <div className="space-y-4 bg-slate-50/40 p-5 dark:bg-ink-black-900/30 lg:overflow-y-auto">
            {error && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                {error}
              </p>
            )}
            {alertaPosibleAbandono && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <FiAlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Tiene {inasistenciasNoJustificadas} inasistencias no justificadas. Evaluar cambio de estado a abandono.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Section icon={<FiUser size={15} />} title="Datos del paciente">
                <Field label="Nombre" value={paciente.nombre} />
                <Field label="RUT" value={formatearRut(paciente.rut)} />
                <Field label="Edad" value={paciente.edad > 0 ? `${paciente.edad} años` : ""} />
                <Field label="Mayor de 60" value={paciente.mayor_60 ? "Sí" : "No"} />
                <Field label="Sector CESFAM" value={paciente.sector_cesfam ? <SectorBadge sector={paciente.sector_cesfam} /> : ""} />
                <Field label="Sector oficial" value={paciente.sector_oficial} />
              </Section>

              <Section icon={<FiPhone size={15} />} title="Contacto">
                <Field
                  label="Teléfono"
                  value={paciente.telefono ? <a className="text-blue-700 hover:underline dark:text-blue-300" href={`tel:${telLimpio}`}>{paciente.telefono}</a> : ""}
                />
                <Field label="Teléfono recados" value={paciente.telefono_recados} />
                <Field label="Correo" value={paciente.email} />
                <Field
                  label="Último contacto"
                  value={ultimoLlamado ? `${formatearFechaHoraCorta(ultimoLlamado.fecha)} · ${ultimoLlamado.resultado_label}` : ""}
                />
                <Field label="Próxima acción" value={ultimoLlamado?.proxima_accion} />
              </Section>

              <Section icon={<FiFileText size={15} />} title="Derivación">
                <Field label="Fecha de derivación" value={formatearFecha(paciente.fecha_derivacion)} />
                <Field label="Categoría" value={CATEGORIA_LABELS[paciente.categoria]} />
                <Field label="Prioridad" value={PRIORIDAD_LABELS[paciente.prioridad]} />
                <Field label="Profesional que deriva" value={paciente.profesional} />
                <Field label="Asignado histórico" value={paciente.asignado_historico ? "Sí" : "No"} />
                <Field label="Diagnóstico" value={paciente.diagnostico} full />
              </Section>

              <Section icon={<FiActivity size={15} />} title="Seguimiento CCR">
                <Field label="Estado" value={ESTADO_LABELS[paciente.estado]} />
                <Field label="Kine asignado" value={kineNombre ?? <span className="font-semibold text-amber-700 dark:text-amber-300">Sin asignar</span>} />
                <Field label="Último cambio de estado" value={paciente.fecha_cambio_estado ? formatearFechaHoraCorta(paciente.fecha_cambio_estado) : ""} />
                <Field label="Fecha de ingreso" value={paciente.fecha_ingreso ? formatearFecha(paciente.fecha_ingreso) : ""} />
                <Field label="Fecha de egreso" value={paciente.fecha_egreso ? formatearFecha(paciente.fecha_egreso) : ""} />
                <Field
                  label="Última inasistencia"
                  value={
                    ultimaInasistencia
                      ? `${formatearFecha(ultimaInasistencia.fecha)} · ${ultimaInasistencia.justificada ? "Justificada" : "No justificada"}`
                      : ""
                  }
                />
                {motivoUltimaInasistencia && <Field label="Motivo inasistencia" value={motivoUltimaInasistencia} full />}
              </Section>
            </div>

            {paciente.observaciones && (
              <Section icon={<FiMessageSquare size={15} />} title="Observaciones">
                <p className="whitespace-pre-line py-2.5 text-[13px] font-medium leading-relaxed text-slate-700 dark:text-ink-black-100">
                  {paciente.observaciones}
                </p>
              </Section>
            )}

            {/* ----- Historial de movimientos ----- */}
            <section className="rounded-xl border border-slate-200 bg-white dark:border-ink-black-600 dark:bg-ink-black-800">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 dark:border-ink-black-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FiClock size={15} className="text-blue-600 dark:text-blue-300" aria-hidden="true" />
                  <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">Historial de movimientos</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200">
                    {acciones.length}
                  </span>
                </div>
                <div className="ccr-no-print inline-flex self-start rounded-lg bg-slate-100 p-0.5 dark:bg-ink-black-900">
                  {([
                    { id: "timeline", label: "Línea de tiempo", icon: <FiGitCommit size={13} /> },
                    { id: "tabla", label: "Tabla", icon: <FiList size={13} /> },
                  ] as const).map((vista) => (
                    <button
                      key={vista.id}
                      type="button"
                      onClick={() => setVistaHistorial(vista.id)}
                      aria-pressed={vistaHistorial === vista.id}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                        vistaHistorial === vista.id
                          ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200"
                          : "text-slate-500 hover:text-slate-800 dark:text-ink-black-300"
                      }`}
                    >
                      {vista.icon} {vista.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ccr-no-print flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5 dark:border-ink-black-700" role="group" aria-label="Filtrar historial por tipo">
                {FILTROS_HISTORIAL.map((filtro) => {
                  const activo = filtroHistorial === filtro.id;
                  const total = conteoHistorial[filtro.id];
                  return (
                    <button
                      key={filtro.id}
                      type="button"
                      onClick={() => setFiltroHistorial(filtro.id)}
                      aria-pressed={activo}
                      disabled={filtro.id !== "TODOS" && total === 0}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40 ${
                        activo
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-200"
                      }`}
                    >
                      {filtro.label}
                      <span className={`tabular-nums ${activo ? "text-blue-100" : "text-slate-400"}`}>{total}</span>
                    </button>
                  );
                })}
              </div>
              <div className="p-4">
                {loadingHistorial ? (
                  <div className="space-y-3" aria-label="Cargando historial">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex gap-3">
                        <span className="h-8 w-8 animate-pulse rounded-full bg-slate-100 dark:bg-ink-black-700" />
                        <div className="flex-1 space-y-1.5">
                          <span className="block h-3 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-ink-black-700" />
                          <span className="block h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-ink-black-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : vistaHistorial === "timeline" ? (
                  <TimelinePaciente acciones={accionesVisibles} />
                ) : (
                  <HistorialAcciones items={accionesVisibles} />
                )}
              </div>
            </section>
          </div>

          {/* ----- Panel de acciones ----- */}
          <aside className="ccr-no-print space-y-4 border-t border-slate-200 bg-slate-50/70 p-4 dark:border-ink-black-600 dark:bg-ink-black-900/50 lg:overflow-y-auto lg:border-l lg:border-t-0">
            {puedeCambiarEstado && (
              <button type="button" onClick={() => setMostrarCambioEstado(true)} className="ccr-control-button-primary w-full">
                <FiRefreshCw size={14} aria-hidden="true" />
                Cambiar estado
              </button>
            )}

            <GrupoAcciones titulo="Gestión">
              {puedeRegistrarLlamado && (
                <AccionFicha icon={<FiPhone size={14} />} label="Registrar contacto" onClick={() => setMostrarContacto(true)} />
              )}
              {puedeProgramar && (
                <AccionFicha
                  icon={<FiCalendar size={14} />}
                  label={paciente.proxima_atencion ? "Reprogramar atención" : "Programar atención"}
                  onClick={() => setMostrarProgramacion(true)}
                />
              )}
              {paciente.estado === "INGRESADO" && puedeCambiarEstado && (
                <AccionFicha icon={<FiAlertTriangle size={14} />} tono="ambar" label="Registrar inasistencia" onClick={() => setMostrarInasistencia(true)} />
              )}
              {puedeCambiarEstado && (
                <AccionFicha
                  icon={<FiUserPlus size={14} />}
                  label={paciente.kine_asignado ? "Cambiar kine" : "Asignar kine"}
                  onClick={() => setMostrarEdicion(true)}
                />
              )}
              {onTomar && <AccionFicha icon={<FiUserPlus size={14} />} label="Tomar paciente" onClick={onTomar} />}
              <AccionFicha icon={<FiGitCommit size={14} />} label="Línea de tiempo" onClick={() => router.push(`/linea-tiempo?rut=${paciente.rut}`)} />
            </GrupoAcciones>

            <GrupoAcciones titulo="Comunicación">
              <AccionFicha
                icon={<FiPhoneCall size={14} />}
                label="Llamar"
                href={telLimpio ? `tel:${telLimpio}` : undefined}
                disabled={!telLimpio}
                titulo={telLimpio ? undefined : "Sin teléfono registrado"}
              />
              <AccionFicha
                icon={<FaWhatsapp size={14} />}
                tono="verde"
                label="WhatsApp"
                href={waUrl ?? undefined}
                externo
                disabled={!waUrl}
                titulo={waUrl ? undefined : "Sin teléfono registrado"}
              />
              <AccionFicha icon={<FiCopy size={14} />} label="Copiar resumen" onClick={copiarResumen} />
            </GrupoAcciones>

            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-ink-black-600 dark:bg-ink-black-800">
              <p className="text-[11px] font-bold text-slate-500 dark:text-ink-black-300">Kine responsable</p>
              <p className={`mt-0.5 text-[13px] font-extrabold ${kineNombre ? "text-slate-900 dark:text-ink-black-50" : "text-amber-700 dark:text-amber-300"}`}>
                {kineNombre ?? "Sin asignar"}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-ink-black-400">
                {ESTADO_LABELS[paciente.estado]} desde {paciente.fecha_cambio_estado ? formatearFecha(paciente.fecha_cambio_estado) : formatearFecha(paciente.fecha_derivacion)}
              </p>
            </div>

            {onEliminar && (
              <div className="border-t border-slate-200 pt-4 dark:border-ink-black-600">
                <button type="button" onClick={onEliminar} className="ccr-button-cancel w-full">
                  <FiTrash2 size={14} aria-hidden="true" />
                  Eliminar paciente
                </button>
              </div>
            )}
          </aside>
        </div>

        </Dialog>
      </Modal>

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
          mode="full"
          onClose={() => setMostrarEdicion(false)}
          onGuardado={(actualizado) => {
            setPaciente(actualizado);
            setMostrarEdicion(false);
            onRefresh();
          }}
        />
      )}
    </ModalOverlay>
  );
}

function badgeAccion(tipo: HistorialAccionPaciente["tipo"]) {
  if (tipo === "CONTACTO") return "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200";
  if (tipo === "INASISTENCIA" || tipo === "AGENDA_NO_ASISTIO") return "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200";
  if (tipo === "AGENDA_CANCELADO") return "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200";
  if (tipo === "AGENDA_REAGENDADO") return "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200";
  if (tipo.startsWith("AGENDA_")) return "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-200";
  return "bg-slate-100 text-slate-700 dark:bg-ink-black-700 dark:text-ink-black-100";
}

function labelAccion(tipo: HistorialAccionPaciente["tipo"]) {
  if (tipo === "CONTACTO") return "Contacto";
  if (tipo === "INASISTENCIA") return "Inasistencia";
  if (tipo.startsWith("AGENDA_")) return "Agenda";
  return "Estado";
}

function HistorialAcciones({ items }: { items: HistorialAccionPaciente[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm font-semibold text-slate-400 dark:text-ink-black-400">Sin movimientos para este filtro.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-ink-black-600">
      <table className="w-full min-w-[620px] table-fixed border-collapse text-[12px]">
        <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 dark:bg-ink-black-900 dark:text-ink-black-300">
          <tr>
            <th className="w-[18%] px-3 py-2">Fecha</th>
            <th className="w-[18%] px-3 py-2">Tipo</th>
            <th className="w-[40%] px-3 py-2">Movimiento</th>
            <th className="w-[24%] px-3 py-2">Observación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-ink-black-700">
          {items.map((accion, index) => (
            <tr key={`${accion.tipo}-${accion.fecha}-${index}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-ink-black-700/50">
              <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-700 dark:text-ink-black-100">
                {formatearFechaHoraCorta(accion.fecha)}
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeAccion(accion.tipo)}`}>
                  {labelAccion(accion.tipo)}
                </span>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-ink-black-300">
                  {accion.usuario_nombre ?? "Sistema"}
                </p>
              </td>
              <td className="px-3 py-2.5">
                <p className="break-words font-bold leading-snug text-slate-900 dark:text-ink-black-50">{accion.titulo}</p>
                {accion.descripcion && (
                  <p className="mt-0.5 break-words text-[11px] font-medium leading-snug text-slate-500 dark:text-ink-black-300">{accion.descripcion}</p>
                )}
                {(accion.fecha_programada || accion.nueva_fecha) && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
                    {accion.fecha_programada && <>Programada {formatearFechaHoraCorta(accion.fecha_programada)}</>}
                    {accion.fecha_programada && accion.nueva_fecha && " → "}
                    {accion.nueva_fecha && <>Nueva {formatearFechaHoraCorta(accion.nueva_fecha)}</>}
                  </p>
                )}
              </td>
              <td className="break-words px-3 py-2.5 text-[11px] font-medium leading-snug text-slate-600 dark:text-ink-black-200">
                {accion.observacion || <span className="text-slate-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
