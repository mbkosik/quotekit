# Quote Management Implementation Plan

## Overview

Add full quote management capabilities to QuoteKit: a paginated list with inline status changes and delete, a full edit page (title, status, line items), and the backing API endpoints. S-01 delivered quote creation; this slice delivers the lifecycle management that follows.

## Current State Analysis

The basic `/quotes` list page (`src/pages/quotes.astro`) exists but is read-only: it shows title and status badge per quote with no actions. No API endpoints exist for reading a single quote, updating a quote, or deleting one. `GET /api/quotes` has a hard `.limit(100)`. The `QuoteUpdate` type (`Partial<Pick<Quote, "title" | "status" | "content">>`) is already defined in `src/types.ts:32` — ready to use.

`LineItemsEditor` (`src/components/quotes/LineItemsEditor.tsx`) is the existing inline-edit table component. It accepts `{ items, title, onItemsChange, onSave, saving }`. The `title` prop renders as a static `<h2>` — a small backwards-compatible change is needed to make it editable on the edit page.

### Key Discoveries

- `src/types.ts:32` — `QuoteUpdate` already typed; no schema changes needed
- `src/pages/api/quotes/index.ts:91` — `.limit(100)` hardcoded; needs pagination
- `src/components/quotes/LineItemsEditor.tsx:8` — `onSave: (items: QuoteItem[]) => void` captures items on save; QuoteEditor can close over `title` + `status` state in the callback
- `src/pages/quotes.astro` must be moved to `src/pages/quotes/index.astro` before `/quotes/[id].astro` can exist — file and directory cannot share the same name at the same path level
- Lessons: non-trivial React state goes to a dedicated hook in `src/components/hooks/` (lessons.md)

## Desired End State

- `GET /api/quotes?page=N&limit=M` returns paginated results with total count
- `GET /api/quotes/:id`, `PATCH /api/quotes/:id`, `DELETE /api/quotes/:id` all exist and enforce per-user RLS
- `/quotes` shows a paginated list; each row has a status dropdown (saves on change) and a delete button (AlertDialog confirm)
- Each row links to `/quotes/:id`
- `/quotes/:id` loads the quote SSR; shows editable title, status select, line item table, Save button, and Delete button
- Saving persists title + status + items in one PATCH call; deleting redirects back to `/quotes`

### Key Discoveries

- `QuoteUpdate` type already in `src/types.ts` — no new types needed for API
- `LineItemsEditor.onSave` callback pattern works for edit page without breaking creation flow

## What We're NOT Doing

- No search or filter by title/status (planned as a future slice)
- No cursor-based pagination (offset is sufficient at current scale)
- No warn-on-navigate-away for unsaved edits
- No soft delete or undo
- No re-triggering AI from the edit page
- No editing of `inquiry_text`

## Implementation Approach

Three sequential phases: API first (enables manual testing of endpoints), then the edit page (depends on `GET /api/quotes/:id`), then list interactivity (depends on `PATCH` and `DELETE`). Each phase is independently testable.

## Critical Implementation Details

- **File reorganization**: Moving `quotes.astro` to `quotes/index.astro` must happen before creating `quotes/[id].astro`. The route `/quotes` is preserved — Astro treats `index.astro` identically to `quotes.astro` at the parent level.
- **RLS double-enforcement**: The `PATCH` and `DELETE` endpoints must filter by both `id` AND `user_id` (`.eq("user_id", user.id)`). Supabase RLS is the hard guardrail, but the API-level filter ensures a wrong `id` returns 404 rather than a silent 0-rows-affected.
- **onTitleChange pattern**: LineItemsEditor renders a static `<h2>` when `onTitleChange` is undefined (creation flow, unchanged). When provided, it renders an `<input>` instead — backwards-compatible, no changes to QuoteCreator.

---

## Phase 1: Backend API

### Overview

Create `src/pages/api/quotes/[id].ts` with GET, PATCH, and DELETE. Update `GET /api/quotes` to support offset pagination and return total count.

### Changes Required

#### 1. New route file for single-quote operations

**File**: `src/pages/api/quotes/[id].ts`

**Intent**: Expose three endpoints for a single quote. GET fetches the full record (including `content` with items). PATCH updates any combination of `title`, `status`, and `content`. DELETE hard-deletes the record and returns 204.

