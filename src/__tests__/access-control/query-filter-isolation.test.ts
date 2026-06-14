// @vitest-environment node
//
// Risk #10: query param data isolation — GET /api/quotes with ?status= and ?search=
// filters must never return rows belonging to another user.
// Oracle: PRD §NFR data isolation — filter parameters must not bypass RLS.
//
// Strategy: two real test users with overlapping data; all assertions run via
// each user's RLS-scoped Supabase client directly (no HTTP server required).
// The risk lives at the DB/RLS layer. Requires `npx supabase start`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";

describe("Risk #10: query param data isolation — quotes filter RLS", () => {
  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  let quoteA_draftId: string;
  let quoteA_acceptedId: string;
  let quoteB_draftId: string;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([createTestUser("qf-a"), createTestUser("qf-b")]);

    const admin = createAdminClient();

    const [resA1, resA2, resB1] = await Promise.all([
      admin
        .from("quotes")
        .insert({
          user_id: userA.id,
          title: "Alpha test project",
          inquiry_text: "Build a landing page for alpha client",
          content: { items: [] },
          status: "draft",
        })
        .select("id")
        .single(),
      admin
        .from("quotes")
        .insert({
          user_id: userA.id,
          title: "Alpha production",
          inquiry_text: "Full production site for alpha client",
          content: { items: [] },
          status: "accepted",
        })
        .select("id")
        .single(),
      admin
        .from("quotes")
        .insert({
          user_id: userB.id,
          title: "Beta test project",
          inquiry_text: "Build a landing page for beta client",
          content: { items: [] },
          status: "draft",
        })
        .select("id")
        .single(),
    ]);

    if (resA1.error) throw resA1.error;
    if (resA2.error) throw resA2.error;
    if (resB1.error) throw resB1.error;

    quoteA_draftId = resA1.data.id as string;
    quoteA_acceptedId = resA2.data.id as string;
    quoteB_draftId = resB1.data.id as string;
  }, 20_000);

  afterAll(async () => {
    await Promise.allSettled([
      userA ? cleanupTestUser(userA.id) : Promise.resolve(),
      userB ? cleanupTestUser(userB.id) : Promise.resolve(),
    ]);
    // ON DELETE CASCADE removes quotes when users are deleted
  }, 10_000);

  // Sanity: owner sees own draft rows matching the search term.
  it("owner sees own rows with status=draft and title ilike %test%", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userA!.client
      .from("quotes")
      .select("id")
      .in("status", ["draft"])
      .ilike("title", "%test%");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(quoteA_draftId);
    expect(ids).not.toContain(quoteA_acceptedId);
    expect(ids).not.toContain(quoteB_draftId);
  });

  // Core assertion: User B cannot see User A's accepted quote via status filter.
  it("cross-user status filter returns 0 results — User B cannot see User A's accepted row", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client.from("quotes").select("id").in("status", ["accepted"]);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).not.toContain(quoteA_acceptedId);
    expect(ids).toHaveLength(0);
  });

  // Belt-and-suspenders: combined filter must not bleed User A's draft into User B's results.
  it("cross-user combined filter returns only User B's own rows — User A id absent", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await userB!.client
      .from("quotes")
      .select("id")
      .in("status", ["draft"])
      .ilike("title", "%test%");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(quoteB_draftId);
    expect(ids).not.toContain(quoteA_draftId);
  });
});
