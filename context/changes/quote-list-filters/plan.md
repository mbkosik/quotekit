# Quote List Filters Implementation Plan

## Overview

Add a filter bar to the quote list (`/quotes`) with status-pill multi-select, title search, and a sort toggle. Filtering is server-side (query params on `/api/quotes`), filter state lives in the URL, and the initial SSR fetch respects URL params so direct navigation to `/quotes?status=sent` shows filtered results without a flash.

## Current State Analysis

- `src/pages/api/quotes/index.ts` — GET accepts only `page` and `limit`; no status, search, or sort params
- `src/components/quotes/QuotesList.tsx` — 176-line React island with pagination state (`quotes`, `total`, `currentPage`, `loading`, `error`) but no filter UI
- `src/pages/quotes/index.astro` — SSR initial fetch hardcoded: newest-first, no filters, passes `initialQuotes / initialTotal / pageSize` to `QuotesList`
- `src/types.ts` — `QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"]` and `STATUS_LABELS` in `src/lib/quotes.ts`
- Lessons.md rule: components with non-trivial state (>2-3 variables or complex transitions) must delegate to a hook in `src/components/hooks/`

## Desired End State

Users see an inline filter bar above the quote list. They can activate any combination of status pills (Szkic / Wysłana / Zaakceptowana / Odrzucona), type a title search, and toggle sort order. All filter state is reflected in the URL — navigating to `/quotes?status=sent,draft&search=acme` shows filtered results immediately (SSR + client hydration agree). When filters match no quotes, a "Brak wycen dla wybranych filtrów" message with a "Wyczyść filtry" link appears. Pagination continues to work correctly and resets to page 1 on every filter change.

### Key Discoveries

- `src/pages/api/quotes/index.ts:96-101` — the Supabase query is a simple chain; `.in()` and `.ilike()` can be added conditionally
- `src/components/quotes/QuotesList.tsx:26-31` — already has 5 state variables; adding filter state crosses the hook-extraction threshold from lessons.md
- `src/pages/quotes/index.astro:15-20` — directly queries Supabase; same filter logic applied here keeps SSR and client in sync without a client-side re-fetch on mount

## What We're NOT Doing

- Date range filter (out of scope per user decision)
- Client-side-only filtering (breaks with pagination; explicitly rejected)
- Full-text search on `inquiry_text` (title only)
- Sort by fields other than `created_at`
- Per-column sort headers (just a single newest/oldest toggle)
- Persistent filter preferences (no user settings storage)

## Implementation Approach

Three phases, each independently verifiable: first extend the API, then extract the hook with filter state and URL sync, then build the filter bar UI and wire everything together (including SSR alignment).

## Critical Implementation Details

- **URL sync — use `replaceState`, not `pushState`**: filter changes should not pollute browser history. The back button should go to the previous page, not cycle through every intermediate filter state.
- **Page reset must be atomic with filter change**: the hook must pass `page=1` in the same fetch call that applies new filters, never allowing a filter change to fetch page 2+ of a different result set.
- **Debounce stale capture**: the search debounce timer callback must close over the specific input value captured at schedule time, not read from React state at fire time. Pass the value explicitly into the timeout closure.

---

## Phase 1: Extend GET /api/quotes

### Overview

Add `status`, `search`, and `sort` query params to the GET handler. Supabase query is built conditionally from validated params.

### Changes Required

#### 1. Filter param parsing and query extension

**File**: `src/pages/api/quotes/index.ts`

**Intent**: Parse three new optional params from `url.searchParams`, validate them with Zod, then apply conditional Supabase filters before `.range()`.

**Contract**:
- `status` — comma-separated string of `QuoteStatus` values; each token validated against `QUOTE_STATUSES`; invalid tokens silently dropped; empty/absent → no `.in()` call
- `search` — string; trimmed; absent or blank → no `.ilike()` call; applied as `.ilike("title", \`%${search}%\`)`
- `sort` — `"asc" | "desc"`, default `"desc"`; replaces the hardcoded `ascending: false` in `.order()`
- Import `QUOTE_STATUSES` from `@/types`

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes (no TypeScript errors)
- `GET /api/quotes?status=sent` returns only quotes with `status === "sent"`
- `GET /api/quotes?status=sent,draft` returns quotes with status in `["sent", "draft"]`
- `GET /api/quotes?search=acme` returns only quotes whose title matches (case-insensitive)
- `GET /api/quotes?sort=asc` returns quotes oldest-first
- `GET /api/quotes` (no params) behaves identically to the current implementation

#### Manual Verification

- Verify all filter combinations via browser dev tools or curl against the local dev server

