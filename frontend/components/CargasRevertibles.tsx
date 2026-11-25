"use client";

// Aviso fijo, visible en todo el dashboard, con las cargas de derivaciones que
// aún se pueden revertir (10 minutos desde la subida). Así la reversión sigue
// disponible aunque se salga de Importar o se haya hecho más de una carga.
// Se puede cerrar: la cuenta regresiva sigue en Historial de cortes, y el aviso
// vuelve a aparecer solo si llega una carga nueva.

import { useEffect, useState } from "react";
import { FiRotateCcw, FiX } from "react-icons/fi";
import RevertirCarga from "@/components/RevertirCarga";
import { useAuth } from "@/lib/auth-context";
import { useAlCambiarCargas } from "@/lib/cargasEventos";
import { puedeCargarDerivaciones } from "@/lib/roles";
import { useAPI } from "@/lib/swr";
import type { CargasRevertiblesResultado } from "@/lib/types";

const REFRESCO_MS = 30_000;
const CLAVE_CERRADAS = "ccr-cargas-revertibles-cerradas";

function leerCerradas(): string[] {
  try {
    const guardado = JSON.parse(window.sessionStorage.getItem(CLAVE_CERRADAS) ?? "[]");
    return Array.isArray(guardado) ? guardado.filter((lote) => typeof lote === "string") : [];
  } catch {
    return [];
  }
}

function guardarCerradas(lotes: string[]) {
  try {
    window.sessionStorage.setItem(CLAVE_CERRADAS, JSON.stringify(lotes));
  } catch {
    // Sin almacenamiento el aviso queda cerrado solo hasta recargar la página.
  }
}

export default function CargasRevertibles() {
  const { user } = useAuth();
  const habilitado = Boolean(user && puedeCargarDerivaciones(user));
  const { data, mutate } = useAPI<CargasRevertiblesResultado>(
    habilitado ? "/importar/cargas-revertibles/" : null,
    { refreshInterval: REFRESCO_MS, revalidateOnFocus: true },
  );
  useAlCambiarCargas(() => void mutate());

  // Reloj para ocultar cada carga justo al vencer su plazo, sin esperar al próximo refresco.
  const [ahora, setAhora] = useState(() => Date.now());
  const hayItems = (data?.items.length ?? 0) > 0;
  useEffect(() => {
    if (!hayItems) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hayItems]);

  // Lotes cuyo aviso se cerró; se recuerdan durante la sesión del navegador.
  const [cerradas, setCerradas] = useState<string[]>(leerCerradas);

  const vigentes = (data?.items ?? []).filter(
    (carga) => Date.parse(carga.revertible_hasta) > ahora && !cerradas.includes(carga.lote),
  );
  if (!habilitado || vigentes.length === 0) return null;

  const cerrar = () => {
    const lotes = [...new Set([...cerradas, ...vigentes.map((carga) => carga.lote)])];
    setCerradas(lotes);
    guardarCerradas(lotes);
  };

  return (
    <aside
      aria-label="Cargas que se pueden revertir"
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-amber-200 bg-white p-3 shadow-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[390px] dark:border-amber-400/30 dark:bg-ink-black-900"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
          <FiRotateCcw size={13} aria-hidden="true" />
          {vigentes.length === 1 ? "Puedes revertir una carga" : `Puedes revertir ${vigentes.length} cargas`}
        </p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar aviso"
          title="Cerrar · sigue disponible en Historial de cortes"
          className="-m-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 dark:text-ink-black-400 dark:hover:bg-ink-black-800 dark:hover:text-white"
        >
          <FiX size={14} aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
        {vigentes.map((carga) => (
          <li
            key={carga.lote}
            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-ink-black-800"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-slate-800 dark:text-white" title={carga.archivo_nombre}>
                {carga.periodos.join(", ")} · {carga.archivo_nombre}
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-ink-black-300">
                {carga.pacientes_creados === 1 ? "1 paciente nuevo" : `${carga.pacientes_creados} pacientes nuevos`}
                {carga.usuario_nombre ? ` · ${carga.usuario_nombre}` : ""}
              </span>
            </span>
            <RevertirCarga
              corteId={carga.corte_id}
              hasta={carga.revertible_hasta}
              descripcion={`${carga.periodos.join(", ")} · ${carga.archivo_nombre}`}
              onRevertida={() => void mutate()}
              compacto
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}
