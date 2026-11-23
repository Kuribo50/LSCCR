"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Cuántas filas de arriba entran escalonadas; el resto aparece de inmediato. */
const FILAS_ANIMADAS = 12;

/**
 * Entrada escalonada para tablas virtualizadas (Lista de espera, Ingresados).
 *
 * Las filas virtuales se posicionan con `transform`, así que no pueden usar
 * `ccr-stagger`: la animación pisaría su posición. Esta variante anima la
 * opacidad de la fila y el desplazamiento de sus celdas (`ccr-fila-entrada`).
 * Solo corre al cargar: pasado ese momento, las filas que aparecen al hacer
 * scroll no se animan.
 */
export function useEntradaFilas(listo: boolean, duracionMs = 900) {
  const [activa, setActiva] = useState(true);

  useEffect(() => {
    if (!listo || !activa) return;
    const t = window.setTimeout(() => setActiva(false), duracionMs);
    return () => window.clearTimeout(t);
  }, [listo, activa, duracionMs]);

  return (indice: number): { className: string; style: CSSProperties } =>
    activa && indice < FILAS_ANIMADAS
      ? { className: "ccr-fila-entrada", style: { "--fila": indice } as CSSProperties }
      : { className: "", style: {} };
}
