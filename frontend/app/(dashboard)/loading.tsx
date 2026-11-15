// Pantalla inmediata mientras la siguiente seccion carga sus datos: evita la
// sensacion de "click sin respuesta" al navegar desde el menu lateral.
export default function CargandoSeccion() {
  return (
    <div className="ccr-dashboard-content space-y-4" aria-busy="true" aria-label="Cargando sección">
      <div className="h-24 animate-pulse rounded-[20px] bg-white dark:bg-ink-black-800" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-[20px] bg-white dark:bg-ink-black-800 xl:col-span-2" />
        <div className="h-72 animate-pulse rounded-[20px] bg-white dark:bg-ink-black-800" />
      </div>
    </div>
  );
}
