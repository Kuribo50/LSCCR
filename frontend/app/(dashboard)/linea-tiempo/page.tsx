"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiRefreshCw, FiSearch, FiUser } from "react-icons/fi";
import { api } from "@/lib/api";
import { formatearRut } from "@/lib/rut";
import { unwrapResults } from "@/lib/swr";
import { getErrorMessage } from "@/lib/errors";
import { ESTADO_LABELS } from "@/lib/types";
import type {
  HistorialAccionPaciente,
  HistorialAccionesPaciente,
  Paciente,
  PaginatedResponse,
} from "@/lib/types";
import PacienteSearchBox from "@/components/PacienteSearchBox";
import TimelinePaciente from "@/components/TimelinePaciente";

function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

export default function LineaTiempoPage() {
  const searchParams = useSearchParams();
  const rutParam = searchParams.get("rut");
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [acciones, setAcciones] = useState<HistorialAccionPaciente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargarHistorial = useCallback(async (seleccionado: Paciente) => {
    setPaciente(seleccionado);
    setLoading(true);
    setError("");
    setAcciones([]);
    try {
      const data = await api.get<HistorialAccionesPaciente>(
        `/pacientes/${seleccionado.id}/historial-acciones/`,
      );
      setAcciones(data.acciones);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar la línea de tiempo."));
    } finally {
      setLoading(false);
    }
  }, []);

  // Deep-link opcional: /linea-tiempo?rut=... preselecciona al paciente (la ficha
  // y la paleta pueden enlazar aqui sin que el usuario tenga que volver a buscar).
  useEffect(() => {
    if (!rutParam) return;
    let cancelado = false;
    void (async () => {
      try {
        const data = await api.get<Paciente[] | PaginatedResponse<Paciente>>(
          `/pacientes/?search=${encodeURIComponent(rutParam)}`,
        );
        const lista = unwrapResults(data);
        const limpio = rutParam.replace(/[^0-9kK]/g, "").toLowerCase();
        const match =
          lista.find((p) => p.rut.replace(/[^0-9kK]/g, "").toLowerCase() === limpio) ?? lista[0];
        if (match && !cancelado) void cargarHistorial(match);
      } catch {
        // El usuario siempre puede buscar manualmente.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [rutParam, cargarHistorial]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
          Historial clínico-operativo
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          Línea de tiempo
        </h1>
        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Todos los eventos de un paciente en un solo hilo: contactos, citas, inasistencias y cambios de estado.
        </p>
      </header>

      {!paciente ? (
        <section className="ccr-panel rounded-2xl border border-slate-200 bg-white p-6 dark:border-[#262626] dark:bg-[#0f0f10]">
          <div className="mx-auto max-w-xl">
            <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Buscar paciente
            </label>
            <PacienteSearchBox onSelect={(p) => void cargarHistorial(p)} />
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-400">
              <FiSearch size={15} /> Busca por nombre o RUT para ver su línea de tiempo.
            </p>
          </div>
        </section>
      ) : (
        <section className="ccr-panel space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#262626] dark:bg-[#0f0f10] sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-[#1f1f1f] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                {iniciales(paciente.nombre)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-black text-slate-950 dark:text-white">
                  {paciente.nombre}
                </p>
                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {formatearRut(paciente.rut)} · {ESTADO_LABELS[paciente.estado] ?? paciente.estado}
                  {typeof paciente.dias_en_lista === "number"
                    ? ` · ${paciente.dias_en_lista} días en lista`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void cargarHistorial(paciente)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#181818] dark:text-slate-200 dark:hover:bg-[#202020]"
              >
                <FiRefreshCw size={14} /> Actualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaciente(null);
                  setAcciones([]);
                  setError("");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#181818] dark:text-slate-200 dark:hover:bg-[#202020]"
              >
                <FiUser size={14} /> Cambiar paciente
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 px-1 py-6 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              Cargando línea de tiempo…
            </div>
          ) : (
            <TimelinePaciente acciones={acciones} />
          )}
        </section>
      )}
    </div>
  );
}
