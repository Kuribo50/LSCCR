import type { Usuario } from "@/lib/types";

/*
 * Reglas de acceso por rol en el frontend. El backend aplica las mismas
 * (BloqueaMedicoMixin, IsAdminOrEncargado, PacienteViewSet.update); esto evita
 * mostrar o abrir por URL pantallas que no corresponden.
 *
 * - Médico: solo carga derivaciones (Importar, Historial de cortes).
 * - Profesional encargado: además corrige datos de pacientes y resuelve la
 *   Revisión de carga. Puede haber varios.
 * - Profesional: trabaja sobre datos ya corregidos; solo edita el contacto.
 */

type ConRol = Pick<Usuario, "rol"> & { es_encargado?: boolean };

export function esEncargado(user: ConRol | null | undefined): boolean {
  return user?.rol === "KINE" && Boolean(user.es_encargado);
}

/** Corrige a fondo los datos de un paciente (no solo el contacto). */
export function puedeCorregirDatos(user: ConRol | null | undefined): boolean {
  return user?.rol === "ADMIN" || esEncargado(user);
}

/** Revisión de carga: Administrador y profesionales encargados. */
export function puedeRevisarCarga(user: ConRol | null | undefined): boolean {
  return puedeCorregirDatos(user);
}

/** Importar derivaciones e Historial de cortes: Administrador, Médico y encargados. */
export function puedeCargarDerivaciones(user: ConRol | null | undefined): boolean {
  return user?.rol === "ADMIN" || user?.rol === "MEDICO" || esEncargado(user);
}

const RUTAS_CARGA = ["/importar", "/historial-mensual"];

const RUTAS_MEDICO = ["/inicio", "/importar", "/historial-mensual", "/perfil"];

export function puedeAbrirRuta(user: ConRol, pathname: string): boolean {
  if (pathname === "/importar/revision" || pathname.startsWith("/importar/revision/")) {
    return puedeRevisarCarga(user);
  }
  if (RUTAS_CARGA.includes(pathname)) return puedeCargarDerivaciones(user);
  if (user.rol !== "MEDICO") return true;
  return RUTAS_MEDICO.includes(pathname);
}
