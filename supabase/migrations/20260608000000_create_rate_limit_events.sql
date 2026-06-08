CREATE TABLE rate_limit_events (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX rate_limit_events_user_window_idx
  ON rate_limit_events (user_id, created_at DESC);

ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_events_select_own"
  ON rate_limit_events
  FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "rate_limit_events_insert_own"
  ON rate_limit_events
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
