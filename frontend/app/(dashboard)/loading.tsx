import LoaderKine from '@/components/LoaderKine'

// Pantalla inmediata mientras la siguiente seccion carga sus datos: evita la
// sensacion de "click sin respuesta" al navegar desde el menu lateral.
export default function CargandoSeccion() {
  // Solo se ve si la seccion demora mas de 300 ms.
  return <LoaderKine retrasoMs={300} />
}
