---
date: 2026-06-03T00:00:00+02:00
researcher: Mateusz Kosik
git_commit: 85c5ca8
branch: main
repository: quotekit
topic: "Testing AI state machine — gdzie ryzyko przechodzi przez kod, jakie zachowanie udowadnia ochronę, najtańszy test"
tags: [research, state-machine, useQuoteCreator, hooks, ai-flow, risk-3]
status: complete
last_updated: 2026-06-03
last_updated_by: Mateusz Kosik
---

# Research: Testing AI State Machine (Risk #3)

**Date**: 2026-06-03  
**Git Commit**: 85c5ca8  
**Branch**: main  
**Repository**: quotekit

## Research Question

Wyłów z researchu trzy rzeczy: gdzie ryzyko realnie przechodzi przez kod (plik / funkcja / moduł), jakie zachowanie udowodniłoby ochronę (to ma pochodzić z analizy, nie z kształtu implementacji) i jaki jest najtańszy test, który łapie to ryzyko.

---

## Summary

Risk #3 (test-plan.md §2) — „AI creation flow state machine fails: hook enters invalid state mid-conversation (stuck loading, wrong phase transition, lost line items)" — żyje wyłącznie w `src/components/hooks/useQuoteCreator.ts`. API endpoint jest bezstanowy. Ryzyko polega na tym, że błąd sieciowy lub błąd HTTP w złym momencie zostawia `phase` w stanie `loading` albo cofa użytkownika do `inquiry` gubiąc historię konwersacji. Najtańszy test to unit test hooka z mockiem `callChat` — bez Supabase, bez prawdziwego Anthropic API, bez przeglądarki.

---

## Trzy rzeczy

### 1. Gdzie ryzyko przechodzi przez kod

**Plik**: `src/components/hooks/useQuoteCreator.ts`

Cały state machine jest w tym jednym pliku. API endpoint jest stateless — ryzyko nie leży po jego stronie.

| Funkcja | Linie | Dlaczego tu leży ryzyko |
|---------|-------|-------------------------|
| `callChat()` | 13–21 | Jedyne miejsce, gdzie fetch może rzucić wyjątek. Wszystkie trzy handlery muszą go obsłużyć — jeśli `catch` jest niepełny, `phase` zostaje w `loading` |
| `handleAnswer()` | 74–110 | Najbardziej krytyczna tranzycja: błąd musi cofnąć do `conversation` (nie do `inquiry`) i zachować `messages`. Nieprawidłowy `catch` wysyła użytkownika z powrotem na start, tracąc całą historię |
| `handleSave()` | 138–164 | Błąd zapisu musi cofnąć do `items` z zachowaniem items. Nieprawidłowy `catch` lub reset `items` przy błędzie niszczy pracę edycji użytkownika |
| `phase` (state var) | 24 | Single source of truth dla całego UI — `QuoteCreator.tsx` renderuje wyłącznie na podstawie `phase`. Tranzycja przez `loading` jest zawsze przejściowa: musi zakończyć się innym stanem |

**Aktualne fazy w implementacji** (nie te z test-planu — tam były nazwy konceptualne):

```
"inquiry" → "loading" → "conversation" → "loading" → "items" → "saving" → "done"
                ↑                  ↑
            (on error, reverts)  (on error, reverts)
```

Komponent używający hooka: `src/components/QuoteCreator.tsx` — deleguje całe renderowanie na podstawie `phase`.

---

### 2. Jakie zachowanie udowadnia ochronę

Oracle pochodzi z PRD (US-01, FR-005, FR-007, FR-010) i test-plan §2 Risk #3 — **nie** z kształtu implementacji.

**Zachowanie A — błąd mid-conversation nie cofa użytkownika na start**

Podstawa w PRD: FR-005 „User can respond to AI clarifying questions" zakłada, że rozmowa jest sesją — użytkownik inwestuje czas w odpowiedzi. Błąd sieciowy nie powinien tej inwestycji niszczyć.

Konkretny test oracle: gdy `callChat()` rzuca błąd podczas `handleAnswer()` (a użytkownik był już w fazie `conversation` z ≥1 wiadomością), hook musi skończyć w `phase === "conversation"` z `messages.length > 0` i widocznym komunikatem błędu. Nigdy w `phase === "inquiry"` i nigdy z `messages === []`.

**Zachowanie B — save failure zachowuje zedytowane line items**

Podstawa w PRD: FR-007 „User can edit individual line items" + FR-010 „User can save a quote" razem implikują, że błąd zapisu nie może zniszczyć sesji edycji. Użytkownik musi móc ponowić zapis bez utraty zmian.

