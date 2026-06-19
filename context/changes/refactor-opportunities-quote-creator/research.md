---
date: 2026-06-15T12:08:09+02:00
researcher: Claude Sonnet 4.6
git_commit: 3c9a5afa3011582e74c6399c3bb060791ede6ee4
branch: main
repository: quotekit
topic: "Refactor opportunities in useQuoteCreator — ranking and feasibility"
tags: [research, refactor, useQuoteCreator, http-contracts, rate-limiting, dead-code, stuck-state]
status: complete
last_updated: 2026-06-15
last_updated_by: Claude Sonnet 4.6
---

# Research: Refactor Opportunities — useQuoteCreator

**Date**: 2026-06-15
**Git Commit**: `3c9a5afa`
**Branch**: main

## Research Question

Które problemy z analizy długu technicznego `useQuoteCreator` (context/changes/quote-creator-refactor/research.md) warto naprawić? W jakim docelowym kształcie i w jakiej kolejności? Analiza opiera się na dowodach z kodu i historii git — nie projektuje docelowej architektury poza konkretnie nazwanym kształtem per kandydat.

---

## Podstawa: prior research

Wszystkie twierdzenia budują na `context/changes/quote-creator-refactor/research.md` (commit `3c9a5af`). Tamten raport udokumentował 8 problemów (TD-1…TD-8) z blast radius, mapą pokrycia testami i białymi plamami. Niniejszy dokument traktuje je jako dane wejściowe, nie odtwarza ich — skupia się na klasyfikacji, weryfikacji w kodzie, archeologii git i rankingu.

Trzy równoległe sub-agenty zebrały dowody niezależnie:

- **Sub-agent 1** — weryfikacja obecnego kształtu (file:line, evidence/inference/unknown)
- **Sub-agent 2** — archeologia git i ocena intencjonalności
- **Sub-agent 3** — ocena wykonalności migracji (testy, blast radius, prerekwizyt)

---

## Klasyfikacja kandydatów

**KANDYDAT** = problem, którego naprawa zmieniłaby strukturę kodu.

| #    | Problem z prior research                                              | Klasyfikacja                                                                 |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| TD-1 | Hardcoded URL strings w useQuoteCreator.ts                            | **KANDYDAT**                                                                 |
| TD-2 | Brak typowanych kontraktów HTTP                                       | **KANDYDAT**                                                                 |
| TD-3 | Niezgodność walidacyjnych client/server                               | **KANDYDAT**                                                                 |
| TD-4 | handleSave ignoruje ID stworzonej wyceny                              | NIE-KANDYDAT — zmiana produktowa (nowy UX redirect), nie techniczny refaktor |
| TD-5 | Stuck state przy `inquiry_unusable`                                   | **KANDYDAT**                                                                 |
| TD-6 | handleSkip/handleGenerateQuestions/handleBackFromQuestions bez testów | NIE-KANDYDAT — luka testowa; wejście do oceny kosztu zmiany                  |
| TD-7 | QuoteCreator.tsx bez testów komponentowych                            | NIE-KANDYDAT — luka testowa; informuje o blast radius refaktorów             |
| TD-8 | Podwójna warstwa rate limitingu                                       | **KANDYDAT**                                                                 |
| —    | scope.ts: potencjalny martwy kod (Open Questions z prior research)    | **KANDYDAT**                                                                 |

---

## Analiza per kandydat

### TD-1 — Hardcoded URL strings

#### Obecny kształt

- **Evidence** — `useQuoteCreator.ts:20` — literał `"/api/ai/questions"`
- **Evidence** — `useQuoteCreator.ts:32` — literał `"/api/ai/chat"`
- **Evidence** — `useQuoteCreator.ts:201` — literał `"/api/quotes"`
- **Evidence** — grep całego `src/` potwierdza: żaden inny plik nie hardcode'uje tych URL-i — każdy pojawia się tylko raz, tylko w hooku
- **Evidence** — `src/lib/` nie zawiera modułu stałych URL ani api-client (lista: `utils.ts`, `quotes.ts`, `anthropic.ts`, `config-status.ts`, `supabase.ts`, `rate-limit.ts`, `supabase-errors.ts`, `test-helpers.ts`, `supabase-test.ts`)

