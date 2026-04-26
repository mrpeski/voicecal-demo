/**
 * Build fetch headers with an optional Clerk session JWT.
 */
const GET_TOKEN_TIMEOUT_MS = 30_000;

function getTokenWithTimeout(
  getToken: () => Promise<string | null>,
  ms: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      console.warn("Clerk getToken() timed out; request will continue without Authorization.");
      resolve(null);
    }, ms);
    getToken()
      .then((t) => {
        clearTimeout(id);
        resolve(t);
      })
      .catch((e) => {
        clearTimeout(id);
        console.warn("Clerk getToken() failed", e);
        resolve(null);
      });
  });
}

export async function withAuthHeaders(
  getToken: (() => Promise<string | null>) | undefined,
  base: HeadersInit = {},
): Promise<HeadersInit> {
  const h = new Headers(base);
  if (!getToken) return h;
  const t = await getTokenWithTimeout(getToken, GET_TOKEN_TIMEOUT_MS);
  if (t) h.set("Authorization", `Bearer ${t}`);
  return h;
}
