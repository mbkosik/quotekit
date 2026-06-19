---
title: "QuoteKit — Domain Distillation"
created: 2026-06-15
type: domain-distillation
source_commits: 3c9a5af (head at analysis time)
---

# QuoteKit — Destylacja domeny

## Krok 0 — Kontekst projektu

### Dokumenty źródłowe użyte w analizie

| Dokument            | Ścieżka                                                            | Rola                                                    |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| PRD v1              | `context/foundation/prd.md`                                        | Wymagania, kryteria sukcesu, nie-cele, logika biznesowa |
| Shape notes         | `context/foundation/shape-notes.md`                                | Historia szlifowania idei, decyzje projektowe           |
| Roadmap             | `context/foundation/roadmap.md`                                    | Slices, zależności, decyzje schematowe, status done     |
| Lessons learned     | `context/foundation/lessons.md`                                    | Operacyjne reguły wynikające z implementacji            |
| Research (refaktor) | `context/changes/refactor-opportunities-quote-creator/research.md` | Inwentaryzacja długu technicznego                       |

### Stack i struktura repozytorum

- **Warstwa HTTP / serwer**: `src/pages/api/` — API routes Astro (quotes CRUD, AI endpoints, auth, settings)
- **Logika biznesowa / stan**: `src/components/hooks/` — React hooks (`useQuoteCreator`, `useQuoteEditor`, `useQuotesList`)
- **Infrastruktura**: `src/lib/` — klient Supabase, klient Anthropic, rate limiter, utilities
- **Typy domenowe**: `src/types.ts` — 14 importerów; liść grafu importów
- **Persystencja**: `supabase/migrations/` — 4 migracje: `quotes`, `rate_limit_events`, `user_settings`, granty ról

**Architektura warstw** (top→down): Astro pages → React islands → hooks (logika stanu + fetch) → API routes → Supabase DB. Brak dedykowanej warstwy domenowej; logika biznesowa żyje w hookach (po stronie klienta) i w systemowych promptach AI (po stronie serwera).

---

## Krok 1 — Ubiquitous Language

Każde pojęcie: definicja | cytat źródłowy | lokalizacja w kodzie lub adnotacja BRAK.

### 1. Wycena (Quote)

**Definicja**: Oferta cenowa przygotowana przez freelancera dla klienta. Składa się z nagłówka (tytuł, status, tekst zapytania) oraz listy pozycji. Artefakt persystentny — tworzony po zakończeniu sesji tworzenia.

**Źródło**: `context/foundation/prd.md:36` — "QuoteKit is the tool that collapses 'vague inquiry → deliverable quote' from hours to minutes"

**Kod**: `src/types.ts:22-31` (interface `Quote`), `supabase/migrations/20260526000000_create_quotes.sql:11-20` (tabela `quotes`)

---

### 2. Pozycja wyceny (Line Item / QuoteItem)

**Definicja**: Jednostkowy element pracy w wycenie. Posiada nazwę zadania (`task`), estymację godzin (`hours`) oraz stawkę godzinową (`rate`). Generowana przez AI lub dodana ręcznie. Lista pozycji to treść wyceny.

**Źródło**: `context/foundation/prd.md:86` — "list of AI-generated line items (task name, estimated hours, suggested rate)"

**Kod**: `src/types.ts:13-18` (schema `QuoteItemSchema`), `supabase/migrations/20260526000000_create_quotes.sql` kolumna `content JSONB NOT NULL DEFAULT '{"items": []}'`

---

### 3. Subtotal (kwota pozycji)

**Definicja**: Obliczona wartość monetarna pojedynczej pozycji: `hours × rate`. Wyświetlana obok każdej pozycji.

**Źródło**: `context/foundation/prd.md:58-59` (AC do US-01) — "Each line item shows: task name, estimated hours, suggested rate, and **a computed subtotal**"

**Kod**: **BRAK w typach** — nie ma pola `subtotal` w `QuoteItemSchema` (`src/types.ts:13-18`). Wartość obliczana ad-hoc w komponentach UI.

---

### 4. Zapytanie klienta (Client Inquiry)

**Definicja**: Surowy tekst wiadomości klienta opisujący projekt. Punkt wejścia całego przepływu. Persystowany jako niezmienialny rekord (`inquiry_text`) — stanowi historyczny kontekst wyceny.

**Źródło**: `context/foundation/prd.md:20` — "a solo freelancer receives a client inquiry with a vague scope"

**Kod**: `src/types.ts:28` (pole `inquiry_text: string`), `supabase/migrations/20260526000000_create_quotes.sql:17` (`inquiry_text TEXT NOT NULL`), `src/pages/api/ai/chat.ts:12` (walidacja `z.string().min(20)`)

