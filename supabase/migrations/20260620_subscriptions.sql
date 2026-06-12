-- Subscriptions table for Stripe-backed Premium tier.
-- Run once. All statements are idempotent.

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT UNIQUE NOT NULL,
  stripe_sub_id       TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'inactive',
  -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'
  price_id            TEXT,
  current_period_end  TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see own subscription"
    ON subscriptions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only the service role (webhook handler) writes to this table.
-- No INSERT/UPDATE/DELETE policy for authenticated users.

CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_idx
  ON subscriptions (stripe_customer_id);
