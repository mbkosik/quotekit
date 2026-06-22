# useQuoteCreator Refactor — Implementation Plan

## Overview

Cztery addytywne zmiany porządkujące dług techniczny w okolicach `useQuoteCreator` — w kolejności priorytetowej ustalonej w `research.md`. Każda faza jest niezależna i może być zweryfikowana osobno.

## Current State Analysis

`useQuoteCreator.ts` steruje pełnym flow tworzenia wyceny przez maszynę stanów z fazami `inquiry → loading → conversation → items → saving → done`. Trzy problemy aktualnie blokują jakość codebase:

1. **Stuck state** — `handleAnswer` przy błędzie `inquiry_unusable` zostaje w `phase="conversation"` z generycznym komunikatem. `handleInquirySubmit` MA specyficzną obsługę tego błędu (wraca do inquiry), `handleAnswer` nie. `resetForm()` istnieje i jest wyeksportowany, ale nigdzie nie wystawiony jako "Zacznij od nowa" w UI konwersacji.
2. **Fałszywy pozytyw w teście** — mock dla `handleSave` w `useQuoteCreator.test.ts:161` zwraca `{ id: "q1" }`, podczas gdy `POST /api/quotes` zwraca `{ quote: result.data }`. Test przechodzi bo hook nie czyta body, ale mock nie chroni przed przyszłą regresją.
3. **Martwy endpoint** — `src/pages/api/ai/scope.ts` istnieje jako pełny handler, nigdy nie wywoływany z klienta. Jedyna referencja to import testowy w `error-sanitization.test.ts`.
4. **Rozbite kontrakty HTTP** — `ChatResponse` zdefiniowany lokalnie w hooku, schematy request/response w każdym route osobno. Zmiana kontraktu w handlerze nie wygeneruje błędu kompilacji po stronie hooka.

## Desired End State

- Użytkownik zablokowany w `phase="conversation"` po błędzie `inquiry_unusable` widzi przycisk "Zacznij od nowa" obok "Spróbuj ponownie" i może powrócić do formularza bez reloadu.
- Mock w teście `handleSave` odpowiada faktycznemu kształtowi response API.
- `src/pages/api/ai/scope.ts` nie istnieje; `error-sanitization.test.ts` nie ma importu scope.
- `src/types.ts` eksportuje 5 typów HTTP: `ChatRequest`, `ChatResponse`, `QuestionsRequest`, `QuestionsResponse`, `QuoteCreateRequest`. Hook, `chat.ts`, `questions.ts` i `quotes/index.ts` używają tych typów — zmiana kontraktu w dowolnym miejscu jest wykrywalna przez TypeScript.

### Key Discoveries

- `resetForm()` istnieje w `useQuoteCreator.ts:55–65`, eksportowany jako `actions.resetForm` w linii 239. Nie trzeba pisać nowej logiki — wystarczy dodać alias.
- `ConversationCard.tsx:76–85` — blok błędu już zawiera opcjonalny `onRetry`. `onReset` wchodzi jako drugi optional prop, renderowany tylko przy `error && onReset`.
- `QuoteCreator.tsx:46` używa `resetForm` w fazie `done` ("Utwórz nową wycenę"). Ta linia nie jest dotknięta przez Fazę 1 — `resetForm` pozostaje w actions.
- `chat.ts:11–15` — `RequestSchema` lokalny, ale już importuje `MessageSchema` i `QuoteItemSchema` z `@/types`. Dodanie `ChatResponse` z types to minimalny krok.
- `CreateSchema` w `quotes/index.ts:8–12` definiuje `{ title, inquiry_text, content: { items } }` — dokładnie ten kształt staje się `QuoteCreateRequest` w types.ts.
- `error-sanitization.test.ts:42–56` — describe block dla scope.ts testuje `messages.parse` throw. Identyczny scenariusz jest już pokryty przez "chat.ts — generate mode" (linie 78–95 tego samego pliku) — usunięcie describe bloku nie powoduje luki.

## What We're NOT Doing

- Nie zmieniamy logiki `handleAnswer` — nie rozróżniamy `inquiry_unusable` w środku hooka. Użytkownik dostaje generyczny komunikat błędu + przycisk "Zacznij od nowa" jako wyjście.
- Nie dodajemy runtime validation (Zod parse) przy `callChat` w hooku — tylko typy TypeScript.
- Nie synchronizujemy Zod schemas między routes a types.ts — zostawiamy lokalne Zod schemas w routes, dodajemy tylko TypeScript interfaces w types.ts.
- Nie wdrażamy TD-4 (expose savedQuoteId / link do detail page) — to zmiana produktowa, nie refaktor.
- Nie usuwamy podwójnej warstwy rate limitingu (TD-8) — świadome defense-in-depth.

## Implementation Approach

