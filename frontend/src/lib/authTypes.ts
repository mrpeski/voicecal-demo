/** Optional Clerk `getToken` (session JWT for `Authorization: Bearer`) when using Clerk. */
export type GetClerkToken = () => Promise<string | null>;
