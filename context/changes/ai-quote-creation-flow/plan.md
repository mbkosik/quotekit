# AI-Assisted Quote Creation Flow Implementation Plan

## Overview

Zbuduj end-to-end flow tworzenia wyceny: freelancer wkleja zapytanie klienta na stronie `/new`, AI zadaje pytania wyjaśniające jedno po jednym (card-by-card, max 5, z przyciskiem "pomiń"), po konwersacji generuje listę pozycji z tytułem, freelancer edytuje je inline i zapisuje jako draft. Po zapisie agent resetuje się do pustego formularza, toast potwierdza zapis.

## Current State Analysis

- `/dashboard` to stub — tylko welcome + sign out; do usunięcia
- Brak stron do tworzenia lub przeglądania wycen
- `/api/ai/scope` istnieje jako scaffold (single-call inquiry → items) — nie jest używany w S-01; pozostaje bez zmian
- `quotes` tabela z pełnymi politykami RLS gotowa w Supabase
- Typy `Quote`, `QuoteItem`, `QuoteItemSchema`, `QuoteInsert` gotowe w `src/types.ts`
- Pattern React island: `client:load` + props z Astro page (wzorzec z auth)
- Pattern API route: `POST: APIRoute` z Zod + `context.locals.user` guard (wzorzec z `/api/ai/scope`)
- `createAnthropicClient()` z `src/lib/anthropic.ts` do reużycia
- Dostępne: `button.tsx` (shadcn), `lucide-react`, `cn()` helper

