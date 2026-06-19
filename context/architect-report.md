---
title: "QuoteKit — Raport Architektoniczny"
created: 2026-06-15
sources: [L2: repo-map.md, L3: quote-creator-refactor/research.md, L4: refactor-opportunities-quote-creator/plan.md, L5: domain/*.md]
---

# Raport Architektoniczny — QuoteKit

## 1. Opisane projekty

Wszystkie cztery artefakty (L2–L5) pochodzą z **jednego repozytorium**: `quotekit`.

| Artefakt | Stack | Skala (orientacyjnie) |
| -------- | ----- | --------------------- |
| L2 — repo-map.md | Astro 6 SSR, React 19, Supabase, Cloudflare Workers, shadcn/ui | ~47 modułów TS, 87 krawędzi importów; 73 commity w `src/components/quotes/` w ciągu roku |
| L3 — quote-creator-refactor/research.md | j.w. | Analiza na commit `3c9a5af` |
| L4 — refactor-opportunities-quote-creator/plan.md | j.w. | 4 fazy, 4 pliki krytyczne |
| L5 — domain/*.md (3 pliki) | j.w. | 12 pojęć UL, 8 niezmienników, 2 kandydaci ACL |

---

## 2. Mapa projektu (L2)

**Entry point**: `pages/new.astro:7–12` montuje `<QuoteCreator client:load />` bez props — punkt wejścia dla całego flow AI. Middleware (`src/middleware.ts`) ustala sesję przed dotarciem do strony.

**Centrum aktywności**: `src/components/quotes/` (73 commity, 73% wszystkich) + `src/components/hooks/` (24 commity, 12 co-changes z quotes). Para hooks ↔ quotes to jedyne silne sprzężenie widoczne zarówno w git, jak i w grafie TS.

**Trzy strefy ryzyka** (zidentyfikowane w L2, pogłębione w L3–L5):

1. `useQuoteCreator.ts` — centralny orchestrator z 12 stanami (sprostowanie z L3: nie 13), 3 `fetch()` do hardkodowanych URL-i. Zmiana nazwy route wymaga `grep`, nie TS.
2. `UserContextForm.tsx` — cross-cutter (4.8 dirs/commit), **zero importerów w grafie TS**. Coupling biegnie przez `.astro` — niewidoczny dla statycznej analizy.
3. Trzy trasy AI (`chat.ts`, `questions.ts`, `scope.ts`) — identyczny zestaw importów infra, brak wspólnej abstrakcji, model Anthropic hardkodowany ×3.

**Kluczowy unknown**: Pliki `.astro` są poza zasięgiem dependency-cruiser. Coupling `UserContextForm` ↔ flow wyceny, montowanie komponentów i routing auth przez HTML `form action` — nieweryfikowalne przez TypeScript.

---

## 3. Analiza ficzera (L3)

**Badany przepływ**: `useQuoteCreator` — wybrany ze względu na strefę ryzyka #1 z mapy (centralny orchestrator, hardcoded URLs, luki testowe).

**Overview**: Użytkownik wkleja zapytanie klienta → `handleInquirySubmit` wywołuje `POST /api/ai/chat` → API rozgałęzia odpowiedź na trzy ścieżki: `type="question"` (rozmowa doprecyzowująca, max 5 rund), `type="sparse"` (zbyt krótkie → `POST /api/ai/questions`), `type="complete"` (bezpośrednia generacja). Po zakończeniu rozmowy → `handleSave` → `POST /api/quotes` → `phase="done"`.

**Trzy najważniejsze długi techniczne** (wszystkie potwierdzone analizą kodu w L3):

| Dług | Dowód | Ryzyko |
| ---- | ----- | ------ |
| **TD-5: Stuck state** — przy błędzie `inquiry_unusable` (HTTP 422) `handleAnswer` zostaje w `phase="conversation"` bez wyjścia; jedyny reset to reload strony | `useQuoteCreator.ts:37` (422 pass-through) + `QuoteCreator.tsx:68–86` (brak przycisku reset) | User-visible, brak testu |
| **TD-6: handleSkip / handleGenerateQuestions / handleBackFromQuestions** — trzy callbacki (L150–195) bez ani jednego testu; `handleSkip` to krytyczna ścieżka pomijająca pytania | `useQuoteCreator.test.ts` — brak referencji do tych funkcji | Cicha regresja przy refaktorze |
| **TD-2: Brak shared HTTP types** — `ChatResponse` zdefiniowany tylko po stronie hooka (L5–9); zmiana kształtu odpowiedzi w `chat.ts` nie wygeneruje błędu kompilacji w hooku | `useQuoteCreator.ts:5–9` vs `chat.ts:161,186,210,216` | Drift nieweryfikowalny przez TS |

**Blast radius** przy refaktorze interfejsu hooka: `QuoteCreator.tsx`, `InquiryForm.tsx`, `LineItemsEditor.tsx`, `ConversationCard.tsx` (3–4 co-changes każdy wg git).

---

## 4. Plan refaktoryzacji (L4)

**Co refaktoryzowane**: Cztery niezależne zmiany porządkujące TD w `useQuoteCreator` i okolicach, w kolejności priorytetowej.

**Czego świadomie NIE robimy**: runtime validation (Zod) w hooku, expose `savedQuoteId` / redirect do `/quotes/:id` (zmiana produktowa, nie refaktor), usunięcie podwójnego rate limitingu (świadome defense-in-depth), merge tras AI.

| Faza | Zmiana | Weryfikacja |
| ---- | ------ | ----------- |
| **1** — Escape hatch z `phase="conversation"` | `resetForm()` + `setError("")` → alias `handleResetToInquiry`; przycisk "Zacznij od nowa" w `ConversationCard` | auto: nowy test `handleResetToInquiry`; ręcznie: React DevTools wymuszony błąd |
| **2** — Naprawa mocka w teście | `jsonResponse({ id: "q1" })` → `jsonResponse({ quote: { id: "q1" } })` w linii 161 | auto: `npm run test` |
| **3** — Usunięcie martwego `scope.ts` | Usuń plik + describe block w `error-sanitization.test.ts:42–56` | auto: test + lint; `ls src/pages/api/ai/` |
| **4** — Shared HTTP contracts | 5 typów do `src/types.ts` (`ChatRequest`, `ChatResponse`, `QuestionsRequest`, `QuestionsResponse`, `QuoteCreateRequest`); hook i 3 trasy używają `satisfies` | auto: test + lint + `npm run build` |

---

## 5. Domena wg DDD (L5)

**Ubiquitous Language — 5 kluczowych pojęć**:

| Pojęcie | Kod | Rozjazd |
| ------- | --- | ------- |
| Wycena (Quote) | `src/types.ts:22–31`, tabela `quotes` | brak — model spójny |
| Pozycja wyceny (QuoteItem) | `src/types.ts:13–18`, `content JSONB` | **M1**: PRD explicite definiuje `subtotal = hours × rate`; brak pola w typie — obliczanie ad-hoc w UI |
| Status wyceny | `QUOTE_STATUSES` + CHECK DB | **M2**: PRD: `draft → sent → accepted\|rejected` (unidirektionalny); PATCH `[id].ts:84–114` akceptuje dowolne przejście bez walidacji |
| Sesja tworzenia (QuoteCreationSession) | `Phase` type w hooku, `useQuoteCreator.ts:4` | Efemeryczna, tylko kliencka — świadoma decyzja; niezmienniki sesji (max 5 pytań, conversation-must-complete) egzekwowane wyłącznie po stronie klienta |
| Kontekst użytkownika | `user_settings.prompt_context`, max 500 znaków | brak — model spójny |

**Niezmiennik #1**: Pipeline statusów jest unidirektionalny (`draft → sent → accepted | rejected`). Należy do agregatu `Quote` (root: `id: UUID`). Egzekwowany dziś: ✅ DB CHECK (wartość), ✅ Zod enum (wartość), ❌ **ZERO walidacji przejść** po stronie API — jedno żądanie `PATCH { status: "accepted" }` na wycenie `draft` przechodzi bez błędu. Plan naprawy: nowy moduł `src/lib/quote-status-machine.ts` + SELECT przed UPDATE w handlerze (L5: `02-invariant-aggregate-refactor.md`).

**Anti-Corruption Layer**: Zależność `@anthropic-ai/sdk` przecieka przez **2 warstwy** — z planowej fabryki `src/lib/anthropic.ts` (9 linii) bezpośrednio do 3 tras HTTP. Sub-path import `zodOutputFormat` z `@anthropic-ai/sdk/helpers/zod` pojawia się w `chat.ts:3`, `questions.ts:3`, `scope.ts:3`; wzorzec `messages.parse` + `parsed_output` + `content[0].type` zduplikowany ×3; nazwa modelu `"claude-haiku-4-5-20251001"` hardkodowana ×3. Dokument `tech-stack.md:24` deklaruje SDK jako wymienialny (`(e.g., ...)`). Rozwiązanie: port `AIScopingPort` + `AnthropicScopingAdapter` — po refaktorze `grep -r "@anthropic-ai/sdk" src/` zwraca 1 plik (L5: `03-anti-corruption-layer.md`).

---

## 6. Decyzje, które należą do mnie

**Sekwencja planów** — mam dwa aktywne, nakładające się plany (L4 i L5 ACL dla Anthropic). Postanawiam nie wdrażać ich równolegle: L4 wchodzi pierwsza (addytywna, niski blast radius), ACL z L5 — osobno, jako głębszy refaktor. Tego wyboru sekwencji AI nie podjął — wynikał z mojej oceny ryzyka równoczesnych zmian.

---

Poniższe decyzje zostały zaproponowane przez agenta i przeze mnie zatwierdzone:

- **Priorytet niezmiennika I1** (pipeline statusów) nad I2 (sesja AI) — agent uzasadnił słabością egzekucji serwerowej; I2 jest celowo kliencka per PRD.
- **scope.ts do usunięcia** — agent potwierdził martwość przez analizę statyczną; akceptuję ryzyko braku logów prod.
- **Alias `handleResetToInquiry`** zamiast nowej logiki — agent wskazał istniejący `resetForm()` jako gotowy fundament; minimalna zmiana.
