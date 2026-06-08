// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, TEST_URL, TEST_ANON_KEY } from "@/lib/supabase-test";
import { createTestUser, cleanupTestUser, type TestUser } from "@/lib/test-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Risk #5: Rate limiting — AI endpoint spend cap", () => {
  let user1: TestUser | undefined;
  let user2: TestUser | undefined;

  const LIMIT = 3;
  const WINDOW = 10;

  beforeAll(async () => {
    user1 = await createTestUser("rl1");
    user2 = await createTestUser("rl2");
  }, 20_000);

  afterAll(async () => {
    await Promise.allSettled([
      user1 ? cleanupTestUser(user1.id) : Promise.resolve(),
      user2 ? cleanupTestUser(user2.id) : Promise.resolve(),
    ]);
  }, 10_000);

  it("first LIMIT requests are all allowed", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user1!;
    for (let i = 0; i < LIMIT; i++) {
      const result = await checkRateLimit(u.client, u.id, LIMIT, WINDOW);
      expect(result.allowed).toBe(true);
    }
  });

  it("(LIMIT+1)th request is blocked", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user1!;
    const result = await checkRateLimit(u.client, u.id, LIMIT, WINDOW);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSecs).toBe(WINDOW);
  });

  it("blocked result has correct shape: retryAfterSecs equals windowSecs", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user1!;
    const result = await checkRateLimit(u.client, u.id, LIMIT, WINDOW);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSecs).toBe(WINDOW);
  });

  it("second user is not rate-limited by first user's events", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user2!;
    const result = await checkRateLimit(u.client, u.id, LIMIT, WINDOW);
    expect(result.allowed).toBe(true);
  });

  it("fail-open: unauthenticated client INSERT error returns allowed", async () => {
    const anonClient = createClient(TEST_URL, TEST_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result = await checkRateLimit(anonClient, crypto.randomUUID(), LIMIT, WINDOW);
    expect(result.allowed).toBe(true);
  });

  it("events outside the window do not count toward the limit", async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const u = user2!;
    const admin = createAdminClient();

    await admin.from("rate_limit_events").insert([
      { user_id: u.id, created_at: new Date(Date.now() - 120_000).toISOString() },
      { user_id: u.id, created_at: new Date(Date.now() - 120_000).toISOString() },
      { user_id: u.id, created_at: new Date(Date.now() - 120_000).toISOString() },
    ]);

    const result = await checkRateLimit(u.client, u.id, LIMIT, WINDOW);
    expect(result.allowed).toBe(true);
  });
});
