import { createClient } from "@supabase/supabase-js";

// Keys are read from env — no hardcoded fallbacks because Supabase keys are
// project-specific and vary between local instances (new sb_* format).
// Required vars: SUPABASE_URL, SUPABASE_KEY (or SUPABASE_ANON_KEY),
//                SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY).
// Add them to .env for local dev (`npx supabase status` prints all values).
const TEST_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

const TEST_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY;
if (!TEST_ANON_KEY) throw new Error("Missing env var: SUPABASE_KEY (anon/publishable key)");

// Service role JWT — bypasses RLS, used only for test setup and teardown.
const TEST_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
if (!TEST_SERVICE_KEY) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY (from `npx supabase status --output json`)");

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
