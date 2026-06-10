import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    // 1. Get authenticated user from session
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 2. Delete all holdings for this user
    const { error: holdingsError } = await supabase
      .from("holdings")
      .delete()
      .eq("user_id", user.id);

    if (holdingsError) {
      console.error("Error deleting holdings:", holdingsError);
      // Continue anyway — don't block account deletion
    }

    // 3. Delete the profile row if it exists
    await supabase.from("profiles").delete().eq("id", user.id);

    // 4. Delete the auth user — requires service role key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { persistSession: false } }
      );
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error("Error deleting auth user:", deleteError);
        return NextResponse.json({ error: "Could not delete auth user" }, { status: 500 });
      }
    } else {
      // No service role key — sign out only (data already wiped)
      await supabase.auth.signOut();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
