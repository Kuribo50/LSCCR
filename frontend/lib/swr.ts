import useSWR, { type SWRConfiguration } from "swr";
import { api } from "./api";
import type { Paciente, PaginatedResponse, Usuario } from "./types";

// ---------------------------------------------------------------------------
// Fetcher generico: delega en api.get que ya maneja auth, refresh y errores.
// ---------------------------------------------------------------------------

const fetcher = <T>(url: string): Promise<T> => api.get<T>(url);

// ---------------------------------------------------------------------------
// Normalizador: el backend puede devolver un array plano (legacy) o un objeto
// paginado { count, next, previous, results }. Esta funcion unifica ambos a
// un array para que los componentes no dependan del formato de respuesta.
// ---------------------------------------------------------------------------

export function unwrapResults<T>(data: T[] | PaginatedResponse<T> | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if ("results" in data && Array.isArray(data.results)) return data.results;
  return [];
}

// ---------------------------------------------------------------------------
// Hook generico: envuelve useSWR con defaults razonables para la app.
// Pasar `path = null` salta el fetch (conditional fetching de SWR).
// ---------------------------------------------------------------------------

export function useAPI<T>(
  path: string | null,
  options?: SWRConfiguration<T>,
) {
  return useSWR<T>(path, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Hooks especificos: encapsulan la logica de endpoint + query params para las
// pantallas principales. Devuelven el mismo shape de useSWR.
// ---------------------------------------------------------------------------

/** Lista de espera: PENDIENTE + RESCATE, con filtros opcionales por query params. */
export function usePacientes(params?: URLSearchParams | null) {
  const query = params?.toString() ?? "";
  const path = `/pacientes/${query ? `?${query}` : ""}`;
  return useAPI<Paciente[] | PaginatedResponse<Paciente>>(path);
}

/** Pacientes asignados (admin) o solo los mios (kine). */
export function useMisPacientes(endpoint: string | null) {
  return useAPI<Paciente[] | PaginatedResponse<Paciente>>(endpoint);
}

/** Todos los usuarios (admin). */
export function useUsuarios() {
  return useAPI<Usuario[] | PaginatedResponse<Usuario>>("/usuarios/");
}
