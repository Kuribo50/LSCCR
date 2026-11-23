"use client";

// Fondo de la pestaña activa que se desliza entre opciones (patrón de Grupos y
// Llamados). Va dentro del botón activo, que debe ser `relative`; el texto del
// botón va en un elemento `relative z-10` para quedar siempre encima.

import { motion, useReducedMotion } from "framer-motion";

export default function FondoPestana({
  id,
  className = "rounded-md bg-white shadow-sm dark:bg-ink-black-700",
}: {
  /** Único por grupo de pestañas: identifica qué fondo se desliza. */
  id: string;
  className?: string;
}) {
  const reducir = useReducedMotion();
  return (
    <motion.span
      layoutId={id}
      aria-hidden="true"
      className={`absolute inset-0 z-0 ${className}`}
      transition={reducir ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
    />
  );
}