**Implementation Note**: After Phase 1 automated verification passes, confirm manually before proceeding to Phase 2.

---

## Phase 2: Extract useQuotesList Hook

### Overview

Move all state and fetch logic from `QuotesList.tsx` into `src/components/hooks/useQuotesList.ts`. Add filter state (`statusFilter`, `searchFilter`, `sortOrder`), URL sync (`history.replaceState`), and debounced search. The hook accepts `initialFilters` so the SSR-seeded values bootstrap without a client-side re-fetch.

### Changes Required

#### 1. Create hook

**File**: `src/components/hooks/useQuotesList.ts`

**Intent**: Consolidate all quote-list state and side-effects in one place per the lessons.md rule. Expose everything `QuotesList` needs as a single return object.

**Contract**: The hook signature:
```ts
useQuotesList(options: {
  initialQuotes: QuoteRow[];
  initialTotal: number;
  pageSize: number;
  initialFilters: {
    statusFilter: QuoteStatus[];
    searchFilter: string;
    sortOrder: "asc" | "desc";
  };
})
```
Returns:
- State: `quotes`, `total`, `currentPage`, `totalPages`, `loading`, `error`, `statusFilter`, `searchFilter`, `sortOrder`, `hasActiveFilters: boolean`
- Handlers: `handleStatusChange(id, newStatus)`, `handleDelete(id)`, `handlePageChange(page)`, `handleStatusFilterToggle(status)`, `handleSearchChange(value)`, `handleSortChange()`, `handleClearFilters()`

URL sync behavior:
- On any filter change or page change: call `history.replaceState(null, "", builtURL)` where `builtURL` omits params at their default values (`sort` omitted when `"desc"`, `page` omitted when `1`, `status`/`search` omitted when empty)
- On mount: no URL push — initial state comes from `initialFilters` props

Search debounce: 300 ms, cleared on each new keystroke; the debounce callback receives the captured value as a closure argument.

`hasActiveFilters` is `true` when `statusFilter.length > 0 || searchFilter !== "" || sortOrder !== "desc"`.

#### 2. Remove inline state from QuotesList

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Replace the 5 `useState` / `useRef` declarations and all handlers with a single `useQuotesList(...)` call. Props interface gains `initialFilters`.

**Contract**: `QuotesList` becomes a thin rendering component — it calls the hook, renders `<QuoteFilterBar>`, and renders the list. No business logic remains in the component body.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes
- `QuotesList` renders without errors when `initialFilters` defaults are passed

#### Manual Verification

- Filter changes reset to page 1 in the URL
- URL updates on every filter interaction (status toggle, search, sort)
- Reloading `/quotes?status=sent` preserves filter state without a visible flash
- Debounce: typing quickly in search does not fire a request per keystroke

**Implementation Note**: After Phase 2 manual verification passes, confirm before proceeding to Phase 3.

---

## Phase 3: Filter Bar UI + SSR Alignment

### Overview

Build `QuoteFilterBar.tsx`, render it inside `QuotesList`, add the empty-with-filters state, and update `quotes/index.astro` to apply URL params to the SSR fetch and pass `initialFilters` to the component.

### Changes Required

#### 1. QuoteFilterBar component

**File**: `src/components/quotes/QuoteFilterBar.tsx`

**Intent**: Render the status pills, title search input, sort toggle, and conditional "clear filters" link. All logic lives in the hook; this component is purely presentational.

**Contract**: Props:
```ts
interface QuoteFilterBarProps {
  statusFilter: QuoteStatus[];
  searchFilter: string;
  sortOrder: "asc" | "desc";
  hasActiveFilters: boolean;
  onStatusFilterToggle: (status: QuoteStatus) => void;
  onSearchChange: (value: string) => void;
  onSortChange: () => void;
  onClearFilters: () => void;
}
```
Layout: horizontal flex row with three groups — status pills (`STATUS_LABELS` keys), search input, sort toggle — followed by the "Wyczyść filtry" link that renders only when `hasActiveFilters`. Active status pills are visually distinguished (e.g., `bg-purple-600` vs `bg-white/5`). Sort toggle label: "Najnowsze" when `sortOrder === "desc"`, "Najstarsze" when `"asc"`. No shadcn/ui dependencies needed (native `<input>`, `<button>` elements, Tailwind only).

#### 2. Update QuotesList for empty-with-filters state

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Differentiate the "no quotes at all" empty state from "filters returned nothing" so users aren't misled.

**Contract**:
- `total === 0 && !hasActiveFilters` → existing message "Nie masz jeszcze żadnych wycen."
- `quotes.length === 0 && hasActiveFilters` → "Brak wycen dla wybranych filtrów." + "Wyczyść filtry" button that calls `handleClearFilters()`
- `<QuoteFilterBar>` is always rendered above the list (even when empty)