---

### 5. Brief (lakoniczny / wystarczający)

**Definicja**: Ocena gęstości informacyjnej zapytania klienta. Brief lakoniczny (poniżej progu) triggeruje generację pytań do klienta; brief wystarczający wchodzi w przepływ rozmowy doprecyzowującej.

**Źródło**: `context/foundation/prd.md:148` — "How should the tool handle a very sparse or uninformative paste?"

**Kod**: `src/pages/api/ai/chat.ts:185-189` (sentinel `TOO_SHORT` → `{type:"sparse"}`), `src/components/hooks/useQuoteCreator.ts:82-95` (routing do fazy `questions` przy sparse), `src/components/quotes/InquiryForm.tsx:43` (bramka kliencka `length < 20`)

---

### 6. Rozmowa doprecyzowująca (AI Clarifying Conversation)

**Definicja**: Multi-turowy dialog między AI a freelancerem. AI zadaje jedno pytanie na raz (max 5) dotyczące zakresu, stacku, terminu lub budżetu. Celem jest zebranie kontekstu do wygenerowania trafnych pozycji wyceny. Freelancer może pominąć rundę w dowolnym momencie.

**Źródło**: `context/foundation/prd.md:81-82` — "FR-005: User can respond to AI clarifying questions about scope, stack, deadline, and client budget"

**Kod**: `src/pages/api/ai/chat.ts:22-29` (QUESTION_SYSTEM_PROMPT), `src/components/hooks/useQuoteCreator.ts:11` (`MAX_QUESTIONS = 5`), fazy `"conversation"` i `"loading"` w hooku

---

### 7. Pytania do klienta (Client Questions)

**Definicja**: Lista pytań generowana przez AI, którą freelancer wysyła klientowi gdy brief jest zbyt lakoniczny. Cel: uzupełnić brief przed wejściem do przepływu wyceny. Zewnętrzne (skierowane do klienta), nie wewnętrzne. Odrębne od rozmowy doprecyzowującej — inny prompt, inny ton.

**Źródło**: `context/foundation/roadmap.md:166` — "Pytania do klienta (S-03, FR-004) — AI generuje listę pytań, które freelancer wysyła klientowi... Nie wolno reużyć promptu doprecyzowującego z S-01."

**Kod**: `src/pages/api/ai/questions.ts:20-32` (SYSTEM_PROMPT), `src/components/quotes/ClientQuestionsList.tsx`, faza `"questions"` w `useQuoteCreator.ts`

---

### 8. Status wyceny (Quote Status)

**Definicja**: Stan wyceny w pipeline sprzedażowym freelancera. Cztery wartości: `draft` (niezatwierdzony szkic), `sent` (wysłana do klienta), `accepted` (zaakceptowana przez klienta), `rejected` (odrzucona). Zmiana ręczna przez freelancera.

**Źródło**: `context/foundation/prd.md:107` — "FR-012: User can update a quote's status (draft → sent → accepted / rejected)"

**Kod**: `src/types.ts:3` (`QUOTE_STATUSES`), `supabase/migrations/20260526000000_create_quotes.sql:14` (CHECK constraint), `src/lib/quotes.ts:3-8` (etykiety UI `STATUS_LABELS`)

---

### 9. Sesja tworzenia wyceny (Quote Creation Session)

**Definicja**: Efemeryczny, wieloetapowy przepływ: wklej zapytanie → AI zadaje pytania (lub generuje pytania do klienta) → AI generuje pozycje → freelancer edytuje → zapisuje jako draft. Nie jest persystowany między odświeżeniami przeglądarki.

**Źródło**: `context/foundation/shape-notes.md:22` — "7-step flow: sign in → paste inquiry → AI clarifying questions → AI generates line items → user edits → save as draft"

**Kod**: `src/components/hooks/useQuoteCreator.ts:4` (type `Phase = "inquiry" | "loading" | "questions" | "conversation" | "items" | "saving" | "done"`) — całkowicie w stanie React, brak reprezentacji serwerowej

---

### 10. Kotwice cenowe (Rate Anchors)

**Definicja**: Rynkowe zakresy stawek godzinowych (PLN/h) dla kategorii prac freelancerskich na polskim rynku. Wiedza domenowa przekazywana do AI jako kontekst wyceny.

**Źródło**: `context/foundation/prd.md:119-120` — "proposing rates grounded in the project's shape"

