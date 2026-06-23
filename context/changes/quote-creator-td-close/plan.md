# Quote Creator TD Close — Implementation Plan

## Overview

Domknięcie 4 otwartych pozycji z `context/changes/quote-creator-refactor/research.md`: TD-1 (URL constants), TD-3 (client-side min-20 validation), TD-4 (savedQuoteId po zapisie), TD-6 (brakujące testy dla 3 handlerów). TD-2 i TD-5 są już zamknięte w poprzednim refaktorze.

## Current State Analysis

- `useQuoteCreator.ts`: 3 hardcoded URL strings (L16, L29, L202), brak walidacji min-20 przed callChat, handleSave nie czyta body response po zapisie
- `QuoteCreator.tsx`: success screen linkuje do `/quotes` (lista), nie do konkretnej wyceny
- `useQuoteCreator.test.ts`: brak testów dla `handleSkip`, `handleGenerateQuestions`, `handleBackFromQuestions`; mock w re-entry guard (L344) zwraca `{ id: "q1" }` zamiast `{ quote: { id: "q1" } }`
- Strona `/quotes/[id].astro` istnieje — link do konkretnej wyceny jest wykonywalny

## Desired End State

- Trzy URL-e hooka są stałymi TypeScript — zmiana route = błąd kompilatora zamiast `grep`
- Zapytanie krótsze niż 20 znaków nie trafia do API — użytkownik dostaje natychmiastowy komunikat
- Po zapisie wyceny success screen daje link bezpośrednio do `/quotes/:id`
- Każdy z 3 brakujących handlerów ma co najmniej happy-path + network-error test

### Key Discoveries

- `chat.ts:13`: `z.string().min(20)` — API zwraca 400 przy krótszym inquiry; hook traktował to jak błąd sieciowy (`useQuoteCreator.ts:34`)
- `quotes/index.ts:63`: response `{ quote: Quote }` był całkowicie ignorowany przez hook
- `/pages/quotes/[id].astro` istnieje — link docelowy jest poprawny
- Re-entry guard test (L344): mock `{ id: "q1" }` zamiast `{ quote: { id: "q1" } }` — po TD-4 musiałby zwrócić undefined na `data.quote.id`
- Golden path test (L161): mock już poprawny (`{ quote: { id: "q1" } }`) — tylko brak asercji

## What We're NOT Doing

- TD-7 (testy komponentowe QuoteCreator.tsx) — poza zakresem
- TD-8 (double rate limiting) — decyzja architektoniczna
- Walidacja w czasie rzeczywistym (real-time) — tylko on-submit
- Zmiana error message dla 429 — `is429()` obsługuje to systemowo

## Implementation Approach

Trzy oddzielne fazy: najpierw hook-only zmiany (TD-1, TD-3), potem zmiany state shape hook + consumer (TD-4), na końcu testy (weryfikacja wszystkich faz + domknięcie TD-6).

---

## Phase 1: URL Constants + Client Validation

### Overview

Dwie izolowane poprawki w `useQuoteCreator.ts` bez zmiany sygnatury ani kształtu stanu.

### Changes Required

#### 1. URL constants

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Wyciągnąć 3 hardcoded string literals do stałych modułowych powyżej `RATE_LIMIT_MSG`. Zastąpić L16, L29, L202 tymi stałymi.

**Contract**: Trzy stałe na poziomie modułu: `API_QUESTIONS_URL = "/api/ai/questions"`, `API_CHAT_URL = "/api/ai/chat"`, `API_QUOTES_URL = "/api/quotes"`. Użyte wyłącznie w tym pliku.

#### 2. Min-20 guard w handleInquirySubmit

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Przed wywołaniem API sprawdzić, czy `text.trim().length < 20`. Jeśli tak — ustawić `sparseMessage` i zwrócić bez przejścia do `phase="loading"`. Eliminuje HTTP 400 z błędnym komunikatem "Błąd połączenia z AI".

**Contract**: Guard wstawiony **przed** `setInquiryText(text)` — faza nigdy nie wchodzi w `"loading"` dla krótkich inputów. Używa `sparseMessage` (istniejący slot), nie nowej zmiennej stanu.

```typescript
if (text.trim().length < 20) {
  setSparseMessage("Opis jest za krótki — podaj co najmniej 20 znaków.");
  return;
}
```

### Success Criteria

#### Automated Verification

- `npm run lint` przechodzi bez błędów

#### Manual Verification

- Wpisanie "Test" i submit InquiryForm → komunikat pod formularzem, brak network call
- Wpisanie 20+ znaków → normalne przejście do `phase="loading"`

---

## Phase 2: savedQuoteId

### Overview

Hook odczytuje ID nowo stworzonej wyceny z response body i eksponuje je w stanie. Komponent używa go do przekierowania na konkretną wycenę.

### Changes Required

#### 1. Stan savedQuoteId w hooku

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Dodać `savedQuoteId` jako 13. zmienna stanu. Wyczyścić w `resetForm()`. Wypełnić w `handleSave` po sukcesie. Wyeksponować w zwracanym `state`.

**Contract**:
- `const [savedQuoteId, setSavedQuoteId] = useState("");` — obok `savedTitle`
- `resetForm()`: dodać `setSavedQuoteId("")`
- `handleSave`: po `if (!res.ok) throw ...` odczytać body i ustawić ID:

```typescript
const data = (await res.json()) as { quote: { id: string } };
setSavedQuoteId(data.quote.id);
setSavedTitle(title);
setPhase("done");
```

- Zwracany `state` rozszerzyć o `savedQuoteId`

#### 2. Link do konkretnej wyceny w success screen

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Zastąpić link `/quotes` (lista) linkiem do `/quotes/${savedQuoteId}` z tekstem "Otwórz wycenę". Jeden fokusowany CTA zamiast ogólnego linku do listy.

