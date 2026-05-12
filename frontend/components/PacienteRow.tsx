"use client";
import { formatearRut } from "@/lib/rut";

import type { Paciente, Usuario } from "@/lib/types";
import {
  CATEGORIA_LABELS,
  getKineColor,
} from "@/lib/types";
import BadgePrioridad from "./BadgePrioridad";
import BadgeEstado from "./BadgeEstado";
import BadgeDias from "./BadgeDias";

interface Props {
  paciente: Paciente;
  usuario: Usuario;
  onVerFicha: (paciente: Paciente) => void;
  onAsignarme: (paciente: Paciente) => Promise<void>;
  onProgramar: (paciente: Paciente) => void;
  onContactar: (paciente: Paciente) => void;
  onEliminar?: (paciente: Paciente) => void;
  isMisPacientes?: boolean;
  daysMode?: "lista" | "ingreso" | "llamados";
  showProximaAtencion?: boolean;
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

function toCapitalizedWords(value: string) {
  const normalized = value
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL");
  return normalized.replace(/\p{L}+/gu, (word) => {
    const [first = "", ...rest] = Array.from(word);
    return `${first.toLocaleUpperCase("es-CL")}${rest.join("")}`;
  });
}

export default function PacienteRow({
  paciente,
  usuario,
  onVerFicha,
  onAsignarme,
  onProgramar,
  onContactar,
  onEliminar,
  isMisPacientes = false,
  daysMode = isMisPacientes ? "ingreso" : "lista",
  showProximaAtencion = true,
}: Props) {
  const proximaAtencion = paciente.proxima_atencion
    ? new Date(paciente.proxima_atencion)
    : null;
  const proximaAtencionValida =
    proximaAtencion && !Number.isNaN(proximaAtencion.getTime());

  const kineColor = getKineColor(paciente.kine_asignado_nombre);
  const responsableNombre = paciente.responsable_nombre ?? paciente.kine_asignado_nombre;
  const diasDesdeIngreso =
    calcularDiasDesde(paciente.fecha_ingreso ?? paciente.fecha_cambio_estado) ??
    paciente.dias_en_lista;
  const diasDesdeLlamados =
    calcularDiasDesde(paciente.fecha_cambio_estado) ?? paciente.dias_en_lista;
  const diasMostrados =
    daysMode === "ingreso"
      ? paciente.estado === "INGRESADO"
        ? diasDesdeIngreso
        : paciente.dias_en_lista
      : daysMode === "llamados"
        ? diasDesdeLlamados
        : paciente.dias_en_lista;
  const puedeAsignarse =
    paciente.kine_asignado === null && usuario.rol === "KINE";
  const estadoProgramable = ["PENDIENTE", "RESCATE", "INGRESADO"].includes(
    paciente.estado,
  );
  const puedeProgramar =
    showProximaAtencion &&
    estadoProgramable &&
    paciente.kine_asignado !== null &&
    ((usuario.rol === "KINE" && paciente.kine_asignado === usuario.id) ||
      usuario.rol === "ADMIN");

  const puedeContactar = 
    ["PENDIENTE", "RESCATE"].includes(paciente.estado) && 
    paciente.kine_asignado !== null &&
    ((usuario.rol === "KINE" && paciente.kine_asignado === usuario.id) || 
     ["ADMIN", "ADMINISTRATIVO"].includes(usuario.rol));

  return (
    <tr
      className="cursor-pointer border-b border-slate-100 odd:bg-white even:bg-[#FCFCFD] transition-colors hover:bg-slate-50 dark:border-[#262626] dark:odd:bg-[#151515] dark:even:bg-[#0f0f10] dark:hover:bg-[#202020]"
      onClick={() => onVerFicha(paciente)}
    >
      <td className="max-w-[170px] border-r border-slate-100 px-4 py-3 font-semibold text-slate-800 dark:border-[#262626] dark:text-[#ecf5f8]">
        <div className="truncate">{toCapitalizedWords(paciente.nombre)}</div>
      </td>
      <td className="border-r border-slate-100 px-4 py-3 font-mono text-slate-600 dark:border-[#262626] dark:text-[#b5d8e3]">
        {formatearRut(paciente.rut)}
      </td>
      <td className="border-r border-slate-100 px-4 py-3 text-slate-600 dark:border-[#262626] dark:text-[#b5d8e3]">{paciente.edad}</td>
      <td className="max-w-[170px] border-r border-slate-100 px-4 py-3 text-slate-600 dark:border-[#262626] dark:text-[#b5d8e3]">
        <div className="truncate" title={paciente.sector_cesfam || "-"}>
          {paciente.sector_cesfam || "-"}
        </div>
      </td>
      <td className="max-w-[170px] border-r border-slate-100 px-4 py-3 text-slate-600 dark:border-[#262626] dark:text-[#b5d8e3]">
        <div className="truncate" title={paciente.sector_oficial || "-"}>
          {paciente.sector_oficial || "-"}
        </div>
      </td>
      <td className="max-w-[220px] border-r border-slate-100 px-4 py-3 text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
        <div className="truncate">{toCapitalizedWords(paciente.diagnostico)}</div>
      </td>
      <td className="border-r border-slate-100 px-4 py-3 dark:border-[#262626]">
        <BadgePrioridad prioridad={paciente.prioridad} />
      </td>
      <td className="border-r border-slate-100 px-4 py-3 text-slate-600 dark:border-[#262626] dark:text-[#b5d8e3]">
        {toCapitalizedWords(CATEGORIA_LABELS[paciente.categoria] ?? paciente.categoria)}
      </td>
      <td className="border-r border-slate-100 px-4 py-3 dark:border-[#262626]">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: paciente.kine_asignado ? kineColor : "#9CA3AF",
            }}
          />
          <span className="max-w-[110px] truncate text-slate-700 dark:text-[#b5d8e3]">
            {toCapitalizedWords(responsableNombre ?? "Sin asignar")}
          </span>
        </div>
      </td>
      <td className="border-r border-slate-100 px-4 py-3 dark:border-[#262626]">
        <BadgeEstado estado={paciente.estado} />
      </td>
      {showProximaAtencion && (
        <td className="whitespace-nowrap border-r border-slate-100 px-4 py-3 text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
          {proximaAtencionValida ? (
            <div className="ccr-appointment-soft inline-flex min-w-[118px] flex-col items-start rounded-md px-2.5 py-1.5 leading-tight">
              <p className="font-bold">
                {proximaAtencion!.toLocaleDateString("es-CL")}
              </p>
              <p className="text-[11px] font-semibold opacity-75">
                {proximaAtencion!.toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ) : (
            <span className="text-slate-500 dark:text-[#6ab0c8]">Sin programar</span>
          )}
        </td>
      )}
      <td
        className="border-r border-slate-100 px-4 py-3 text-center font-semibold dark:border-[#262626]"
        title={`${diasMostrados} ${
          daysMode === "ingreso"
            ? "días desde ingreso"
            : daysMode === "llamados"
              ? "días en contactabilidad"
              : "días en lista"
        }`}
      >
        <BadgeDias days={diasMostrados} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right dark:text-[#daebf1]">
        <div className="inline-flex gap-2">
          {puedeAsignarse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onAsignarme(paciente);
              }}
              className="ccr-table-action ccr-action-primary"
            >
              Asignarme
            </button>
          )}
          {puedeProgramar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onProgramar(paciente);
              }}
              className="ccr-table-action ccr-action-schedule"
            >
              {paciente.proxima_atencion ? "Reprogramar" : "Próxima atención"}
            </button>
          )}
          {puedeContactar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContactar(paciente);
              }}
              className="ccr-table-action ccr-action-call"
            >
              Contactar
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVerFicha(paciente);
            }}
            className="ccr-table-action ccr-action-view"
          >
            Ver ficha operativa
          </button>
          {onEliminar && usuario.rol === "ADMIN" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEliminar(paciente);
              }}
                className="ccr-table-action ccr-action-danger"
              >
                Eliminar
              </button>
          )}
        </div>
      </td>
    </tr>
  );
}
