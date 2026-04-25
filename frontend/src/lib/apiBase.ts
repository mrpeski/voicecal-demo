// Resolve API base URL.
// In dev: empty string → Vite proxies /api/* to localhost:8000.
// In prod: VITE_API_BASE_URL points at the deployed Lambda Function URL
// (no trailing slash). We prepend it to any path that starts with "/api".
const RAW = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
export const API_BASE = RAW.replace(/\/+$/, "");

/** Resolve an /api/... path against the configured base. */
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
