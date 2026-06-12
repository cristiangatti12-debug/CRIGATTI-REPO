import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ premium: false });
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return NextResponse.json({ premium: false });

  const active     = ["active", "trialing"].includes(data.status);
  const notExpired = data.current_period_end
    ? new Date(data.current_period_end) > new Date()
    : true;

  return NextResponse.json({
    premium: active && notExpired,
    status:  data.status,
  });
}
