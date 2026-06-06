import { createClient } from "@supabase/supabase-js";

// Falls back to well-known local Supabase defaults so tests work after `npx supabase start`
// without any extra env setup. Override via SUPABASE_URL / SUPABASE_KEY /
// SUPABASE_SERVICE_ROLE_KEY for a non-standard or CI environment.
const TEST_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

const TEST_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqt8_CV6kSxTByIXW62Z86g_4V8OW3Gr4";

// Service role key bypasses RLS — used only for test setup and teardown.
const TEST_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0";

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