#### 3. SSR filter alignment

**File**: `src/pages/quotes/index.astro`

**Intent**: Read `status`, `search`, and `sort` from `Astro.url.searchParams`, apply them to the initial Supabase query, and pass the parsed values as `initialFilters` to `<QuotesList>`. This ensures SSR output and client hydration agree, eliminating any content flash on filtered direct URLs.

**Contract**:
- Parse `status` param → `initialStatusFilter: QuoteStatus[]` (same validation logic as Phase 1 API)
- Parse `search` param → `initialSearchFilter: string` (trimmed)
- Parse `sort` param → `initialSortOrder: "asc" | "desc"` (default `"desc"`)
- Extend the Supabase query with `.in("status", initialStatusFilter)` (when non-empty) and `.ilike("title", ...)` (when non-blank) and `.order("created_at", { ascending: initialSortOrder === "asc" })`
- Pass `initialFilters={{ statusFilter: initialStatusFilter, searchFilter: initialSearchFilter, sortOrder: initialSortOrder }}` to `<QuotesList>`

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes (full production build, no TypeScript errors)

#### Manual Verification

- Status pills: clicking a pill adds it to active set; clicking again removes it; list updates after each toggle
- Multi-pill: activating "Wysłana" + "Zaakceptowana" shows both; deactivating one shows only the other
- Search: typing in the search field filters by title after ~300 ms; clearing the field restores all results
- Sort toggle: switches between newest-first and oldest-first; label updates accordingly
- Clear filters: resets all three filter dimensions and returns to unfiltered list
- Empty-with-filters: when no quotes match, shows "Brak wycen dla wybranych filtrów." with working clear link
- SSR: navigate directly to `/quotes?status=sent` — the initially rendered list is already filtered (no flash of unfiltered content)
- No pagination regressions: next/previous still works when filters are active

**Implementation Note**: After all automated and manual verification passes, this change is complete.

---

## Testing Strategy

### Manual Testing Steps

1. Create quotes of multiple statuses (draft, sent, accepted, rejected)
2. Click each status pill individually — verify list filters correctly
3. Activate two status pills simultaneously — verify OR semantics (both show)
4. Type a partial title in the search — verify debounce (no immediate fetch) then filtered result
5. Combine status + search — verify both apply
6. Toggle sort — verify order flips; verify URL updates
7. Navigate to `/quotes?status=sent&search=test&sort=asc` directly — verify correct initial SSR state
8. Clear filters — verify URL cleaned up and full list returns
9. Filter to zero results — verify "Brak wycen" message and clear link
10. Paginate while a filter is active — verify pages respect current filters

## References

- Full plan: `context/changes/quote-list-filters/plan.md`
- Similar fetch pattern: `src/components/quotes/QuotesList.tsx:66-83` (handlePageChange)
- Supabase conditional query: `src/pages/api/quotes/index.ts:92-101`
- STATUS_LABELS: `src/lib/quotes.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Extend GET /api/quotes

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run build` passes
- [ ] 1.3 `GET /api/quotes?status=sent` returns only sent quotes
- [ ] 1.4 `GET /api/quotes?status=sent,draft` returns quotes with status in [sent, draft]
- [ ] 1.5 `GET /api/quotes?search=acme` returns only title-matching quotes
- [ ] 1.6 `GET /api/quotes?sort=asc` returns quotes oldest-first
- [ ] 1.7 `GET /api/quotes` (no params) behaves identically to current

#### Manual

- [ ] 1.8 Verify all filter combinations via browser dev tools or curl

### Phase 2: Extract useQuotesList Hook

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 QuotesList renders without errors with default initialFilters

#### Manual

- [ ] 2.4 Filter changes reset to page 1 in URL
- [ ] 2.5 URL updates on every filter interaction
- [ ] 2.6 Reloading `/quotes?status=sent` preserves filter state without flash
- [ ] 2.7 Debounce: quick typing does not fire a request per keystroke

### Phase 3: Filter Bar UI + SSR Alignment

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Status pills toggle correctly; list updates after each toggle
- [ ] 3.4 Multi-pill OR semantics work correctly
- [ ] 3.5 Search filters by title with ~300 ms debounce
- [ ] 3.6 Sort toggle changes order; label updates
- [ ] 3.7 Clear filters resets all three dimensions
- [ ] 3.8 Empty-with-filters shows correct message and working clear link
- [ ] 3.9 Direct navigation to filtered URL shows correct SSR state
- [ ] 3.10 Pagination works correctly while filters are active
