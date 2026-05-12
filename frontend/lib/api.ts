import { refreshAuthToken } from "@/app/actions";

const BASE = "/api";

// El access token vive en memoria para que los requests cliente sean rapidos,
// mientras la copia persistente queda en cookies httpOnly manejadas por actions.ts.
let memoryToken: string | null = null;

export function setMemoryToken(token: string | null) {
  memoryToken = token;
}

type FetchOptions = RequestInit & { skipContentType?: boolean };

const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshTokenWithTimeout() {
  // El refresh corre en server action porque la cookie httpOnly no es legible
  // desde el navegador. El timeout evita dejar la UI bloqueada si backend no responde.
  return Promise.race<string | null>([
    refreshAuthToken(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 7000);
    }),
  ]);
}

function toRequestInit(options: FetchOptions): RequestInit {
  const requestOptions = { ...options };
  delete requestOptions.skipContentType;
  return requestOptions;
}

async function request<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.skipContentType) {
    headers["Content-Type"] = "application/json";
  }
  if (memoryToken) {
    headers["Authorization"] = `Bearer ${memoryToken}`;
  }
  Object.assign(headers, options.headers || {});

  const restOptions = toRequestInit(options);
  let resp = await fetchWithTimeout(`${BASE}${path}`, {
    ...restOptions,
    headers,
  });

  // Refresh automatico: si el access expiro, Next usa refresh-token httpOnly,
  // actualiza cookie y devuelve un access nuevo para reintentar una sola vez.
  if (resp.status === 401 && path !== "/auth/login/") {
    const newAccess = await refreshTokenWithTimeout();
    if (newAccess) {
      memoryToken = newAccess;
      headers["Authorization"] = `Bearer ${memoryToken}`;
      resp = await fetchWithTimeout(`${BASE}${path}`, {
        ...restOptions,
        headers,
      });
    } else if (typeof window !== "undefined") {
      memoryToken = null;
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
  }

  if (resp.ok && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "")) {
    // Sidebar y badges dependen de resumen operativo; este evento desacopla la
    // recarga de esos contadores de cada pantalla puntual.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ccr:refresh-sidebar"));
    }
  }

  if (resp.status === 204) return undefined as T;

  const data = await resp.json().catch(() => ({ detail: resp.statusText }));
  if (!resp.ok) throw data;
  return data as T;
}

async function requestBlob(
  path: string,
  options: FetchOptions = {},
): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (memoryToken) {
    headers["Authorization"] = `Bearer ${memoryToken}`;
  }
  Object.assign(headers, options.headers || {});

  const restOptions = toRequestInit(options);
  let resp = await fetchWithTimeout(`${BASE}${path}`, {
    ...restOptions,
    headers,
  });

  if (resp.status === 401 && path !== "/auth/login/") {
    // Mismo flujo que request<T>, pero manteniendo respuesta Blob para Excel.
    const newAccess = await refreshTokenWithTimeout();
    if (newAccess) {
      memoryToken = newAccess;
      headers["Authorization"] = `Bearer ${memoryToken}`;
      resp = await fetchWithTimeout(`${BASE}${path}`, {
        ...restOptions,
        headers,
      });
    } else if (typeof window !== "undefined") {
      memoryToken = null;
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
  }

  if (resp.ok && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "")) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ccr:refresh-sidebar"));
    }
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw data;
  }

  return resp.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, {
      method: "POST",
      body: form,
      skipContentType: true,
    }),

  getBlob: (path: string) =>
    requestBlob(path, {
      method: "GET",
      skipContentType: true,
    }),
};
