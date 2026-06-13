# Manual Line Item Addition — Plan Brief

> Full plan: `context/changes/manual-line-items/plan.md`

## What & Why

Freelancers sometimes need to add a line item that AI didn't generate — a bespoke task, a travel expense, a discount row. FR-008 was parked at launch and promoted to S-06 based on user feedback. The implementation is minimal: a single button in the shared `LineItemsEditor` component.

## Starting Point

`LineItemsEditor.tsx` already supports inline cell editing via `editingCell` state and `autoFocus` on the rendered input. Items are managed entirely in React state and saved as `content.items` JSONB — no schema or API changes are needed.

## Desired End State

A "Dodaj pozycję" button sits to the left of "Zapisz wycenę" in the items table footer. Clicking it adds an empty row and immediately focuses the task cell. Save is blocked until every row has a non-empty task name. The button appears in both the creation flow (`/new`) and edit flow (`/quotes/[id]`).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Button placement | Below table, left of save button | Natural discovery point; keeps both CTAs in one row | Plan |
| Auto-focus | Yes — via `setEditingCell` to task field | Zero extra click; `autoFocus` already wired to `editingCell` condition | Plan |
| Save validation | Block save if any task is empty | Consistent with existing "no items → save disabled" guard | Plan |
| Scope | Both creation and edit flows | `LineItemsEditor` is shared — one change covers both | Plan |
| New hook? | No | `addRow` is trivial (one line); hook extraction reserved for non-trivial state machines per lessons.md | Plan |

## Scope

**In scope:** `LineItemsEditor.tsx` only — `addRow` function, "Dodaj pozycję" button, extended save-disabled condition.

**Out of scope:** DB schema changes, API changes, new components, new hooks, per-flow conditional rendering.

## Architecture / Approach

`addRow()` calls `onItemsChange([...items, {task:'', hours:0, rate:0}])` then `setEditingCell({rowIndex: items.length, field:'task'})`. The existing `autoFocus` on the task `<input>` fires when the new row renders in edit mode. No `useEffect` or ref needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. "Dodaj pozycję" button | Button + auto-focus + save guard in one component | None — change is contained to a single component with no downstream effects |

**Prerequisites:** S-01 done (LineItemsEditor exists) ✓  
**Estimated effort:** ~1 session, 1 phase

## Open Risks & Assumptions

- No risks identified — purely additive UI change with no API or schema surface.

## Success Criteria (Summary)

- "Dodaj pozycję" button visible in both creation and edit flows
- Clicking adds a row with immediate task focus; save blocked until task filled
- Manually added rows persist to DB via existing save path
