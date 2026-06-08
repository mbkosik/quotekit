# Core CRUD Integration Tests — Risk #1

## Overview

Implement integration tests that empirically verify the core quote CRUD operations (list, save by ID, fetch by ID, delete) work correctly for an authenticated user against a live local Supabase instance. The tests target Risk #1 from the test-plan: "user cannot list, view, or save their quotes."

## Current State Analysis

Vitest 4.x is installed and configured (`vitest.config.ts` loads `.env` automatically via `loadEnv`). Two integration test files already exist and establish the pattern this plan follows:

- `src/__tests__/access-control/idor-read.test.ts` — Risk #2
- `src/__tests__/access-control/idor-write.test.ts` — Risk #6

Both use real Supabase users, the `createTestUser` / `cleanupTestUser` / `createAdminClient` helpers from `src/lib/`, and `// @vitest-environment node` at the top. No HTTP server is needed — operations run directly through the Supabase JS client.

The `quotes` table (`supabase/migrations/20260526000000_create_quotes.sql`) has:
- INSERT RLS WITH CHECK: `(select auth.uid()) = user_id`
- SELECT RLS USING: `(select auth.uid()) = user_id`
- DELETE RLS USING: `(select auth.uid()) = user_id`
- `ON DELETE CASCADE` on `user_id → auth.users.id` — cleanup via `deleteUser` cascades to quotes

`src/lib/supabase-test.ts` exports `TEST_URL` and `TEST_ANON_KEY` needed for the anon-client unauthenticated tests.

## Desired End State

`src/__tests__/core-crud/crud.test.ts` exists and passes 7 tests:

1. Authenticated user inserts a quote — INSERT returns the new row with `status: "draft"` and a defined `id`.
2. Authenticated user lists their own quotes — SELECT returns an array that contains the fixture quote's id.
3. Authenticated user fetches their own quote by id — SELECT single returns the full row with all schema fields.
4. Authenticated user deletes their own quote — DELETE returns `count: 1`; admin re-read confirms the row is gone.
5. Unauthenticated Supabase client cannot INSERT — RLS returns a non-null error.
6. Unauthenticated Supabase client cannot list quotes — SELECT returns an empty array.
7. Delete on a non-existent (or foreign) id returns `count: 0`.

Running `npm test src/__tests__/core-crud/crud.test.ts -- --reporter=verbose` against a live local Supabase instance prints 7 green tests with no timeouts.

### Key Discoveries

- Tests go directly through the Supabase JS client, not the HTTP API layer. The risk lives in the DB/RLS + Supabase round-trip; the HTTP layer is a thin Zod + auth wrapper that is validated by TypeScript and linting.
- When using raw Supabase client (not HTTP POST /api/quotes), the test must supply `user_id: user.id` in INSERT — the API sets it server-side, but the Supabase client does not. The RLS `WITH CHECK` policy enforces `user_id = auth.uid()`, which validates the assignment at the DB layer.
- `status` has a DB-level DEFAULT `'draft'`, so the insert test can omit it from the payload and assert it appears in the returned row.
- Anon client (no Authorization header) has `auth.uid() = NULL` at the RLS layer: INSERT fails with a policy violation error; SELECT returns `[]`; DELETE returns `count: 0`.
- `cleanupTestUser` deletes the Supabase auth user; CASCADE removes all their quotes. No explicit quote cleanup is needed in `afterAll`.
- `TEST_URL` and `TEST_ANON_KEY` are already exported from `src/lib/supabase-test.ts` — the anon client for unauthenticated tests can be constructed inline from these.

## What We're NOT Doing

- Not testing through the HTTP API (`POST /api/quotes`, `GET /api/quotes`, `DELETE /api/quotes/[id]`) — that would require a running server and is a higher-cost layer to test when the risk lives at the DB layer.
- Not testing Zod input validation or HTTP error shapes (400, 401 from middleware) — those are validated by TypeScript strict mode and linting.
- Not adding PATCH / status-change tests — Risk #1 is scoped to list, save, and delete; PATCH is not in scope.
- Not testing pagination behavior (`page`, `limit` params) — covered at the API layer; not part of the DB-level risk.

## Implementation Approach