#### Intencjonalność

- **Evidence** — commit `6b1d06e` (ai-quote-creation-flow, 2026-05-29): URL-e wbudowane od razu w prywatne funkcje `callChat`/`callQuestions` — hook projektowany jako self-contained
- **Evidence** — żaden `plan.md` w `context/changes/` ani `context/archive/` nie wspomina o ekstrakcji URL-i do wspólnego modułu
- **Inference** — wzorzec self-contained był świadomą decyzją projektową dla tej iteracji

**Werdykt: świadome ograniczenie**

#### Wykonalność

Zmiana trywialna: stwórz `src/lib/api-routes.ts` z 3 stałymi, zamień 3 literały w hooku. Testy mockują `global.fetch` bez asercji na URL — nie złamie się nic. Blast radius: wyłącznie `useQuoteCreator.ts`. Prerekwizyt: brak.

---

### TD-2 — Brak typowanych kontraktów HTTP

#### Obecny kształt

- **Evidence** — `useQuoteCreator.ts:5–9` — `ChatResponse` union zdefiniowany lokalnie w hooku, nie eksportowany
- **Evidence** — `chat.ts:11–15` — `RequestSchema` (inquiry_text, messages, generate) lokalny, nie eksportowany
- **Evidence** — `chat.ts:17–20` — `ChatOutputSchema` (items, title) lokalny, nie eksportowany
- **Evidence** — `questions.ts:10–14` — `InputSchema` lokalny, nie eksportowany
- **Evidence** — `questions.ts:16–18` — `QuestionsOutputSchema` lokalny, nie eksportowany
- **Evidence** — `quotes/index.ts:8–12` — `CreateSchema` (title, inquiry_text, content.items) lokalny, nie eksportowany
- **Evidence** — `src/types.ts` eksportuje typy domenowe (`Quote`, `QuoteItem`, `Message`, `MessageSchema`, `QuoteItemSchema`) — 14 importerów — ale zero request/response HTTP types
- **Evidence** — `useQuoteCreator.ts:38` — `res.json() as Promise<ChatResponse>` — cast bez runtime validation
- **Evidence** — `useQuoteCreator.ts:26–28` — `data.questions` sprawdzany przez `Array.isArray` (runtime), bez TypeScript type

`ChatResponse` po stronie hooka jest niekompletny — nie obejmuje wszystkich kształtów zwracanych przez `chat.ts` (np. pełny zestaw wariantów błędów). Zmiana kształtu response w handlerze nie wygeneruje błędu kompilacji po stronie hooka.

#### Intencjonalność

- **Evidence** — commit `eb255aa` (2026-05-29): API chat z lokalnym `RequestSchema`
- **Evidence** — commit `3ee4b8a` (2026-06-13): API questions z lokalnym `InputSchema` — identyczny wzorzec
- **Evidence** — żaden `plan.md` nie wspomina "shared schemas", "HTTP contracts" ani "API contracts layer"
- **Inference** — endpointy pisane inkrementalnie w osobnych etapach; nigdy nie zaplanowano warstwy kontraktowej

**Werdykt: przypadkowa złożoność**

#### Wykonalność

- `src/types.ts` to naturalne miejsce — 14 importerów, liść DAG, zero cykli
- Zmiana czysto addytywna: dodaj `ChatRequest`, `ChatResponseUnion`, `QuestionsRequest`, `QuestionsResponse`, `QuoteCreateRequest` — nic nie usuwaj
- Krok 2: zaktualizuj `useQuoteCreator.ts:5–9` — import zamiast lokalnej definicji
- Krok 3 (opcjonalny): API routes importują schematy — pełna synchronizacja; to może być osobny PR
- Testy nie asertują typów — nie złamią się
- Blast radius: MUSZĄ zmienić się `types.ts` (add) + `useQuoteCreator.ts` (import); MOGĄ `chat.ts`, `questions.ts`, `quotes/index.ts`
- Prerekwizyt: brak