**Kod**: `src/pages/api/ai/chat.ts:31-40` (hardkodowane w `GENERATION_SYSTEM_PROMPT` — UI/UX: 80-100, Frontend: 90-130, Backend: 100-150, API: 100-130, DevOps: 120-150, PM: 80-100). Duplikat w martwym kodzie `src/pages/api/ai/scope.ts:21-35`.

---

### 11. Kontekst użytkownika (User Prompt Context)

**Definicja**: Dowolny tekst (max 500 znaków) zapisany przez freelancera — opis specjalizacji, rynku, stylu pracy. Dołączany do każdego promptu AI przy generowaniu pozycji, aby spersonalizować wycenę.

**Źródło**: `context/foundation/roadmap.md:129-131` — "użytkownik może zapisać własny kontekst... który jest dołączany do każdego promptu AI"

**Kod**: `src/pages/api/settings.ts`, `supabase/migrations/20260613000000_create_user_settings.sql` (tabela `user_settings`, kolumna `prompt_context`), `src/pages/api/ai/chat.ts:106-121` (odczyt i wstrzyknięcie do systemowych promptów)

---

### 12. Izolacja danych (Data Isolation)

**Definicja**: Twardy niezmiennik bezpieczeństwa: freelancer widzi i modyfikuje wyłącznie swoje wyceny. Naruszenie jest krytyczną regresją niezależnie od stanu pozostałych funkcji.

**Źródło**: `context/foundation/prd.md:44` — "Quote data isolation: a signed-in freelancer must never be able to see or reach another user's quotes. A data-visibility bug here is a trust-breaking regression regardless of any other feature working."

**Kod**: `supabase/migrations/20260526000000_create_quotes.sql:33-47` (4 polityki RLS, każda z `(select auth.uid()) = user_id`), `src/pages/api/quotes/[id].ts:41` (`.eq("user_id", user.id)` w każdym zapytaniu)

---

## Krok 2 — Klasyfikacja subdomen

| Subdomena                          | Kategoria      | Uzasadnienie                                                                                                                                      |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-wspomagane szacowanie (scoping) | **Core**       | Centralna hipoteza produktu: "LLMs changed the calculus" (PRD vision). Bez tego QuoteKit to tylko formularz. Sukces mierzony jakością AI-pozycji. |
| Zarządzanie cyklem życia wyceny    | **Core**       | Wycena jako artefakt (tworzenie, edycja, statusy, usuwanie) to cel istnienia produktu. PRD guardrail: CRUD musi działać niezależnie od AI.        |
| Personalizacja promptów AI         | **Supporting** | Kontekst użytkownika podnosi jakość AI-pozycji (PRD NFR), ale jest narzędziem poprawy Core, nie rdzeniem samym w sobie.                           |
| Uwierzytelnianie (Auth)            | **Supporting** | Wymagane do multi-user izolacji, ale standard Supabase — bez własnej logiki domenowej. PRD: "standard registration flow".                         |
| Rate Limiting                      | **Generic**    | Ochrona przed nadużyciem kosztów API. Czysto techniczna infrastruktura, zero logiki biznesowej.                                                   |
| Integracja Anthropic SDK           | **Generic**    | Transport HTTP do modelu AI. Commodity pattern — plik `src/lib/anthropic.ts` to 9 linii.                                                          |
| Persystencja (Supabase CRUD)       | **Generic**    | Standardowe operacje bazodanowe. Wartość leży w politykach RLS (supporting Core izolacji), nie w samej operacji CRUD.                             |

---

## Krok 3 — Kandydaci na agregaty i ich niezmienniki

### A. Quote (Wycena) — agregat główny

**Granica**: jeden rekord `quotes` z kolekcją `content.items`. Root: UUID `id`.

| Niezmiennik                                                     | Źródło                                     | Status egzekucji                                                                     |
| --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `user_id = auth.uid()` — freelancer jest właścicielem           | PRD NFR (data isolation guardrail)         | ✅ Egzekwowany przez RLS (`quotes_*_own` policies) i `.eq("user_id", user.id)` w API |
| `status ∈ {draft, sent, accepted, rejected}`                    | PRD FR-012 (+ shape-notes)                 | ✅ Egzekwowany przez DB CHECK constraint i Zod enum w API                            |
| `title` niepusty                                                | PRD (implicit — title generowany przez AI) | ✅ Egzekwowany przez Zod `min(1)` w API routes                                       |
| Przejścia statusu są unidirectionalne: `draft → sent → accepted | rejected`                                  | PRD FR-012 "draft → sent → accepted / rejected"                                      | ❌ **IGNOROWANY** — PATCH przyjmuje dowolną wartość statusu niezależnie od aktualnego stanu (`src/pages/api/quotes/[id].ts:84-114`) |

---

