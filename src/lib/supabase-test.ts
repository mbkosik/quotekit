import { createClient } from "@supabase/supabase-js";

// Keys are read from env — no hardcoded fallbacks because Supabase keys are
// project-specific and vary between local instances (new sb_* format).
// Required vars: SUPABASE_URL, SUPABASE_KEY (or SUPABASE_ANON_KEY),
//                SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).
// Add them to .env for local dev (`npx supabase status` prints all values).

// TypeScript doesn't narrow module-level variables inside function bodies, so
// we use a helper that returns string (or throws) to get a non-optional type.
function requireEnv(label: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${label}`);
  return value;
}

const TEST_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const TEST_ANON_KEY = requireEnv(
  "SUPABASE_KEY (anon/publishable key)",
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY,
);
// Service role JWT — bypasses RLS, used only for test setup and teardown.
const TEST_SERVICE_KEY = requireEnv(
  "SUPABASE_SERVICE_ROLE_KEY (from `npx supabase status --output json`)",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY,
);

/** Service-role client — bypasses RLS. Use only for test setup and teardown. */
export function createAdminClient() {
  return createClient(TEST_URL, TEST_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Anon client with the user's JWT injected via Authorization header.
 * All queries go through RLS exactly as in production.
 */
export function createUserClient(accessToken: string) {
  return createClient(TEST_URL, TEST_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { TEST_URL, TEST_ANON_KEY };