Konkretny test oracle: gdy `POST /api/quotes` zwraca 5xx podczas `handleSave(editedItems)`, hook musi skończyć w `phase === "items"` z `state.items` identycznym co `editedItems` (nie zresetowanym do wartości sprzed edycji, nie wyczyszczonym).

**Zachowanie C — `loading` jest zawsze przejściowe**

Podstawa w PRD: implied — żaden user story nie zakłada, że użytkownik będzie czekał w nieskończoność bez sygnału. Loading nie może być stanem terminalnym.

Konkretny test oracle: po dowolnym await (success lub error) w `handleAnswer()`, `handleSkip()`, `handleSave()` — `phase !== "loading"`.

---

### 3. Najtańszy test

**Warstwa**: unit test hooka z mockiem `callChat` / `fetch`.  
**Narzędzia**: Vitest + `@testing-library/react` (`renderHook` + `act`).  
**Brak zależności**: żadnego Supabase, żadnego Anthropic, żadnej przeglądarki.

Koszt jest minimalny, bo:
- Stan hooka jest w pełni obserwowany przez `result.current.state`
- `callChat()` jest izolowaną funkcją, którą można podmienić `vi.mock`
- Asercje są na widocznym stanie hooka — nie na internals, nie na `console.error`

**Test 1 — błąd mid-conversation (Zachowanie A)**

```ts
// Arrange
vi.mocked(callChat).mockRejectedValueOnce(new Error("network"));
const { result } = renderHook(() => useQuoteCreator());
// Ustaw hook w fazie conversation z jedną wiadomością (przez wcześniejszy udany handleAnswer)

// Act
await act(() => result.current.actions.handleAnswer("moja odpowiedź"));

// Assert
expect(result.current.state.phase).toBe("conversation");  // nie "inquiry", nie "loading"
expect(result.current.state.messages.length).toBeGreaterThan(0); // historia zachowana
expect(result.current.state.error).toBeTruthy();            // błąd widoczny
```

**Test 2 — save failure zachowuje items (Zachowanie B)**

```ts
// Arrange
vi.mocked(fetch).mockResolvedValueOnce(new Response("err", { status: 500 }));
const editedItems = [{ task: "Design", hours: 10, rate: 150 }];
// Ustaw hook w fazie items przez wcześniejszą udaną konwersację

// Act
await act(() => result.current.actions.handleSave(editedItems));

// Assert
expect(result.current.state.phase).toBe("items");           // nie "saving", nie "done"
expect(result.current.state.items).toEqual(editedItems);    // items nie zresetowane
expect(result.current.state.error).toBeTruthy();
```

Oba testy razem łapią realną regresję — zmiana w `catch` bloku `handleAnswer()` lub `handleSave()` (np. przypadkowy `setPhase("inquiry")` albo `setItems([])`) natychmiast je "czerwieni".

---

## Detailed Findings

### State machine — kompletna mapa

```
Phase: "inquiry"
  handleInquirySubmit(text) →
    loading → success(question) → "conversation" (setCurrentQuestion, questionCount=1)
    loading → success(complete) → "items"  (setItems, setTitle)
    loading → success(sparse)   → "inquiry" (setSparseMessage)
    loading → catch             → "inquiry" (setSparseMessage = error)

Phase: "conversation"
  handleAnswer(answer) →
    loading → success(question)  → "conversation" (appendMessages, setCurrentQuestion, questionCount++)
    loading → success(complete)  → "items"
    loading → success(sparse)    → "inquiry"
    loading → error in data      → "conversation" (setError, messages preserved)   ← CRITICAL PATH
    loading → catch              → "conversation" (setError, messages preserved)   ← CRITICAL PATH

  handleSkip() →
    loading → success(complete)  → "items"
    loading → other/error        → "conversation" (setError)
    loading → catch              → "conversation" (setError)

Phase: "items"
  handleSave(finalItems) →
    saving → HTTP 200           → "done" (setSavedTitle, timer→reset→"inquiry")
    saving → HTTP error / catch → "items" (setError, items unchanged)  ← CRITICAL PATH

Phase: "done"
  (auto-reset after 3s) → "inquiry" (full state reset)
```

### API endpoint — nie tu leży state machine

