-- Sprint 10: Add allocation_performance table for tracking allocation recommendation performance

CREATE TABLE allocation_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocation_history_id UUID NOT NULL REFERENCES allocation_history(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 3-month performance metrics
  original_allocation_return_3m NUMERIC(5, 2),
  portfolio_actual_return_3m NUMERIC(5, 2),
  outperformance_3m NUMERIC(5, 2),

  -- 6-month performance metrics
  original_allocation_return_6m NUMERIC(5, 2),
  portfolio_actual_return_6m NUMERIC(5, 2),
  outperformance_6m NUMERIC(5, 2),

  -- Year-to-date performance metrics
  original_allocation_return_ytd NUMERIC(5, 2),
  portfolio_actual_return_ytd NUMERIC(5, 2),
  outperformance_ytd NUMERIC(5, 2),

  CONSTRAINT fk_allocation_performance_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_allocation_performance_history FOREIGN KEY (allocation_history_id) REFERENCES allocation_history(id) ON DELETE CASCADE
);

CREATE INDEX idx_allocation_performance_user ON allocation_performance(user_id);
CREATE INDEX idx_allocation_performance_history ON allocation_performance(allocation_history_id);
CREATE INDEX idx_allocation_performance_user_created ON allocation_performance(user_id, created_at DESC);

-- RLS: Users can only see their own performance data
ALTER TABLE allocation_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own allocation performance"
  ON allocation_performance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own allocation performance"
  ON allocation_performance FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own allocation performance"
  ON allocation_performance FOR UPDATE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON allocation_performance TO authenticated;
