// Single source of truth for where the backend lives.
//
// Override in agentic-interviewer/.env.local when the backend runs somewhere
// else — it must match HOST/PORT in server/.env:
//
//   VITE_API_BASE_URL=http://localhost:8100

const DEFAULT_API_BASE_URL = "http://localhost:8100";

/** Backend HTTP origin, e.g. "http://localhost:8100" (never has a trailing slash). */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

/**
 * Backend WebSocket origin, derived from API_BASE_URL so there is only one
 * setting to change. http -> ws, https -> wss.
 */
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");

/** Build an absolute API URL from a root-relative path. */
export const apiUrl = (path: string): string =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Build an absolute WebSocket URL from a root-relative path. */
export const wsUrl = (path: string): string =>
  `${WS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
