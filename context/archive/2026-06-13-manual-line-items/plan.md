# Manual Line Item Addition — Implementation Plan

## Overview

Add a "Dodaj pozycję" button to `LineItemsEditor` that appends an empty item and immediately opens its task cell for typing. No DB or API changes — pure React state manipulation in one component, available in both creation and editing flows.

## Current State Analysis

- `LineItemsEditor.tsx` renders a table of `QuoteItem[]` with inline editing via `editingCell` state (`{rowIndex, field}`) and a `draft` string. When `editingCell.rowIndex === i && editingCell.field === 'task'`, the task cell renders `<input autoFocus>`.
- Items are passed in via `items` prop; mutations go through `onItemsChange` callback to the parent hook (`useQuoteCreator` / `useQuoteEditor`).
- Save button is currently disabled when `saving || items.length === 0 || saveDisabled`.
- The component is used by both `QuoteCreator` (creation flow, `/new`) and `QuoteEditor` (edit flow, `/quotes/[id]`) with no code duplication — a single change propagates to both.

## Desired End State

User sees a "Dodaj pozycję" button to the left of "Zapisz wycenę". Clicking it:
1. Appends `{task: '', hours: 0, rate: 0}` to the items array.
2. Immediately opens the new row's task cell in edit mode — cursor ready to type.
3. Save button is disabled until every item has a non-empty task name.

Verified: manually added rows save via the same `onSave(items)` path as AI-generated rows (no API changes needed).

### Key Discoveries

- `editingCell` + `autoFocus` pattern already exists on lines 79–101 of `LineItemsEditor.tsx` — setting `editingCell = {rowIndex: newIdx, field: 'task'}` after `onItemsChange` is sufficient for auto-focus. No `useEffect` or extra ref needed.
- `items.some(i => i.task.trim() === '')` on the existing save `disabled` guard is the save-blocking condition. Empty `hours`/`rate` default to 0 and are acceptable.
- Both `useQuoteCreator` and `useQuoteEditor` expose `setItems` — no hook changes required.

## What We're NOT Doing

- No new hook, no new component, no prop toggle.
- No changes to API, DB schema, or any other file.
- No per-flow conditional rendering — button appears unconditionally (desired in both creation and edit per user decision).
- No validation beyond task name (empty hours/rate allowed — they default to 0).

## Implementation Approach

Single targeted edit to `LineItemsEditor.tsx`:
1. Add `addRow()` that calls `onItemsChange` with the extended array and immediately sets `editingCell` to the new row's task field.
2. Wrap the save button in a `flex justify-between` row that also holds "Dodaj pozycję".
3. Extend the save-disabled condition with `items.some(i => i.task.trim() === '')`.

---

## Phase 1: "Dodaj pozycję" button in LineItemsEditor

### Overview

Single file edit. No prop interface changes. No other files touched.

### Changes Required

#### 1. LineItemsEditor — addRow function, button, save guard

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Let the user add an empty row at any time and immediately start typing its task name; block saving while any row has a blank task.

**Contract**:

Add `addRow` function after `removeRow`:

```ts
function addRow() {
  const newIdx = items.length;
  onItemsChange([...items, { task: "", hours: 0, rate: 0 }]);
  setDraft("");
  setEditingCell({ rowIndex: newIdx, field: "task" });
}
```

`onItemsChange` triggers parent re-render with the extended array; setting `editingCell` to `{rowIndex: newIdx, field: "task"}` causes the new row's task cell to render as `<input autoFocus>` on the next render (the condition at line 79 already handles this). No additional ref or `useEffect` needed.

Replace the standalone save `<button>` (lines 185–193) with a `flex justify-between` wrapper:

```tsx
<div className="flex items-center justify-between">
  <button
    onClick={addRow}
    className="rounded-lg border border-dashed border-white/20 px-4 py-2 text-sm text-white/40 transition-colors hover:border-white/40 hover:text-white/60"
  >
    + Dodaj pozycję
  </button>
  <button
    onClick={() => { onSave(items); }}
    disabled={saving || items.length === 0 || saveDisabled || items.some((i) => i.task.trim() === "")}
    className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {saving ? "Zapisuję..." : "Zapisz wycenę"}
  </button>
</div>
```

Dashed border on "Dodaj pozycję" signals an additive action without competing with the primary purple save button.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- On `/new`, after AI generates items, "Dodaj pozycję" appears to the left of "Zapisz wycenę"
- Clicking it appends a new row with the task cell immediately focused and editable
- Typing a task name and pressing Enter (or blurring) commits it
- Save button is disabled while any row has an empty task; re-enables once all tasks are non-empty
- Saving a quote with a manually added row persists — row visible when reopening at `/quotes/[id]`
- On `/quotes/[id]`, the same button and behavior appears for existing quotes in edit mode
- No regression in existing inline editing for AI-generated rows

**Implementation Note**: After automated checks pass, confirm manual verification before marking phase complete.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in → `/new` → paste a valid inquiry → complete AI flow → items table visible → click "Dodaj pozycję" → new empty row appears with task cell focused
2. Type task name, set hours and rate → "Zapisz wycenę" → reopen quote at `/quotes/[id]` → manually added row persists
3. Click "Dodaj pozycję" → without filling task, click "Zapisz wycenę" → confirm button is disabled
4. On `/quotes/[id]` → click "Dodaj pozycję" → fill in → save → reload → confirm row persists

## References

- Roadmap entry S-06: `context/foundation/roadmap.md` (lines 172–182)
- `LineItemsEditor` component: `src/components/quotes/LineItemsEditor.tsx`
- `QuoteCreator` orchestrator: `src/components/quotes/QuoteCreator.tsx`
- `QuoteEditor` orchestrator: `src/components/quotes/QuoteEditor.tsx`
- Hook pattern lesson: `context/foundation/lessons.md` (addRow is trivial enough to stay in the component — no state machine delegation needed)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: "Dodaj pozycję" button in LineItemsEditor

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 73bd630
- [x] 1.2 Build succeeds: `npm run build` — 73bd630

#### Manual

- [x] 1.3 Button visible on /new; new row added with task cell focused — 73bd630
- [x] 1.4 Save disabled with empty task; enabled when all tasks filled — 73bd630
- [x] 1.5 Manually added item persists after save (creation flow) — 73bd630
- [x] 1.6 Button and persistence work on /quotes/[id] (edit flow) — 73bd630
- [x] 1.7 No regression in existing inline editing — 73bd630