### Key Discoveries

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]` — trzeba zaktualizować na `["/new", "/quotes"]`
- `src/types.ts` — `QuoteItemSchema` (Zod) + `QuoteItem` (infer) gotowe; `QuoteInsert = Omit<Quote, "id"|"user_id"|"created_at"|"updated_at">`
- `src/lib/anthropic.ts` — `createAnthropicClient(): Anthropic | null` — wzorzec null-guard do reużycia
- `src/pages/api/ai/scope.ts` — wzorzec endpointu: auth guard → null-guard → Zod safeParse → try/catch → `messages.parse()` z `zodOutputFormat`
- Anthropic SDK: multi-turn = przekazywanie pełnej tablicy `messages[]` przy każdym wywołaniu; API jest całkowicie stateless — idealne dla Workers

## Desired End State

`/new` to główny widok po zalogowaniu. Niezalogowany użytkownik trafiający na `/new` lub `/quotes` jest redirectowany do `/auth/signin`. Zalogowany freelancer może przejść pełny flow: wkleić zapytanie → odpowiedzieć na pytania AI (lub pominąć) → edytować pozycje inline → zapisać wycenę. Po zapisie agent resetuje się, toast potwierdza tytuł wyceny i link do `/quotes` (stub). `/dashboard` nie istnieje.

## What We're NOT Doing

- Brak edycji istniejących wycen (S-02)
- Brak zmiany statusu wycen (S-02)
- Brak usuwania wycen (S-02)
- Brak ręcznego dodawania pozycji (FR-008 — nice-to-have v2)
- Brak rate limiting na endpointach AI (pre-launch gate — patrz roadmap S-01)
- Brak reużywania `/api/ai/scope` w S-01 — ten endpoint pozostaje jako scaffold
- Brak pełnej strony `/quotes` (stub do S-02)
- Brak topbar linków do `/quotes`/`/settings` (strony nie istnieją)

## Implementation Approach

Cztery sekwencyjne fazy. Faza 1 tworzy routing i shell — weryfikowalna bez AI. Faza 2 buduje endpoint AI — weryfikowalna przez curl. Faza 3 buduje cały React island wired do fazy 2. Faza 4 dodaje CRUD quotes i domyka flow.

## Critical Implementation Details

**Multi-turn Anthropic API — mechanizm:** przy każdym wywołaniu client przesyła pełną historię rozmowy jako `messages[]`. Endpoint jest stateless — Workers nie przechowują żadnego stanu konwersacji. Historia jest trzymana w React state po stronie klienta.

**Dwa tryby `/api/ai/chat`:** gdy `generate: false` → `client.messages.create()` zwraca plain text (pytanie lub sentinel DONE/TOO_SHORT); gdy `generate: true` → `client.messages.parse()` z `zodOutputFormat(ChatOutputSchema)` zwraca strukturalne `{items, title}`. Sentinel DONE w trybie pytań oznacza, że AI ma wystarczająco informacji — endpoint automatycznie przechodzi do generacji w tym samym requestcie (jeden dodatkowy call).

**Sparse guard:** gdy AI zwraca sentinel `TOO_SHORT` (brief za krótki) → endpoint zwraca `{type: "sparse"}` → client wyświetla inline komunikat pod formularzem, nie resetuje tekstu.

**Inline editing:** kliknięcie w komórkę Task/Hours/Rate aktywuje `<input>` w miejscu tekstu. `onBlur` zatwierdza zmiany w lokalnym state. Subtotal = `hours × rate` — wyliczany, nigdy edytowalny.

---

## Phase 1: Routing & Navigation

### Overview

Usuń `/dashboard`, dodaj `/new` i `/quotes` (stub), zaktualizuj chronione routy w middleware, zaktualizuj topbar dla nowego layoutu.

### Changes Required

#### 1. Usuń `src/pages/dashboard.astro`

**File**: `src/pages/dashboard.astro`

**Intent**: Strona przestaje istnieć. Route `/dashboard` zwraca 404.

**Contract**: Plik usunięty.

#### 2. Zaktualizuj `PROTECTED_ROUTES` w middleware

**File**: `src/middleware.ts`

**Intent**: `/new` i `/quotes` są teraz chronione (wymagają logowania). `/dashboard` usunięty z listy.

**Contract**: `PROTECTED_ROUTES = ["/new", "/quotes"]`

#### 3. Zaktualizuj `src/components/Topbar.astro`

**File**: `src/components/Topbar.astro`

**Intent**: Topbar dla zalogowanych użytkowników: logo "QuoteKit" po lewej, email użytkownika + przycisk sign out po prawej. Przyjmuje prop `userEmail?: string`.

**Contract**: Eksportuje props interface z opcjonalnym `userEmail`. Formularz sign out POSTuje na `/api/auth/signout` (jak w obecnym dashboard).

#### 4. Stwórz `src/pages/new.astro`

**File**: `src/pages/new.astro`

**Intent**: Główna chroniona strona — shell montujący `QuoteCreator` island. Przekazuje `userEmail` z `Astro.locals.user` do topbara.

**Contract**: Imports: `Layout`, `Topbar`, `QuoteCreator`. Montuje `<QuoteCreator client:load />`. Używa `Astro.locals.user` dla topbara.

#### 5. Stwórz `src/pages/quotes.astro` (stub)

**File**: `src/pages/quotes.astro`

**Intent**: Stub-strona listy wycen. Wyświetla tylko placeholder "Twoje wyceny — wkrótce". S-02 zastąpi tę stronę pełnym widokiem.

**Contract**: Chroniona strona (objęta PROTECTED_ROUTES). Minimalne markup — nagłówek + komunikat placeholder.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- `/new` ładuje się (pusta strona z topbarem, bez treści — island zostanie dodany w fazie 3)
- `/dashboard` zwraca 404
- `/quotes` ładuje się ze stubem
- Niezalogowany użytkownik trafiający na `/new` jest redirectowany do `/auth/signin`

**Implementation Note**: Poczekaj na ręczną weryfikację przed przejściem do Phase 2.

---

## Phase 2: AI Conversation Endpoint

### Overview

Nowy endpoint `POST /api/ai/chat` obsługuje cały multi-turn flow: tryb pytań (zwraca jedno pytanie) i tryb generacji (zwraca pozycje + tytuł). Client zarządza historią po swojej stronie.

### Changes Required

#### 1. Stwórz `src/pages/api/ai/chat.ts`

**File**: `src/pages/api/ai/chat.ts`

**Intent**: Stateless multi-turn endpoint AI. Dwa tryby sterowane przez `generate` flag. Wzorzec auth/error handling identyczny jak w `src/pages/api/ai/scope.ts`.

**Contract**:

```typescript
// Request schema
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const RequestSchema = z.object({
  inquiry_text: z.string().min(20),
  messages: z.array(MessageSchema),
  generate: z.boolean().default(false),
});

