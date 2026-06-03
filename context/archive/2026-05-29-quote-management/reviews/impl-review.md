<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Quote Management

- **Plan**: context/changes/quote-management/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-05-30
- **Verdict**: APPROVED (all findings fixed during triage)
- **Findings**: 0 critical · 6 warnings · 0 observations

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

### F1 — No UUID validation on route params in API handler

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/quotes/[id].ts:31, 91, 130
- **Detail**: context.params.id passed directly to Supabase without UUID validation. Malformed input causes a Postgres cast error returning 500 instead of 400.
- **Fix**: Added `const idSchema = z.uuid()` with `safeParse` guard (returning 400) at the top of each handler.
- **Decision**: FIXED

### F2 — No UUID validation on route params in SSR page

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/quotes/[id].astro:14
- **Detail**: Astro.params.id passed directly to Supabase without UUID validation. Cast error gets swallowed and returned as 404.
- **Fix**: Added `z.uuid().safeParse(Astro.params.id)` before the Supabase call; returns 400 on invalid format.
- **Decision**: FIXED

### F3 — Silent delete failure leaves user without feedback

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/QuotesList.tsx:48-57
- **Detail**: handleDelete catch block was a no-op. AlertDialog closes, row stays, no user feedback.
- **Fix**: Added `error` state to QuotesList; catch block sets "Nie udało się usunąć wyceny." error message rendered above the list.
- **Decision**: FIXED

### F4 — Concurrent page-change fetches possible (no in-flight guard)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/QuotesList.tsx:59-73
- **Detail**: Pagination buttons disable on React loading state, but state update is async — double-click window allows two concurrent fetches.
- **Fix**: Added `pageLoadingRef = useRef(false)` guard; handlePageChange returns early if in-flight, clears ref in `finally`.
- **Decision**: FIXED

### F5 — Last item on page N>1 deleted → empty page with no recovery

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/QuotesList.tsx:52-54
- **Detail**: Deleting the last quote on page 2+ left quotes=[] while total>0; user stranded on empty page.
- **Fix (Fix A)**: After successful DELETE, if `quotes.length === 1 && currentPage > 1`, call `handlePageChange(currentPage - 1)` instead of updating local state directly.
- **Decision**: FIXED via Fix A

### F6 — handleDelete has no in-flight guard (double-invocation risk)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteEditor.ts:51
- **Detail**: handleDelete had no guard against concurrent calls; handleSave was already protected by `saving` flag.
- **Fix**: Added `deleting` state boolean mirroring `saving`; guard at top of handleDelete returns early if already deleting. Button in QuoteEditor shows "Usuwanie…" and is disabled while deleting.
- **Decision**: FIXED
