"use client";

import { useEffect, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiHelpCircle,
  FiPhone,
  FiPhoneMissed,
  FiSlash,
  FiUserX,
  FiX,
  FiXCircle,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import type { Paciente, ResultadoLlamado } from "@/lib/types";
import { ESTADO_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import {
  aIso,
  consecuencia,
  diaHabil,
  fechaKey,
  mensajeRegistro,
  registrarLlamado,
  resultadosPara,
} from "@/lib/llamados";
import CampoFecha from "./CampoFecha";

const ICONOS: Record<ResultadoLlamado, IconType> = {
  CONTESTA_CONFIRMADO: FiCheckCircle,
  NO_CONTESTA: FiPhoneMissed,
  REAGENDAR_LLAMADO: FiClock,
  NUMERO_EQUIVOCADO: FiSlash,
  RECHAZA_ATENCION: FiUserX,
  YA_RESUELTO: FiXCircle,
  OTRO: FiHelpCircle,
};

const INPUT =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-50";

function nombreLegible(nombre: string) {
  return nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

interface Props {
  paciente: Paciente;
  onClose: () => void;
  /** Recibe el paciente actualizado (con `ultimo_llamado` para poder deshacer). */
  onSuccess: (paciente?: Paciente, resultado?: ResultadoLlamado) => void;
  /** Resultado elegido al abrir (p. ej. desde un boton rapido). */
  resultadoInicial?: ResultadoLlamado;
  /** Compatibilidad: abre con "Contesta y agenda" elegido. */
  startWithScheduler?: boolean;
}

/** Registro de un llamado: un solo lugar para elegir el resultado y ver su efecto. */
export default function RegistrarContactoModal({ paciente, onClose, onSuccess, resultadoInicial, startWithScheduler = false }: Props) {
  const { toast } = useToast();
  const opciones = resultadosPara(paciente);
  const [resultado, setResultado] = useState<ResultadoLlamado | null>(
    resultadoInicial ?? (startWithScheduler ? "CONTESTA_CONFIRMADO" : null),
  );
  const [notas, setNotas] = useState("");
  const [fechaCita, setFechaCita] = useState(() => diaHabil(1));
  const [horaCita, setHoraCita] = useState("09:00");
  const [fechaVolver, setFechaVolver] = useState(() => diaHabil(1));
  const [horaVolver, setHoraVolver] = useState("09:00");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const efecto = resultado ? consecuencia(paciente, resultado) : null;
  const faltaNota = !!efecto?.requiereNota && !notas.trim();
  const faltaCita = !!efecto?.requiereFechaCita && !aIso(fechaCita, horaCita);
  const faltaVolver = !!efecto?.requiereVolverALlamar && !aIso(fechaVolver, horaVolver);
  const puedeGuardar = !!resultado && !guardando && !faltaNota && !faltaCita && !faltaVolver;

  // Atajo: teclas 1..7 eligen el resultado (fuera de los campos de texto).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= opciones.length) setResultado(opciones[n - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opciones]);

  async function guardar() {
    if (!resultado || !puedeGuardar) return;
    setGuardando(true);
    setError("");
    try {
      const actualizado = await registrarLlamado(paciente, {
        resultado,
        notas: notas.trim(),
        fecha_atencion: efecto?.requiereFechaCita ? aIso(fechaCita, horaCita) : null,
        volver_a_llamar: efecto?.requiereVolverALlamar ? aIso(fechaVolver, horaVolver) : null,
      });
      const mensaje = mensajeRegistro(paciente, actualizado, resultado);
      if (efecto?.grave) toast.warning(mensaje);
      else toast.success(mensaje);
      onSuccess(actualizado, resultado);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo registrar el llamado."));
    } finally {
      setGuardando(false);
    }
  }

  const hoy = fechaKey(new Date());
  const horaActual = new Date().getHours();
  const atajosVolver = [
    ...(horaActual < 15 ? [{ label: "Hoy 16:00", fecha: hoy, hora: "16:00" }] : []),
    { label: "Mañana 09:00", fecha: diaHabil(1), hora: "09:00" },
    { label: "En 2 días", fecha: diaHabil(2), hora: "09:00" },
    { label: "Próxima semana", fecha: diaHabil(7), hora: "09:00" },
  ];
  const telefonos = [
    { label: "Principal", valor: paciente.telefono },
    { label: "Recados", valor: paciente.telefono_recados },
  ].filter((t) => t.valor?.trim());

  return (
    <ModalOverlay
      isOpen
      isDismissable={!guardando}
      onOpenChange={(open) => {
        if (!open && !guardando) onClose();
      }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 px-4 py-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-xl">
        <Dialog
          aria-label="Registrar llamado"
          className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-ink-black-600">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">Registrar llamado</p>
              <h2 className="mt-0.5 truncate text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{nombreLegible(paciente.nombre)}</h2>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
                {paciente.id_ccr} · {formatearRut(paciente.rut)} · {ESTADO_LABELS[paciente.estado] ?? paciente.estado}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              aria-label="Cerrar"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
            >
              <FiX size={18} />
            </button>
          </header>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {telefonos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {telefonos.map((t) => (
                  <a
                    key={t.label}
                    href={`tel:${t.valor}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-bold tabular-nums text-slate-800 transition hover:border-blue-300 hover:text-blue-700 dark:border-ink-black-600 dark:text-ink-black-100"
                  >
                    <FiPhone size={13} aria-hidden="true" />
                    {t.valor}
                    <span className="text-[10px] font-semibold text-slate-400">{t.label}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                Este paciente no tiene teléfono registrado.
              </p>
            )}

            <fieldset>
              <legend className="mb-2 text-[12px] font-bold text-slate-700 dark:text-ink-black-100">¿Qué pasó en el llamado?</legend>
              <div role="radiogroup" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {opciones.map((op, i) => {
                  const Icon = ICONOS[op.id];
                  const activo = resultado === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => setResultado(op.id)}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                        activo
                          ? "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-500/60 dark:bg-blue-500/15 dark:text-blue-100"
                          : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-ink-black-600 dark:text-ink-black-100 dark:hover:bg-ink-black-700"
                      }`}
                    >
                      <Icon size={15} aria-hidden="true" className={activo ? "text-blue-600 dark:text-blue-300" : "text-slate-400"} />
                      <span className="flex-1">{op.label}</span>
                      <kbd className="rounded border border-slate-200 px-1 text-[10px] font-semibold text-slate-400 dark:border-ink-black-600">{i + 1}</kbd>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {efecto?.requiereFechaCita && (
              <div>
                <p className="mb-1.5 text-[12px] font-bold text-slate-700 dark:text-ink-black-100">Fecha y hora de la cita</p>
                <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                  <CampoFecha label="Fecha de la cita" value={fechaCita} onChange={setFechaCita} opcional={false} compacto altoCompacto="h-10" />
                  <input type="time" step={900} value={horaCita} onChange={(e) => setHoraCita(e.target.value)} aria-label="Hora de la cita" className={INPUT} />
                </div>
              </div>
            )}

            {efecto?.requiereVolverALlamar && (
              <div>
                <p className="mb-1.5 text-[12px] font-bold text-slate-700 dark:text-ink-black-100">¿Cuándo volver a llamar?</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {atajosVolver.map((a) => {
                    const activo = fechaVolver === a.fecha && horaVolver === a.hora;
                    return (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          setFechaVolver(a.fecha);
                          setHoraVolver(a.hora);
                        }}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          activo
                            ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/15 dark:text-blue-100"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-ink-black-600 dark:text-ink-black-200"
                        }`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                  <CampoFecha label="Volver a llamar" value={fechaVolver} onChange={setFechaVolver} opcional={false} compacto altoCompacto="h-10" />
                  <input type="time" step={900} value={horaVolver} onChange={(e) => setHoraVolver(e.target.value)} aria-label="Hora para volver a llamar" className={INPUT} />
                </div>
              </div>
            )}

            {resultado && (
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-bold text-slate-700 dark:text-ink-black-100">
                  Observación {efecto?.requiereNota ? <span className="text-red-600">(obligatoria)</span> : <span className="font-medium text-slate-400">(opcional)</span>}
                </span>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder={efecto?.requiereNota ? "Explica qué pasó; queda en el historial." : "Ej.: dejó recado con la hija."}
                  className={`${INPUT} h-auto resize-none py-2`}
                />
              </label>
            )}

            {efecto && (
              <p
                className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold leading-snug ${
                  efecto.grave
                    ? "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200"
                    : efecto.cambiaEstado
                      ? "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-100"
                      : "bg-slate-50 text-slate-700 dark:bg-ink-black-900 dark:text-ink-black-200"
                }`}
              >
                {efecto.grave ? <FiAlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <FiCalendar size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                {efecto.texto}
              </p>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-ink-black-600 dark:bg-ink-black-900/60">
            <p className="hidden text-[11px] font-medium text-slate-500 sm:block">Puedes deshacerlo durante 10 minutos desde la cola.</p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} disabled={guardando} className="ccr-control-button">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={!puedeGuardar}
                className={`ccr-control-button-primary disabled:opacity-50 ${efecto?.grave ? "!bg-red-600 hover:!bg-red-700" : ""}`}
              >
                {guardando ? "Guardando…" : "Registrar llamado"}
              </button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
