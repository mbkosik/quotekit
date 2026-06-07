// @vitest-environment node
//
// Risk #2: IDOR read — authenticated user reads another user's quote by ID.
// Oracle: PRD §NFR data isolation — a signed-in freelancer must never view
// quote data belonging to another account.
//
// Strategy: two real test users, one quote owned by User A; all assertions
// run via User B's RLS-scoped Supabase client. No HTTP server required —
// the risk lives at the DB/RLS layer. Requires `npx supabase start`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";

describe("Risk #2: IDOR read — SELECT RLS on quotes", () => {
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let quoteAId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser("idor-a"), createTestUser("idor-b")]);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quotes")
      .insert({
        user_id: userA.id,
        title: "User A private quote",
        inquiry_text: "Build a landing page",
        content: { items: [] },
      })
      .select("id")
      .single();

    if (error) throw error;
    quoteAId = data.id as string;
  }, 20_000);

  afterAll(async () => {
    // Guard: userA/userB may be undefined if createTestUser threw before Promise.all resolved.
    await Promise.allSettled([
      userA ? cleanupTestUser(userA.id) : Promise.resolve(),
      userB ? cleanupTestUser(userB.id) : Promise.resolve(),
    ]);
    // ON DELETE CASCADE removes the quote when userA is deleted
  }, 10_000);

  // Sanity: owner can always read their own quote.
  it("owner reads their own quote by id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userA!.client.from("quotes").select("id, title").eq("id", quoteAId).maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(quoteAId);
  });

  // Core assertion: RLS SELECT policy filters out the foreign row.
  // maybeSingle() returns null (not an error) when 0 rows are returned.
  it("cross-user read by id returns null — RLS SELECT enforced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client.from("quotes").select("id, title").eq("id", quoteAId).maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  // Belt-and-suspenders: the foreign quote must not appear in User B's list.
  it("cross-user list does not expose foreign quote id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client.from("quotes").select("id");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).not.toContain(quoteAId);
  });
});
