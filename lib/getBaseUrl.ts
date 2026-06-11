// Returns the canonical base URL for building auth redirects.
//
// Why: Supabase signup uses `emailRedirectTo` to build the confirmation link.
// If that was derived from `window.location.origin`, a user signing up on a
// preview deployment or custom domain would get an email pointing back at that
// URL — which Supabase rejects if it isn't on the project's Redirect URL
// allowlist. Pulling from NEXT_PUBLIC_SITE_URL pins it to one production
// origin regardless of where the browser happens to be.
export function getBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
