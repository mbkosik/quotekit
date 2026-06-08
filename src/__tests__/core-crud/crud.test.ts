// @vitest-environment node
//
// Risk #1: Core CRUD regression — user cannot list, view, or save their quotes (wyceny).
// Oracle: test-plan.md §2 row #1 — verify payload shape and DB state, not just status codes.
//
// Strategy: one real test user, raw Supabase client, admin-seeded fixture quote.
// No HTTP server required — the risk lives at the DB/RLS layer.
// Requires `npx supabase start`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, TEST_URL, TEST_ANON_KEY } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";

describe("Risk #1: Core CRUD — quote list, save, fetch, and delete", () => {
  let user: TestUser | undefined;
  let fixtureId: string;

  beforeAll(async () => {
    user = await createTestUser("crud");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quotes")
      .insert({
        user_id: user.id,
        title: "Fixture quote for CRUD tests",
        inquiry_text: "Build a landing page",
        content: { items: [] },
      })
      .select("id")
      .single();

    if (error) throw error;
    fixtureId = data.id as string;
  }, 20_000);

  afterAll(async () => {
    await Promise.allSettled([user ? cleanupTestUser(user.id) : Promise.resolve()]);
    // ON DELETE CASCADE removes all quotes when user is deleted
  }, 10_000);

  // Sanity: owner can insert their own quote.
  it("owner inserts a quote — INSERT returns new row with id and draft status", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user!;
    const { data, error } = await u.client
      .from("quotes")
      .insert({
        user_id: u.id,
        title: "Integration-test quote",
        inquiry_text: "Build a mobile app",
        content: { items: [] },
      })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.status).toBe("draft");
  });

  // Core: owner sees their own quotes in a list.
  it("owner lists their own quotes — SELECT returns array containing fixture", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await user!.client.from("quotes").select("id, title, status, created_at");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(fixtureId);
  });

  // Core: owner can fetch a single quote by id with all schema fields present.
  it("owner fetches their own quote by id — SELECT single returns full row", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { data, error } = await user!.client
      .from("quotes")
      .select("id, title, inquiry_text, content, status, created_at")
      .eq("id", fixtureId)
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(fixtureId);
    expect(data?.title).toBeDefined();
    expect(data?.inquiry_text).toBeDefined();
    expect(data?.content).toBeDefined();
    expect(data?.status).toBeDefined();
    expect(data?.created_at).toBeDefined();
  });

  // Core: owner deletes their own quote; admin re-read confirms it is gone.
  it("owner deletes their own quote — DELETE count is 1 and admin confirms row gone", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user!;
    const admin = createAdminClient();

    const { data: newQuote, error: insertError } = await admin
      .from("quotes")
      .insert({
        user_id: u.id,
        title: "Quote to delete",
        inquiry_text: "Delete this quote",
        content: { items: [] },
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const deleteId = newQuote!.id as string;

    const { count, error: deleteError } = await u.client.from("quotes").delete({ count: "exact" }).eq("id", deleteId);

    expect(deleteError).toBeNull();
    expect(count).toBe(1);

    // Admin re-read: record must be gone.
    const { data: adminRow, error: adminError } = await admin
      .from("quotes")
      .select("id")
      .eq("id", deleteId)
      .maybeSingle();

    expect(adminError).toBeNull();
    expect(adminRow).toBeNull();
  });

  // RLS: unauthenticated client cannot insert — WITH CHECK rejects null auth.uid().
  it("unauthenticated Supabase client cannot insert a quote — RLS returns error", async () => {
    const anonClient = createClient(TEST_URL, TEST_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anonClient.from("quotes").insert({
      user_id: crypto.randomUUID(),
      title: "Unauthorized insert",
      inquiry_text: "This should fail",
      content: { items: [] },
    });

    expect(error).not.toBeNull();
  });

  // RLS: unauthenticated client sees zero quotes — auth.uid() = null filters all rows.
  it("unauthenticated Supabase client cannot list quotes — SELECT returns empty array", async () => {
    const anonClient = createClient(TEST_URL, TEST_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.from("quotes").select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // Edge: deleting a non-existent id returns count 0, not an error.
  it("delete non-existent quote id returns count 0", async () => {
    const nonExistentId = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { count, error } = await user!.client.from("quotes").delete({ count: "exact" }).eq("id", nonExistentId);

    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});
