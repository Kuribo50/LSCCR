import { useEffect, useRef } from "react";

/*
 * Avisos entre pantallas sobre las cargas de derivaciones. Permiten que el
 * aviso "Puedes revertir una carga" (visible en todo el dashboard), Importar,
 * el Historial de cortes y el Inicio del Médico se mantengan al día cuando se
 * sube o se revierte una carga desde cualquiera de ellos.
 */

const CARGA_IMPORTADA = "ccr:carga-importada";
const CARGA_REVERTIDA = "ccr:carga-revertida";

export function avisarCargaImportada() {
  window.dispatchEvent(new Event(CARGA_IMPORTADA));
}

export function avisarCargaRevertida(corteId: number) {
  window.dispatchEvent(new CustomEvent<{ corteId: number }>(CARGA_REVERTIDA, { detail: { corteId } }));
}

/** Ejecuta `alCambiar` cuando se importa o se revierte una carga (en cualquier pantalla). */
export function useAlCambiarCargas(alCambiar: (evento: { revertida?: { corteId: number } }) => void) {
  const callback = useRef(alCambiar);
  useEffect(() => {
    callback.current = alCambiar;
  });
  useEffect(() => {
    const importada = () => callback.current({});
    const revertida = (e: Event) => callback.current({ revertida: (e as CustomEvent<{ corteId: number }>).detail });
    window.addEventListener(CARGA_IMPORTADA, importada);
    window.addEventListener(CARGA_REVERTIDA, revertida);
    return () => {
      window.removeEventListener(CARGA_IMPORTADA, importada);
      window.removeEventListener(CARGA_REVERTIDA, revertida);
    };
  }, []);
}
