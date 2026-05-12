"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Paciente, Usuario } from "@/lib/types";
import PacienteRow from "./PacienteRow";
import FichaPaciente from "./FichaPaciente";
import ProximaAtencionModal from "./ProximaAtencionModal";
import RegistrarContactoModal from "./RegistrarContactoModal";

interface Props {
  pacientes: Paciente[];
  usuario: Usuario;
  onRefresh: () => void;
  ordering?: string;
  onToggleDiasOrder: () => void;
  isMisPacientes?: boolean;
  daysMode?: "lista" | "ingreso" | "llamados";
  showProximaAtencion?: boolean;
}

export default function PacienteTable({
  pacientes,
  usuario,
  onRefresh,
  ordering = "",
  onToggleDiasOrder,
  isMisPacientes = false,
  daysMode = isMisPacientes ? "ingreso" : "lista",
  showProximaAtencion = true,
}: Props) {
  const [seleccionado, setSeleccionado] = useState<Paciente | null>(null);
  const [programando, setProgramando] = useState<Paciente | null>(null);
  const [contactando, setContactando] = useState<Paciente | null>(null);
  const [error, setError] = useState("");
  const orderingLabel =
    ordering === "dias" ? "▲" : ordering === "-dias" ? "▼" : "↕";

  if (pacientes.length === 0) {
    return (
      <div className="ccr-panel rounded-xl border p-12 text-center text-sm text-slate-500">
        No hay pacientes que coincidan con los filtros.
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="ccr-panel ccr-data-table overflow-hidden rounded-lg bg-white dark:bg-[#0f0f10]">
        <div className="max-h-[clamp(300px,calc(100dvh-340px),820px)] min-h-[300px] overflow-auto">
          <table className="w-full min-w-[1500px] text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="ccr-table-head border-b border-slate-200 bg-slate-50 dark:border-[#262626] dark:bg-[#202020]">
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Nombre
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  RUT
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Edad
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Sector CESFAM
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Sector oficial
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Diagnóstico
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Prioridad
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Categoría
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Responsable CCR
                </th>
                <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  Estado
                </th>
                {showProximaAtencion && (
                  <th className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                    Próxima atención
                  </th>
                )}
                <th className="whitespace-nowrap border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-700 dark:border-[#262626] dark:text-[#daebf1]">
                  <button
                    type="button"
                    onClick={onToggleDiasOrder}
                    className="inline-flex items-center gap-1 text-slate-700 transition hover:text-blue-700 dark:text-[#daebf1] dark:hover:text-blue-300"
                  >
                    {daysMode === "ingreso"
                      ? "Días desde el ingreso"
                      : daysMode === "llamados"
                        ? "Días en contactabilidad"
                        : "Días en lista"}
                    <span className="text-[10px]">{orderingLabel}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-[#daebf1]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((paciente) => (
                <PacienteRow
                  key={paciente.id}
                  paciente={paciente}
                  usuario={usuario}
                  isMisPacientes={isMisPacientes}
                  daysMode={daysMode}
                  showProximaAtencion={showProximaAtencion}
                  onVerFicha={setSeleccionado}
                  onProgramar={setProgramando}
                  onContactar={setContactando}
                  onAsignarme={async (p) => {
                    if (
                      !window.confirm(
                        "¿Estás seguro que deseas tomar a este paciente? Comenzará su seguimiento y pasará a tu sección Mis pacientes.",
                      )
                    ) {
                      return;
                    }
                    try {
                      setError("");
                      await api.post(`/pacientes/${p.id}/asignar/`);
                      onRefresh();
                    } catch (e: unknown) {
                      const detail =
                        e && typeof e === "object" && "detail" in e
                          ? (e as { detail: string }).detail
                          : "No se pudo asignar el paciente.";
                      setError(detail);
                    }
                  }}
                  onEliminar={usuario.rol === "ADMIN" ? async (p) => {
                    if (!window.confirm(`¿Seguro que deseas eliminar al paciente ${p.nombre} del sistema de forma permanente?`)) return;
                    try {
                      setError("");
                      await api.delete(`/pacientes/${p.id}/`);
                      onRefresh();
                    } catch {
                      setError("No se pudo eliminar el paciente.");
                    }
                  } : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-600 dark:border-[#262626] dark:bg-[#202020] dark:text-[#b5d8e3] sm:flex-row sm:items-center sm:justify-between">
          <p>
            {pacientes.length} paciente{pacientes.length !== 1 ? "s" : ""} en la
            tabla
          </p>
          <p className="text-slate-500 dark:text-[#6ab0c8]">Vista actualizada</p>
        </div>
      </div>

      {seleccionado && (
        <FichaPaciente
          paciente={seleccionado}
          usuario={usuario}
          onClose={() => setSeleccionado(null)}
          onRefresh={() => {
            onRefresh();
          }}
        />
      )}

      {showProximaAtencion && programando && (
        <ProximaAtencionModal
          paciente={programando}
          onClose={() => setProgramando(null)}
          onConfirm={async (fechaHora) => {
            await api.post(`/pacientes/${programando.id}/programar-atencion/`, {
              fecha_hora: fechaHora,
            });
            onRefresh();
            const actualizado = await api.get<Paciente>(
              `/pacientes/${programando.id}/`,
            );
            setProgramando(actualizado);
          }}
          onClear={
            programando.proxima_atencion
              ? async () => {
                  await api.delete(
                    `/pacientes/${programando.id}/programar-atencion/`,
                  );
                  onRefresh();
                  onRefresh();
                  const actualizado = await api.get<Paciente>(
                    `/pacientes/${programando.id}/`,
                  );
                  setProgramando(actualizado);
                }
              : undefined
          }
        />
      )}

      {contactando && (
        <RegistrarContactoModal
          paciente={contactando}
          onClose={() => setContactando(null)}
          onSuccess={() => {
            onRefresh();
          }}
        />
      )}
    </>
  );
}
