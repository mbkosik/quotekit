# RLS Write-Path — Integration Tests for Risk #6

## Overview

Implement integration tests that empirically verify the RLS UPDATE and DELETE policies on the `quotes` table prevent cross-user writes. The RLS policies exist in the migration and look correct; this plan produces the test that locks that guarantee in place and catches any future regression.

## Current State Analysis

RLS policies on `quotes` (from `supabase/migrations/20260526000000_create_quotes.sql`):
- `quotes_update_own` (line 44–45): `USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id)` — correct; both clauses present.
- `quotes_delete_own` (line 48–49): `USING ((select auth.uid()) = user_id)` — correct for DELETE.

Test infrastructure already in place:
- `src/lib/supabase-test.ts` — `createAdminClient()`, `createUserClient(token)`, env loading via `requireEnv`.
- `src/lib/test-helpers.ts` — `createTestUser(prefix)`, `cleanupTestUser(userId)`, `TestUser` interface.
- `src/__tests__/access-control/idor-read.test.ts` — the exact pattern this plan replicates for write ops.

## Desired End State

`src/__tests__/access-control/idor-write.test.ts` exists and passes three assertions:
1. Sanity: User A (owner) can UPDATE their own quote.
2. User B's UPDATE on User A's quote affects 0 rows; admin re-read confirms the title is unchanged.
3. User B's DELETE on User A's quote returns count=0; admin re-read confirms the record still exists.

Running `npm test src/__tests__/access-control/idor-write.test.ts -- --reporter=verbose` against a live local Supabase instance prints 3 green tests with no timeouts.

### Key Discoveries

- Supabase returns `{ data: [], error: null }` (not an error) when an UPDATE is blocked by RLS — 0 rows in the result array is the signal, not an error throw. (`src/__tests__/access-control/idor-read.test.ts` uses `maybeSingle()` for the analogous SELECT pattern.)
- DELETE with `{ count: "exact" }` returns `{ count: 0, error: null }` when RLS blocks — test asserts on `count`, not on an error.
- Admin re-read (service-role client) bypasses RLS — it is the authoritative "was the record mutated?" check.
- `ON DELETE CASCADE` on `quotes.user_id → auth.users.id` means `cleanupTestUser` in `afterAll` implicitly removes the test quote; no explicit quote cleanup needed.
- Test must be tagged `// @vitest-environment node` (top of file) — same requirement as idor-read.test.ts.

## What We're NOT Doing

- Not testing through the HTTP API (`PATCH /api/quotes/[id]`, `DELETE /api/quotes/[id]`) — the risk lives at the DB/RLS layer; a direct Supabase client test is the cheapest signal per test-plan §1 and is consistent with idor-read.test.ts.
- Not testing INSERT user_id spoofing (separate RLS policy, separate attack vector; Risk #6 is scoped to UPDATE and DELETE).
- Not adding an owner-can-DELETE sanity test — would require a second disposable fixture; afterAll cleanup via `deleteUser` is implicit evidence of owner deletion working.
- Not mocking Supabase — test-plan §2 Risk #6: "mocking bypasses the RLS layer."

## Implementation Approach

Single file, single phase. Mirror the structure of `idor-read.test.ts` exactly:
- `beforeAll`: provision two users in parallel; admin-insert one quote owned by User A.
- Three `it` blocks: sanity → cross-user UPDATE → cross-user DELETE.
- `afterAll`: `cleanupTestUser` for both users; CASCADE removes the quote.

## Phase 1: Write idor-write.test.ts

### Overview

Create `src/__tests__/access-control/idor-write.test.ts` with three tests covering the owner sanity check and both cross-user write operations.

### Changes Required

#### 1. Test file — `src/__tests__/access-control/idor-write.test.ts`

**File**: `src/__tests__/access-control/idor-write.test.ts`

**Intent**: Implement the full test suite for Risk #6 following the idor-read.test.ts pattern — two real Supabase users, one quote owned by User A, all write assertions via User B's RLS-scoped client.

**Contract**: The file must satisfy these structural and behavioral contracts:

- Top-of-file `// @vitest-environment node` comment (required by Vitest for non-jsdom integration tests).
- `beforeAll` timeout: `20_000` ms (network-bound user creation); `afterAll` timeout: `10_000` ms.
- Imports: `{ describe, it, expect, beforeAll, afterAll }` from `"vitest"`; `createAdminClient` from `"@/lib/supabase-test"`; `createTestUser, cleanupTestUser, type TestUser` from `"@/lib/test-helpers"`.
- Fixture: admin insert with `user_id: userA.id`, `title`, `inquiry_text`, `content: { items: [] }` — same shape as idor-read.test.ts.
- `quoteAId` extracted via `.select("id").single()` → `data.id as string`.

**Test 1 — sanity** `"owner updates their own quote"`:
- `userA.client.from("quotes").update({ title: "Owner-updated title" }).eq("id", quoteAId).select("id, title")`
- Assert `error` is null; assert returned array has length ≥ 1 (`data` contains the updated row).

**Test 2 — cross-user UPDATE** `"cross-user UPDATE by id returns empty data — RLS UPDATE enforced"`:
- `userB.client.from("quotes").update({ title: "HACKED" }).eq("id", quoteAId).select("id")`
- Assert `error` is null; assert `data` array has length 0 (no rows were affected by User B's UPDATE).
- Admin re-read: `.from("quotes").select("title").eq("id", quoteAId).single()` — assert `data.title` equals `"Owner-updated title"` (not `"HACKED"`).

**Test 3 — cross-user DELETE** `"cross-user DELETE by id returns count 0 — RLS DELETE enforced"`:
- `userB.client.from("quotes").delete({ count: "exact" }).eq("id", quoteAId)`
- Assert `error` is null; assert `count` equals 0.
- Admin re-read: `.from("quotes").select("id").eq("id", quoteAId).maybeSingle()` — assert `data` is not null (record still exists).

### Success Criteria

#### Automated Verification

- Type check clean: `npx tsc --noEmit` exits 0.
- Lint clean: `npx eslint src/__tests__/access-control/idor-write.test.ts` exits 0.
- All 3 tests pass against live local Supabase: `npm test src/__tests__/access-control/idor-write.test.ts -- --reporter=verbose` (requires `npx supabase start`).

#### Manual Verification

- None required — all oracles are automated assertions.

---

## Testing Strategy

### Integration Tests

All three tests run directly against local Supabase via `npx supabase start`. No mocks.

- Test 1 proves the fixture and RLS ALLOW path work — a failing sanity test means setup is broken, not that the risk is covered.
- Test 2 proves `quotes_update_own` USING+WITH CHECK blocks cross-user UPDATE.
- Test 3 proves `quotes_delete_own` USING blocks cross-user DELETE.
- Admin re-read in tests 2 and 3 provides a second, independent oracle that is immune to a hypothetical Supabase bug in count/data reporting.

## References

- Risk #6 definition: `context/foundation/test-plan.md` §2 row #6
- Pattern reference: `src/__tests__/access-control/idor-read.test.ts`
- RLS policies: `supabase/migrations/20260526000000_create_quotes.sql` lines 36–49
- Test helpers: `src/lib/test-helpers.ts`, `src/lib/supabase-test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Write idor-write.test.ts

#### Automated

- [x] 1.1 `npx tsc --noEmit` exits 0 — 80bc855
- [x] 1.2 `npx eslint src/__tests__/access-control/idor-write.test.ts` exits 0 — 80bc855
- [x] 1.3 `npm test src/__tests__/access-control/idor-write.test.ts -- --reporter=verbose` — 3 tests green (requires `npx supabase start`) — 80bc855
