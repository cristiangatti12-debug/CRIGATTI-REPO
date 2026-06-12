import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let priceId: string;
  try {
    const body = await req.json();
    priceId = body.priceId;
    if (!priceId) throw new Error("missing priceId");
  } catch {
    return NextResponse.json({ error: "priceId required" }, { status: 400 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vela-ai-two.vercel.app";

  // Reuse existing customer if we already have one
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: 7 },
    success_url: `${siteUrl}/?checkout=success`,
    cancel_url:  `${siteUrl}/?checkout=cancelled`,
    metadata: { supabase_user_id: user.id },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
