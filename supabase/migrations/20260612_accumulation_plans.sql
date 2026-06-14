-- Accumulation plans (PAC / DCA)
-- Each row represents one recurring investment commitment for a user.
-- Purchases are logged manually by the user; no automation.

CREATE TABLE IF NOT EXISTS accumulation_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  ticker          TEXT NOT NULL,
  name            TEXT NOT NULL,
  amount          NUMERIC NOT NULL,
  currency        TEXT DEFAULT 'EUR',
  interval        TEXT NOT NULL CHECK (interval IN ('weekly', 'monthly', 'quarterly')),
  start_date      DATE NOT NULL,
  last_purchase   DATE,
  purchase_count  INT DEFAULT 0,
  total_invested  NUMERIC DEFAULT 0,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE accumulation_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own accumulation plans"
  ON accumulation_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
