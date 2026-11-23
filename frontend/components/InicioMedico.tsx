"use client";

// Inicio del Médico: su trabajo es cargar y verificar derivaciones, así que
// aquí ve solo eso. Indicadores del mes y últimas cargas, cada una con su
// ventana de 10 minutos para revertirse o marcada como consolidada.

import Link from "next/link";
import { FiCheckCircle, FiClock, FiFileText, FiPhoneOff, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import RevertirCarga, { formatoRestante, useSegundosRestantes } from "@/components/RevertirCarga";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { useAPI } from "@/lib/swr";
import type { CargaReciente, ResumenCargas } from "@/lib/types";

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? "Buenas noches" : h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function fechaHora(iso: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function Indicador({ icono, titulo, valor, detalle, accion }: { icono: React.ReactNode; titulo: string; valor: number; detalle: string; accion?: React.ReactNode }) {
  return (
    <div className="ccr-panel rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[12px] font-bold text-[color:var(--text-muted)]">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)] ring-1 ring-inset ring-[color:var(--border-subtle)]">{icono}</span>
        {titulo}
      </div>
      <p className="mt-3 text-[28px] font-extrabold leading-none tabular-nums text-[color:var(--text-primary)]">{valor}</p>
      <p className="mt-1.5 text-[12px] font-medium text-[color:var(--text-subtle)]">{detalle}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

/** Estado de la ventana de reversión de una carga. */
function EstadoCarga({ carga, onRevertida }: { carga: CargaReciente; onRevertida: () => void }) {
  const segundos = useSegundosRestantes(carga.en_ventana ? carga.revertible_hasta : undefined);
  if (carga.revertible && segundos > 0) {
    return (
      <RevertirCarga
        corteId={carga.id}
        hasta={carga.revertible_hasta}
        descripcion={`${carga.periodo_label} · ${carga.archivo_nombre}`}
        onRevertida={onRevertida}
        compacto
      />
    );
  }
  if (carga.en_ventana && segundos > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200 dark:text-amber-200 dark:ring-amber-400/30" title={carga.motivo_no_revertible}>
        <FiClock size={11} aria-hidden="true" />
        En ventana · {formatoRestante(segundos)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-green-800 ring-1 ring-inset ring-green-200 dark:text-green-200 dark:ring-green-400/30" title={carga.motivo_no_revertible || "Consolidada"}>
      <FiCheckCircle size={11} aria-hidden="true" />
      Consolidada
    </span>
  );
}

export default function InicioMedico() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useAPI<ResumenCargas>("/importar/resumen-cargas/");
  const nombre = (user?.nombre ?? "").split(" ")[0] || "equipo CCR";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--text-muted)]">Carga y verificación de derivaciones</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
            {saludo()}, {nombre}
          </h1>
          <p className="mt-1 text-sm font-medium text-[color:var(--text-secondary)]">
            Sube aquí las derivaciones extraídas de TrakCare. Cada carga se puede revertir durante 10 minutos.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => void mutate()} className="ccr-control-button inline-flex items-center gap-1.5">
            <FiRefreshCw size={13} aria-hidden="true" />
            Actualizar
          </button>
          <Link href="/importar" className="ccr-control-button ccr-control-button-primary inline-flex items-center gap-1.5">
            <FiUploadCloud size={14} aria-hidden="true" />
            Importar derivaciones
          </Link>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
          {getErrorMessage(error, "No se pudo cargar el resumen de cargas.")}
        </p>
      )}

      <section className="ccr-stagger grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={`Indicadores de ${data?.mes_label ?? "este mes"}`}>
        <Indicador
          icono={<FiFileText size={14} aria-hidden="true" />}
          titulo="Derivaciones importadas"
          valor={data?.derivaciones_mes ?? 0}
          detalle={`Pacientes nuevos en ${data?.mes_label ?? "el mes"}`}
        />
        <Indicador
          icono={<FiUploadCloud size={14} aria-hidden="true" />}
          titulo="Cargas realizadas"
          valor={data?.cargas_mes ?? 0}
          detalle={`Archivos subidos en ${data?.mes_label ?? "el mes"}`}
        />
        <Indicador
          icono={<FiPhoneOff size={14} aria-hidden="true" />}
          titulo="Pendientes de teléfono"
          valor={data?.pendientes_telefono ?? 0}
          detalle="Pacientes activos sin número registrado"
          accion={
            <Link href="/importar#telefonos" className="text-[12px] font-bold text-[color:var(--action)] hover:underline">
              Completar teléfonos →
            </Link>
          }
        />
      </section>

      <section className="ccr-panel rounded-2xl" aria-label="Actividad reciente">
        <div className="flex flex-col gap-1 border-b border-[color:var(--border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[color:var(--text-primary)]">Actividad reciente</h2>
            <p className="mt-0.5 text-[12px] font-medium text-[color:var(--text-muted)]">
              Últimas cargas. Dentro de los primeros 10 minutos se pueden revertir; después quedan consolidadas.
            </p>
          </div>
          <Link href="/historial-mensual" className="text-[12px] font-bold text-[color:var(--action)] hover:underline">
            Ver historial de cortes →
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-ink-black-700" />
            ))}
          </div>
        ) : !data?.recientes.length ? (
          <div className="px-5 py-10 text-center">
            <FiUploadCloud className="mx-auto text-slate-300" size={26} aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-[color:var(--text-primary)]">Todavía no hay cargas</p>
            <p className="mt-1 text-[12px] font-medium text-[color:var(--text-muted)]">Empieza con Importar derivaciones.</p>
          </div>
        ) : (
          <ul className="ccr-stagger divide-y divide-[color:var(--border-subtle)]">
            {data.recientes.map((carga) => (
              <li key={carga.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[color:var(--text-primary)]">
                    {carga.periodo_label} <span className="font-medium text-[color:var(--text-subtle)]">· {carga.archivo_nombre}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] font-medium text-[color:var(--text-muted)]">
                    {fechaHora(carga.fecha_subida)}
                    {carga.usuario_nombre ? ` · ${carga.usuario_nombre}` : ""} · {carga.registros_importados} nuevos · {carga.duplicados} recurrentes
                    {carga.errores_count ? ` · ${carga.errores_count} con error` : ""}
                  </p>
                </div>
                <div className="shrink-0">
                  <EstadoCarga carga={carga} onRevertida={() => void mutate()} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