---

### TD-3 — Niezgodność walidacyjnych client/server

#### Obecny kształt

- **Evidence** — `chat.ts:12` — `inquiry_text: z.string().min(20)`
- **Evidence** — `questions.ts:13` — `inquiry_text: z.string().min(3)`
- **Evidence** — `useQuoteCreator.ts:67–72` — `handleInquirySubmit` wysyła bez walidacji długości

**Nowa informacja z sub-agent 3 (nieobecna w prior research):**

- **Evidence** — `InquiryForm.tsx:27` — `if (trimmed.length < 3)` — walidacja UI
- **Evidence** — `InquiryForm.tsx:38` — `if (trimmed.length < 3)` — druga walidacja UI
- **Evidence** — `InquiryForm.tsx:43` — `if (trimmed.length < 20)` — bramka wyboru chat vs. questions
- **Inference** — normalny flow przez UI jest CHRONIONY przez InquiryForm; ryzyko z prior research ("user widzi błąd serwera zamiast klienta") jest mitygowane — dotyczy tylko path omijający InquiryForm

Realny problem: magic numbers `3` i `20` istnieją niezależnie w `InquiryForm.tsx` i API routes — bez wspólnej stałej.

#### Intencjonalność

- **Evidence** — commit `fe527a7` (2026-06-13, impl-review fix F4): komentarz `questions.ts:12` — "min(3) intentional: questions endpoint serves short briefs (e.g. 'strona www'), unlike chat/scope which need ≥20 chars for quote generation context"
- **Evidence** — plan `context/archive/2026-06-13-client-questions-flow/plan.md` dokumentuje `min(5)/max(7)` dla `QuestionsOutputSchema` oraz `min(20)` dla `inquiry_text` — potwierdza różne progi dla różnych endpointów, ale nie dokumentuje explicite `min(3)` jako wartości UI; różnica progów jest jednak widoczna w implementacji i komentarzu w kodzie

**Werdykt: świadome ograniczenie** (różne minima dla różnych endpointów); **przypadkowa złożoność** (magic numbers bez wspólnej stałej)

#### Wykonalność

Dodaj `INQUIRY_MIN_LENGTH = 3` i `INQUIRY_CHAT_MIN_LENGTH = 20` do `types.ts`, zamień literały w `InquiryForm.tsx:27,38,43`, `chat.ts:12`, `questions.ts:13`. Blast radius: 4 pliki. Brak prerekwizytów.

---

### TD-4 — handleSave ignoruje ID stworzonej wyceny

#### Obecny kształt

- **Evidence** — `useQuoteCreator.ts:197–213` — `handleSave`: sprawdza `res.ok`, ustawia `setSavedTitle(title)`, NIE woła `res.json()`
- **Evidence** — `quotes/index.ts:63` — POST odpowiada `{ quote: result.data }` z `id: string` w środku
- **Evidence** — `QuoteCreator.tsx:39–50` — ekran sukcesu: link do `/quotes` (lista), nie `/quotes/:id`
- **Evidence** — `useQuoteCreator.test.ts:161` — mock odpowiedzi to `{ id: "q1" }` — **bug w teście**: rzeczywisty kształt to `{ quote: { id, ... } }`, nie `{ id }`. Test przechodzi bo hook body nie czyta.

#### Intencjonalność

- **Evidence** — plan `context/archive/2026-05-29-ai-quote-creation-flow/plan.md §Phase 4.2` — "Po 201 → ustaw `phase: 'done'`"; link do `/quotes` (lista); zero wzmianki o `quote.id`
- **Evidence** — commit `863ef86` (UI visual quality, 2026-06-14): usunięto auto-reset timer, bez zmiany ID handling

**Werdykt: świadome ograniczenie** (decyzja produktowa: sukces = lista, nie detail page)

