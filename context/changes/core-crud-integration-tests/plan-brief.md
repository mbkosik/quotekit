# Core CRUD Integration Tests — Plan Brief

> Full plan: `context/changes/core-crud-integration-tests/plan.md`

## What & Why

Implement 7 integration tests for Risk #1 from the test-plan: "user cannot list, view, or save their quotes." The test-plan's oracle is explicit — asserting a status code is not enough; tests must verify payload shape and DB state. The cheapest layer that gives a real signal here is the Supabase JS client against a live local instance, consistent with the existing idor-read and idor-write test pattern.

## Starting Point

Vitest 4.x is installed; `vitest.config.ts` auto-loads `.env`. Two integration test files already exist in `src/__tests__/access-control/` (idor-read, idor-write) and define the full pattern: real users via `createTestUser`, service-role admin client for setup/teardown, user-scoped client for RLS assertions. No new dependencies are needed.

## Desired End State

`src/__tests__/core-crud/crud.test.ts` exists with 7 passing tests. Running `npm test src/__tests__/core-crud/crud.test.ts -- --reporter=verbose` against `npx supabase start` prints 7 green results with no timeouts. This locks the core CRUD guarantee into the regression suite.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Test layer | Supabase client (no HTTP) | Consistent with existing idor tests; risk lives at DB/RLS layer; no server startup required |
| Operations covered | INSERT + SELECT list + SELECT single + DELETE | Matches Risk #1 scope: list, save, fetch by ID, delete |
| Error paths | Unauthenticated INSERT/SELECT + delete non-existent | Proves RLS blocks anon access and misses are signalled cleanly |
| File location | `src/__tests__/core-crud/crud.test.ts` | Mirrors access-control/ subfolder layout; clean risk-category separation |
| Fixture strategy | One test user + one admin-seeded fixture quote; INSERT/DELETE tests supply their own data | Avoids test ordering dependencies; each destructive test uses a fresh row |

## Scope

**In scope:** INSERT (save), SELECT list, SELECT single by ID, DELETE; unauthenticated INSERT blocked; unauthenticated SELECT returns empty; delete non-existent returns count=0.

**Out of scope:** HTTP API layer (Zod validation, auth middleware 401, response wrapper shape); PATCH / status change; pagination parameters; any cross-user isolation (covered by idor-read/idor-write).

## Architecture / Approach

Single describe block, one real test user provisioned in `beforeAll`, one admin-seeded fixture quote. Tests 1–4 exercise the happy path for each CRUD operation; tests 5–6 construct an anon Supabase client (no Authorization header → `auth.uid() = NULL`) and assert RLS blocks the operation; test 7 deletes a random UUID and asserts count=0. `afterAll` calls `cleanupTestUser`; `ON DELETE CASCADE` removes all quotes automatically.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Write crud.test.ts | 7 passing integration tests for Risk #1 | `npx supabase start` must be running; anon-client behaviour must match expected RLS null-uid outcome |

**Prerequisites:** `npx supabase start` (local Supabase running); `.env` or `.env.local` populated with `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (run `npx supabase status` to get values).

**Estimated effort:** ~1 session; single phase, single file.

## Open Risks & Assumptions

- Anon client (`auth.uid() = NULL`) INSERT is expected to return a non-null error from Supabase — if local Supabase returns a different signal (e.g., `PGRST` code vs a generic error), the assertion may need adjustment to check `error` object shape.
- Test 7 uses `crypto.randomUUID()` (available in Node.js 18+, confirmed by `.nvmrc: v22`).

## Success Criteria (Summary)

- `npx tsc --noEmit` exits 0 (no new type errors).
- `npx eslint src/__tests__/core-crud/crud.test.ts` exits 0.
- `npm test src/__tests__/core-crud/crud.test.ts -- --reporter=verbose` → 7 green tests against live local Supabase.
