<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Core CRUD Integration Tests — Risk #1

- **Plan**: context/changes/core-crud-integration-tests/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Test 1 INSERT row leaks into test 2 scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/core-crud/crud.test.ts:44
- **Detail**: Test 1 inserts a quote and asserts the returned id is truthy, but does not delete the row. The extra row persists until afterAll CASCADE cleanup. Test 2's list check passes regardless, but the test suite accumulates one stray quote per run and — if ordering ever changes — a list count assertion could produce unexpected results. The plan says each destructive test "supplies its own data" but did not explicitly require test 1 to clean up its INSERT.
- **Fix**: Capture the inserted id from test 1 and delete it at the end of the test: `user.client.from("quotes").delete().eq("id", insertedId)`.
  - Strength: Same pattern test 4 uses — makes test 1 fully self-contained.
  - Tradeoff: 3 extra lines; CASCADE already covers cleanup if left as-is.
  - Confidence: MEDIUM — omission looks deliberate (plan says CASCADE handles fixtures); this is an isolation preference, not a correctness bug.
  - Blind spot: None significant.
- **Decision**: FIXED — added `if (data) await u.client.from("quotes").delete().eq("id", data.id as string)` at end of test 1.

### F2 — Test 3 uses toBeDefined() for known fixture fields instead of exact values

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/core-crud/crud.test.ts:84
- **Detail**: The plan oracle says "verify payload shape" (test-plan.md §2 row #1). toBeDefined() passes when the value is null (null !== undefined), so a DB bug returning NULL for title would not be caught. The fixture values are known at assertion time: title = "Fixture quote for CRUD tests", inquiry_text = "Build a landing page", content = { items: [] }, status = "draft". The plan's "(not null/undefined)" qualifier calls for stronger oracles than toBeDefined() delivers.
- **Fix**: Replace toBeDefined() for the four known fields with exact-value assertions: `.toBe("Fixture quote for CRUD tests")`, `.toBe("Build a landing page")`, `.toEqual({ items: [] })`, `.toBe("draft")`. Keep toBeDefined() for created_at (value unknown at assertion time).
  - Strength: Closes the null-pass gap; fixture values are stable (set in beforeAll) so the assertions won't flake.
  - Tradeoff: Couples test 3 to fixture content — if beforeAll changes, test 3 must update.
  - Confidence: HIGH — plan oracle explicitly names payload-shape verification; exact assertions are its natural fulfillment.
  - Blind spot: None significant.
- **Decision**: FIXED — replaced four `toBeDefined()` calls with `.toBe("Fixture quote for CRUD tests")`, `.toBe("Build a landing page")`, `.toEqual({ items: [] })`, `.toBe("draft")`.

### F3 — fixtureId declared without initialization

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/__tests__/core-crud/crud.test.ts:17
- **Detail**: `let fixtureId: string` is declared without initialization. Vitest's beforeAll failure semantics skip all describe-block tests if beforeAll throws — same pattern as sibling idor-read.test.ts. Acceptable; noted for consistency.
- **Fix**: No action required — matches existing sibling pattern. Optionally initialize as `let fixtureId = ""` to make intent explicit.
- **Decision**: SKIPPED — matches existing sibling pattern; acceptable.

### F4 — Unauthenticated INSERT test lacks admin re-read confirming no row created

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/core-crud/crud.test.ts:129
- **Detail**: Test 5 asserts the anon INSERT returns a non-null error. This satisfies the plan contract ("assert error is not null") and is sufficient for RLS verification. An admin re-read to confirm no row was inserted would add a DB-state oracle but requires knowing the would-be row id (the test uses randomUUID as user_id, not id).
- **Fix**: No action required. If stronger assurance is desired, use a known title like "Unauthorized insert attempt" and do an admin SELECT by title after the attempt to confirm the row doesn't exist.
- **Decision**: SKIPPED — matches plan contract exactly; beyond scope.

### F5 — afterAll conditional guard missing explanatory comment from siblings

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/__tests__/core-crud/crud.test.ts:38
- **Detail**: `Promise.allSettled([user ? cleanupTestUser(user.id) : Promise.resolve()])` is correct and matches the plan contract exactly. The sibling idor-read.test.ts includes a comment explaining why the conditional guard exists; crud.test.ts omits it. Minor consistency gap.
- **Fix**: No action required. The project's comment guidelines (CLAUDE.md) say to add comments only when the WHY is non-obvious — the guard condition is self-explanatory here.
- **Decision**: SKIPPED — CLAUDE.md comment guidelines support omission here.