#### Wykonalność

Zmiana wymaga: odczytu `res.json()` w hooku, ekstrakcji `quote.id`, nowego stanu `savedQuoteId`, zmiany linku w QuoteCreator.tsx. Warunek wstępny: istnienie strony `/quotes/[id].astro` (detail view) — nie zweryfikowano jej istnienia.

**Uwaga**: to jest zmiana produktowa (nowy UX redirect), nie techniczny refaktor.

**Bug testowy do naprawy niezależnie**: `useQuoteCreator.test.ts:161` mockuje `{ id: "q1" }` zamiast `{ quote: { id: "q1", ... } }`. Zerowy blast radius, czysta poprawka — warto naprawić niezależnie od decyzji o ID handling.

---

### TD-5 — Stuck state przy inquiry_unusable

#### Obecny kształt

- **Evidence** — `chat.ts:154–159` — gdy `generateItems` zwraca 0 elementów: HTTP 422, body `{ error: "inquiry_unusable" }`
- **Evidence** — `useQuoteCreator.ts:37` — `callChat` przepuszcza 422 (if `!res.ok && res.status !== 422`): body jest parsowane i zwracane
- **Evidence** — `useQuoteCreator.ts:126–129` — w `handleAnswer`: `if ("error" in data)` → `setPhase("conversation")`, `setError("Błąd AI. Spróbuj odpowiedzieć ponownie.")` — generyczny komunikat, brak rozróżnienia typu błędu
- **Evidence** — `useQuoteCreator.ts:67–81` — `handleInquirySubmit` MA specyficzną obsługę: `if (data.error === "inquiry_unusable")` → wraca do `phase="inquiry"` z dedykowanym komunikatem
- **Evidence** — `ConversationCard.tsx:7–16` — props: `question, questionNumber, maxQuestions, onAnswer, onSkip, loading, error?, onRetry?` — brak `onReset`
- **Evidence** — `ConversationCard.tsx:76–85` — przy błędzie: komunikat + opcjonalny przycisk "Spróbuj ponownie" (`onRetry`)
- **Evidence** — `QuoteCreator.tsx:78–84` — `onRetry` wołuje `setError("")` — tylko czyści error, nie zmienia fazy
- **Evidence** — `useQuoteCreator.ts:55–65` — `resetForm()` istnieje i resetuje cały stan do `phase="inquiry"`
- **Evidence** — `useQuoteCreator.ts:239` — `resetForm` jest eksportowany w obiekcie `actions`
- **Inference** — jedyne dostępne wyjścia ze stuck state to Skip (woła `callChat(generate=true)`, co może znowu zwrócić `inquiry_unusable`) lub reload przeglądarki

#### Intencjonalność

- **Evidence** — commit `eb255aa` (2026-05-29): `inquiry_unusable` path dodany w `chat.ts`
- **Evidence** — commit `863ef86` (2026-06-14): specyficzna obsługa `inquiry_unusable` dodana TYLKO do `handleInquirySubmit`, nie do `handleAnswer`/`handleSkip`
- **Inference** — to niekompletna implementacja, nie decyzja projektowa: obsłużono ścieżkę "zbyt krótki initial inquiry", pominięto "AI zgubił kontekst w trakcie rozmowy"

**Werdykt: przypadkowa złożoność** (niekompletna implementacja error handlingu)

#### Wykonalność

`resetForm()` jest gotowy — to jedyne narzędzie potrzebne. Zmiany w 3 plikach:

1. `useQuoteCreator.ts` — nowa akcja `handleResetToInquiry` (alias do `resetForm()`) lub eksponowanie `resetForm` bezpośrednio
2. `QuoteCreator.tsx` — przekazanie nowej akcji jako `onReset` do ConversationCard
3. `ConversationCard.tsx` — nowy optional prop `onReset?: () => void`; render przycisku "Zacznij od nowa" przy błędzie

