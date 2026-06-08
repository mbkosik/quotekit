<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rate Limiting Integration Tests — Risk #5

- **Plan**: context/changes/rate-limiting-test/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING (2 Phase 2 manual checks skipped by user) |

## Success Criteria

### Automated (all phases)
- ✅ `npx tsc --noEmit` → exit 0
- ✅ `npx eslint` (all 3 source files) → exit 0
- ✅ `npm test` → 6/6 tests green (1.05s)

### Manual
- ✅ 1.4 rate_limit_events table visible in Supabase Studio (confirmed)
- ⏭ 2.3 21 curl requests → 21st returns 429 (skipped by user)
- ⏭ 2.4 Studio shows 20 rows for test user (skipped by user)

## Findings

### F1 — Missing Retry-After HTTP header on 429 response

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:22–25
- **Detail**: The 429 response included retry_after in the JSON body but omitted the standard Retry-After HTTP header (RFC 6585 §4). Automated clients, Cloudflare caching, and future SDK consumers inspect the header to know when to retry.
- **Fix**: Add `"Retry-After": String(retryAfterSecs)` to the headers object.
  - Strength: One-line change; retryAfterSecs already in scope; RFC-compliant.
  - Tradeoff: None.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 — select("*") on a HEAD request — intent not explicit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/rate-limit.ts:18
- **Detail**: `select("*", { count: "exact", head: true })` sends a HEAD request so no columns are transferred. `select("id", ...)` is more idiomatic and makes COUNT-only intent clear.
- **Fix**: Changed `select("*", ...)` to `select("id", ...)`.
- **Decision**: FIXED

### F3 — TOCTOU race undocumented

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/rate-limit.ts:16–30
- **Detail**: SELECT COUNT and INSERT are separate round-trips with no transaction. Concurrent Workers instances can each read count < limit and all insert, allowing burst to exceed limit by (concurrency - 1). Known MVP tradeoff but undocumented.
- **Fix**: Added comment above `checkRateLimit` documenting the non-atomic behavior as an accepted MVP tradeoff.
- **Decision**: FIXED

### F4 — Migration missing intent comment for absent UPDATE/DELETE policies

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260608000000_create_rate_limit_events.sql:12–20
- **Detail**: The migration intentionally omits UPDATE/DELETE policies (append-only design prevents limit bypass), but without a comment a future reviewer could add them back.
- **Fix**: Added comment explaining the append-only design and security rationale.
- **Decision**: FIXED
