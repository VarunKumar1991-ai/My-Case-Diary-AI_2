/**
 * Shared typed fetch wrapper for every `/apis/*` module (§10.1: "one module per
 * backend resource"). The backend mounts routers at the root (no `/api` prefix —
 * see `backend/src/app.ts`), so `VITE_API_BASE_URL` points at the API origin
 * directly (defaults to `http://localhost:4000` for local dev).
 *
 * Cookies carry the session (`httpOnly` JWT pair, D3) — `credentials: "include"`
 * is mandatory on every request, and the frontend never reads/decodes the token
 * itself (architecture.md §5: auth state comes from `GET /me` only).
 */

// Exported for the rare caller that must bypass this module's `request()` (e.g.
// a `beforeunload` flush using `fetch(..., { keepalive: true })`, which can't go
// through the normal retry/error-toast pipeline since the page is unloading).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip JSON-decoding the response (e.g. binary export downloads). */
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Endpoints that must never trigger a refresh-and-retry — `/auth/refresh` itself would recurse forever. */
const NO_REFRESH_RETRY_PATHS = new Set(["/auth/refresh", "/auth/logout"]);

/** Dedupes concurrent 401s onto a single `/auth/refresh` call (D3: refresh token cookie, rotated). */
let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  refreshPromise ??= fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Statuses the API host itself returns while no app instance is answering —
 * the backend waking from sleep, or a redeploy swapping instances. The request
 * never reached the app, so retrying is safe even for a POST.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);
/** Backoff between gateway retries — ~12s total, enough to ride out a redeploy. */
const GATEWAY_RETRY_DELAYS_MS = [2000, 4000, 6000];

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = "GET", body, query, raw } = options;

  const send = () =>
    fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  // Without this, the first sign-in after the backend has been idle (or during a
  // deploy) fails for something that fixes itself seconds later. Note the host's
  // error page carries no CORS headers, so a gateway failure usually reaches us
  // as a thrown network error rather than a readable 502 — both are handled.
  //
  // Retrying is safe here because these failures mean no app instance answered;
  // and the one request a duplicate would matter for (creating a case diary) is
  // guarded by the `(owner, FIR, CD no.)` unique index, which 409s instead.
  let response: Response | null = null;

  for (let attempt = 0; attempt <= GATEWAY_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, GATEWAY_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      response = await send();
      if (!GATEWAY_STATUSES.has(response.status)) break;
    } catch {
      response = null; // network/CORS failure — nothing answered at all
    }
  }

  if (!response) {
    throw new ApiError(
      0,
      "SERVER_UNAVAILABLE",
      "Could not reach the server. It may be starting up — please try again in a few seconds.",
    );
  }

  // The access token (JWT_ACCESS_TTL_MINUTES) expires well before the refresh
  // token — silently refresh once and retry so a short-lived access token
  // never surfaces as "Authentication required" mid-session.
  if (response.status === 401 && !isRetry && !NO_REFRESH_RETRY_PATHS.has(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (raw) {
    return response as unknown as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : undefined;

  if (!response.ok) {
    const body = (payload as { error?: ApiErrorBody } | undefined)?.error;
    // A gateway error still standing after the retries above means the server is
    // genuinely not up yet — say so, rather than blaming something the officer did.
    const fallbackMessage = GATEWAY_STATUSES.has(response.status)
      ? "The server is still starting up. Please try again in a few seconds."
      : "Something went wrong. Please try again.";
    throw new ApiError(
      response.status,
      body?.code ?? "UNKNOWN_ERROR",
      body?.message ?? fallbackMessage,
      body?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** For binary downloads (export) — returns the raw `Response` so callers can read `.blob()`/headers. */
  raw: (path: string, query?: RequestOptions["query"]) => request<Response>(path, { method: "GET", query, raw: true }),
};
