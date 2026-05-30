# Quote Management — Plan Brief

> Full plan: `context/changes/quote-management/plan.md`

## What & Why

S-01 delivered the creation flow; this slice delivers lifecycle management. A freelancer with saved quotes currently has no way to update their status, re-edit their contents, or delete them — the list is read-only. S-02 closes that gap so QuoteKit functions as a usable tool beyond the first save.

## Starting Point

`src/pages/quotes.astro` shows a static list (title + status badge, no actions). `GET /api/quotes` has a hard `.limit(100)` and no pagination. No API endpoints exist for reading a single quote, updating, or deleting. The `QuoteUpdate` type is already defined in `src/types.ts`.

## Desired End State

A freelancer can open `/quotes`, see a paginated list of their wyceny (20 per page), change a quote's status inline, and delete with a confirmation prompt. Clicking a quote opens `/quotes/:id` where they can rename the quote, adjust the status, re-edit line items, and save or delete — all backed by real API calls with per-user RLS enforcement.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| List actions | Inline (no separate edit for list actions) | Tightest scope matching roadmap; detail editing lives on the edit page |
| Status change UX | Inline select per row | Fewest clicks; matches "lightweight pipeline view" intent from PRD |
| Save UX on edit page | Explicit Save button | Clear mental model; matches existing LineItemsEditor pattern |
| Unsaved change guard | None (silent loss) | Zero extra code; acceptable for MVP with explicit Save button |
| Pagination | Offset (?page, ?limit=20) | Simple; PRD targets small data volume — cursor pagination unnecessary |
| Search / filter | Deferred to future slice | Not in S-02 scope; doesn't block core management use cases |
| Delete | Hard delete, AlertDialog confirm | PRD accepts hard delete; confirm guards against accidental loss |
| Edit page fields | Title + status + line items | All three are user-editable post-creation per user's decision |

## Scope

**In scope:**
- `GET /api/quotes/:id`, `PATCH /api/quotes/:id`, `DELETE /api/quotes/:id` endpoints
- Offset pagination on `GET /api/quotes`
- `/quotes/:id` edit page (title, status, line items, save, delete)
- `/quotes` list with inline status dropdown, delete, pagination, and row links

**Out of scope:**
- Search or filter by title/status (future slice)
- Re-triggering AI from the edit page
- Editing `inquiry_text`
- Warn-on-navigate-away for unsaved changes
- Soft delete / undo

## Architecture / Approach

Phase 1 adds the missing API endpoints and pagination. Phase 2 adds the edit page: `useQuoteEditor` hook (state + PATCH/DELETE calls), `QuoteEditor` component (status select + LineItemsEditor with editable title + delete AlertDialog), and a new SSR Astro page. A key prerequisite: `quotes.astro` must be moved to `quotes/index.astro` to make room for the `quotes/[id].astro` file. Phase 3 replaces the static Astro list with a `QuotesList` React component that handles optimistic status updates, delete, and client-side pagination.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend API | GET/:id, PATCH/:id, DELETE/:id, pagination | Wrong user_id filter could expose other users' data |
| 2. Quote edit page | Full /quotes/:id edit flow | File reorganization (quotes.astro → quotes/index.astro) must not break /quotes route |
| 3. List interactivity | Inline status/delete/pagination in /quotes list | Optimistic update revert on PATCH failure |

**Prerequisites:** F-01 (done), S-01 (done)
**Estimated effort:** ~2–3 sessions across 3 phases

## Open Risks & Assumptions

- AlertDialog from shadcn/ui may not be installed yet — `npx shadcn@latest add alert-dialog` needed in Phase 2
- Astro file reorganization (`quotes.astro` → `quotes/index.astro`) must be verified not to break the existing route
- Optimistic status update in QuotesList must revert correctly on API error

## Success Criteria (Summary)

- Freelancer can change a quote's status from the list in one click, no page reload
- Freelancer can open a saved quote, edit title/status/items, and save — changes persist across navigation
- Freelancer can delete a quote from both list and edit page, with confirmation