**Contract**: W bloku `phase === "done"` — zmienić `href="/quotes"` na `href={`/quotes/${savedQuoteId}`}` i tekst na "Otwórz wycenę". Destructurize `savedQuoteId` z `state` obok `savedTitle`.

### Success Criteria

#### Automated Verification

- `npm run lint` przechodzi bez błędów

#### Manual Verification

- Pełny flow inquiry → conversation → items → save → success screen pokazuje "Otwórz wycenę" z linkiem do `/quotes/:id`
- Klik linka otwiera stronę konkretnej wyceny

---

## Phase 3: Tests

### Overview

Aktualizacja dwóch istniejących testów (poprawny mock + nowa asercja dla TD-4), dodanie 1 testu TD-3, dodanie 5 testów TD-6.

### Changes Required

#### 1. Poprawka mocka w re-entry guard

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Test `handleSave re-entry guard` (L344) używa mocka `{ id: "q1" }`. Po TD-4 hook czyta `data.quote.id` — mock musi zwracać `{ quote: { id: "q1" } }`.

**Contract**: Zmienić `JSON.stringify({ id: "q1" })` → `JSON.stringify({ quote: { id: "q1" } })` w `resolveSave(...)` wewnątrz tego describe block.

#### 2. Asercja savedQuoteId w Golden path

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Golden path (L161) już mockuje `{ quote: { id: "q1" } }` — dodać asercję sprawdzającą `savedQuoteId`.

**Contract**: Po `expect(result.current.state.phase).toBe("done")` dodać:
```typescript
expect(result.current.state.savedQuoteId).toBe("q1");
```

#### 3. Test walidacji min-20 (TD-3)

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Dodać test do istniejącego describe `"handleInquirySubmit error and edge paths"` — weryfikuje, że krótki input nie wywołuje fetch i zwraca sparseMessage.

**Contract**: Wywołanie `handleInquirySubmit("Too short")` (< 20 znaków) → `phase === "inquiry"`, `sparseMessage` truthy, `fetchMock` nie wywołany.

#### 4. Tests: handleSkip

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Nowy describe `"handleSkip triggers generation"`. Dwa testy: happy path (→ items) i network error (→ conversation, error truthy).

**Contract**:
- Setup dla obu testów: `handleInquirySubmit` z mockiem `{ type: "question", ... }` → `phase="conversation"`
- Happy path: `handleSkip()` z mockiem `{ type: "complete", items, title }` → `phase === "items"`, items i title ustawione
- Error: `handleSkip()` z `Promise.reject` → `phase === "conversation"`, `error` truthy

#### 5. Tests: handleGenerateQuestions

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Nowy describe `"handleGenerateQuestions fetches questions"`. Dwa testy: happy path (→ questions) i network error (→ inquiry, sparseMessage truthy).

**Contract**:
- Happy path: `handleGenerateQuestions("long enough text")` z mockiem `{ questions: ["Q1?", "Q2?", "Q3?"] }` → `phase === "questions"`, `clientQuestions` ustawione
- Error: `handleGenerateQuestions(...)` z `Promise.reject` → `phase === "inquiry"`, `sparseMessage` truthy

#### 6. Test: handleBackFromQuestions

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Nowy describe `"handleBackFromQuestions resets to inquiry"`. Jeden test: osiągnij `questions` przez `handleGenerateQuestions`, potem `handleBackFromQuestions()` → `phase="inquiry"`, `clientQuestions=[]`.

**Contract**: Synchroniczne wywołanie `handleBackFromQuestions()` w `act(() => { ... })`. Asercje: `phase === "inquiry"`, `clientQuestions.length === 0`.

### Success Criteria

#### Automated Verification

- `npx vitest run` — wszystkie testy zielone (poprzednie + 8 nowych/zaktualizowanych)
- `npm run lint` — brak błędów

#### Manual Verification

- Brak regresji w golden path i pozostałych testach

---

## Testing Strategy

### Unit Tests

- TD-3: krótki input nie trafia do sieci
- TD-4: savedQuoteId po zapisie (golden path update)
- TD-6: handleSkip (success + network error), handleGenerateQuestions (success + network error), handleBackFromQuestions (reset)

### Manual Testing Steps

1. `/quotes/new` → wpisać < 20 znaków → błąd bez network call
2. Pełny flow → success screen → "Otwórz wycenę" prowadzi do `/quotes/:id`
3. `npm run lint && npx vitest run` — wszystko zielone

## References

- Research: `context/changes/quote-creator-refactor/research.md`
- Hook: `src/components/hooks/useQuoteCreator.ts`
- Component: `src/components/quotes/QuoteCreator.tsx`
- Tests: `src/components/hooks/useQuoteCreator.test.ts`
- API response type: `src/types.ts:22` (`Quote`)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: URL Constants + Client Validation

#### Automated

- [x] 1.1 `npm run lint` przechodzi bez błędów — 9a02440

#### Manual

- [x] 1.2 Input < 20 znaków → sparseMessage, brak network call — 9a02440
- [x] 1.3 Input 20+ znaków → normalne przejście do loading — 9a02440

### Phase 2: savedQuoteId

#### Automated

- [x] 2.1 `npm run lint` przechodzi bez błędów — c3ffb3a

#### Manual

- [x] 2.2 Success screen pokazuje "Otwórz wycenę" z linkiem do `/quotes/:id` — c3ffb3a
- [x] 2.3 Klik linka otwiera konkretną wycenę — c3ffb3a

### Phase 3: Tests

#### Automated

- [x] 3.1 `npx vitest run` — wszystkie testy zielone
- [x] 3.2 `npm run lint` przechodzi bez błędów
