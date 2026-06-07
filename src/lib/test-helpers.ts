import { createClient } from "@supabase/supabase-js";
import { createAdminClient, createUserClient, TEST_URL, TEST_ANON_KEY } from "./supabase-test";

const TEST_PASSWORD = "Qu0t3k1t-t3st!";

export interface TestUser {
  id: string;
  email: string;
  /** Supabase client authenticated as this user — all queries respect RLS. */
  client: ReturnType<typeof createUserClient>;
}

/**
 * Creates a real Supabase user (email_confirm: true, skips email verification)
 * and signs them in. Returns a fully authenticated client for RLS assertions.
 *
 * @param prefix - short label to identify the user in test output, e.g. "userA"
 */
export async function createTestUser(prefix: string): Promise<TestUser> {
  const admin = createAdminClient();
  const email = `${prefix}.${Date.now()}@test.quotekit.local`;

  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;

  // Sign in with anon client to get a real JWT — needed to drive RLS.
  const signinClient = createClient(TEST_URL, TEST_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signinError } = await signinClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signinError) throw signinError;

  return {
    id: userData.user.id,
    email,
    client: createUserClient(session.session.access_token),
  };
}

/** Removes the test user and all their data (cascade via ON DELETE CASCADE). */
export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}
