"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FiMoreVertical } from "react-icons/fi";

export interface AccionMenu {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Color del ícono y del fondo al pasar el mouse. */
  tono?: "azul" | "verde" | "rojo" | "gris";
  /** Texto de apoyo bajo el nombre. */
  detalle?: string;
}

const TONOS = {
  azul: { chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200", hover: "hover:bg-blue-50 dark:hover:bg-blue-500/10" },
  verde: { chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200", hover: "hover:bg-emerald-50 dark:hover:bg-emerald-500/10" },
  rojo: { chip: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200", hover: "hover:bg-red-50 dark:hover:bg-red-500/10" },
  gris: { chip: "bg-slate-100 text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200", hover: "hover:bg-slate-50 dark:hover:bg-ink-black-700" },
} as const;

/** Botón de tres puntos que abre un menú corto de acciones (actualizar, exportar, etc.). */
export default function MenuAcciones({ acciones, ariaLabel = "Más acciones" }: { acciones: AccionMenu[]; ariaLabel?: string }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-900 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/30 aria-expanded:bg-slate-100 dark:text-ink-black-50 dark:hover:bg-ink-black-700 dark:aria-expanded:bg-ink-black-700"
      >
        <FiMoreVertical size={16} aria-hidden="true" />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[13rem] rounded-xl border border-slate-200 bg-white p-1 shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          {acciones.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={() => {
                setAbierto(false);
                a.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:bg-slate-100 disabled:opacity-50 ${TONOS[a.tono ?? "gris"].hover}`}
            >
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${TONOS[a.tono ?? "gris"].chip}`}>{a.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold leading-tight text-slate-800 dark:text-ink-black-50">{a.label}</span>
                {a.detalle && <span className="block text-[10.5px] font-medium leading-tight text-slate-500 dark:text-ink-black-300">{a.detalle}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
