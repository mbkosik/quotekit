// @vitest-environment node
//
// Risk #11: IDOR on user_settings — User B reads or modifies User A's settings.
// Oracle: PRD §NFR data isolation — user_settings must be isolated by owner.
//
// Strategy: two real test users; User A's settings inserted by admin; all
// cross-user assertions run via User B's RLS-scoped Supabase client.
// Admin re-read after mutations confirms no data was changed.
// No HTTP server required — the risk lives at the DB/RLS layer.
// Requires `npx supabase start`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";

describe("Risk #11: IDOR on user_settings — SELECT/INSERT/UPDATE RLS", () => {
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser("si-a"), createTestUser("si-b")]);

    const admin = createAdminClient();
    const { error } = await admin.from("user_settings").insert({
      user_id: userA.id,
      prompt_context: "User A private context",
    });

    if (error) throw error;
  }, 20_000);

  afterAll(async () => {
    await Promise.allSettled([
      userA ? cleanupTestUser(userA.id) : Promise.resolve(),
      userB ? cleanupTestUser(userB.id) : Promise.resolve(),
    ]);
    // ON DELETE CASCADE removes user_settings when users are deleted
  }, 10_000);

  // Sanity: owner reads their own settings — confirms RLS ALLOW path works.
  it("owner reads their own settings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userA!.client
      .from("user_settings")
      .select("prompt_context")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .eq("user_id", userA!.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.prompt_context).toBe("User A private context");
  });

  // Core assertion: RLS SELECT policy filters out the foreign row.
  it("cross-user SELECT returns null — RLS SELECT enforced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client
      .from("user_settings")
      .select("prompt_context")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .eq("user_id", userA!.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  // Core assertion: INSERT WITH CHECK blocks cross-user row creation.
  it("cross-user INSERT returns error — INSERT WITH CHECK enforced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { error } = await userB!.client.from("user_settings").insert({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      user_id: userA!.id,
      prompt_context: "HACKED",
    });

    expect(error).not.toBeNull();
  });

  // Core assertion: upsert (INSERT ON CONFLICT DO UPDATE) must not mutate User A's row.
  // Upsert under RLS may return no error but 0 mutations — authoritative check is admin re-read.
  it("cross-user upsert does not mutate User A's settings — admin re-read confirms", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await userB!.client.from("user_settings").upsert(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      { user_id: userA!.id, prompt_context: "HACKED" },
      { onConflict: "user_id" },
    );

    const admin = createAdminClient();
    const { data, error: adminError } = await admin
      .from("user_settings")
      .select("prompt_context")
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .eq("user_id", userA!.id)
      .single();

    expect(adminError).toBeNull();
    expect(data?.prompt_context).toBe("User A private context");
  });
});
