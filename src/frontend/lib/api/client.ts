/** Browser → Next.js BFF (/api/backend/*) → FastAPI. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown
  ) {
    super(typeof detail === "string" ? detail : ((detail as { message?: string })?.message ?? `HTTP ${status}`));
  }

  get code(): string | undefined {
    return (this.detail as { code?: string } | undefined)?.code;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined") {
    // Session expired: full reload through the login route (clears client state).
    window.location.replace(new URL(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`, window.location.origin));
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