### B. QuoteCreationSession (Sesja Tworzenia Wyceny) — agregat konceptualny

**Granica**: efemeryczna sesja — od wklejenia zapytania do zapisu draftu. Nie persystowana.

| Niezmiennik                                                 | Źródło                                                                                   | Status egzekucji                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Rozmowa AI musi się zakończyć przed wyświetleniem pozycji" | PRD US-01 AC: "The AI clarifying conversation must complete before line items are shown" | ⚠️ Egzekwowany wyłącznie przez kliencki state machine (`phase` musi dojść do `"items"` zanim `handleSave` jest dostępny). Zero weryfikacji serwerowej.                               |
| Max 5 pytań doprecyzowujących                               | PRD OQ-1 resolved: "max 5 questions"                                                     | ⚠️ Egzekwowany przez `MAX_QUESTIONS = 5` w kliencie (`useQuoteCreator.ts:11,121`). Brak limitu po stronie API.                                                                       |
| Nie można zapisać wyceny przy zbyt krótkim inquiries        | PRD FR-004 / S-03 (sparse guard)                                                         | ⚠️ Egzekwowany przez kliencki routing (faza `"questions"` blokuje `handleSave`). API `/api/quotes` (POST) przyjmuje `inquiry_text: z.string().min(1)` — właściwie jakikolwiek tekst. |

---

### C. UserSettings (Kontekst użytkownika) — value object

**Granica**: jeden rekord `user_settings` na użytkownika. Primary key: `user_id`.

| Niezmiennik                     | Źródło                      | Status egzekucji                                                                                       |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Jeden rekord na użytkownika     | S-04 design decision        | ✅ PRIMARY KEY constraint                                                                              |
| `prompt_context` max 500 znaków | S-04 decyzja (koszt tokenu) | ✅ Zod `max(500)` w API (`src/pages/api/settings.ts:9`), slicing serwera `slice(0, 500)` w chat.ts:113 |
| `user_id = auth.uid()`          | Standard izolacji per-user  | ✅ RLS policies, `.eq("user_id", user.id)`                                                             |

---

## Krok 4 — Rozjazdy MODEL vs KOD

| #      | Dokument mówi                                                                    | Kod robi                                                                                                                                                                      | Dowód (plik:linia)                                                                                                         |
| ------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **M1** | Każda pozycja wyceny posiada obliczony `subtotal` (hours × rate)                 | `QuoteItemSchema` nie ma pola `subtotal`; wartość obliczana ad-hoc w UI                                                                                                       | PRD `prd.md:58` vs `src/types.ts:13-18`                                                                                    |
| **M2** | Status przechodzi w pipeline: `draft → sent → accepted / rejected` (kierunkowy)  | API PATCH akceptuje dowolną zmianę statusu bez weryfikacji aktualnego stanu — `draft → accepted` lub `sent → draft` są możliwe                                                | `prd.md:107` vs `src/pages/api/quotes/[id].ts:84-114`                                                                      |
| **M3** | Rozmowa AI musi zakończyć się przed wygenerowaniem pozycji (niezmiennik sesji)   | Tylko kliencki state machine egzekwuje ten warunek; `/api/quotes` (POST) nie wymaga dowodu zakończenia sesji                                                                  | `prd.md:58` (AC US-01) vs `src/pages/api/quotes/index.ts:8-12`                                                             |
| **M4** | Kotwice cenowe są wiedzą domenową (rynkowe stawki PLN/h)                         | Wartości hardkodowane jako string w system promptcie; nie ma konfigurowalnego obiektu domenowego                                                                              | `prd.md:119` (Business Logic) vs `src/pages/api/ai/chat.ts:31-40`                                                          |
| **M5** | Endpoint `/api/ai/scope` był oryginalną implementacją single-shot scoping (F-02) | Kod istnieje (`src/pages/api/ai/scope.ts`), ale ŻADEN klient go nie wywołuje — zastąpiony przez `/api/ai/chat` (generate=true). Jedyna referencja to test error-sanitization. | `context/changes/refactor-opportunities-quote-creator/research.md:242-248` vs `src/pages/api/ai/scope.ts` (cały plik)      |
| **M6** | Pozycje wyceny nie mają własnej tożsamości domenowej (są częścią agregatu Quote) | `QuoteItemSchema` ma opcjonalne pole `id`; klient generuje UUID przez `crypto.randomUUID()` i wysyła je do API; API przechowuje je w JSONB bez veryfikacji                    | `prd.md:119-123` (Business Logic, "list of line items") vs `src/types.ts:14`, `src/components/hooks/useQuoteCreator.ts:97` |
| **M7** | `"quote" = wycena` (oferta cenowa) — nie cytat                                   | Lekcja udokumentowana, ale nazwy tabel/pól używają angielskiego `quote` — ryzyko tłumaczenia w komentarzach, opisach zmian                                                    | `context/foundation/lessons.md:35-43`                                                                                      |

