<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Testing AI State Machine

- **Plan**: context/changes/testing-ai-state-machine/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical / 2 warnings / 3 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

**Automated criteria**: `npm test` 4/4 ✅ · `npx astro check` 0 errors ✅

## Findings

### F1 — vi.useRealTimers() not in afterEach — fake timers can leak

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.test.tsx:132,170
- **Detail**: `vi.useFakeTimers()` is called at line 132 and `vi.useRealTimers()` at line 170 — both inline in the golden path test body. If the golden path test throws before line 170, `vi.useRealTimers()` is never called. The module-level `afterEach` only runs `vi.unstubAllGlobals()` — it does not restore real timers. Behavior A and B tests would then run with fake timers active, causing fetch Promises to never resolve and the tests to hang or produce wrong results.
- **Fix ⭐**: Move `vi.useRealTimers()` into the module-level `afterEach` alongside `vi.unstubAllGlobals()`.
  - Strength: Guarantees timer restore regardless of test outcome — the afterEach is the only safe cleanup point.
  - Tradeoff: `vi.useRealTimers()` in afterEach is a no-op for tests that never called `useFakeTimers`, so there is no cost.
  - Confidence: HIGH — this is the established pattern for fake timer cleanup in RTL + Vitest.
  - Blind spot: None significant.
- **Decision**: FIXED — moved `vi.useRealTimers()` into module-level `afterEach`; removed inline call from golden path test body.

### F2 — @vitejs/plugin-react installed but unused; .tsx extension unguarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:45, vitest.config.ts:4
- **Detail**: `@vitejs/plugin-react` (^6.0.2) is in devDependencies and installed, but `vitest.config.ts` intentionally omits it (Vite 7 vs required Vite ^8). The plugin is dead weight. Separately, the test file uses `.tsx` extension — future tests in the same file that accidentally include JSX will fail with cryptic esbuild errors rather than a clear config mismatch.
- **Fix A ⭐ Recommended**: Rename test file to `.test.ts` + uninstall plugin. Rename `src/components/hooks/useQuoteCreator.test.tsx` → `.test.ts` (zero content change; no JSX is used). Uninstall `@vitejs/plugin-react` from devDependencies.
  - Strength: Makes the "no JSX" constraint enforced by the filename, not just convention. Removes the dead dep.
  - Tradeoff: Plugin must be re-added if JSX tests are ever needed (after Vite upgrades to ^8).
  - Confidence: HIGH — rename is safe; no imports reference the filename.
  - Blind spot: Check if any other config or tooling references `*.test.tsx` explicitly. None found in this project.
- **Fix B**: Keep `.tsx` + update cookbook §6.3 to warn about the JSX risk.
  - Strength: No rename or package change needed.
  - Tradeoff: Dead dep stays; constraint is doc-only, not enforced.
  - Confidence: MEDIUM.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — renamed to `useQuoteCreator.test.ts`; uninstalled `@vitejs/plugin-react`.

### F3 — act() vs await act() inconsistency between test and cookbook

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: useQuoteCreator.test.tsx:163, context/foundation/test-plan.md §6.3
- **Detail**: The golden path test runs `act(() => { vi.runAllTimers(); })` without `await`. The cookbook (§6.3 timer pattern) documents `await act(...)` for the same operation. Both are valid (synchronous callback), but the inconsistency will confuse developers copying from §6.3 and comparing to the actual test file.
- **Fix**: Add `await` to the `vi.runAllTimers()` `act()` call at line 163 to align with the cookbook example.
- **Decision**: SKIPPED

### F4 — --passWithNoTests skipped as intermediate step (procedural drift)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json scripts
- **Detail**: Phase 1 planned to add `--passWithNoTests` to the test script, then Phase 2 would remove it. The flag was never added; `npm test` shipped as `"vitest run"` from the start. End state is correct, no functional impact.
- **Fix**: None required — end state is correct. Accept as intentional shortcut.
- **Decision**: ACCEPTED — no action needed

### F5 — Untested paths: sparse response + handleInquirySubmit error

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.test.ts
- **Detail**: Two hook paths have no test coverage: (a) the `"sparse"` response type (resets to "inquiry", sets `sparseMessage`); (b) the `handleInquirySubmit` network/API error path (reverts to "inquiry"). Neither was in this plan's scope, but they represent gaps future regressions could hit silently.
- **Fix**: Track as follow-up for the next test phase. Same mock patterns already established apply.
- **Decision**: TRACKED — flagged as follow-up for next test phase (Phase 2: Core flow reliability)