Prerekwizyt: brak — `resetForm()` istnieje, jest przetestowany implicitly przez test `handleSave re-entry guard`.

---

### TD-8 — Podwójna warstwa rate limitingu

#### Obecny kształt

- **Evidence** — `middleware.ts:19–26` — guard dla `/api/ai/*`: wywołuje `checkRateLimit`, przy `!allowed` SHORT-CIRCUIT (zwraca Response 429, nie woła `next()`)
- **Evidence** — `chat.ts:88–94` — niezależne `checkRateLimit` wewnątrz handlera; przy `!allowed` zwraca 429
- **Evidence** — `questions.ts:43–50` — identyczny wzorzec co `chat.ts`
- **Evidence** — 429 response shape: middleware zwraca `{ error: "rate_limit_exceeded", retry_after: N }` + Retry-After header; handlery zwracają `{ error: "Too many requests" }` bez `retry_after` w body
- **Evidence** — oba wywołania używają tej samej funkcji `checkRateLimit` z `src/lib/rate-limit.ts`
- **Inference** — inkrementowanie licznika `rate_limit_events` może nastąpić podwójnie: raz przez middleware, raz przez handler (zależy od implementacji `checkRateLimit` — patrz sub-agent 3)

#### Intencjonalność

- **Evidence** — commit `d7125d1` (2026-06-08): dodano `checkRateLimit` do middleware
- **Evidence** — commit `b71ea2c` (2026-06-14): dodano `checkRateLimit` do wszystkich 3 handlerów AI — opisane jako "backfill wiringu rate limitera"
- **Evidence** — plan `context/archive/2026-06-14-test-plan-refresh-2026-06-14/plan.md` — "żaden AI endpoint nigdy nie wywołał checkRateLimit — wiring jest brakujący wkład Fazy 3"
- **Inference** — obie warstwy były intencjonalne: middleware jako pierwsza brama, handlery jako per-endpoint enforcement (defense-in-depth)

**Werdykt: świadome ograniczenie** (defense-in-depth; nie przypadkowa duplikacja)

**Poboczny problem**: niezgodne kształty 429 response między middleware i handlerami. To jest oddzielna, mniejsza poprawka, niezależna od decyzji o architekturze warstw.

#### Wykonalność (ujednolicenie kształtu, nie usunięcie warstwy)

- Zmiana kształtu 429 response: dostosuj middleware albo handlery do wspólnego formatu (np. wszędzie `{ error: "rate_limit_exceeded", retry_after: N }`)
- Blast radius: `middleware.ts` + `chat.ts` + `questions.ts` (+ `scope.ts` jeśli nie zostanie usunięty)
- Brak integration testu dla middleware rate-limit (`src/__tests__/rate-limiting/` testuje tylko `lib/rate-limit.ts` w izolacji) — usunięcie jednej warstwy bez takiego testu byłoby ryzykowne

---

### scope.ts — Martwy kod

#### Obecny kształt

- **Evidence** — `src/pages/api/ai/scope.ts` istnieje — pełny handler POST dla `/api/ai/scope`
- **Evidence** — grep `src/`: jedyna referencja poza własnym plikiem to `src/__tests__/error-sanitization/error-sanitization.test.ts` (import testowy: `import { POST as scopePOST } from "@/pages/api/ai/scope"`)
- **Evidence** — żaden hook, komponent ani strona Astro nie woła `/api/ai/scope` przez `fetch()`
- **Evidence** — `questions.ts:12` — komentarz "unlike chat/scope" — sugeruje, że scope był wcześniej produkcyjnym endpointem
- **Inference** — scope.ts jest pozostałością wcześniejszego designu (single-shot inquiry → items); ta funkcjonalność jest teraz w `chat.ts` tryb `generate=true`

#### Intencjonalność

- **Unknown** — brak commita oficjalnie "wycofującego" scope.ts; mogło zostać przez przeoczenie przy przejściu na chat-based flow
- **Inference** — zachowanie w testach error-sanitization "ukryło" plik przed kandydatami do usunięcia

