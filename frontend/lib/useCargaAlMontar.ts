import { useEffect } from 'react'

/**
 * Ejecuta `cargar` cuando cambia su identidad (al montar o al cambiar sus
 * dependencias). La llamada se programa fuera del cuerpo síncrono del efecto,
 * así los `setState` de la carga ocurren de forma asíncrona y no provocan
 * renders en cascada. Si el efecto se limpia antes, la carga pendiente se cancela.
 */
export function useCargaAlMontar(cargar: () => Promise<unknown>, habilitado = true) {
  useEffect(() => {
    if (!habilitado) return
    let activo = true
    queueMicrotask(() => {
      if (activo) void cargar()
    })
    return () => {
      activo = false
    }
  }, [cargar, habilitado])
}
