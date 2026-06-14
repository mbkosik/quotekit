<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Enhancements — Plan 1

- **Plan**: context/changes/ui-enhancements/plan.md
- **Scope**: All 6 Phases
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION (triaged)
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Checks

- lint: PASS ✅
- build: PASS ✅
- grep starter-remnants: PASS ✅
- grep bg-cosmic/backdrop-blur-xl: PASS ✅
- lang="pl": PASS ✅
- 404.astro exists: PASS ✅

## Plan Drift

29/30 MATCH, 1 DRIFT (F1 — sparseMessage in InquiryForm lacks role="alert")

---

## Findings

### F1 — InquiryForm sparseMessage not announced by screen reader

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/InquiryForm.tsx:56
- **Detail**: Phase 4 added role="alert" to QuoteCreator's error elements but the inquiry-phase path passes errors via `sparseMessage` to InquiryForm which rendered it as a plain `<p>` — silent to screen readers.
- **Fix**: Add `role="alert" aria-live="assertive"` + always-in-DOM pattern to InquiryForm:56.
- **Decision**: FIXED — changed `{sparseMessage && <p>}` to always-in-DOM `<p role="alert" aria-live="assertive">{sparseMessage ?? ""}</p>`

### F2 — signup.ts still passes raw English Supabase errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signup.ts:16
- **Detail**: signin.ts calls `translateAuthError()`; signup.ts was left with raw `error.message`. supabase-errors.ts was created to centralise this but signup was missed.
- **Fix**: Add `translateSignupError` to supabase-errors.ts; apply in signup.ts.
- **Decision**: FIXED — added `translateSignupError` function to supabase-errors.ts with signup-specific PL messages; applied in signup.ts:16

### F3 — useQuotesList fetchQuotes guard flag set after the guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts:65-68
- **Detail**: `pageLoadingRef.current = true` was set inside the try block after `setLoading(true)`, creating a window where a concurrent call could slip through the guard.
- **Fix**: Move `pageLoadingRef.current = true` to immediately after the guard check.
- **Decision**: FIXED

### F4 — LineItemsEditor rows use array index as React key

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/LineItemsEditor.tsx:96
- **Detail**: Pre-existing key={i} issue became more consequential after Phase 6 added keyboard navigation. React reuses DOM nodes when rows shift after deletion.
- **Fix A ⭐**: Add `id?: string` to QuoteItemSchema; assign `crypto.randomUUID()` at AI-parse (3 call sites) and at `addRow()`; use `key={item.id ?? i}` in LineItemsEditor.
- **Decision**: FIXED via Fix A — QuoteItemSchema updated; useQuoteCreator.ts (3 setItems calls) and LineItemsEditor.addRow() now assign UUIDs; key changed to `item.id ?? i`

### F5 — React.SubmitEvent is not a valid React type

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/ConversationCard.tsx:26, InquiryForm.tsx:23
- **Detail**: Attempted to change to `React.FormEvent` but the project's ESLint rule `@typescript-eslint/no-deprecated` flags `FormEvent` as deprecated and recommends `SubmitEvent`. Original code was correct per this project's @types/react version.
- **Decision**: REVERTED — original `React.SubmitEvent` is correct; `FormEvent` is deprecated in this @types/react version

### F6 — stale total count if fetchQuotes fails after last-item delete

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts:109-119
- **Detail**: If the re-fetch after last-item delete fails, `total` stays at old value while `quotes` is empty.
- **Fix**: Optimistically decrement `total` before calling `fetchQuotes` in the last-item branch.
- **Decision**: FIXED

### F7 — Empty role="alert" elements may trigger spurious screen reader announcements

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/QuotesList.tsx:69-74
- **Detail**: Always-in-DOM live regions render "" when empty; clearing an error (text → "") can trigger an empty SR announcement. This is the plan's intended pattern.
- **Fix**: Changed `statusError` paragraph from `role="alert" aria-live="assertive"` to `role="status" aria-live="polite"` — it's a non-blocking notification; assertive reserved for the delete error.
- **Decision**: FIXED via Option B

### F8 — UserContextForm/useQuoteEditor setTimeout has no cleanup on unmount

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/settings/UserContextForm.tsx:29, src/components/hooks/useQuoteEditor.ts:42
- **Detail**: Auto-dismiss timers without stored IDs or useEffect cleanup, diverging from the pattern in useQuoteCreator.ts and useQuotesList.ts.
- **Fix**: Add `timerRef`/`successTimerRef` + `useEffect` cleanup in both files.
- **Decision**: FIXED in both UserContextForm.tsx and useQuoteEditor.ts

### F9 — supabase-errors.ts relies on exact Supabase error message strings

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase-errors.ts:1-11
- **Detail**: Exact string match on error.message — silently falls through to fallback if Supabase changes capitalisation.
- **Fix**: Switch to `.toLowerCase()` matching with lowercase map keys.
- **Decision**: FIXED

### F10 — quotes/[id].astro manual type cast bypasses Supabase-generated types

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/quotes/[id].astro:28-30
- **Detail**: Inline union cast for Supabase result. However, cast already uses `Quote` from `@/types` and is identical to the pattern in `api/quotes/index.ts:50-54` — project-wide convention.
- **Decision**: SKIPPED — consistent with project-wide pattern; no better alternative without Supabase type generation
