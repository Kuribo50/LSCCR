"use client";

// Número que cuenta hasta su valor. Al cambiar el valor (otro año, una recarga)
// parte desde el que mostraba, no desde cero. Respeta "reducir movimiento".

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

export default function NumeroAnimado({ value, duracion = 0.7 }: { value: number; duracion?: number }) {
  const reducir = useReducedMotion();
  const [mostrado, setMostrado] = useState(reducir ? value : 0);
  const desde = useRef(reducir ? value : 0);

  useEffect(() => {
    if (reducir) return;
    const controles = animate(desde.current, value, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (actual) => {
        desde.current = actual;
        setMostrado(Math.round(actual));
      },
    });
    return () => controles.stop();
  }, [value, duracion, reducir]);

  return <>{(reducir ? value : mostrado).toLocaleString("es-CL")}</>;
}
