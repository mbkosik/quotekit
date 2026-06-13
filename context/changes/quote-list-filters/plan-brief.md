# Quote List Filters — Plan Brief

> Full plan: `context/changes/quote-list-filters/plan.md`

## What & Why

Add filtering to the quote list so users can narrow down their wyceny by status, title, or sort order. As the list grows, unfiltered scrolling becomes impractical — this feature lets freelancers quickly find "all accepted quotes to bill" or "draft quotes to finish" without scrolling through everything.

## Starting Point

The GET `/api/quotes` endpoint accepts only `page` and `limit`. `QuotesList.tsx` renders all quotes in a fixed newest-first order with no filter UI. The SSR page (`quotes/index.astro`) always fetches the first 20 unfiltered quotes.

## Desired End State

Users see an inline filter bar above the quote list with four status toggle pills, a title search input, and a newest/oldest sort toggle. Filters are reflected in the URL (`/quotes?status=sent&search=acme`) so filtered views are bookmarkable and survive reload. When filters return no results, a clear "Brak wycen dla wybranych filtrów" message with a "Wyczyść filtry" link appears. Pagination continues to work correctly under any active filter.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Filter dimensions | Status (pills) + title search | Most actionable filters; date range deferred as lower utility | Plan |
| Filter architecture | Server-side (API query params) | Client-side filtering breaks silently with pagination > 20 items | Plan |
| URL state | Yes — `history.replaceState` | Bookmarkable filtered views; `replaceState` avoids polluting browser history | Plan |
| Filter UI placement | Inline bar above list | Always visible, no toggle needed; fits the minimal dark-UI aesthetic | Plan |
| Status filter interaction | Toggle pills (multi-select) | Shows all options at once; fastest to use; supports OR combinations | Plan |
| Sort exposure | Newest/Oldest toggle in filter bar | Marginal effort once the bar exists; rounds out the feature | Plan |
| Hook extraction | `useQuotesList.ts` | Component already has 5 state variables; lessons.md mandates hook for non-trivial state | Plan |

## Scope

**In scope:** Status pill multi-select, title ilike search, newest/oldest sort toggle, URL sync, empty-with-filters state, SSR alignment on initial load

**Out of scope:** Date range filter, sort by fields other than `created_at`, per-column sort headers, full-text search on `inquiry_text`, persistent filter user preferences

## Architecture / Approach

Server-side filtering: API receives `?status=sent,draft&search=foo&sort=asc`, builds a conditional Supabase query. Client state lives in `useQuotesList.ts` (new hook); filter changes push a `replaceState` URL update, reset page to 1, and fire a new fetch. The Astro SSR page reads URL params to seed both the initial Supabase query and the `initialFilters` prop, so SSR output and client hydration agree on first render.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API extension | `status`, `search`, `sort` query params on GET /api/quotes | Incorrect conditional query building (e.g., empty `.in([])` matching nothing) |
| 2. Hook extraction | `useQuotesList.ts` with filter state, URL sync, debounced search | Stale closure in debounce callback; filter+page must reset atomically |
| 3. Filter bar + wiring | `QuoteFilterBar.tsx`, updated `QuotesList`, SSR alignment in `index.astro` | SSR/client filter mismatch causing content flash on direct URL navigation |

**Prerequisites:** Local Supabase running with quotes data for manual testing  
**Estimated effort:** ~2 sessions across 3 phases

## Open Risks & Assumptions

- `ilike` performance is fine at current data volumes (solo freelancer, hundreds of quotes at most); no FTS index needed
- `history.replaceState` is available (Cloudflare Workers serves a real browser, not a headless worker context)
- No test runner is installed — verification is manual + lint/build
