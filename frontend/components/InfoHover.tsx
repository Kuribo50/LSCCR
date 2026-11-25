"use client";

// Tarjeta de información al pasar el mouse (o al enfocar con teclado).
// Se dibuja en un portal con posición fija, así no la recorta un contenedor
// con overflow-hidden (por ejemplo, la grilla del calendario de cortes).

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

const ANCHO = 248;
const MARGEN = 8;

export interface FilaInfo {
  label: string;
  valor: ReactNode;
  /** Clase de color del punto (bg-...); sin punto si se omite. */
  punto?: string;
  /** Resalta la fila (por ejemplo, el total). */
  fuerte?: boolean;
}

/** Contenido estándar: título, filas etiqueta–valor y una nota final en gris. */
export function TarjetaInfo({ titulo, filas = [], nota }: { titulo: ReactNode; filas?: FilaInfo[]; nota?: ReactNode }) {
  return (
    <>
      <p className="text-xs font-black text-slate-900 dark:text-white">{titulo}</p>
      {filas.length > 0 && (
        <dl className="mt-1.5 flex flex-col gap-1">
          {filas.map((fila, i) => (
            <div key={`${i}-${fila.label}`} className="flex items-center gap-2 text-[11px]">
              {fila.punto && <i className={`h-2 w-2 shrink-0 rounded-full ${fila.punto}`} aria-hidden="true" />}
              <dt className="min-w-0 flex-1 text-slate-500 dark:text-ink-black-300">{fila.label}</dt>
              <dd className={`tabular-nums ${fila.fuerte ? "font-black text-slate-900 dark:text-white" : "font-bold text-slate-700 dark:text-ink-black-100"}`}>
                {fila.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {nota && <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] leading-snug text-slate-500 dark:border-ink-black-600 dark:text-ink-black-300">{nota}</p>}
    </>
  );
}

export default function InfoHover({
  info,
  children,
  className = "",
  como: Etiqueta = "span",
}: {
  info: ReactNode;
  children: ReactNode;
  className?: string;
  /** "div" cuando envuelve dt/dd dentro de un dl. */
  como?: "span" | "div";
}) {
  const ref = useRef<HTMLElement>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arriba: boolean } | null>(null);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  // Arriba del elemento si cabe; si no, abajo. Siempre dentro de la ventana.
  useLayoutEffect(() => {
    if (!abierto || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const alto = tarjetaRef.current?.offsetHeight ?? 120;
    const arriba = r.top - alto - MARGEN > 0;
    const left = Math.min(Math.max(MARGEN, r.left + r.width / 2 - ANCHO / 2), window.innerWidth - ANCHO - MARGEN);
    setPos({ top: arriba ? r.top - alto - MARGEN : r.bottom + MARGEN, left, arriba });
  }, [abierto]);

  return (
    <Etiqueta
      ref={ref as React.RefObject<HTMLDivElement & HTMLSpanElement>}
      className={className}
      onMouseEnter={abrir}
      onMouseLeave={cerrar}
      onFocus={abrir}
      onBlur={cerrar}
      aria-describedby={abierto ? id : undefined}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {abierto && (
              <motion.div
                ref={tarjetaRef}
                id={id}
                role="tooltip"
                initial={{ opacity: 0, y: pos?.arriba === false ? -4 : 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ANCHO }}
                className="pointer-events-none z-[70] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-ink-black-600 dark:bg-ink-black-800"
              >
                {info}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </Etiqueta>
  );
}