**Contract**:
- All three handlers: auth check → Supabase client → operation → response
- GET: `.select("*").eq("id", id).eq("user_id", user.id).single()` → 404 if not found, 200 with full `Quote`
- PATCH: validate body against `PatchSchema = z.object({ title: z.string().min(1).optional(), status: z.enum(["draft","sent","accepted","rejected"]).optional(), content: z.object({ items: z.array(QuoteItemSchema) }).optional() })`, then `.update(parsed.data).eq("id", id).eq("user_id", user.id).select().single()` → 404 if 0 rows updated, 200 with updated `Quote`
- DELETE: `.delete().eq("id", id).eq("user_id", user.id)` → 404 if row not found, 204 No Content on success
- Export `export const prerender = false` at top

#### 2. Pagination on GET /api/quotes

**File**: `src/pages/api/quotes/index.ts`

**Intent**: Replace the hard `.limit(100)` with offset pagination. Accept `?page` and `?limit` query params; return `{ quotes, total, page, totalPages }`.

**Contract**:
- Parse `page = Math.max(1, Number(url.searchParams.get("page") ?? "1"))` and `limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")))`
- Use `.select("id, title, status, created_at", { count: "exact" })` + `.range(from, to)` (where `from = (page-1)*limit`, `to = from+limit-1`)
- Response shape: `{ quotes: [...], total: count ?? 0, page, totalPages: Math.ceil((count ?? 0) / limit) }`

### Success Criteria

#### Automated Verification

- `npm run lint` passes on the new files
- `npm run build` completes without type errors

#### Manual Verification

- `GET /api/quotes/[valid-id]` returns 200 with full quote including `content.items`
- `GET /api/quotes/[other-users-id]` returns 404 (RLS + user_id filter)
- `PATCH /api/quotes/[id]` with `{ "status": "sent" }` returns 200 with updated quote
- `PATCH /api/quotes/[id]` with invalid status returns 400
- `DELETE /api/quotes/[id]` returns 204; subsequent GET returns 404
- `GET /api/quotes?page=1&limit=2` returns at most 2 quotes with correct `total` and `totalPages`

**Implementation Note**: Pause after this phase for manual endpoint verification before proceeding.

---

## Phase 2: Quote Edit Page

### Overview

Move `quotes.astro` → `quotes/index.astro`. Add `onTitleChange` prop to `LineItemsEditor`. Create `useQuoteEditor` hook and `QuoteEditor` component. Create the SSR page at `/quotes/:id`.

### Changes Required

#### 1. Reorganize pages directory

**File**: Rename `src/pages/quotes.astro` → `src/pages/quotes/index.astro`

**Intent**: Make room for the `quotes/` directory required for `/quotes/[id].astro`. The route `/quotes` is unchanged.

**Contract**: Content stays identical during the move. No functional changes.

#### 2. Add optional editable title to LineItemsEditor

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Allow the edit page to make the title heading editable without touching the creation flow.

**Contract**: Add `onTitleChange?: (title: string) => void` to `Props`. Where the component renders `<h2 className="text-xl font-semibold text-white">{title}</h2>`, conditionally render an `<input>` styled to match when `onTitleChange` is defined:
```tsx
{onTitleChange ? (
  <input
    value={title}
    onChange={(e) => onTitleChange(e.target.value)}
    className="text-xl font-semibold text-white bg-transparent border-b border-white/20 outline-none focus:border-white/60 pb-1"
  />
) : (
  <h2 className="text-xl font-semibold text-white">{title}</h2>
)}
```
QuoteCreator passes no `onTitleChange` — behaviour is unchanged.

#### 3. useQuoteEditor hook

**File**: `src/components/hooks/useQuoteEditor.ts`

**Intent**: Encapsulate all state and async logic for editing a saved quote: managing `title`, `status`, and `items` state; calling PATCH on save; calling DELETE and redirecting on delete.

**Contract**: 
```ts
function useQuoteEditor(initial: Pick<Quote, "id" | "title" | "status" | "content">): {
  title: string;
  status: QuoteStatus;
  items: QuoteItem[];
  saving: boolean;
  error: string | null;
  setTitle: (t: string) => void;
  setStatus: (s: QuoteStatus) => void;
  setItems: (items: QuoteItem[]) => void;
  handleSave: (currentItems: QuoteItem[]) => Promise<void>;
  handleDelete: () => Promise<void>;
}
```
- `handleSave(currentItems)`: calls `PATCH /api/quotes/:id` with `{ title, status, content: { items: currentItems } }`; sets `saving` during the call; sets `error` on failure
- `handleDelete()`: calls `DELETE /api/quotes/:id`; on 204 navigates to `/quotes` via `window.location.href`; sets `error` on failure