`src/pages/api/ai/chat.ts` jest stateless:
- Request: `{ inquiry_text, messages, generate }` (messages = pełna historia z klienta)
- Response discriminated union: `{ type: "question" }` | `{ type: "complete", items, title }` | `{ type: "sparse" }`
- Błędy Anthropic SDK: `502 "AI service error"` (generic, bez leakage credentials)
- Brak rate limiting — osobne ryzyko (#5)

Hook interpretuje te odpowiedzi i napędza state machine. To hook, nie endpoint, jest miejscem ryzyka.

---

## Code References

- `src/components/hooks/useQuoteCreator.ts:4` — `Phase` type: `"inquiry" | "loading" | "conversation" | "items" | "saving" | "done"`
- `src/components/hooks/useQuoteCreator.ts:13-21` — `callChat()` helper (abstraction boundary)
- `src/components/hooks/useQuoteCreator.ts:24` — `phase` state var (single source of truth)
- `src/components/hooks/useQuoteCreator.ts:74-110` — `handleAnswer()` (critical transition)
- `src/components/hooks/useQuoteCreator.ts:89-92` — error-in-data catch → reverts to `conversation`
- `src/components/hooks/useQuoteCreator.ts:105-108` — network error catch → reverts to `conversation`
- `src/components/hooks/useQuoteCreator.ts:138-164` — `handleSave()` (save transition)
- `src/components/hooks/useQuoteCreator.ts:161-164` — save error catch → reverts to `items`, items preserved
- `src/components/hooks/useQuoteCreator.ts:167-181` — return shape `{ state, actions }`
- `src/components/QuoteCreator.tsx:13,24,39` — `phase` drives rendering
- `src/pages/api/ai/chat.ts:13-21` — Anthropic call (question mode)
- `src/pages/api/ai/chat.ts:46-73` — `generateItems()` helper (generation mode)
- `src/types.ts:4` — `Phase` type (exported)
- `src/types.ts:6-9` — `MessageSchema`
- `src/types.ts:13-17` — `QuoteItemSchema`

---

## Architecture Insights

1. **State machine jest wyłącznie client-side.** API jest stateless — historia konwersacji istnieje tylko w `messages[]` w hooku. Utrata tej tablicy = utrata sesji. Stąd `catch` bloki muszą nigdy nie czyścić `messages`.

2. **`loading` jest stanem przejściowym, nie terminalnym.** Hook wchodzi w `loading` przed każdym await i musi z niego wyjść — zawsze. Test który asertuje `phase !== "loading"` po każdym async act to minimalny smoke test poprawności maszyny stanów.

3. **`callChat()` to jedyny punkt wejścia do sieci** z perspektywy hooka. Mock tej funkcji = pełna kontrola nad wszystkimi ścieżkami błędów bez żadnej infrastruktury.

4. **`handleSave` przyjmuje `finalItems` jako parametr** (nie czyta `state.items`). Oznacza to, że test musi przekazać `editedItems` do `handleSave()` i asertować, że po błędzie `state.items` (ustawiany przez `setItems` w poprzednich krokach) nie zostaje wyzerowany — bo hook NIE modyfikuje `items` podczas save failure, tylko cofa `phase`.

---

## Historical Context

- `context/archive/2026-05-28-ai-integration-scaffold/plan.md` — Decyzja: model `claude-haiku-4-5-20251001`, `messages.parse()` + `zodOutputFormat()` dla structured output, max 5 pytań
- `context/archive/2026-05-29-ai-quote-creation-flow/plan.md` — Implementacja kompletna (wszystkie 4 fazy: routing, endpoint, UI, save flow); lessons.md: logika state machine trafia do hooka, nie komponentu
- `context/foundation/lessons.md:46-53` — Reguła: stan hooka w `src/components/hooks/`, nie w komponencie — to też wyjaśnia dlaczego testujemy hook, nie komponent

---

## Open Questions

1. **`callChat` vs `fetch` — co dokładnie mockować?** Jeśli `callChat` jest w tym samym module co hook, `vi.mock` modułu może nie działać elegancko. Alternatywa: mock `fetch` globalnie przez `vi.stubGlobal("fetch", ...)`. Trzeba sprawdzić eksport `callChat` — czy jest eksportowana osobno czy tylko wewnętrznie w pliku hooka.

2. **Jak ustawić hook w fazie `conversation` na potrzeby testu?** Wymaga symulacji poprzednich kroków (`handleInquirySubmit` → sukces). Alternatywa: dodać `initialPhase` prop do hooka dla testability — ale to zmiana API hooka, której nie ma w planie. Prostsze: po prostu przejść przez `handleInquirySubmit` z mockiem zwracającym `{ type: "question" }`.

3. **Czy `items` w `state` po `handleSave` failure odzwierciedla `finalItems` (parametr) czy stan sprzed edycji?** Z kodu wynika: `items` state = ostatnia wartość z `setItems()`. `setItems` jest wywoływane przez `LineItemsEditor` przy każdej edycji. `handleSave` nie wywołuje `setItems` przy błędzie — więc `state.items` = ostatni stan edytora. Test powinien to potwierdzić empirycznie.
