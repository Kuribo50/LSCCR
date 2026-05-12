import { refreshAuthToken } from "@/app/actions";

const BASE = "/api";

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

  // Auto refresh
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