Fazy 1–3 są addytywne lub subtraktywne w izolacji, bez interakcji między sobą. Faza 4 dodaje typy do types.ts i aktualizuje 4 konsumentów — każdy import jest niezależny. Można fazy przeprowadzić w dowolnej kolejności, ale kolejność 1→2→3→4 odpowiada priorytetyzacji badawczej (user-visible first).

---

## Phase 1: Conversation Escape Hatch (TD-5)

### Overview

Dodaje `handleResetToInquiry` do hooka jako semantyczny alias do `resetForm()`, wciąga go do `ConversationCard` przez `QuoteCreator`, i renderuje przycisk "Zacznij od nowa" przy błędzie w trakcie konwersacji.

### Changes Required

#### 1. `useQuoteCreator.ts` — Nowa akcja w exports

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Rozszerz ciało `resetForm()` (linie 55–65) o `setError("")` — obecnie nie czyści `error` state. Następnie dodaj `handleResetToInquiry: resetForm` do obiektu `actions` (obok istniejącego `resetForm`). Alias daje konsumentowi semantycznie czytelną nazwę zamiast generycznego `resetForm`.

Uwaga: `error` nie jest widoczny w fazie inquiry (InquiryForm nie otrzymuje go jako prop), więc brak czyszczenia nie skutkuje widocznym błędem w UI — ale poprawka zapewnia faktycznie czysty stan i symetrię z `setError("")` wywoływanym przez `onRetry` w QuoteCreator.tsx.

**Contract**: `resetForm()` czyści wszystkie pola stanu włącznie z `error`. Nowy klucz `handleResetToInquiry` w obiekcie `actions` zwracanym przez hook — ten sam typ co `resetForm: () => void`. Istniejące `resetForm` pozostaje bez zmian (używane w fazie `done` przez `QuoteCreator`).

#### 2. `QuoteCreator.tsx` — Przekaż onReset do ConversationCard

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Destrukturyzuj `handleResetToInquiry` z `actions`. W bloku `phase === "conversation"` (linie 68–86) przekaż `onReset={handleResetToInquiry}` do `ConversationCard`. `onReset` jest przekazywany bezwarunkowo — ConversationCard decyduje kiedy go pokazać.

**Contract**: `ConversationCard` otrzymuje nowy prop `onReset`. Prop `onRetry` i reszta props bez zmian.

#### 3. `ConversationCard.tsx` — Przycisk "Zacznij od nowa"

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Dodaj `onReset?: () => void` do interface `Props`. W bloku błędu (linie 76–85) dodaj przycisk "Zacznij od nowa" renderowany gdy `error && onReset`. Przycisk wchodzi obok istniejącego "Spróbuj ponownie".

**Contract**: `onReset` jest opcjonalny. Przycisk pojawia się wyłącznie gdy jednocześnie `error` jest niepusty i `onReset` jest przekazany — to zachowanie spójne z `onRetry`, który jest też warunkowany errorem.

#### 4. `useQuoteCreator.test.ts` — Test dla handleResetToInquiry

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Dodaj test weryfikujący, że `handleResetToInquiry` jest eksportowany przez hook i po wywołaniu ustawia `phase` z powrotem na `"inquiry"`. Wystarczy jeden przypadek: zainicjuj hook, wymuś przejście do `phase="conversation"`, wywołaj `handleResetToInquiry`, sprawdź fazę.

**Contract**: Test żyje w nowym describe bloku lub obok istniejących testów `resetForm`. Nie duplikuje istniejącego testu re-entry guard.

### Success Criteria

#### Automated Verification

- Testy przechodzą: `npm run test` — w tym nowy test `"handleResetToInquiry resets phase to inquiry"` musi być zielony
- Lint przechodzi: `npm run lint`

#### Manual Verification

- **Happy path (błąd aktywny):** W trakcie konwersacji zasymuluj błąd (lub wymuś stan przez React DevTools: `phase="conversation"`, `error="test"`) — przy wyświetlonym błędzie widoczny jest przycisk "Zacznij od nowa" obok "Spróbuj ponownie"
- **Reset state:** Kliknięcie "Zacznij od nowa" cofa do formularza inquiry z czystym stanem — pola inquiry są puste (`inquiryText === ""`), `phase === "inquiry"`, lista wiadomości wyczyszczona
- **Niezależność retry:** Kliknięcie "Spróbuj ponownie" nadal działa niezależnie (nie woła `resetForm`)
- **Negatywny przypadek:** Przycisk "Zacznij od nowa" NIE pojawia się gdy `error` jest pusty (normalny flow konwersacji bez błędu)

---

## Phase 2: Fix Stale Test Mock (Bug testowy)

### Overview

Poprawia mock odpowiedzi dla `handleSave` w teście integracyjnym — dopasowuje do faktycznego kształtu `{ quote: { ... } }` zwracanego przez `POST /api/quotes`.

