-- User settings table (one row per user)
CREATE TABLE user_settings (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_context TEXT       NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger (reuses function created in create_quotes migration)
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- SELECT: own row only
CREATE POLICY "user_settings_select_own" ON user_settings
  FOR SELECT USING ((select auth.uid()) = user_id);

-- INSERT: own row only
CREATE POLICY "user_settings_insert_own" ON user_settings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE: own row only
CREATE POLICY "user_settings_update_own" ON user_settings
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- DELETE: intentionally no policy — RLS deny-all is the desired behavior.
-- Rows are only ever upserted, never deleted (ON DELETE CASCADE on user_id handles account deletion).
