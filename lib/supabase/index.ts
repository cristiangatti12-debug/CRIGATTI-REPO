// ── Backwards-compatibility shim ─────────────────────────────────────────────
// All browser components that import { supabase } from "@/lib/supabase"
// get a lazily-initialised client — createClient() is called on first property
// access rather than at module evaluation time, so Next.js static prerendering
// never triggers the "URL and API key are required" error during `next build`.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "./client";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) _client = createClient();
  return _client;
}

export const supabase = new Proxy(
  {} as ReturnType<typeof createClient>,
  {
    get(_target, prop: string | symbol) {
      return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
);

// Re-export Holding from the central types file
export type { Holding } from "@/types";
