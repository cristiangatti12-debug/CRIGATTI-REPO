import { createClient } from "@/lib/supabase/server";

/**
 * Server-side: returns true if userId has an active or trialing subscription.
 * Safe to call from API routes — reads the `subscriptions` table via service
 * RLS (the row is visible to the owner; use service-role client if calling
 * outside of a user session).
 */
export async function isPremium(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return false;
    const active = ["active", "trialing"].includes(data.status);
    const notExpired = data.current_period_end
      ? new Date(data.current_period_end) > new Date()
      : true;
    return active && notExpired;
  } catch {
    return false;
  }
}