// Response types (JSON)
// { type: "question", content: string }
// { type: "sparse" }
// { type: "complete", items: QuoteItem[], title: string }
// Error: { error: string }
```

**Tryb pytań (`generate: false`):**
- Wywołaj `client.messages.create()` z system promptem nakazującym zadać JEDNO pytanie wyjaśniające lub zwrócić sentinel `DONE` / `TOO_SHORT`
- Wiadomości: `[{ role: "user", content: "Zapytanie: {inquiry_text}" }, ...messages]`
- Gdy odpowiedź to `TOO_SHORT` → zwróć `{ type: "sparse" }`
- Gdy odpowiedź to `DONE` → automatycznie przejdź do trybu generacji (drugi call w tym samym requescie)
- W przeciwnym razie → zwróć `{ type: "question", content: responseText }`

**Tryb generacji (`generate: true` lub po DONE):**
- Zbuduj user message: `inquiry_text` + sformatowane Q&A z `messages[]`
- Wywołaj `client.messages.parse()` z `zodOutputFormat(ChatOutputSchema)`
- `ChatOutputSchema = z.object({ items: z.array(QuoteItemSchema), title: z.string() })`
- `parsed_output?.items` → fallback `[]` → jeśli puste → 422 `inquiry_too_short`
- Zwróć `{ type: "complete", items, title }`

**System prompt (tryb pytań):**
Kontekst freelancera junior, polska scena freelance. Zadaj JEDNO konkretne pytanie o zakres, tech stack, termin, budżet klienta lub podobne. Nie zadawaj pytania ogólnego. Jeśli masz wystarczająco informacji — odpowiedz TYLKO: `DONE`. Jeśli zapytanie jest za krótkie lub nieczytelne — odpowiedz TYLKO: `TOO_SHORT`.

**System prompt (tryb generacji):**
Identyczny jak w `src/pages/api/ai/scope.ts:SYSTEM_PROMPT` — kopiuj bez zmian.

**Guard sequence** (wzorzec z scope.ts): 401 → 503 → 400 → try/catch API call → 502 → logika odpowiedzi.

### Success Criteria

#### Automated Verification

- `npm run lint` passes na `src/pages/api/ai/chat.ts`
- `npm run build` passes

#### Manual Verification

- Unauthenticated → 401
- `inquiry_text` < 20 znaków → 400
- `{ inquiry_text: "...", messages: [], generate: false }` → `{ type: "question", content: "..." }`
- `{ ..., generate: true }` z sensownym briefem → `{ type: "complete", items: [...], title: "..." }`
- Nonsensowny brief + `generate: true` → 422 `inquiry_too_short`

**Implementation Note**: Testuj przez curl z ciasteczkiem sesji (jak w F-02). Weryfikacja przed Phase 3.

---

## Phase 3: Quote Creation UI

### Overview

Cały React island `QuoteCreator.tsx` z trzema wewnętrznymi fazami: formularz zapytania, konwersacja card-by-card, edytor pozycji inline. Island jest wired do `/api/ai/chat`.

### Changes Required

#### 1. Stwórz `src/components/quotes/QuoteCreator.tsx`

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Główny orchestrator — zarządza fazami i stanem konwersacji. Renderuje odpowiedni sub-komponent zależnie od fazy. Nie zna szczegółów UI każdej fazy.

**Contract**: Named export `QuoteCreator`. State machine:
```
"inquiry" | "loading" | "conversation" | "items" | "saving" | "done"
```
State: `inquiryText`, `messages: {role, content}[]`, `questionCount`, `currentQuestion`, `items: QuoteItem[]`, `title`, `error`. Funkcje: `handleInquirySubmit`, `handleAnswer(answer: string)`, `handleSkip`, `handleSave(items)`.

`handleAnswer` i `handleSkip` dołączają do `messages` parę `{role:"assistant", content: currentQuestion}` + `{role:"user", content: answer|"[pominięto]"}`, incrementują `questionCount`. Gdy `questionCount >= 4` (pytanie nr 5 jest ostatnim) lub skip → `generate: true`.

Po `{ type: "sparse" }` → powrót do fazy "inquiry" z komunikatem błędu wyświetlanym pod formularzem.

#### 2. Stwórz `src/components/quotes/InquiryForm.tsx`

**File**: `src/components/quotes/InquiryForm.tsx`

**Intent**: Krok 1 — pole textarea dla zapytania klienta z przyciskiem "Analizuj zapytanie". Wyświetla komunikat sparse jeśli AI uznało brief za zbyt krótki.

**Contract**: Props: `onSubmit(text: string): void`, `loading: boolean`, `sparseMessage?: string`. Textarea min 20 znaków (walidacja client-side przed submit). Podczas `loading` przycisk jest disabled z spinnerem.

#### 3. Stwórz `src/components/quotes/ConversationCard.tsx`

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Krok 2 — jedna karta naraz z pytaniem AI, polem odpowiedzi i dwoma akcjami. Pokazuje licznik pytań (X/5).

**Contract**: Props: `question: string`, `questionNumber: number`, `maxQuestions: number`, `onAnswer(answer: string): void`, `onSkip(): void`, `loading: boolean`. Przycisk "Odpowiedz" wymaga niepustej odpowiedzi. Przycisk "Pomiń / Wystarczy" zawsze aktywny (skip = generate items teraz). Oba disabled gdy `loading`.

Gdy `loading === true` (oczekiwanie na AI po odpowiedzi/skip) — karta pokazuje inline komunikat "Analizuję..." zamiast inputa.

Error retry: opcjonalny prop `error?: string` — jeśli ustawiony, pokazuje komunikat pod kartą z przyciskiem "Spróbuj ponownie" który wywołuje ostatnie działanie ponownie.

#### 4. Stwórz `src/components/quotes/LineItemsEditor.tsx`

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Krok 3 — tabela pozycji z inline editing. Kliknięcie na pole Task/Hours/Rate aktywuje `<input>`. Subtotal i Total są wyliczane automatycznie.

**Contract**: Props: `items: QuoteItem[]`, `title: string`, `onItemsChange(items: QuoteItem[]): void`, `onSave(items: QuoteItem[]): void`, `saving: boolean`.

Kolumny: Zadanie | Godziny | Stawka (PLN/h) | Subtotal | [ikona usuń]. Subtotal = `hours × rate` (wyliczany, nie edytowalny). Wiersz Total na dole: suma godzin + suma PLN. Przycisk "Zapisz wycenę" poniżej tabeli — disabled gdy `saving`.

Inline edit: `editingCell: {rowIndex, field} | null` w lokalnym state. `onBlur` zatwierdza i ustawia `editingCell: null`. Edytowane pole hours i rate przyjmują tylko liczby nieujemne.

### Success Criteria

#### Automated Verification

- `npm run lint` passes na wszystkich nowych komponentach
- `npm run build` passes

#### Manual Verification

- Wklej zapytanie (min 20 znaków) → kliknij "Analizuj" → pojawia się pierwsze pytanie AI
- Odpowiedz na pytanie → pojawia się kolejne pytanie
- Kliknij "Pomiń / Wystarczy" → generowane pozycje (tabela pojawia się)
- Po 5 pytaniach → automatycznie generowane pozycje
- Kliknij w pole "Zadanie" → staje się edytowalne
- Edytuj godziny → subtotal aktualizuje się po blur
- Kliknij usuń na wierszu → wiersz znika
- Krótkie zapytanie (< 20 znaków) → walidacja client-side, brak submit
- Bardzo lakoniczny brief (np. "hej") → komunikat sparse pod formularzem
- Błąd AI mid-conversation → inline error z przyciskiem retry

**Implementation Note**: Phase 3 nie wymaga działającego `/api/quotes` — przycisk "Zapisz" może być aktywny ale wywoływać `console.log` dopóki Phase 4 nie jest gotowa.

---

## Phase 4: Quotes API & Save Flow

### Overview

Endpoint CRUD dla wycen (`POST` + `GET`), integracja przycisku "Zapisz" z API, toast po zapisie, reset agenta, stub `/quotes` z minimalną listą.

### Changes Required

#### 1. Stwórz `src/pages/api/quotes/index.ts`

**File**: `src/pages/api/quotes/index.ts`

**Intent**: Dwa handlery REST dla kolekcji wycen — tworzenie i listowanie własnych wycen. Wzorzec identyczny jak inne endpointy API w projekcie.

**Contract**:

`POST` handler:
- Auth guard (401), Supabase null-guard (503)
- Input schema: `z.object({ title: z.string().min(1), inquiry_text: z.string().min(1), content: z.object({ items: z.array(QuoteItemSchema) }) })`
- Insert: `{ title, inquiry_text, content, status: "draft", user_id: user.id }` do tabeli `quotes` przez `supabase.from("quotes").insert(...).select().single()`
- Sukces → 201 + `{ quote }` z pełnym rekordem
- DB error → 500 + `{ error: "Failed to create quote" }`

`GET` handler:
- Auth guard (401), Supabase null-guard (503)
- Query: `supabase.from("quotes").select("id, title, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false })`
- Sukces → 200 + `{ quotes }`

#### 2. Zaktualizuj `src/components/quotes/QuoteCreator.tsx`

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Podłącz `handleSave` do `POST /api/quotes`. Po sukcesie wyświetl toast i zresetuj cały stan do fazy "inquiry".

**Contract**: `handleSave` POSTuje `{ title, inquiry_text: inquiryText, content: { items } }`. Po 201 → ustaw `phase: "done"` na 3 sekundy (pokazując toast), potem reset wszystkich pól do stanu początkowego + `phase: "inquiry"`. Po błędzie → `error` state z komunikatem.

Toast — prosty inline banner (nie zewnętrzna biblioteka): `"Wycena '{title}' zapisana! → /quotes"` gdzie link to `<a href="/quotes">`. Wyświetlany w miejscu formularza przez 3 sekundy przed resetem.

#### 3. Zaktualizuj `src/pages/quotes.astro`

**File**: `src/pages/quotes.astro`

**Intent**: Rozbuduj stub o minimalną listę wycen fetchowaną po stronie serwera z Supabase. Wyświetla tytuł i status każdej wyceny. Brak akcji (delete, status change) — te należą do S-02.

**Contract**: Astro frontmatter: `createClient` → `supabase.from("quotes").select("id, title, status, created_at").eq("user_id", user.id).order(...)`. Renderuje `<ul>` z `<li>` na każdą wycenę: tytuł + badge statusu "draft". Gdy brak wycen → "Nie masz jeszcze żadnych wycen."

### Success Criteria

#### Automated Verification

- `npm run lint` passes na `src/pages/api/quotes/index.ts`
- `npm run build` passes

#### Manual Verification

- Przejdź pełny flow: inquiry → konwersacja → pozycje → "Zapisz wycenę"
- Toast pojawia się z tytułem wyceny
- Po 3 sekundach formularz resetuje się do pustego stanu
- Wejdź na `/quotes` → zapisana wycena widoczna na liście ze statusem "draft"
- Curl `GET /api/quotes` z cookie → zwraca listę wycen
- Unauthenticated GET/POST → 401

**Implementation Note**: To finalna weryfikacja całego S-01 flow — przetestuj pełny happy path zanim zamkniesz fazę.

---

## Testing Strategy

### Manual Testing Steps

1. Zaloguj się, przejdź na `/new`
2. Wklej realne zapytanie klienta (np. "Potrzebuję stronę dla mojej restauracji: menu, rezerwacje, galeria, blog, kontakt")
3. Odpowiedz na 2-3 pytania AI, potem kliknij "Pomiń / Wystarczy"
4. Sprawdź jakość pozycji (czy pasują do zapytania, czy stawki są w PLN-owym zakresie)
5. Edytuj co najmniej jedno pole inline (zmień godziny) → sprawdź subtotal
6. Usuń jedną pozycję
7. Zapisz → sprawdź toast
8. Wejdź na `/quotes` → sprawdź czy wycena jest widoczna
9. Odśwież `/new` → agent pusty

### Edge Cases do Przetestowania

- Bardzo krótki brief (< 20 znaków) → walidacja client-side
- Lakoniczny brief ("hej zrób mi stronę") → sparse guard
- AI error (wyłącz klucz) → inline retry
- Zapisz bez żadnych edycji → powinno działać

## Performance Considerations

Haiku przy ~1-2s p50 — akceptowalne per pytanie w konwersacji (max 5 callów). Każdy call przesyła pełną historię (~kilka KB). Brak cachingu na poziomie API w S-01.

## References

- PRD: `context/foundation/prd.md`
- Roadmap S-01: `context/foundation/roadmap.md`
- F-02 scope endpoint (wzorzec): `src/pages/api/ai/scope.ts`
- Factory pattern: `src/lib/anthropic.ts`
- Auth island pattern: `src/pages/auth/signin.astro` + `src/components/auth/SignInForm.tsx`
- Quotes schema + RLS: `supabase/migrations/20260526000000_create_quotes.sql`
- Types: `src/types.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Routing & Navigation

#### Automated

- [x] 1.1 `npm run lint` passes — 21be8ce
- [x] 1.2 `npm run build` passes — 21be8ce

#### Manual

- [x] 1.3 `/new` ładuje się (pusta strona z topbarem) — 21be8ce
- [x] 1.4 `/dashboard` zwraca 404 — 21be8ce
- [x] 1.5 `/quotes` ładuje się ze stubem — 21be8ce
- [x] 1.6 Niezalogowany użytkownik na `/new` jest redirectowany do `/auth/signin` — 21be8ce

### Phase 2: AI Conversation Endpoint

#### Automated

- [x] 2.1 `npm run lint` passes na `src/pages/api/ai/chat.ts` — eb255aa
- [x] 2.2 `npm run build` passes — eb255aa

#### Manual

- [x] 2.3 Unauthenticated → 401 — eb255aa
- [x] 2.4 `inquiry_text` < 20 znaków → 400 — eb255aa
- [x] 2.5 `{ inquiry_text, messages: [], generate: false }` → `{ type: "question", content: "..." }` — eb255aa
- [x] 2.6 `{ ..., generate: true }` z sensownym briefem → `{ type: "complete", items: [...], title: "..." }` — eb255aa
- [x] 2.7 Nonsensowny brief + `generate: true` → 422 — eb255aa

### Phase 3: Quote Creation UI

#### Automated

- [x] 3.1 `npm run lint` passes na wszystkich nowych komponentach — 6b1d06e
- [x] 3.2 `npm run build` passes — 6b1d06e

#### Manual

- [x] 3.3 Inquiry submit → pierwsze pytanie AI pojawia się — 6b1d06e
- [x] 3.4 Odpowiedź na pytanie → kolejne pytanie — 6b1d06e
- [x] 3.5 "Pomiń / Wystarczy" → generowane pozycje (tabela) — 6b1d06e
- [x] 3.6 Po 5 pytaniach → auto-generacja pozycji — 6b1d06e
- [x] 3.7 Kliknięcie w komórkę → edytowalny input — 6b1d06e
- [x] 3.8 Edycja godzin → subtotal aktualizuje się po blur — 6b1d06e
- [x] 3.9 Usunięcie wiersza → wiersz znika — 6b1d06e
- [x] 3.10 Lakoniczny brief → sparse message pod formularzem — 6b1d06e
- [x] 3.11 AI error mid-conversation → inline error z retry — 6b1d06e

### Phase 4: Quotes API & Save Flow

#### Automated

- [x] 4.1 `npm run lint` passes na `src/pages/api/quotes/index.ts`
- [x] 4.2 `npm run build` passes

#### Manual

- [x] 4.3 Pełny flow: inquiry → konwersacja → pozycje → zapis → toast
- [x] 4.4 Toast zawiera tytuł wyceny i link do `/quotes`
- [x] 4.5 Po 3 sekundach formularz resetuje się
- [x] 4.6 `/quotes` pokazuje zapisaną wycenę ze statusem "draft"
- [x] 4.7 Unauthenticated GET/POST → 401
