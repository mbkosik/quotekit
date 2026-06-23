<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: useQuoteCreator Refactor

- **Plan**: context/changes/refactor-opportunities-quote-creator/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS — 26/26 items MATCH |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING (3 findings) |
| Success Criteria | PASS — tests ✓ lint ✓ build ✓ |

## Findings

### F1 — callQuestions does not validate array element types

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:27
- **Detail**: `callQuestions` checks `Array.isArray(data.questions)` but casts with `data.questions as string[]` without verifying element types. Non-string elements silently propagate into state and render as `[object Object]`. Server-side Zod validation makes this low probability but the client has no last-resort guard.
- **Fix**: Add `.every((q) => typeof q === "string")` after the array check and throw "Malformed response" if it fails.
- **Decision**: FIXED — added element-type guard (commit 3f9ec01)

### F2 — sparse response in handleAnswer resets phase without clearing state

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:131–136
- **Detail**: When `data.type === "sparse"` in `handleAnswer`, the hook calls `setPhase("inquiry")` but does NOT clear `messages`, `currentQuestion`, or `error`. Stale conversation messages survive the return to inquiry and will be sent in the next `callChat` call. Phase 1 introduced `resetForm()` as the clean-slate operation — calling it here is now a two-word fix.
- **Fix**: Replace `setPhase("inquiry")` in the sparse branch of `handleAnswer` with `resetForm()`.
- **Decision**: FIXED — replaced with resetForm() (commit 3f9ec01)

### F3 — QuoteCreateRequest and QuoteInsert are unlinked near-duplicates

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:56
- **Detail**: `QuoteCreateRequest` overlaps heavily with `QuoteInsert` (same three fields, QuoteInsert also has `status`). The distinction is intentional (requests omit `status`) but nothing in the file makes the relationship visible.
- **Fix**: Either add a comment `// status is injected server-side; this is the client-facing subset of QuoteInsert` or derive via `type QuoteCreateRequest = Omit<QuoteInsert, "status">`.
- **Decision**: FIXED — derived via Omit<QuoteInsert, "status"> (commit 3f9ec01)

### F4 — satisfies on request-side lacks a comment explaining compile-time intent

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/ai/chat.ts:143, src/pages/api/ai/questions.ts:80, src/pages/api/quotes/index.ts:50
- **Detail**: `void (parsed.data satisfies ChatRequest)` is a compile-time-only check with zero runtime effect. Without a comment the intent (keep Zod schema in sync with the shared HTTP type) is invisible and looks like dead code.
- **Fix**: Add inline comment: `void (parsed.data satisfies ChatRequest); // compile-time: Zod schema ↔ ChatRequest`
- **Decision**: FIXED — comment added to all 3 lines (commit 3f9ec01)

### F5 — ConversationCard outer error div condition includes unreachable onRetry path

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/quotes/ConversationCard.tsx:78
- **Detail**: Outer error section renders on `(error ?? onRetry)`. From the current call site, `onRetry` is only passed when `error` is truthy — so `onRetry` without `error` is unreachable. If it were reached, an invisible layout div would appear. The condition predates Phase 1.
- **Fix**: Simplify the outer condition to `!!error`.
- **Decision**: FIXED — condition simplified to !!error; also removed redundant error ?? null (commit 3f9ec01)
