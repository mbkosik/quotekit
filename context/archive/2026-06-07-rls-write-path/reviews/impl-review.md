<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: RLS Write-Path — Integration Tests for Risk #6

- **Plan**: context/changes/rls-write-path/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-06-07
- **Verdict**: APPROVED (after triage)
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Admin re-read asserted wrong invariant (cross-test dependency)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/access-control/idor-write.test.ts:84
- **Detail**: Admin re-read asserted `toMatchObject({ title: "Owner-updated title" })`, which passed only because Test 1 ran first and set that title. The test should assert the RLS invariant directly: the attack value was not written.
- **Fix**: Replace with `expect(adminRow?.title).not.toBe("HACKED")` — tests the actual security guarantee independent of test ordering.
  - Strength: Removes cross-test dependency; tests the actual RLS invariant.
  - Tradeoff: None significant.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F2 — Owner sanity check too weak

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/access-control/idor-write.test.ts:58-61
- **Detail**: `expect(data).not.toHaveLength(0)` passes for any non-empty array; does not verify the mutation actually landed. Added `toHaveLength(1)` + title assertion.
- **Fix**: `expect(data).toHaveLength(1)` + `expect(data![0].title).toBe("Owner-updated title")`.
  - Strength: Confirms the update was applied, not just that some row was returned.
  - Tradeoff: None.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — afterAll throws if createTestUser rejects before Promise.all resolves

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/access-control/idor-write.test.ts:41-46, src/__tests__/access-control/idor-read.test.ts:41-46
- **Detail**: `let userA: TestUser` (non-optional) + unconditional `cleanupTestUser(userA.id)` in afterAll would throw if `createTestUser` rejected before `Promise.all` resolved, masking the real error.
- **Fix**: Change to `TestUser | undefined`, guard cleanup with `userA ? cleanupTestUser(userA.id) : Promise.resolve()`, use `Promise.allSettled`. Add `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion` before `!.client` usages in `it` blocks.
  - Strength: Cleanup never throws; real setup error surfaces cleanly.
  - Tradeoff: Non-null assertions in `it` blocks require eslint-disable comments.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED (both files)
