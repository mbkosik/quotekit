<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Visual Quality (Plan 2)

- **Plan**: context/changes/ui-visual-quality/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-14
- **Verdict**: APPROVED (all findings resolved or accepted)
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — AlertDialog closes before delete outcome is known

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/QuotesList.tsx:150-159
- **Detail**: The plan required the AlertDialog to stay open until the delete succeeds. shadcn's `AlertDialogAction` is internally a `<DialogClose>` — it closes the dialog immediately on click, before the fetch resolves. `isDeleting` disables the button but the dialog is already gone. If delete fails, the error surfaces through `<InlineError>` at the top of the list, but the user has lost the delete dialog context.
- **Fix A ⭐ Recommended**: Make AlertDialog controlled — add `deleteId` state, bind `open={deleteId === q.id} onOpenChange={(o) => !o && !isDeleting && setDeleteId(null)}`, close only after successful delete.
  - Strength: Implements plan contract exactly; error shown while dialog still visible.
  - Tradeoff: More state; AlertDialogTrigger becomes a plain button.
  - Confidence: HIGH — standard controlled-dialog pattern for async actions.
  - Blind spot: Verify Escape-key behavior during active delete.
- **Fix B**: Accept current behavior — document deviation; InlineError still surfaces errors clearly enough for MVP.
  - Strength: Zero code change.
  - Tradeoff: Plan intent unmet; error position unexpected.
  - Confidence: MED.
  - Blind spot: No user research on which error location is clearer.
- **Decision**: FIXED via Fix A — 16d7d2c

### F2 — ConversationCard error not migrated to InlineError

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/ConversationCard.tsx:75-92
- **Detail**: Phase 3 Change 7 explicitly listed ConversationCard as requiring InlineError migration. The component keeps a hand-rolled `<div role="alert" aria-live="assertive">` with inline Retry button. This is the only planned InlineError migration not done.
- **Fix**: Place `<InlineError message={error ?? null} />` inside the existing `<div role="alert">` (remove `aria-live` from the div since InlineError provides its own). Keep Retry button alongside.
- **Decision**: FIXED — 16d7d2c

### F3 — confirmPassword value submitted in POST body

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SignUpForm.tsx:71
- **Detail**: `<FormField id="confirmPassword" name="confirmPassword" ...>` has explicit `name` prop, so the plaintext confirm-password is transmitted in every signup POST body. Server ignores it (reads only email + password), but it's unnecessary data transmission.
- **Fix A ⭐ Recommended**: Remove the `name="confirmPassword"` prop (or set `name=""`). Verify FormField.tsx doesn't fall back to `name ?? id` — if it does, passing `name=""` prevents submission.
  - Strength: POST body no longer contains confirmPassword.
  - Tradeoff: Need to verify FormField fallback behavior.
  - Confidence: HIGH — server ignores the field; removing it is safe.
  - Blind spot: Check FormField.tsx line ~44 before applying.
- **Fix B**: Accept and document — harmless over HTTPS for MVP.
- **Decision**: FIXED — 16d7d2c

### F4 — resetTimerRef is dead code after auto-reset removal

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:54-61
- **Detail**: `resetTimerRef` is declared and a `useEffect` cleanup runs `clearTimeout(null)` on unmount (no-op). The auto-reset setTimeout was removed in Phase 5 — the ref is never assigned. The guard in `resetForm()` always evaluates false. Misleads future readers.
- **Fix**: Remove `resetTimerRef` declaration (line 54), the `useEffect` block (lines 56-61), and the clearTimeout guard inside `resetForm`.
- **Decision**: FIXED — 16d7d2c

### F5 — ClientQuestionsList "Kopiuj" button uses default variant

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Plan Adherence
- **Location**: src/components/quotes/ClientQuestionsList.tsx:55
- **Detail**: Plan Phase 2 specified `variant="outline"`. Current uses default filled variant. Hierarchy is filled (copy) > ghost (back); plan wanted outline (copy) > ghost (back).
- **Fix**: Add `variant="outline"` to the copy Button.
- **Decision**: FIXED — 16d7d2c

### F6 — QuotesList isEmpty flash during filter-clear fetch

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/QuotesList.tsx:53-58
- **Detail**: When user filters to 0 results then clears filters, during the fetch `total===0 && !hasActiveFilters` is momentarily true — the "no quotes" message flashes before real data arrives.
- **Fix**: `const isEmpty = total === 0 && !hasActiveFilters && !loading;`
- **Decision**: FIXED — 16d7d2c

### F7 — InquiryForm primary submit spinner non-canonical colors

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/quotes/InquiryForm.tsx:74
- **Detail**: Primary spinner uses `border-white/30 border-t-white`. Phase 1 canonical is `border-white/20 border-t-white/80`. Secondary spinner at line 91 was correctly updated.
- **Fix**: Change `border-white/30 border-t-white` → `border-white/20 border-t-white/80` on line 74.
- **Decision**: FIXED — 16d7d2c

### F8 — QuoteEditor delete trigger uses ghost+manual red, not destructive variant

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/QuoteEditor.tsx:55
- **Detail**: Plan specified `variant="destructive"`. Current: `variant="ghost" className="text-red-400 hover:bg-red-400/10"`. AlertDialogAction also uses manual `className="bg-red-600"`.
- **Fix**: Change trigger to `variant="destructive"` (or accept as intentional design choice).
- **Decision**: ACCEPTED-AS-RULE: Dla tymczasowych kluczy React używaj _clientId (lesson recorded; key={item.id} retained due to ref-during-render lint constraint)

### F9 — key={item.id} instead of planned key={item._clientId}

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/LineItemsEditor.tsx:105
- **Detail**: Plan specified a new `_clientId` field (client-only, never sent to API). Implementation reuses existing `id` field with `crypto.randomUUID()` in addRow. React reconciliation works correctly. Only philosophical deviation: `id` is a persisted-field-by-name.
- **Fix**: Accept as intentional (simpler, no functional bug) or add `_clientId` alongside `id` if API coupling concerns arise.
- **Decision**: FIXED — 16d7d2c