**Werdykt: unknown (prawdopodobnie przypadkowe pominięcie)**

#### Wykonalność

Usuń `src/pages/api/ai/scope.ts`. Zaktualizuj `error-sanitization.test.ts`: podmień import `scopePOST` na inny endpoint lub usuń ten przypadek testowy. Blast radius: 1 plik produkcyjny + 1 aktualizacja testowa. Prerekwizyt: sprawdzenie logów produkcyjnych (jeśli dostępne) pod kątem wywołań `/api/ai/scope`.

---

## Refactor Opportunities — ranking

### #1 — TD-5: Escape hatch ze stuck conversation state

**Obecny → docelowy kształt**

Obecny: `handleAnswer` przy `inquiry_unusable` zostaje w `phase="conversation"` z generycznym komunikatem; `ConversationCard` oferuje tylko "Spróbuj ponownie" (czyści error) i "Pomiń" (woła `callChat(generate=true)`, co może znowu zwrócić ten sam błąd); jedyne wyjście to reload przeglądarki.

Docelowy: hook eksponuje `handleResetToInquiry()` (alias do istniejącego `resetForm()`); `QuoteCreator` przekazuje ją jako `onReset` do `ConversationCard`; `ConversationCard` renderuje przycisk "Zacznij od nowa" przy błędzie obok "Spróbuj ponownie".

**Dlaczego #1**

- Jedyny kandydat z bezpośrednim, user-visible bug — użytkownik może utknąć bez wyjścia poza reload
- Przypadkowa złożoność: `handleInquirySubmit` MA specyficzną obsługę `inquiry_unusable` (wraca do inquiry), `handleAnswer` nie ma — to niekompletna implementacja, nie decyzja projektowa
- `resetForm()` jest gotowy i zeksportowany — koszt implementacji to dosłownie 3 małe zmiany w 3 plikach
- Blast radius: najmniejszy spośród kandydatów strukturalnych (3 pliki, addytywne zmiany)
- Brak prerekwizytów

**Blast radius**: `useQuoteCreator.ts` (add action) → `QuoteCreator.tsx` (pass prop) → `ConversationCard.tsx` (add button)

**Szkic inkrementalnej ścieżki**

1. `useQuoteCreator.ts` — dodaj `handleResetToInquiry` w sekcji akcji (alias do `resetForm()`)
2. `QuoteCreator.tsx` — przekaż `handleResetToInquiry` do `ConversationCard` jako `onReset`
3. `ConversationCard.tsx` — dodaj `onReset?: () => void` do props; render przycisku "Zacznij od nowa" przy `error && onReset`

**Pierwszy krok-prerekwizyt**: żaden — `resetForm()` gotowy w `useQuoteCreator.ts:55–65`

---

### #2 — TD-2: Shared typowane kontrakty HTTP

**Obecny → docelowy kształt**

Obecny: request/response types dla 3 endpointów żyją wyłącznie lokalnie w plikach API route; hook rzutuje odpowiedzi przez `as Promise<ChatResponse>` bez runtime validation; `ChatResponse` w hooku jest niekompletny — nie obejmuje wszystkich kształtów serwera.

Docelowy: `src/types.ts` eksportuje `ChatRequest`, `ChatResponseUnion`, `QuestionsRequest`, `QuestionsResponse`, `QuoteCreateRequest`; hook importuje `ChatResponseUnion` zamiast lokalnej definicji; API routes mogą (opcjonalnie) importować i reeksportować te typy.

**Dlaczego #2**

- Jedyna zmiana, która dodaje compile-time safety do granicy HTTP — każda przyszła zmiana kontraktu API jest wykrywalna przez TypeScript
- Przypadkowa złożoność — schematy były pisane inkrementalnie, nigdy nie zaplanowano shared layer
- `types.ts` jest gotowe jako centralne miejsce (14 importerów, liść DAG), zmiana czysto addytywna
- Wysoka dźwignia: unblockuje bezpieczne implementowanie TD-4 (expose savedQuoteId) w przyszłości i jest naturalnym prerekwizitem dla każdego rozszerzenia kontraktów API
- Ryzyko: zerowe — tylko nowe typy, nic w runtime się nie zmienia

