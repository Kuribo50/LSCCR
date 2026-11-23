"use client";

import { useCallback, useState } from "react";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import { FiEye, FiPhoneCall, FiRefreshCw, FiSearch } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import type { PacienteRiesgo, RiesgoAbandonoResponse, RiesgoNivel } from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import LoaderKine from '@/components/LoaderKine'

const NIVEL_BAND: Record<
  RiesgoNivel,
  { label: string; corto: string; card: string; text: string; score: string }
> = {
  ALTO: {
    label: "Riesgo alto",
    corto: "Alto",
    card: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    score: "text-red-600 dark:text-red-300",
  },
  MEDIO: {
    label: "Riesgo medio",
    corto: "Medio",
    card: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    score: "text-amber-600 dark:text-amber-300",
  },
  BAJO: {
    label: "Riesgo bajo",
    corto: "Bajo",
    card: "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-300",
    score: "text-green-600 dark:text-green-300",
  },
};

export default function RiesgoAbandonoPage() {
  const { user } = useAuth();
  const [data, setData] = useState<RiesgoAbandonoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState<PacienteRiesgo | null>(null);

  const traer = useCallback(async () => {
    try {
      const res = await api.get<RiesgoAbandonoResponse>("/pacientes/riesgo-abandono/");
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo cargar el riesgo de abandono."));
    } finally {
      setLoading(false);
    }
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    await traer();
  }, [traer]);

  useCargaAlMontar(traer);

  const resumen = data?.resumen;
  const pacientes = data?.pacientes ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
            Gestión proactiva
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            Riesgo de abandono
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Pacientes priorizados por un score de riesgo (inasistencias, contacto, espera): a quién contactar primero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#181818] dark:text-slate-200 dark:hover:bg-[#202020]"
        >
          <FiRefreshCw size={14} /> Actualizar
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {(["ALTO", "MEDIO", "BAJO"] as RiesgoNivel[]).map((nivel) => {
          const band = NIVEL_BAND[nivel];
          const value =
            nivel === "ALTO" ? resumen?.alto : nivel === "MEDIO" ? resumen?.medio : resumen?.bajo;
          return (
            <div key={nivel} className={`rounded-xl border p-4 ${band.card}`}>
              <p className={`text-xs font-bold ${band.text}`}>{band.label}</p>
              <p className={`mt-1 text-2xl font-black ${band.score}`}>{value ?? "—"}</p>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-8 dark:border-[#262626] dark:bg-[#0f0f10]">
          <LoaderKine enLinea retrasoMs={0} />
        </div>
      ) : pacientes.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:border-[#262626] dark:bg-[#151515] dark:text-slate-400">
          <FiSearch size={15} /> Sin pacientes activos para evaluar.
        </p>
      ) : (
        <div className="ccr-stagger overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#262626] dark:bg-[#0f0f10]">
          {pacientes.map((paciente, index) => {
            const band = NIVEL_BAND[paciente.riesgo_nivel];
            const tel = (paciente.telefono || "").replace(/\D/g, "");
            return (
              <div
                key={paciente.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index > 0 ? "border-t border-slate-100 dark:border-[#1f1f1f]" : ""
                }`}
              >
                <div className="w-12 shrink-0 text-center">
                  <p className={`text-xl font-black leading-none ${band.score}`}>
                    {paciente.riesgo_score}
                  </p>
                  <p className={`text-[10px] font-bold ${band.text}`}>{band.corto}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setSeleccionado(paciente)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {paciente.nombre}{" "}
                    <span className="font-mono text-xs font-medium text-slate-400">
                      {formatearRut(paciente.rut)}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {paciente.riesgo_factores.map((factor, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-[#202020] dark:text-slate-300"
                      >
                        {factor}
                      </span>
                    ))}
                  </div>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  {tel && (
                    <a
                      href={`tel:${tel}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#181818] dark:text-slate-200 dark:hover:bg-[#202020]"
                    >
                      <FiPhoneCall size={14} /> Llamar
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setSeleccionado(paciente)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[#262626] dark:bg-[#181818] dark:text-slate-200 dark:hover:bg-[#202020]"
                  >
                    <FiEye size={14} /> Ver ficha
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {seleccionado && user && (
        <FichaPaciente
          key={seleccionado.id}
          paciente={seleccionado}
          usuario={user}
          onClose={() => setSeleccionado(null)}
          onRefresh={() => void cargar()}
        />
      )}
    </div>
  );
}
