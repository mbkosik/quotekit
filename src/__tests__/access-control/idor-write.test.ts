// @vitest-environment node
//
// Risk #6: RLS write-path — UPDATE or DELETE policy does not enforce ownership.
// Oracle: PRD §NFR data isolation — a signed-in freelancer must never modify
// or delete quote data belonging to another account.
//
// Strategy: two real test users, one quote owned by User A; all write
// assertions run via User B's RLS-scoped Supabase client. Admin re-read
// after each cross-user write confirms no mutation occurred.
// No HTTP server required — the risk lives at the DB/RLS layer.
// Requires `npx supabase start`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";

describe("Risk #6: RLS write-path — UPDATE/DELETE on quotes", () => {
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let quoteAId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser("idor-w-a"), createTestUser("idor-w-b")]);

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

  // Sanity: owner can update their own quote — confirms RLS ALLOW path works.
  it("owner updates their own quote", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userA!.client
      .from("quotes")
      .update({ title: "Owner-updated title" })
      .eq("id", quoteAId)
      .select("id, title");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(data![0].title).toBe("Owner-updated title");
  });

  // Core assertion: RLS UPDATE policy filters out the foreign row.
  // update().select() returns [] (not an error) when RLS blocks.
  it("cross-user UPDATE by id returns empty data — RLS UPDATE enforced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client
      .from("quotes")
      .update({ title: "HACKED" })
      .eq("id", quoteAId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // Admin re-read: title must not have been changed.
    const admin = createAdminClient();
    const { data: adminRow, error: adminError } = await admin
      .from("quotes")
      .select("title")
      .eq("id", quoteAId)
      .single();

    expect(adminError).toBeNull();
    // The attack value must not have been written — independent of Test 1's title.
    expect(adminRow?.title).not.toBe("HACKED");
  });

  // Core assertion: RLS DELETE policy filters out the foreign row.
  // delete({ count: "exact" }) returns count=0 (not an error) when RLS blocks.
  it("cross-user DELETE by id returns count 0 — RLS DELETE enforced", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { count, error } = await userB!.client.from("quotes").delete({ count: "exact" }).eq("id", quoteAId);

    expect(error).toBeNull();
    expect(count).toBe(0);

    // Admin re-read: record must still exist.
    const admin = createAdminClient();
    const { data: adminRow, error: adminError } = await admin
      .from("quotes")
      .select("id")
      .eq("id", quoteAId)
      .maybeSingle();

    expect(adminError).toBeNull();
    expect(adminRow).not.toBeNull();
  });
});
