'use client'

// Estado compartido de "navegacion en curso": el menu lateral marca el destino
// al instante (sin esperar a que cambie la ruta) y el layout muestra el loader
// solo si esa pagina demora en llegar.

import { useSyncExternalStore } from 'react'

let destino: string | null = null
const subs = new Set<() => void>()
const emitir = () => subs.forEach((fn) => fn())
const suscribir = (fn: () => void) => {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function iniciarNavegacion(href: string) {
  destino = href
  emitir()
}

export function terminarNavegacion() {
  if (destino === null) return
  destino = null
  emitir()
}

export function useDestinoNavegacion() {
  return useSyncExternalStore(suscribir, () => destino, () => null)
}
