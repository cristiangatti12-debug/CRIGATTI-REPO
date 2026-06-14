-- Signal history: global table that logs every market signal generated.
-- Used to feed historical performance context into the AI Analysis feature.
-- Outcomes (return_1y) are filled in daily by the cron job.

CREATE TABLE IF NOT EXISTS signal_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker          TEXT NOT NULL,
  score           INT NOT NULL,
  signal          TEXT NOT NULL CHECK (signal IN ('BUY', 'HOLD', 'SELL')),
  price_at_signal NUMERIC NOT NULL,
  mom3m_pct       NUMERIC,
  pe_ratio        NUMERIC,
  factors         JSONB,
  signaled_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  price_1y_later  NUMERIC,
  return_1y       NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ticker, signaled_at)
);

CREATE INDEX IF NOT EXISTS signal_history_ticker_idx ON signal_history (ticker, signaled_at);
CREATE INDEX IF NOT EXISTS signal_history_pending_idx ON signal_history (signaled_at) WHERE price_1y_later IS NULL;

ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users (global shared data)
CREATE POLICY "Authenticated users read signal history"
  ON signal_history FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role can insert/update (enforced by API routes using admin client)

-- Per-user daily ask log for AI Analysis rate limiting
CREATE TABLE IF NOT EXISTS signal_analysis_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users NOT NULL,
  ticker     TEXT NOT NULL,
  asked_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signal_analysis_log_user_idx ON signal_analysis_log (user_id, asked_at);

ALTER TABLE signal_analysis_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analysis log"
  ON signal_analysis_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
