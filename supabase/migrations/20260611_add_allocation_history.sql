-- Sprint 10: Add allocation_history table for tracking AI recommendations

CREATE TABLE allocation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- User's full risk questionnaire responses at this moment
  risk_questionnaire JSONB NOT NULL,
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_profile TEXT NOT NULL CHECK (risk_profile IN ('Conservative', 'Balanced', 'Growth', 'Aggressive')),

  -- AI recommendation returned (array of AllocationSlice)
  ai_recommendation JSONB NOT NULL,

  -- User's actual portfolio at time of recommendation (snapshot)
  portfolio_snapshot JSONB NOT NULL,

  -- If user adjusted: track what % they deviated from each asset class
  user_adjustments JSONB DEFAULT NULL,

  -- Market context at recommendation time (VIX, volatility, date, etc.)
  market_context JSONB DEFAULT NULL,

  CONSTRAINT fk_allocation_history_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_allocation_history_user ON allocation_history(user_id);
CREATE INDEX idx_allocation_history_created ON allocation_history(created_at DESC);
CREATE INDEX idx_allocation_history_user_created ON allocation_history(user_id, created_at DESC);

-- RLS: Users can only see their own allocation history
ALTER TABLE allocation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own allocation history"
  ON allocation_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own allocation history"
  ON allocation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own allocation history"
  ON allocation_history FOR UPDATE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON allocation_history TO authenticated;
