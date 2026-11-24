"use client";

import type { ReactNode } from "react";
import { FiAlertTriangle, FiRepeat, FiUserPlus } from "react-icons/fi";
import type { ImportacionPreviewResultado } from "@/lib/types";

/** Cuenta textos repetidos y devuelve los más frecuentes. */
function agrupar(textos: string[], maximo = 2) {
  const conteo = new Map<string, number>();
  textos.forEach((t) => conteo.set(t, (conteo.get(t) ?? 0) + 1));
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo)
    .map(([texto, n]) => ({ texto, n }));
}

interface Seccion {
  clave: string;
  titulo: string;
  n: number;
  icono: ReactNode;
  tono: string;
  /** Lo que pasa con estos registros: frases cortas. */
  lineas: string[];
}

function seccionesDe(preview: ImportacionPreviewResultado): Seccion[] {
  const registros = preview.registros;
  const nuevos = registros.filter(
    (r) => r.estado !== "ERROR" && r.estado !== "DUPLICADO",
  );
  const errores = registros.filter((r) => r.estado === "ERROR");

  // --- Nuevos ---
  const lineasNuevos: string[] = [];
  const pendientes = preview.pendientes ?? 0;
  const ingresados = preview.ingresados ?? 0;
  if (pendientes > 0) lineasNuevos.push(`${pendientes} quedan Pendientes`);
  if (ingresados > 0) lineasNuevos.push(`${ingresados} entran Ingresados`);
  const conKine = preview.con_kine_asignado ?? 0;
  if (conKine > 0) lineasNuevos.push(`${conKine} con profesional asignado`);
  if (nuevos.length > 0) {
    const conTerritorio = nuevos.filter((r) => r.sector_oficial).length;
    lineasNuevos.push(
      `${conTerritorio}/${nuevos.length} con sector y territorio`,
    );
  }
  const avisos = nuevos.filter((r) => r.estado === "REVISION");
  if (avisos.length > 0)
    lineasNuevos.push(`${avisos.length} con aviso en Revisión`);

  // --- Errores ---
  const motivos = agrupar(
    errores.map((r) => (r.error || "Fila con error").trim()),
  );
  const lineasErrores = ["No se cargan: van a Revisión de carga"];
  motivos.forEach((m) => lineasErrores.push(`${m.texto} (${m.n})`));

  return [
    {
      clave: "nuevos",
      titulo: "Nuevos",
      n: preview.nuevos ?? preview.validos,
      icono: <FiUserPlus size={15} />,
      tono: "text-blue-700 bg-blue-50 dark:!bg-[#151b2e] dark:!text-ink-black-100",
      lineas: lineasNuevos,
    },
    {
      clave: "recurrentes",
      titulo: "Recurrentes",
      n: preview.recurrentes ?? preview.duplicados,
      icono: <FiRepeat size={15} />,
      tono: "text-amber-700 bg-amber-50 dark:!bg-amber-400/10",
      lineas: [
        "No se crea ficha nueva",
        "Suman diagnóstico y 1 mes de espera",
        "Se completa el teléfono si falta",
      ],
    },
    {
      clave: "errores",
      titulo: "Con error",
      n: preview.errores_count ?? preview.errores.length,
      icono: <FiAlertTriangle size={15} />,
      tono: "text-red-700 bg-red-50 dark:!bg-red-500/10",
      lineas: lineasErrores,
    },
  ].filter((s) => s.n > 0);
}

/** "Qué ocurrirá" al confirmar: una tarjeta por tipo de registro, en horizontal y con frases cortas. */
export default function ImportarResumenConfirmacion({
  preview,
}: {
  preview: ImportacionPreviewResultado;
}) {
  const secciones = seccionesDe(preview);
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      {secciones.map((s) => (
        <section
          key={s.clave}
          aria-label={s.titulo}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 dark:!border-[#262626]"
        >
          <header className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.tono}`}
            >
              {s.icono}
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-black leading-none tabular-nums text-slate-900 dark:!text-white">
                {s.n}
              </p>
              <p className="mt-0.5 text-xs font-bold text-slate-600 dark:!text-ink-black-200">
                {s.titulo}
              </p>
            </div>
          </header>
          <ul className="mt-2.5 space-y-1 text-[11px] font-medium leading-snug text-slate-600 dark:!text-ink-black-200">
            {s.lineas.map((linea) => (
              <li key={linea} className="flex gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-slate-400"
                />
                <span className="min-w-0">{linea}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