### Changes Required

#### 1. `useQuoteCreator.test.ts:161` — Poprawka mocka

**File**: `src/components/hooks/useQuoteCreator.test.ts`

**Intent**: Zmień mock w linii 161 z `jsonResponse({ id: "q1" })` na `jsonResponse({ quote: { id: "q1" } })`. Faktyczny endpoint (potwierdzone w `quotes/index.ts:63`) zwraca `{ quote: result.data }`, nie `{ id }`.

**Contract**: Tylko ta jedna linia. Test zachowuje identyczne asercje — nadal sprawdza `phase === "done"` i `savedTitle`. Hook nadal nie czyta body (istniejące zachowanie), ale mock teraz odzwierciedla rzeczywisty kontrakt API.

### Success Criteria

#### Automated Verification

- Testy przechodzą: `npm run test`

---

## Phase 3: Remove Dead Endpoint (scope.ts)

### Overview

Usuwa martwy endpoint `scope.ts` i czyści jedyny test, który go importował.

### Changes Required

#### 1. `scope.ts` — Usuń plik

**File**: `src/pages/api/ai/scope.ts`

**Intent**: Usuń plik. Endpoint nigdy nie jest wywoływany z klienta (grep potwierdził brak wywołań fetch do `/api/ai/scope` w całym `src/`). Middleware rate-limit (`/api/ai/*`) obejmował ten endpoint — po usunięciu przestaje mieć co obejmować.

**Contract**: Plik przestaje istnieć. Zero zmiany w runtime dla produkcji.

#### 2. `error-sanitization.test.ts` — Usuń import i describe block

**File**: `src/__tests__/error-sanitization/error-sanitization.test.ts`

**Intent**: Usuń linię 3 (`import { POST as scopePOST } from "@/pages/api/ai/scope"`). Usuń describe block "scope.ts — Anthropic SDK error does not leak API key" (linie 42–56). Nie zastępuj go — scenariusz `messages.parse` throw jest już pokryty przez "chat.ts — generate mode" (linie 78–95 tego samego pliku).

**Contract**: Plik traci 1 import i 1 describe block (15 linii). Pozostałe 4 describe bloki bez zmian.

### Success Criteria

#### Automated Verification

- Testy przechodzą: `npm run test`
- Lint przechodzi: `npm run lint`
- Plik `src/pages/api/ai/scope.ts` nie istnieje: `ls src/pages/api/ai/`

---

## Phase 4: Shared HTTP Contracts (TD-2)

### Overview

Dodaje 5 typów HTTP do `src/types.ts` i aktualizuje 4 konsumentów — hook zastępuje lokalną definicję importem, 3 API routes używają `satisfies` do compile-time weryfikacji kształtu response.

### Changes Required

#### 1. `src/types.ts` — Dodaj 5 typów HTTP

**File**: `src/types.ts`

**Intent**: Dodaj na końcu pliku 5 nowych wyeksportowanych typów. Czysto addytywne — zero istniejących importerów dotknięte.

**Contract**: Nowe typy:
- `ChatRequest` — `{ inquiry_text: string; messages: Message[]; generate: boolean }`
- `ChatResponse` — union: `{ type: "question"; content: string } | { type: "sparse" } | { type: "complete"; items: QuoteItem[]; title: string } | { error: string }`
- `QuestionsRequest` — `{ inquiry_text: string }`
- `QuestionsResponse` — `{ questions: string[] }`
- `QuoteCreateRequest` — `{ title: string; inquiry_text: string; content: { items: QuoteItem[] } }`

`ChatResponse` jest identyczny z lokalną definicją w `useQuoteCreator.ts:5–9` — zastępuje ją bezpośrednio.

#### 2. `useQuoteCreator.ts` — Zastąp lokalną ChatResponse importem

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Usuń lokalne `type ChatResponse` (linie 5–9). Rozszerz istniejący import z `@/types` o `ChatResponse`.

**Contract**: Import w linii 2 zmienia się z `import type { QuoteItem, Message } from "@/types"` na `import type { QuoteItem, Message, ChatResponse } from "@/types"`. Linie 5–9 usuwane. Wszystkie użycia `ChatResponse` w pliku (linia 38) niezmienione.

#### 3. `chat.ts` — Annotate request and response shapes

**File**: `src/pages/api/ai/chat.ts`

**Intent**: Zaimportuj `ChatRequest` i `ChatResponse` z `@/types`. Dodaj `satisfies ChatRequest` do parsed body po walidacji Zod (request-side). Dodaj `satisfies ChatResponse` do każdego sukcesu JSON object przekazywanego do `JSON.stringify` — kompilator wykryje drift między typem a faktycznym kształtem request/response.

