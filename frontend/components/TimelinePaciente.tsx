"use client";

import type { IconType } from "react-icons";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCalendar,
  FiCheckCircle,
  FiPhone,
  FiRefreshCw,
  FiTrash2,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import { formatearFechaHoraCorta } from "@/lib/utils";
import type { HistorialAccionPaciente, HistorialAccionTipo } from "@/lib/types";

// Cada tipo de evento del historial mapea a un icono, un color y una etiqueta.
const TIPO_META: Record<HistorialAccionTipo, { icon: IconType; tono: Tono; etiqueta: string }> = {
  CAMBIO_ESTADO: { icon: FiRefreshCw, tono: "slate", etiqueta: "Estado" },
  CONTACTO: { icon: FiPhone, tono: "blue", etiqueta: "Contacto" },
  INASISTENCIA: { icon: FiAlertTriangle, tono: "amber", etiqueta: "Inasistencia" },
  AGENDA_ASISTIO: { icon: FiCheckCircle, tono: "green", etiqueta: "Asistió" },
  AGENDA_NO_ASISTIO: { icon: FiXCircle, tono: "amber", etiqueta: "No asistió" },
  AGENDA_REAGENDADO: { icon: FiCalendar, tono: "blue", etiqueta: "Reagendada" },
  AGENDA_CANCELADO: { icon: FiTrash2, tono: "red", etiqueta: "Cancelada" },
  ACTIVIDAD_GRUPAL: { icon: FiUsers, tono: "blue", etiqueta: "Actividad grupal" },
};

type Tono = "slate" | "blue" | "amber" | "green" | "red" | "violet";

const ICONO: Record<Tono, string> = {
  slate: "bg-slate-100 text-slate-600 ring-white dark:bg-ink-black-700 dark:text-ink-black-100 dark:ring-ink-black-800",
  blue: "bg-blue-50 text-blue-600 ring-white dark:bg-blue-500/15 dark:text-blue-300 dark:ring-ink-black-800",
  amber: "bg-amber-50 text-amber-700 ring-white dark:bg-amber-500/15 dark:text-amber-300 dark:ring-ink-black-800",
  green: "bg-green-50 text-green-700 ring-white dark:bg-green-500/15 dark:text-green-300 dark:ring-ink-black-800",
  red: "bg-red-50 text-red-700 ring-white dark:bg-red-500/15 dark:text-red-300 dark:ring-ink-black-800",
  violet: "bg-violet-50 text-violet-700 ring-white dark:bg-violet-500/15 dark:text-violet-300 dark:ring-ink-black-800",
};

const PILL: Record<Tono, string> = {
  slate: "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  green: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-200",
  red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
};

const MES = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" });

function claveMes(fecha: string) {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  const texto = MES.format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Historial de movimientos agrupado por mes, del mas reciente al mas antiguo. */
export default function TimelinePaciente({
  acciones,
}: {
  acciones: HistorialAccionPaciente[];
}) {
  if (acciones.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-semibold text-slate-400 dark:border-ink-black-600 dark:text-ink-black-400">
        Sin movimientos registrados.
      </p>
    );
  }

  const grupos: { mes: string; items: HistorialAccionPaciente[] }[] = [];
  for (const accion of acciones) {
    const mes = claveMes(accion.fecha);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.mes === mes) ultimo.items.push(accion);
    else grupos.push({ mes, items: [accion] });
  }

  return (
    <div className="space-y-5">
      {grupos.map((grupo) => (
        <section key={grupo.mes} aria-label={grupo.mes}>
          <h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-ink-black-300">
            {grupo.mes}
            <span className="h-px flex-1 bg-slate-100 dark:bg-ink-black-700" aria-hidden="true" />
            <span className="font-semibold normal-case text-slate-400">
              {grupo.items.length} movimiento{grupo.items.length !== 1 ? "s" : ""}
            </span>
          </h4>
          <ol className="relative">
            {grupo.items.map((accion, index) => {
              const meta = TIPO_META[accion.tipo] ?? TIPO_META.CAMBIO_ESTADO;
              const Icon = meta.icon;
              const isLast = index === grupo.items.length - 1;

              return (
                <li key={`${accion.tipo}-${accion.fecha}-${index}`} className="relative flex gap-3">
                  {!isLast && (
                    <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-slate-200 dark:bg-ink-black-600" />
                  )}
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${ICONO[meta.tono]}`}>
                    <Icon size={14} aria-hidden="true" />
                  </span>

                  <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-ink-black-50">{accion.titulo}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PILL[meta.tono]}`}>{meta.etiqueta}</span>
                      <time dateTime={accion.fecha} className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                        {formatearFechaHoraCorta(accion.fecha)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
                      {accion.usuario_nombre ?? "Sistema"}
                    </p>
                    {accion.descripcion && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-ink-black-200">{accion.descripcion}</p>
                    )}
                    {(accion.fecha_programada || accion.nueva_fecha) && (
                      <div className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-ink-black-200">
                        {accion.fecha_programada && (
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 tabular-nums dark:bg-ink-black-700">
                            {formatearFechaHoraCorta(accion.fecha_programada)}
                          </span>
                        )}
                        {accion.fecha_programada && accion.nueva_fecha && (
                          <FiArrowRight size={11} className="text-slate-400" aria-label="cambia a" />
                        )}
                        {accion.nueva_fecha && (
                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 tabular-nums text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
                            {formatearFechaHoraCorta(accion.nueva_fecha)}
                          </span>
                        )}
                      </div>
                    )}
                    {accion.observacion && (
                      <p className="mt-1.5 border-l-2 border-slate-200 pl-2.5 text-xs italic leading-relaxed text-slate-500 dark:border-ink-black-600 dark:text-ink-black-300">
                        {accion.observacion}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
