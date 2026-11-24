"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiLink, FiRefreshCw, FiSearch, FiUser } from "react-icons/fi";
import { api } from "@/lib/api";
import { formatearRut } from "@/lib/rut";
import { unwrapResults } from "@/lib/swr";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { ESTADO_LABELS } from "@/lib/types";
import type {
  HistorialAccionPaciente,
  HistorialAccionesPaciente,
  Paciente,
  PaginatedResponse,
} from "@/lib/types";
import MenuAcciones from "@/components/MenuAcciones";
import PacienteSearchBox from "@/components/PacienteSearchBox";
import TimelinePaciente from "@/components/TimelinePaciente";
import LoaderKine from '@/components/LoaderKine'

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
  const { toast } = useToast();
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

  function cambiarPaciente() {
    setPaciente(null);
    setAcciones([]);
    setError("");
  }

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Línea de tiempo</h1>

      <section className="ccr-panel overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-[#262626] dark:bg-[#0f0f10]">
        {/* Barra superior: búsqueda del paciente o paciente elegido + menú */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4 dark:border-[#262626]">
          {!paciente ? (
            <div className="min-w-0 flex-1 sm:max-w-xl">
              <PacienteSearchBox onSelect={(p) => void cargarHistorial(p)} />
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  {iniciales(paciente.nombre)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">{paciente.nombre}</p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-500">
                    {formatearRut(paciente.rut)} · {ESTADO_LABELS[paciente.estado] ?? paciente.estado}
                    {typeof paciente.dias_en_lista === "number" ? ` · ${paciente.dias_en_lista} días en lista` : ""}
                  </p>
                </div>
              </div>
              <div className="ml-auto">
                <MenuAcciones
                  acciones={[
                    {
                      label: "Actualizar",
                      detalle: "Vuelve a cargar los eventos",
                      tono: "azul",
                      icon: <FiRefreshCw size={13} aria-hidden="true" />,
                      onClick: () => void cargarHistorial(paciente),
                    },
                    {
                      label: "Cambiar paciente",
                      detalle: "Buscar a otra persona",
                      tono: "gris",
                      icon: <FiUser size={13} aria-hidden="true" />,
                      onClick: cambiarPaciente,
                    },
                    {
                      label: "Copiar enlace",
                      detalle: "De la línea de tiempo de este paciente",
                      tono: "gris",
                      icon: <FiLink size={13} aria-hidden="true" />,
                      onClick: () => {
                        const url = new URL(window.location.href);
                        url.searchParams.set("rut", paciente.rut);
                        void navigator.clipboard?.writeText(url.toString()).then(() => toast.info("Enlace copiado."));
                      },
                    },
                  ]}
                />
              </div>
            </>
          )}
        </div>

        {!paciente ? (
          <p className="flex items-center justify-center gap-2 px-4 py-12 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <FiSearch size={15} /> Busca por nombre o RUT para ver su línea de tiempo.
          </p>
        ) : (
          <div className="p-4 sm:p-5">
            {error && (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}

            {loading ? (
              <div className="flex justify-center py-8">
                <LoaderKine enLinea retrasoMs={0} />
              </div>
            ) : (
              <TimelinePaciente acciones={acciones} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
