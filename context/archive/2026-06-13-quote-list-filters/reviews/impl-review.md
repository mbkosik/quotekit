<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Quote List Filters

- **Plan**: context/changes/quote-list-filters/plan.md
- **Scope**: All phases (Phase 1, 2, 3)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Debounce timer not cleared on unmount

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts:50
- **Detail**: `searchTimerRef` is never cleared in a `useEffect` cleanup. If the component unmounts while a debounce is pending (e.g. user navigates away mid-type), the timeout fires after unmount, calling `fetchQuotes` and `history.replaceState` on a dead component. React 18 strict mode double-invocation makes this reproducible in dev.
- **Fix**: Add a useEffect cleanup that calls `clearTimeout(searchTimerRef.current)` on unmount.
  - Strength: Standard React pattern; eliminates the stale update warning and the ghost fetch.
  - Tradeoff: One new useEffect block — negligible scope.
  - Confidence: HIGH — same pattern used for debounce cleanup elsewhere.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix now

### F2 — Fetch errors silently swallowed in fetchQuotes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts:66-68
- **Detail**: The catch block in `fetchQuotes` is empty (or sets error to a generic string without preserving the actual error). If the API returns a non-2xx status or the network fails, the UI silently shows a stale list with no feedback. This also means `total` and `quotes` remain at their previous values after a failed re-fetch post-delete.
- **Fix**: In the catch block, set `setError(String(err))` (or a user-facing message) so the `{error && ...}` branch in QuotesList renders.
  - Strength: The error display JSX already exists in QuotesList.tsx:68 — it just needs the state to be populated.
  - Tradeoff: None — pure additive.
  - Confidence: HIGH — the error display path is already wired up in the component.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix now

### F4 — LIKE metacharacters not escaped in search input

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/quotes/index.ts:112, src/pages/quotes/index.astro:35
- **Detail**: User-supplied `search` is interpolated directly into `.ilike("title", \`%${searchFilter}%\`)`. A query containing `%` or `_` (LIKE metacharacters) will match unexpectedly broadly — `%` matches any sequence, `_` matches any single char. Input like `50%` would return all titles instead of just those containing "50%". This is a correctness issue (not a confidentiality risk since the query is already user-scoped) but could confuse users.
- **Fix**: Escape `%` → `\%` and `_` → `\_` in `searchFilter` before interpolation: `searchFilter.replace(/%/g, "\\%").replace(/_/g, "\\_")`.
  - Strength: Matches PostgreSQL's LIKE escape semantics; one-line change in both locations.
  - Tradeoff: Users cannot use wildcards intentionally — acceptable given this is a "title contains" search, not a pattern search.
  - Confidence: HIGH — both sites have the same pattern; the fix is identical.
  - Blind spot: Supabase's `.ilike()` may handle escaping differently across versions — worth a quick check against Supabase JS docs.
- **Decision**: FIXED via Fix now

### F3 — Fetch guard (pageLoadingRef) fragility

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts:56-70
- **Detail**: `pageLoadingRef.current = true` is set before the try block. If the code between that line and the try throws (currently impossible, but fragile), the ref stays true and locks out all future fetches. Moving the assignment to the first line inside the try block makes the guard self-healing.
- **Fix**: Move `pageLoadingRef.current = true` to the first statement inside the try block.
- **Decision**: FIXED via Fix now

### F5 — Stale total after failed delete re-fetch

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts (handleDelete)
- **Detail**: `handleDelete` calls `fetchQuotes` after the DELETE. If that re-fetch fails (caught silently per F2), `total` stays at the pre-delete count, making the pagination math wrong. Fixing F2 (surfacing fetch errors) mitigates this — users will at least see an error rather than a wrong count.
- **Fix**: Contingent on F2 fix — no separate action needed if error state is set on failed re-fetch.
- **Decision**: SKIPPED — mitigated by F2 fix

### F6 — handleStatusChange never surfaces error to user

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuotesList.ts (handleStatusChange)
- **Detail**: The PATCH request to update a quote's status optimistically updates local state but doesn't surface a failure. If the API call fails, the dropdown reverts visually only on the next page load. Low severity since status changes rarely fail, but silent failures are a UX gap.
- **Fix**: On API error, revert the optimistic state update and call `setError(...)`.
- **Decision**: SKIPPED

### F7 — SSR Supabase error silently returns empty list

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/quotes/index.astro:38
- **Detail**: `const { data: quotes, count } = await query...` — if Supabase returns an error, `data` is `null` and `count` is `null`, so the page renders `initialQuotes=[]` and `initialTotal=0`. Users see an empty list with no indication something went wrong. The API route handles errors with a 500 response; the SSR page should too.
- **Fix**: Destructure `{ data: quotes, count, error }` from the query and return a 500 response or render an error state if `error` is truthy.
- **Decision**: FIXED via Fix now

### D1 — QuoteFilterBar not rendered in the isEmpty early-return path

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/QuotesList.tsx:51-53
- **Detail**: Plan Phase 3 specifies: "`<QuoteFilterBar>` is always rendered above the list (even when empty)." The implementation has an early return at line 51-53 when `isEmpty` (total === 0, no active filters) that returns before rendering the filter bar. This means a user with zero quotes never sees the filter bar — a minor UX deviation but a plan drift.
- **Fix**: Move the filter bar render outside/before the `isEmpty` early-return, or restructure to always render the bar and conditionally render the empty state below it.
- **Decision**: SKIPPED — zero-quote users see no filter bar; acceptable UX