**Blast radius**: `types.ts` (add) → `useQuoteCreator.ts` (import zamiast local) → opcjonalnie `chat.ts`, `questions.ts`, `quotes/index.ts`

**Szkic inkrementalnej ścieżki**

1. `src/types.ts` — dodaj `ChatRequest`, `ChatResponseUnion`, `QuestionsRequest`, `QuestionsResponse`, `QuoteCreateRequest` (czysto addytywne, 0 istniejących importów dotknięte)
2. `useQuoteCreator.ts:5–9` — zastąp lokalną definicję `ChatResponse` importem `ChatResponseUnion` z `types.ts`
3. (Oddzielny PR, opcjonalny) API routes importują Zod schemas z `types.ts` — pełna synchronizacja kontraktów

**Pierwszy krok-prerekwizyt**: żaden — `types.ts` dostępny od razu

---

### #3 — scope.ts: Usunięcie martwego kodu

**Obecny → docelowy kształt**

Obecny: `src/pages/api/ai/scope.ts` istnieje jako pełny handler POST, nigdy nie wywołany z klienta, jedyna produkcyjna referencja wewnątrz testów error-sanitization.

Docelowy: plik usunięty; `error-sanitization.test.ts` zaktualizowany (podmień `scopePOST` na istniejący endpoint lub usuń ten przypadek testowy).

**Dlaczego #3**

- Martwy kod to koszt ciągły: każdy developer czyta scope.ts i musi ocenić, czy jest używany
- Middleware guard `pathname.startsWith("/api/ai/")` obejmuje `/api/ai/scope` — martwy endpoint jest objęty rate-limit checkiem po stronie middleware przy każdym requescie do `/api/ai/*`
- Koszt usunięcia: minimalny (1 plik + aktualizacja 1 testu)
- Ryzyko regresji: zerowe — grep potwierdził, że żaden klient nie woła tego endpointu

**Blast radius**: `src/pages/api/ai/scope.ts` (delete) → `src/__tests__/error-sanitization/error-sanitization.test.ts` (update)

**Szkic inkrementalnej ścieżki**

1. Sprawdź logi produkcyjne (jeśli dostępne) pod kątem wywołań `/api/ai/scope` — to jedyne ryzyko nie-techniczne
2. Usuń `src/pages/api/ai/scope.ts`
3. Zaktualizuj `error-sanitization.test.ts`: usuń import `scopePOST`, podmień przypadek testowy na `chatPOST` lub `questionsPOST`

**Pierwszy krok-prerekwizyt**: grep logów produkcyjnych (jeśli brak dostępu — unknown, zakładamy bezpieczeństwo usunięcia na podstawie kodu)

---

## Kandydaci rozważeni i odrzuceni

### TD-1 — Hardcoded URL strings

**Odrzucony.** Świadome ograniczenie: wzorzec self-contained hook był decyzją projektową (commit `6b1d06e`). Grep potwierdza, że URL-e żyją wyłącznie w jednym miejscu — brak drugiego konsumenta, który tworzyłby ryzyko desynchronizacji. Koszt długu wzrasta dopiero przy dodaniu kolejnych hooków wołających te same endpointy. Przy obecnym zakresie: defer until second consumer appears.

### TD-3 — Niezgodność walidacyjnych (magic numbers)

**Odrzucony jako priorytet.** Świadome ograniczenie: różne minima (3 vs 20) są explicite zdokumentowane jako różne wymagania projektowe. `InquiryForm.tsx` JUŻ implementuje walidację kliencką z dokładnie tymi wartościami — użytkownik w normalnym flow nie widzi błędu serwera. Ryzyko dryftu magic numbers jest niskie przy jednym formularzu. To housekeeping, nie bug.