#### 4. QuoteEditor component

**File**: `src/components/quotes/QuoteEditor.tsx`

**Intent**: Render the full edit page UI: status select at the top, line items table with editable title, save button (via LineItemsEditor), and delete button with AlertDialog confirmation.

**Contract**:
- Props: `{ quote: Quote }` (initial data from SSR)
- Uses `useQuoteEditor(quote)` for all state and handlers
- Renders a status `<select>` bound to `status` / `setStatus` above the LineItemsEditor
- Passes `onTitleChange={setTitle}` and `onSave={handleSave}` and `onItemsChange={setItems}` to LineItemsEditor
- Renders a "Usuń wycenę" button that opens an `AlertDialog` (shadcn/ui); on confirm calls `handleDelete()`
- Shows `error` string in a red text block when non-null
- Requires `npx shadcn@latest add alert-dialog` if AlertDialog is not yet installed

#### 5. Quote edit page

**File**: `src/pages/quotes/[id].astro`

**Intent**: SSR page that loads the full quote by ID and passes it to QuoteEditor. Returns 404 if not found or not owned by the current user.

**Contract**:
- Auth guard: redirect to `/auth/signin` if not logged in
- Extract `id` from `Astro.params.id`
- Call `supabase.from("quotes").select("*").eq("id", id).eq("user_id", user.id).single()`
- If `error` or `!data`: return `new Response(null, { status: 404 })`
- Render `<QuoteEditor quote={data} client:load />`
- Add `/quotes/:id` to `PROTECTED_ROUTES` in `src/middleware.ts` — or rely on the auth guard in the page itself (the existing pattern in `dashboard.astro` uses an in-page redirect, not middleware)

### Success Criteria

#### Automated Verification

- `npm run lint` passes on all modified/new files
- `npm run build` completes without type errors
- `src/pages/quotes/index.astro` exists (route `/quotes` works)

#### Manual Verification

- `/quotes` still loads and shows the list after the file move
- Navigating to `/quotes/[valid-id]` shows the edit page with correct title, status, and line items
- Navigating to `/quotes/[unknown-id]` returns a 404
- Editing title (typing in the title input) updates the heading in real-time
- Changing status select updates the local value
- Editing a line item cell and blurring persists the change in-page
- Clicking "Zapisz wycenę" with changes calls PATCH and shows a brief loading state
- After save, navigating away and back shows the updated data
- Clicking "Usuń wycenę" opens the AlertDialog; cancelling does nothing; confirming deletes and redirects to `/quotes`

**Implementation Note**: Pause for manual verification of the full edit flow before proceeding.

---

## Phase 3: Quote List Interactivity

### Overview

Replace the static Astro list with a `QuotesList` React component that supports inline status change, delete confirmation, pagination, and links to the edit page. Update `quotes/index.astro` to fetch the first page server-side and pass it as initial data.

### Changes Required

#### 1. QuotesList component

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Render an interactive paginated list of quotes. Each row links to the edit page, has an inline status dropdown, and a delete button with AlertDialog confirmation. Pagination controls at the bottom.

**Contract**:
- Props: `{ initialQuotes: Quote[], initialTotal: number, pageSize: number }`
- Local state: `quotes`, `total`, `currentPage`, `loading`
- `handleStatusChange(id, newStatus)`: calls `PATCH /api/quotes/:id { status: newStatus }`; optimistic update (update local state immediately, revert on error)
- `handleDelete(id)`: opens AlertDialog; on confirm calls `DELETE /api/quotes/:id`; removes row from local `quotes` state; updates `total`
- `handlePageChange(page)`: calls `GET /api/quotes?page=N&limit=pageSize`; replaces `quotes` state
- Each row: title as `<a href="/quotes/{id}">` link, status `<select>` (values: draft/sent/accepted/rejected with Polish labels), delete button triggering AlertDialog
- Pagination: "Poprzednia" / "Następna" buttons; disabled when at bounds; current page indicator
- Empty state: "Nie masz jeszcze żadnych wycen." paragraph
- `STATUS_LABELS` map (same as current `quotes.astro:20–25`) defined inside the component

#### 2. Update quotes/index.astro

**File**: `src/pages/quotes/index.astro`

