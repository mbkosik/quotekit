-- Explicit role grants required for CI (fresh supabase start) where
-- ALTER DEFAULT PRIVILEGES may not be applied automatically.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE quotes TO authenticated;
GRANT ALL ON TABLE quotes TO service_role;

GRANT SELECT, INSERT ON TABLE rate_limit_events TO authenticated;
GRANT ALL ON TABLE rate_limit_events TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE user_settings TO authenticated;
GRANT ALL ON TABLE user_settings TO service_role;
