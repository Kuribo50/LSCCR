import { useSyncExternalStore } from 'react'

const sinSuscripcion = () => () => {}

/**
 * `false` al renderizar en el servidor y durante la hidratación; `true` después.
 * Sirve para leer `localStorage` o el DOM sin desajustes de hidratación y sin
 * llamar a `setState` dentro de un efecto.
 */
export function useMontado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  )
}
