import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the server action before importing api module
vi.mock("@/app/actions", () => ({
  refreshAuthToken: vi.fn(),
}));

import { api, setMemoryToken } from "../api";
import { refreshAuthToken } from "@/app/actions";

const mockRefreshAuthToken = vi.mocked(refreshAuthToken);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(
  status: number,
  body: unknown = {},
  ok?: boolean,
): Response {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob()),
    statusText: "OK",
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    clone: () => ({} as Response),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(""),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("api module", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    setMemoryToken(null);
    mockRefreshAuthToken.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---- Auth header injection ------------------------------------------------

  describe("auth headers", () => {
    it("adds Authorization header when memoryToken is set", async () => {
      setMemoryToken("test-access-token");
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, { id: 1 }),
      );

      await api.get("/pacientes/");

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-access-token");
    });

    it("does not add Authorization header when memoryToken is null", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, { id: 1 }),
      );

      await api.get("/pacientes/");

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("sets Content-Type to application/json by default", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, {}),
      );

      await api.get("/test/");

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  // ---- 401 refresh flow -----------------------------------------------------

  describe("401 token refresh", () => {
    it("retries the request after refreshing token on 401", async () => {
      setMemoryToken("expired-token");

      const fetchMock = vi.mocked(globalThis.fetch);
      // First call returns 401
      fetchMock.mockResolvedValueOnce(mockFetchResponse(401, {}, false));
      // After refresh, second call succeeds
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, { refreshed: true }),
      );
      mockRefreshAuthToken.mockResolvedValue("new-access-token");

      const result = await api.get<{ refreshed: boolean }>("/pacientes/");

      expect(mockRefreshAuthToken).toHaveBeenCalledOnce();
      expect(result).toEqual({ refreshed: true });
      // Second call should use the new token
      const [, secondInit] = fetchMock.mock.calls[1];
      const headers = secondInit?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer new-access-token");
    });

    it("does not attempt refresh for /auth/login/ endpoint", async () => {
      setMemoryToken("expired-token");
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(401, { detail: "Unauthorized" }, false),
      );

      await expect(api.post("/auth/login/", {})).rejects.toEqual({
        detail: "Unauthorized",
      });

      expect(mockRefreshAuthToken).not.toHaveBeenCalled();
    });
  });

  // ---- 204 handling ---------------------------------------------------------

  describe("204 No Content", () => {
    it("returns undefined for 204 responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(204, undefined),
      );

      const result = await api.delete("/pacientes/1/");
      expect(result).toBeUndefined();
    });
  });

  // ---- Error handling -------------------------------------------------------

  describe("error handling", () => {
    it("throws parsed JSON error on non-ok responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(400, { detail: "Bad request" }, false),
      );

      await expect(api.post("/pacientes/", {})).rejects.toEqual({
        detail: "Bad request",
      });
    });
  });

  // ---- HTTP methods ---------------------------------------------------------

  describe("HTTP methods", () => {
    it("api.post sends POST with JSON body", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(201, { id: 42 }),
      );

      const result = await api.post<{ id: number }>("/pacientes/", {
        nombre: "Test",
      });

      expect(result).toEqual({ id: 42 });
      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe("/api/pacientes/");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ nombre: "Test" }));
    });

    it("api.patch sends PATCH with JSON body", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, { id: 42, nombre: "Updated" }),
      );

      await api.patch("/pacientes/42/", { nombre: "Updated" });

      const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(init?.method).toBe("PATCH");
    });

    it("api.get sends GET request", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, []),
      );

      await api.get("/pacientes/");

      const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(url).toBe("/api/pacientes/");
      expect(init?.method).toBeUndefined();
    });
  });

  // ---- Sidebar refresh event ------------------------------------------------

  describe("sidebar refresh event", () => {
    it("dispatches ccr:refresh-sidebar on successful mutations", async () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, { id: 1 }),
      );

      await api.post("/pacientes/", { nombre: "Test" });

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ccr:refresh-sidebar" }),
      );
      dispatchSpy.mockRestore();
    });

    it("does not dispatch event on GET requests", async () => {
      const dispatchSpy = vi.spyOn(window, "dispatchEvent");
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockFetchResponse(200, []),
      );

      await api.get("/pacientes/");

      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "ccr:refresh-sidebar" }),
      );
      dispatchSpy.mockRestore();
    });
  });
});
