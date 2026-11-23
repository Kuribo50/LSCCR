"use client";

// Entrada suave de cada pantalla del panel. Un template se vuelve a montar en
// cada navegación, así que la animación corre al abrir cualquier sección.
//
// Se usa CSS (ccr-page-enter) y no framer-motion a propósito: con
// `animation-fill-mode: backwards` no queda ningún transform al terminar, así
// que los modales `position: fixed` de cada página se ubican bien.

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="ccr-page-enter">{children}</div>;
}
