import { redirect } from "next/navigation";

// Ruta antigua: la carga de derivaciones vive en /importar. Se conserva para que los
// enlaces o favoritos viejos sigan funcionando (la regla de acceso del rol la aplica /importar).
export default function DerivacionesPage() {
  redirect("/importar");
}