Single file, single phase. Mirror `idor-read.test.ts` exactly for structure:
- `beforeAll`: provision one test user; admin-insert one fixture quote (used by tests #2 and #3).
- Seven `it` blocks: INSERT sanity → SELECT list sanity → SELECT single sanity → DELETE sanity (with admin re-read) → unauthenticated INSERT blocked → unauthenticated SELECT blocked → delete non-existent count=0.
- `afterAll`: `cleanupTestUser`; CASCADE removes all quotes.

## Phase 1: Write src/__tests__/core-crud/crud.test.ts

### Overview

Create the directory `src/__tests__/core-crud/` and the test file with seven tests covering the four happy-path CRUD operations and two unauthenticated-access assertions.

### Changes Required

#### 1. Test file — `src/__tests__/core-crud/crud.test.ts`

**File**: `src/__tests__/core-crud/crud.test.ts`

**Intent**: Full integration test suite for Risk #1. One real Supabase user; one admin-seeded fixture quote; seven tests that verify the owner can save, list, fetch, and delete their own quotes, and that an unauthenticated client is blocked by RLS.

**Contract**: The file must satisfy:

- Top-of-file `// @vitest-environment node` comment.
- `beforeAll` timeout: `20_000` ms; `afterAll` timeout: `10_000` ms.
- Imports: `{ describe, it, expect, beforeAll, afterAll }` from `"vitest"`; `createAdminClient`, `TEST_URL`, `TEST_ANON_KEY` from `"@/lib/supabase-test"`; `createClient` from `"@supabase/supabase-js"`; `createTestUser`, `cleanupTestUser`, `type TestUser` from `"@/lib/test-helpers"`.
- Fixture: admin-insert with `user_id: user.id`, `title`, `inquiry_text`, `content: { items: [] }` → `fixtureId` from `.select("id").single()`.
- Cleanup: `Promise.allSettled([user ? cleanupTestUser(user.id) : Promise.resolve()])` (guard against undefined in case `createTestUser` threw before assignment).

**Test 1 — INSERT sanity** `"owner inserts a quote — INSERT returns new row with id and draft status"`:
- `user.client.from("quotes").insert({ user_id: user.id, title, inquiry_text, content: { items: [] } }).select().single()`
- Assert `error` is null; assert `data.id` is defined (truthy string); assert `data.status` equals `"draft"`.

**Test 2 — SELECT list sanity** `"owner lists their own quotes — SELECT returns array containing fixture"`:
- `user.client.from("quotes").select("id, title, status, created_at")`
- Assert `error` is null; assert the returned id array contains `fixtureId`.

**Test 3 — SELECT single sanity** `"owner fetches their own quote by id — SELECT single returns full row"`:
- `user.client.from("quotes").select("*").eq("id", fixtureId).single()`
- Assert `error` is null; assert `data.id` equals `fixtureId`; assert `data.title`, `data.inquiry_text`, `data.content`, `data.status`, `data.created_at` are all defined (not null/undefined).

**Test 4 — DELETE sanity** `"owner deletes their own quote — DELETE count is 1 and admin confirms row gone"`:
- Admin-insert a fresh "delete-target" quote owned by `user.id`; capture `deleteId`.
- `user.client.from("quotes").delete({ count: "exact" }).eq("id", deleteId)`
- Assert `error` is null; assert `count` equals `1`.
- Admin re-read: `.from("quotes").select("id").eq("id", deleteId).maybeSingle()` — assert `data` is null.

**Test 5 — unauthenticated INSERT blocked** `"unauthenticated Supabase client cannot insert a quote — RLS returns error"`:
- Construct an anon client inline using `createClient(TEST_URL, TEST_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })`. No Authorization header → `auth.uid()` is null.
- Attempt insert with any valid UUID as `user_id`; the RLS `WITH CHECK` will reject it.
- Assert `error` is not null.

**Test 6 — unauthenticated SELECT blocked** `"unauthenticated Supabase client cannot list quotes — SELECT returns empty array"`:
- Same anon client pattern as Test 5.
- `anonClient.from("quotes").select("id")`
- Assert `error` is null; assert `data` has length 0 (RLS filters all rows when `auth.uid()` is null).

**Test 7 — delete non-existent** `"delete non-existent quote id returns count 0"`:
- `user.client.from("quotes").delete({ count: "exact" }).eq("id", crypto.randomUUID())`
- Assert `error` is null; assert `count` equals `0`.

### Success Criteria

#### Automated Verification

- Type check clean: `npx tsc --noEmit` exits 0.
- Lint clean: `npx eslint src/__tests__/core-crud/crud.test.ts` exits 0.
- All 7 tests pass against live local Supabase: `npm test src/__tests__/core-crud/crud.test.ts -- --reporter=verbose` (requires `npx supabase start`).

#### Manual Verification

- None required — all oracles are automated assertions.

---

## Testing Strategy

### Integration Tests

All seven tests run directly against local Supabase via `npx supabase start`. No mocks.

- Tests 1–4 prove the CRUD ALLOW path works end-to-end — fixture setup is clean, owner operations succeed, DB state is verified by admin client.
- Tests 5–6 prove that `auth.uid() = NULL` at the RLS layer is enforced for INSERT and SELECT; this is the anon-access protection that guards unauthenticated DB access.
- Test 7 proves the DELETE path correctly returns count=0 rather than silently succeeding or erroring on a miss — important for the API layer's 404 logic.

## References

- Risk #1 definition: `context/foundation/test-plan.md` §2 row #1
- Pattern reference: `src/__tests__/access-control/idor-read.test.ts`
- RLS policies: `supabase/migrations/20260526000000_create_quotes.sql`
- Test helpers: `src/lib/test-helpers.ts`, `src/lib/supabase-test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Write src/__tests__/core-crud/crud.test.ts

#### Automated

- [x] 1.1 `npx tsc --noEmit` exits 0
- [x] 1.2 `npx eslint src/__tests__/core-crud/crud.test.ts` exits 0
- [x] 1.3 `npm test src/__tests__/core-crud/crud.test.ts -- --reporter=verbose` — 7 tests green (requires `npx supabase start`)