**Contract**: Request-side — 1 miejsce: `parsed.data satisfies ChatRequest` (lub `void (parsed.data satisfies ChatRequest)`) przy call site Zod parse. Response-side — 4 miejsca z `JSON.stringify({ type: ..., ... })` lub `JSON.stringify({ error: ... })` w handler sukcesu otrzymują `satisfies ChatResponse`. Zwrotki błędów (401, 429, 503, 400) są poza typem — nie dodawaj `satisfies` do nich (to odpowiedzi walidacyjne, nie część kontraktu ChatResponse).

Przykład (response-side; request-side analogicznie):
```ts
import type { ChatRequest, ChatResponse } from "@/types";
// request:
void (parsed.data satisfies ChatRequest);
// response:
JSON.stringify({ type: "complete", items: result.items, title: result.title } satisfies ChatResponse)
```

#### 4. `questions.ts` — Annotate request and response shapes

**File**: `src/pages/api/ai/questions.ts`

**Intent**: Zaimportuj `QuestionsRequest` i `QuestionsResponse` z `@/types`. Dodaj `satisfies QuestionsRequest` przy call site Zod parse (request-side). Dodaj `satisfies QuestionsResponse` do JSON object w linii sukcesu.

**Contract**: Request-side — `void (parsed.data satisfies QuestionsRequest)`. Response-side — `JSON.stringify({ questions: parsedOutput.data.questions } satisfies QuestionsResponse)`.

#### 5. `quotes/index.ts` — Type assertion dla CreateSchema

**File**: `src/pages/api/quotes/index.ts`

**Intent**: Zaimportuj `QuoteCreateRequest` z `@/types`. Po parsowaniu body (`parsed.data`) dodaj type assertion weryfikującą, że Zod schema inferuje typ zgodny z `QuoteCreateRequest`.

**Contract**: Po `const { title, inquiry_text, content } = parsed.data;` (lub przy destrukturyzacji) dodaj:
```ts
import type { ..., QuoteCreateRequest } from "@/types";
// ...
void (parsed.data satisfies QuoteCreateRequest);
```
Jeśli `CreateSchema` i `QuoteCreateRequest` rozejdą się w przyszłości, TypeScript zgłosi błąd w tym miejscu. Użycie `satisfies` zamiast `const _: T = ...` jest spójne z patterniem z kroków 4.3 i 4.4 i unika ryzyka no-unused-vars ESLint.

### Success Criteria

#### Automated Verification

- Testy przechodzą: `npm run test`
- Lint przechodzi: `npm run lint`
- Build TypeScript bez błędów: `npm run build`

---

## Testing Strategy

### Unit Tests

- Faza 1: nowy test `handleResetToInquiry` resetuje phase do "inquiry"
- Fazy 2–4: istniejące testy weryfikują brak regresji; Faza 4 ma zero wpływu na runtime

### Manual Testing Steps

1. (Faza 1) Wejdź w flow konwersacji → zasymuluj stuck state (lub zmodyfikuj stan) → sprawdź przycisk "Zacznij od nowa"
2. (Faza 1) Kliknij "Zacznij od nowa" → formularz inquiry z czystym stanem
3. (Faza 3) Wyślij żądanie POST do `/api/ai/scope` → 404

## References

- Research: `context/changes/refactor-opportunities-quote-creator/research.md`
- Prior debt analysis: `context/changes/quote-creator-refactor/research.md`
- `src/components/hooks/useQuoteCreator.ts:55–65` — `resetForm()` gotowy
- `src/components/quotes/ConversationCard.tsx:76–85` — blok błędu do rozszerzenia
- `src/pages/api/ai/scope.ts` — plik do usunięcia
- `src/__tests__/error-sanitization/error-sanitization.test.ts:42–56` — describe block do usunięcia

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Conversation Escape Hatch (TD-5)

#### Automated

- [x] 1.1 Testy przechodzą: `npm run test`
- [x] 1.2 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 1.3 Przycisk "Zacznij od nowa" widoczny przy błędzie w fazie conversation
- [ ] 1.4 Kliknięcie przycisku cofa do formularza inquiry z czystym stanem
- [ ] 1.5 Przycisk "Spróbuj ponownie" nadal działa niezależnie

### Phase 2: Fix Stale Test Mock (Bug testowy)

#### Automated

- [ ] 2.1 Testy przechodzą: `npm run test`

### Phase 3: Remove Dead Endpoint (scope.ts)

#### Automated

- [ ] 3.1 Testy przechodzą: `npm run test`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 `src/pages/api/ai/scope.ts` nie istnieje

#### Manual

- [ ] 3.4 POST do `/api/ai/scope` zwraca 404

### Phase 4: Shared HTTP Contracts (TD-2)

#### Automated

- [ ] 4.1 Testy przechodzą: `npm run test`
- [ ] 4.2 Lint przechodzi: `npm run lint`
- [ ] 4.3 Build TypeScript bez błędów: `npm run build`
