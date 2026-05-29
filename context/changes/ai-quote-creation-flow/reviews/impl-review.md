<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI-Assisted Quote Creation Flow

- **Plan**: context/changes/ai-quote-creation-flow/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION (resolved through triage)
- **Findings**: 0 critical · 2 warnings · 6 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — GET /api/quotes: brak limitu wierszy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/quotes/index.ts:89
- **Detail**: Zapytanie GET zwraca nieograniczoną liczbę wycen bez .limit(). Tech debt od dnia zero.
- **Fix**: Dodaj `.limit(100)` do zapytania GET.
- **Decision**: FIXED — `.limit(100)` dodany; roadmap S-02 uzupełniony o notatkę dla pagingu/searcha/filtrowania.

### F2 — quotes.astro: Supabase null → cicha pusta lista

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/quotes.astro:10
- **Detail**: Gdy createClient zwraca null, ternary daje `{ data: null }` → "Nie masz jeszcze żadnych wycen." zamiast błędu.
- **Fix**: Null check + 503 Response gdy supabase null.
- **Decision**: FIXED — `if (!supabase) return new Response("Serwis niedostępny", { status: 503 });`

### F3 — useQuoteCreator.ts: logika poza planem

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/hooks/useQuoteCreator.ts
- **Detail**: Plan zakładał logikę state machine w QuoteCreator.tsx. Implementacja wyekstrahowała do hooka — zgodne z CLAUDE.md.
- **Fix**: Nie wymaga akcji.
- **Decision**: ACCEPTED-AS-RULE: "Logika state machine trafia do hooka, nie do komponentu" — zapisane w lessons.md.

### F4 — Topbar: czyta Astro.locals zamiast prop userEmail?

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/Topbar.astro:2
- **Detail**: Plan wymagał prop userEmail?; implementacja czyta Astro.locals bezpośrednio — prostsze i spójne.
- **Decision**: SKIPPED

### F5 — ConversationCard: skip ukryty podczas loading

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/quotes/ConversationCard.tsx:43
- **Detail**: Plan: "Pomiń zawsze aktywny". Impl: cały form chowany podczas loading. Użytkownik nie może przerwać AI.
- **Fix**: Pokaż skip poza blokiem loading.
- **Decision**: SKIPPED

### F6 — handleSave: brak in-flight guard

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:131
- **Detail**: Brak `if (phase === "saving") return;`. UI chroni przez disabled={saving}, ryzyko tylko programmatic.
- **Fix**: Guard na początku handleSave.
- **Decision**: FIXED — `if (phase === "saving") return;` dodane.

### F7 — LineItemsEditor: key={i} zamiast stabilnego id

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/quotes/LineItemsEditor.tsx:63
- **Detail**: key={i} → stale input state gdy edytowany wiersz usunięty. Reprodukowalny: edytuj wiersz → usuń wiersz powyżej.
- **Fix A**: Dodaj `id: string` do QuoteItemUI, generuj przez `crypto.randomUUID()` przy odbiorze z AI, strip przy POST, `key={item.id}`.
- **Decision**: FIXED via Fix A — `QuoteItemUI = QuoteItem & { id: string }` wyeksportowane z hooka; `withId()` dodaje id przy każdym setItems; id stripped przed POST; `key={item.id}` w LineItemsEditor.

### F8 — setTimeout reset nie czyszczony przy unmount

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useQuoteCreator.ts:143
- **Detail**: 3s timeout po zapisie odpala na odmontowanym komponencie jeśli użytkownik nawiguje wcześniej.
- **Fix**: `useRef` dla timera + `useEffect` cleanup.
- **Decision**: FIXED — `resetTimerRef` + `useEffect(() => () => clearTimeout(...), [])`.

## Triage summary

| Status | Findings |
|---|---|
| Fixed | F1, F2, F6, F7, F8 |
| Accepted-as-rule | F3 (+ lesson in lessons.md) |
| Skipped | F4, F5 |