---

## Krok 5 — Ranking refaktoru

Kryterium: (rdzeniowość niezmiennika) × (słabość egzekucji). Im bardziej rdzeniowy niezmiennik i im słabiej egzekwowany, tym wyżej w rankingu.

### #1 — Serwerowa egzekucja pipelineu statusów (M2)

**Problem**: PRD mówi `draft → sent → accepted | rejected`. Kod pozwala `draft → accepted` lub `sent → draft`. Brak state-machine po stronie serwera w PATCH `/api/quotes/[id]`.

**Rdzeniowość**: Wysoka — status pipeline to model procesu sprzedażowego freelancera. Cofnięcie wyceny z `accepted` do `draft` dewaluuje dane analityczne przyszłej wersji.

**Słabość egzekucji**: Całkowita — zero walidacji przejść w API (`src/pages/api/quotes/[id].ts:84-114`).

**Naprawa**: Dodaj `ALLOWED_STATUS_TRANSITIONS` do `src/types.ts`; waliduj przejście w PATCH handlerze przed upsert. Blast radius: `types.ts` + `[id].ts` + testy.

---

### #2 — Subtotal jako typowane pole obliczone (M1)

**Problem**: PRD explicite traktuje `subtotal` jako element każdej pozycji wyceny. Brakuje pola w typie domenowym — obliczenie jest ukryte w komponentach UI bez centralnej definicji.

**Rdzeniowość**: Wysoka — subtotal jest kluczowym sygnałem decyzyjnym freelancera przy zatwierdzaniu wyceny.

**Słabość egzekucji**: Strukturalna — brak pola w `QuoteItemSchema` oznacza, że różne komponenty mogą obliczać subtotal inaczej i nie ma statycznej weryfikacji.

**Naprawa**: Dodaj opcjonalne obliczone pole `subtotal?: number` do `QuoteItemSchema` lub stwórz helper `computeSubtotal(item: QuoteItem): number` w `src/lib/quotes.ts`. Nie wymaga zmiany schematu DB (JSONB). Blast radius: `types.ts` + komponenty UI (`LineItemsEditor`, `QuoteEditor`).

---

### #3 — Formalizacja QuoteCreationSession (M3)

**Problem**: Sesja tworzenia wyceny to centralny przepływ produktu, ale nie ma żadnej serwerowej reprezentacji. Niezmienniki (conversation-must-complete, max-questions) egzekwowane wyłącznie po stronie klienta.

**Rdzeniowość**: Najwyższa — to jest rdzeń produktu. PRD success criteria i US-01 opisują właśnie ten przepływ.

**Słabość egzekucji**: Wysoka w sensie serwerowym — POST `/api/quotes` nie wymaga dowodu zakończonej sesji. Jednak PRD nie wymaga serwerowej sesji: "the application does not maintain a profile or history of past rates". Brak sesji serwerowej jest świadomą decyzją.

**Naprawa**: Nie wymaga zmiany architektury — wystarczy formalizacja w kodzie klienta: wyodrębnienie `Phase` state machine do osobnego modułu `src/lib/quote-creation-session.ts` z eksportowanymi stałymi i logiką przejść. Obniża blast radius przyszłych zmian w hooku.

---

### Kandydat pomocniczy: martwy kod scope.ts (M5)

**Problem**: `src/pages/api/ai/scope.ts` istnieje, nie jest wywoływany przez żadnego klienta, powiela logikę rate-limitingu middleware, zawiera zduplikowane kotwice cenowe. Kosz ciągły: każdy developer czyta plik i ocenia czy jest w użyciu.

**Naprawa**: Usuń `src/pages/api/ai/scope.ts`. Zaktualizuj `src/__tests__/error-sanitization/error-sanitization.test.ts` (zamień `scopePOST` na `chatPOST`). Blast radius: 2 pliki.

---

## Ograniczenia analizy

1. Klasy `useQuotesList.ts` i `UserContextForm.tsx` nie zostały w pełni przeanalizowane — skupiono się na krytycznej ścieżce tworzenia wyceny.
2. Brak dostępu do logów produkcyjnych — kandydat `scope.ts` jako martwy kod opiera się wyłącznie na analizie statycznej kodu.
3. Brak testów integracyjnych dla przejść statusów — trudno ocenić, czy regresja M2 była kiedyś wolna.
