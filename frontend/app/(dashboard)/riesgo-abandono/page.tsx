"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCargaAlMontar } from "@/lib/useCargaAlMontar";
import { FiEye, FiLink, FiPhoneCall, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut } from "@/lib/rut";
import type { PacienteRiesgo, RiesgoAbandonoResponse, RiesgoNivel } from "@/lib/types";
import FichaPaciente from "@/components/FichaPaciente";
import FiltroPildoras from "@/components/FiltroPildoras";
import MenuAcciones from "@/components/MenuAcciones";
import { useToast } from "@/lib/toast-context";
import { normalizeRut, normalizeSearchText } from "@/lib/utils";
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
  const { toast } = useToast();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [nivel, setNivel] = useState<RiesgoNivel | "">("");
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
  const pacientes = useMemo(() => data?.pacientes ?? [], [data]);

  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    return pacientes.filter((p) => {
      if (nivel && p.riesgo_nivel !== nivel) return false;
      if (!q) return true;
      return normalizeSearchText(p.nombre).includes(q) || (!!rut && normalizeRut(p.rut).includes(rut));
    });
  }, [pacientes, busqueda, nivel]);

  const hayFiltros = Boolean(busqueda || nivel);
  const conteoNivel = (n: RiesgoNivel) => pacientes.filter((p) => p.riesgo_nivel === n).length;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Riesgo de abandono</h1>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#262626] dark:bg-[#0f0f10]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 border-b border-slate-200 p-4 dark:border-[#262626]">
          <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={14} aria-hidden="true" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar nombre o RUT"
              aria-label="Buscar paciente"
              className="ccr-control-input w-full pl-9 pr-3"
            />
          </div>
          <div className="w-44 shrink-0">
            <FiltroPildoras
              ariaLabel="Filtrar por nivel de riesgo"
              valor={nivel}
              onChange={(v) => setNivel(v as RiesgoNivel | "")}
              opciones={[
                { value: "", label: "Todos", total: pacientes.length },
                { value: "ALTO", label: "Riesgo alto", dot: "bg-red-500", total: conteoNivel("ALTO") },
                { value: "MEDIO", label: "Riesgo medio", dot: "bg-amber-400", total: conteoNivel("MEDIO") },
                { value: "BAJO", label: "Riesgo bajo", dot: "bg-green-500", total: conteoNivel("BAJO") },
              ]}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {hayFiltros && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  setNivel("");
                }}
                aria-label="Quitar todos los filtros"
                title="Quitar filtros"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-900/60 dark:bg-transparent dark:text-red-300"
              >
                <FiX size={15} aria-hidden="true" />
              </button>
            )}
            <MenuAcciones
              acciones={[
                {
                  label: "Actualizar",
                  detalle: "Vuelve a calcular el riesgo",
                  tono: "azul",
                  icon: <FiRefreshCw size={13} aria-hidden="true" />,
                  onClick: () => void cargar(),
                },
                {
                  label: "Copiar enlace",
                  detalle: "De esta vista",
                  tono: "gris",
                  icon: <FiLink size={13} aria-hidden="true" />,
                  onClick: () => {
                    void navigator.clipboard?.writeText(window.location.href).then(() => toast.info("Enlace copiado."));
                  },
                },
                {
                  label: "Ir a Llamados",
                  detalle: "Pacientes por contactar",
                  tono: "gris",
                  icon: <FiPhoneCall size={13} aria-hidden="true" />,
                  onClick: () => router.push("/llamados"),
                },
              ]}
            />
          </div>
        </div>

        {error && (
          <p className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <LoaderKine enLinea retrasoMs={0} />
          </div>
        ) : visibles.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-slate-500 dark:text-slate-500">
            <FiSearch size={15} /> {pacientes.length === 0 ? "Sin pacientes activos para evaluar." : "Ningún paciente coincide con los filtros."}
          </p>
        ) : (
          <div className="ccr-stagger">
            {visibles.map((paciente, index) => {
              const band = NIVEL_BAND[paciente.riesgo_nivel];
              return (
                <div
                  key={paciente.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    index > 0 ? "border-t border-slate-100 dark:border-[#1f1f1f]" : ""
                  }`}
                >
                  <div className="w-12 shrink-0 text-center">
                    <p className={`text-xl font-black leading-none ${band.score}`}>{paciente.riesgo_score}</p>
                    <p className={`text-[10px] font-bold ${band.text}`}>{band.corto}</p>
                  </div>

                  <button type="button" onClick={() => setSeleccionado(paciente)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {paciente.nombre}{" "}
                      <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
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

                  <button type="button" onClick={() => setSeleccionado(paciente)} className="ccr-control-button shrink-0">
                    <FiEye size={13} aria-hidden="true" /> Ver ficha
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!loading && pacientes.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5 text-[11px] font-semibold text-slate-500 dark:border-[#262626] dark:bg-[#151515] dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Mostrando {visibles.length} de {pacientes.length} ·{" "}
              <span className="text-red-600 dark:text-red-300">{resumen?.alto ?? conteoNivel("ALTO")} alto</span> ·{" "}
              <span className="text-amber-600 dark:text-amber-300">{resumen?.medio ?? conteoNivel("MEDIO")} medio</span> ·{" "}
              <span className="text-green-600 dark:text-green-300">{resumen?.bajo ?? conteoNivel("BAJO")} bajo</span>
            </p>
            <p>Score según inasistencias, contacto y espera: a quién contactar primero.</p>
          </div>
        )}
      </section>

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