### TD-4 — Expose savedQuoteId

**Odrzucony jako refaktor.** Świadome ograniczenie na poziomie produktowym: plan z `ai-quote-creation-flow` explicite zaprojektował ekran sukcesu jako link do listy wycen. Zmiana wymaga: (a) decyzji produktowej (zmiana UX flow po zapisie), (b) istnienia lub stworzenia strony `/quotes/[id].astro`. To feature request, nie refaktor.

**Niezależna poprawka warta PR**: `useQuoteCreator.test.ts:161` mockuje `{ id: "q1" }` zamiast `{ quote: { id: "q1", ... } }` — bug testowy (mock niezgodny z API). Zerowy blast radius, 5 minut pracy.

### TD-8 — Rate limiting podwójna warstwa

**Odrzucony jako kandydat do usunięcia jednej warstwy.** Świadome ograniczenie: defense-in-depth była intencją (plan `test-plan-refresh-2026-06-14`). Brak integration testu middleware rate-limit — usunięcie handlera bez takiego testu byłoby ryzykowne.

**Warto naprawić poboczny problem**: niezgodne kształty 429 response (middleware: `{ error: "rate_limit_exceeded", retry_after: N }` vs handlery: `{ error: "Too many requests" }`). To mniejsza, izolowana poprawka, która nie wymaga zmiany architektury warstw.

---

## Open Questions

1. Czy `/quotes/[id].astro` (detail page) istnieje? — warunkuje TD-4 jako feature request
2. Czy dostęp do logów produkcyjnych pozwala potwierdzić brak wywołań `/api/ai/scope`? — ostatni krok przed usunięciem scope.ts
3. Czy niezgodność kształtów 429 response (TD-8 poboczny) jest warta małego PR przed/poza rankingiem?
4. Otwarte pytanie z prior research: czy testy `error-sanitization` wywołują prawdziwego Anthropica — to nie jest kandydat do refaktoru, ale informuje o koszcie uruchamiania testów

---

## Code References

- [`src/components/hooks/useQuoteCreator.ts:55–65`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/hooks/useQuoteCreator.ts#L55) — `resetForm()` gotowy; kluczowy dla #1
- [`src/components/hooks/useQuoteCreator.ts:126–129`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/hooks/useQuoteCreator.ts#L126) — `handleAnswer` nie rozróżnia `inquiry_unusable`
- [`src/components/hooks/useQuoteCreator.ts:67–81`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/hooks/useQuoteCreator.ts#L67) — `handleInquirySubmit` MA specyficzną obsługę — pokazuje jak powinna wyglądać naprawa
- [`src/components/quotes/ConversationCard.tsx:76–85`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/quotes/ConversationCard.tsx#L76) — error display bez `onReset`; tu wchodzi nowy przycisk
- [`src/types.ts`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/types.ts) — 14 importerów, liść DAG — właściwe miejsce dla HTTP contracts (#2)
- [`src/components/hooks/useQuoteCreator.ts:5–9`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/hooks/useQuoteCreator.ts#L5) — lokalna `ChatResponse` do zastąpienia importem (#2)
- [`src/pages/api/ai/scope.ts`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/pages/api/ai/scope.ts) — martwy endpoint do usunięcia (#3)
- [`src/__tests__/error-sanitization/error-sanitization.test.ts`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/__tests__/error-sanitization/error-sanitization.test.ts) — jedyny importer scope.ts; do aktualizacji przy #3
- [`src/components/hooks/useQuoteCreator.test.ts:161`](https://github.com/mbkosik/quotekit/blob/3c9a5afa3011582e74c6399c3bb060791ede6ee4/src/components/hooks/useQuoteCreator.test.ts#L161) — bug testowy w mocku handleSave (niezależna poprawka)

## Related Research

- `context/changes/quote-creator-refactor/research.md` — prior research (inventory długu, blast radius, mapa pokrycia testami)
- `context/map/repo-map.md` — mapa architektury (import graph, aktywność git, strefy ryzyka)
