# useQuoteCreator Refactor — Plan Brief

> Full plan: `context/changes/refactor-opportunities-quote-creator/plan.md`
> Research: `context/changes/refactor-opportunities-quote-creator/research.md`

## What & Why

Cztery addytywne zmiany porządkujące dług techniczny wokół `useQuoteCreator`. Priorytet wynika z researchów i przeglądu 4-agentowego: jeden user-visible bug (stuck state bez wyjścia), jeden fałszywy pozytyw w teście, jeden martwy endpoint i brakująca warstwa typów HTTP.

## Starting Point

`useQuoteCreator.ts` steruje pełnym flow tworzenia wyceny. `handleAnswer` przy błędzie `inquiry_unusable` zostawia użytkownika w `phase="conversation"` bez wyjścia poza reload. Kontrakty HTTP między hookiem a API routes są lokalne i niezsynchronizowane.

## Desired End State

Użytkownik zablokowany w konwersacji widzi przycisk "Zacznij od nowa" i wraca do formularza bez reloadu. Test mock odpowiada faktycznemu API. `scope.ts` nie istnieje. `src/types.ts` eksportuje pełne kontrakty HTTP — zmiana kształtu response w handlerze jest wykrywalna przez TypeScript w build time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Plan structure | Jeden plan, 4 fazy | Tematycznie spójne, jeden PR do review | Plan |
| TD-5 API hooka | Nowy alias `handleResetToInquiry` | Semantycznie czytelna nazwa dla konsumenta | Plan |
| TD-2 zakres | Extended: types.ts + hook + 3 API routes | Pełna synchronizacja; `satisfies` daje compile-time safety | Plan |
| Obsługa `inquiry_unusable` w `handleAnswer` | Bez zmiany logiki — przycisk UI jako wyjście | Zmiana kompatybilna wstecz; nie wymaga rozróżnienia błędów w hooku | Plan |
| scope.ts test | Usuń describe block, nie zastępuj | Scenariusz `messages.parse` jest już pokryty przez chatPOST generate mode | Research |
| TD-4, TD-8, TD-1, TD-3 | Poza zakresem | Świadome ograniczenia lub zmiany produktowe | Research |

## Scope

**In scope:**
- TD-5: escape hatch "Zacznij od nowa" w ConversationCard przy błędzie
- Bug testowy: mock `{ id }` → `{ quote: { id } }` w `useQuoteCreator.test.ts:161`
- scope.ts: usunięcie pliku + oczyszczenie error-sanitization.test.ts
- TD-2: 5 nowych typów w `types.ts`, import w hooku, `satisfies` w 3 API routes

**Out of scope:**
- TD-4 (expose savedQuoteId / redirect do detail page) — zmiana produktowa
- TD-8 (usunięcie jednej warstwy rate limitingu) — świadome defense-in-depth
- TD-1 (ekstrakcja URL do stałych) — brak drugiego konsumenta
- TD-3 (magic numbers) — InquiryForm już waliduje; housekeeping

## Architecture / Approach

Wszystkie 4 fazy są niezależne i addytywne (lub subtraktywne w izolacji). Faza 1 rozszerza hook o alias i ConversationCard o optional prop. Faza 4 dodaje typy do `types.ts` (liść DAG) i używa TypeScript `satisfies` w API routes — zero zmiany runtime, tylko compile-time safety. Zmiany nie wchodzą w interakcję ze sobą.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Conversation Escape Hatch | "Zacznij od nowa" przy błędzie w konwersacji | Brak — `resetForm()` gotowy, zmiany addytywne |
| 2. Fix Stale Test Mock | Mock handleSave zgodny z API | Brak — jedna linia w teście |
| 3. Remove Dead Endpoint | scope.ts usunięty, import wyczyszczony | Brak — grep potwierdził zero wywołań produkcyjnych |
| 4. Shared HTTP Contracts | 5 typów w types.ts, satisfies w routes | `satisfies` może ujawnić istniejące niespójności w routes |

**Prerequisites:** brak  
**Estimated effort:** ~1-2 sesje; fazy 2 i 3 to minuty; faza 1 i 4 to ~30-45 min każda

## Open Risks & Assumptions

- Faza 4 `satisfies` w `chat.ts` — `ChatResponse` obejmuje 4 warianty sukcesu; nie obejmuje odpowiedzi błędowych (401, 429, 503) co jest zamierzone. Jeśli ktoś próbuje dodać `satisfies` do błędów — błąd kompilacji.
- `QuoteCreateRequest` w `quotes/index.ts` — zakładamy, że `z.infer<typeof CreateSchema>` pasuje do interfejsu. Jeśli nie, build ujawni niezgodność przy type assertion.

## Success Criteria (Summary)

- `npm run test` zielony po każdej fazie
- `npm run build` zielony po Fazie 4
- Użytkownik wychodzi ze stuck conversation state bez reloadu przeglądarki
