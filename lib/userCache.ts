// Per-user localStorage namespacing.
//
// Why: every "vela_*" cache key (signals, market signals, daily digest, score
// snapshot, allocation rec, watchlist, chat history, valuation cards) used to
// be shared across every account on a given device. If two people sign into
// the app on the same browser (family iPad, café laptop, demo machine), the
// second one would see the first one's data. RLS on Supabase prevents server
// reads, but localStorage doesn't know who's signed in.
//
// Pattern: cache the Supabase auth UID under `vela_uid` whenever we resolve it,
// and prefix every per-user key with `u:<uid>:`. Keys that legitimately span
// users (e.g. anonymous onboarding flag, language preference) keep their
// original names and stay shared.

const UID_KEY = "vela_uid";

/** Remember the current signed-in UID synchronously so cache helpers don't need to await auth. */
export function rememberUid(uid: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (uid) localStorage.setItem(UID_KEY, uid);
  else     localStorage.removeItem(UID_KEY);
}

/** Best-effort current UID. Returns null before auth resolves on first paint. */
export function currentUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(UID_KEY);
}

/**
 * Returns a per-user-scoped cache key. When UID is unknown, returns null so
 * callers know to skip read/write (rather than silently leaking into a shared
 * namespace).
 */
export function userKey(rawKey: string): string | null {
  const uid = currentUid();
  if (!uid) return null;
  return `u:${uid}:${rawKey}`;
}

/** Wipe every cache row belonging to the current UID (and the UID pointer itself). */
export function wipeUserCache(): void {
  if (typeof window === "undefined") return;
  const uid = currentUid();
  const keys = Object.keys(localStorage);
  for (const k of keys) {
    if (k === UID_KEY) continue;
    if (uid && k.startsWith(`u:${uid}:`)) localStorage.removeItem(k);
    else if (k.startsWith("vela_")) localStorage.removeItem(k);
  }
  localStorage.removeItem(UID_KEY);
}
