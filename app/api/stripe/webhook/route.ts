import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Disable Next.js body parsing — Stripe signature verification needs the raw bytes.
export const config = { api: { bodyParser: false } };

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function upsertSubscription(
  admin: ReturnType<typeof getAdminClient>,
  sub: Stripe.Subscription,
  customerId: string,
  userId?: string
) {
  let uid = userId;
  if (!uid) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    uid = data?.user_id;
  }
  if (!uid) {
    console.error("[stripe/webhook] Cannot resolve user_id for customer", customerId);
    return;
  }

  const item = sub.items.data[0];
  // current_period_end lives on SubscriptionItem in Stripe v22+
  const periodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;

  await admin.from("subscriptions").upsert({
    user_id:              uid,
    stripe_customer_id:   customerId,
    stripe_sub_id:        sub.id,
    status:               sub.status,
    price_id:             item?.price?.id ?? null,
    current_period_end:   periodEnd,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at:           new Date().toISOString(),
  }, { onConflict: "user_id" });
}

export async function POST(req: NextRequest) {
  const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const SERVICE_ROLE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig     = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[stripe/webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = getAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const userId     = session.metadata?.supabase_user_id;
      const customerId = session.customer as string;
      const subId      = session.subscription as string;
      if (!userId || !customerId || !subId) break;

      const stripe = new Stripe(STRIPE_SECRET_KEY);
      const sub = await stripe.subscriptions.retrieve(subId);
      await upsertSubscription(admin, sub, customerId, userId);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub        = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      await upsertSubscription(admin, sub, customerId);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