**Intent**: Fetch first page of quotes server-side for instant paint; delegate all interactivity to QuotesList.

**Contract**:
- Replace the direct `.select("id, title, status, created_at").limit(100)` query with a paginated one: `.select("id, title, status, created_at", { count: "exact" }).range(0, PAGE_SIZE - 1)` where `PAGE_SIZE = 20`
- Pass `initialQuotes={quotes ?? []}`, `initialTotal={count ?? 0}`, `pageSize={PAGE_SIZE}` to `<QuotesList client:load />`
- Remove the inline `ul` / `li` rendering from Astro (QuotesList owns the list UI now)

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` completes without type errors

#### Manual Verification

- `/quotes` loads instantly with the first page of quotes (SSR initial data visible without JS)
- Changing a status dropdown in the list calls PATCH and updates the badge without page reload
- Changing status to an invalid value (shouldn't be possible via UI) shows an error toast or message
- Clicking delete opens AlertDialog; confirming removes the row; cancelling does not
- With more than 20 quotes: pagination controls appear; "Następna" loads the next page; "Poprzednia" goes back
- With 0 quotes: empty state message shown
- Clicking a quote title navigates to `/quotes/:id`

**Implementation Note**: Pause for full manual regression test: creation flow (S-01) still works, list interactivity works, edit page updates are reflected in the list after navigating back.

---

## Testing Strategy

### Manual Testing Steps

1. Create a new quote via `/new` — confirm it appears in `/quotes` with status "draft"
2. Change its status to "sent" from the list — confirm the badge updates
3. Navigate to the edit page via the row link — confirm data matches
4. Edit title, change a line item, change status to "accepted" on edit page — save — navigate back to list — confirm all changes are reflected
5. Delete from the edit page — confirm redirect to `/quotes` and row is gone
6. Delete from the list — confirm row disappears without page reload
7. Create 21+ quotes; confirm pagination controls appear and work

## Migration Notes

No database schema changes. No data migrations required. The existing `quotes` table and RLS policies are unchanged.

## References

- Roadmap S-02: `context/foundation/roadmap.md:113–125`
- PRD FR-011, FR-012, FR-013: `context/foundation/prd.md:102–109`
- Existing types: `src/types.ts`
- Existing API pattern: `src/pages/api/quotes/index.ts`
- LineItemsEditor: `src/components/quotes/LineItemsEditor.tsx`
- useQuoteCreator (pattern reference): `src/components/hooks/useQuoteCreator.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend API

#### Automated

- [x] 1.1 `npm run lint` passes on new/modified API files
- [x] 1.2 `npm run build` completes without type errors

#### Manual

- [x] 1.3 GET /api/quotes/:id returns 200 with full quote for own record
- [x] 1.4 GET /api/quotes/:id returns 404 for another user's record
- [x] 1.5 PATCH /api/quotes/:id with `{ "status": "sent" }` returns 200 with updated quote
- [x] 1.6 PATCH /api/quotes/:id with invalid status returns 400
- [x] 1.7 DELETE /api/quotes/:id returns 204; subsequent GET returns 404
- [x] 1.8 GET /api/quotes?page=1&limit=2 returns at most 2 quotes with correct total and totalPages

### Phase 2: Quote Edit Page

#### Automated

- [ ] 2.1 `npm run lint` passes on all modified/new files
- [ ] 2.2 `npm run build` completes without type errors
- [ ] 2.3 `src/pages/quotes/index.astro` exists

#### Manual

- [ ] 2.4 /quotes still loads after the file move
- [ ] 2.5 /quotes/:id shows edit page with correct title, status, and line items
- [ ] 2.6 /quotes/:unknown-id returns 404
- [ ] 2.7 Title input updates heading in real-time
- [ ] 2.8 Save button calls PATCH and persists all changes
- [ ] 2.9 Delete button opens AlertDialog; confirming deletes and redirects to /quotes

### Phase 3: Quote List Interactivity

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` completes without type errors

#### Manual

- [ ] 3.3 Status dropdown change saves via PATCH without page reload
- [ ] 3.4 Delete from list removes row via DELETE without page reload
- [ ] 3.5 Pagination controls appear with 20+ quotes and navigate correctly
- [ ] 3.6 Empty state message shown with 0 quotes
- [ ] 3.7 Row title links to /quotes/:id
- [ ] 3.8 Full regression: S-01 creation flow still works end-to-end
