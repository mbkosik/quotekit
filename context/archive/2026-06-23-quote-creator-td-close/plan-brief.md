# Quote Creator TD Close — Plan Brief

> Full plan: `context/changes/quote-creator-td-close/plan.md`
> Research: `context/changes/quote-creator-refactor/research.md`

## What & Why

Domknięcie 4 pozycji technical debt zidentyfikowanych w badaniu refaktoru `useQuoteCreator`. TD-2 i TD-5 zostały zamknięte wcześniej — pozostały URL constants (TD-1), walidacja client-side (TD-3), capture savedQuoteId (TD-4) i brakujące testy dla 3 handlerów (TD-6).

## Starting Point

Hook zarządza przepływem tworzenia wyceny przez 7 faz. Typy HTTP kontraktów są już w `src/types.ts` (TD-2 done), a ConversationCard ma `onReset` (TD-5 done). Zostają 3 hardcoded URL strings, brak walidacji min-20 na kliencie, utrata ID po zapisie i 3 niepokryte handlery.

## Desired End State

URL-e hooka są stałymi TypeScript. Krótkie zapytania są blokowane po stronie klienta z czytelnym komunikatem. Po zapisie wyceny success screen prowadzi bezpośrednio do `/quotes/:id`. Każdy z brakujących handlerów ma co najmniej 2 testy.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| TD-4 success screen | Jeden link do `/quotes/:id` | Jasny następny krok; "Utwórz nową" button obsługuje reset | Plan |
| TD-3 error placement | `sparseMessage` (istniejący slot) | Zero nowych zmiennych stanu i komponentów | Plan |
| TD-6 coverage | happy path + network error (5 testów) | 429 pokryta systemowo przez `is429()` — nie duplikujemy | Plan |
| TD-1 scope | Stałe w tym samym pliku | URLs używane wyłącznie w jednym hooku | Research |

## Scope

**In scope:** TD-1, TD-3, TD-4, TD-6 w 3 plikach (hook, component, tests)

**Out of scope:** TD-7 (component tests), TD-8 (rate limiting design), real-time validation, nowe zmienne stanu dla error display

## Architecture / Approach

Zmiany są izolowane w warstwie hooka i jego konsumenta. Brak migracji DB, brak nowych plików, brak zmian API. Sekwencja: najpierw czyste poprawki (constants + guard), potem zmiana state shape (savedQuoteId), na końcu testy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. URL Constants + Validation | TD-1 + TD-3 w hooku | Brak |
| 2. savedQuoteId | TD-4 w hooku + komponencie | Mock w re-entry guard teście zwraca `{ id }` zamiast `{ quote: { id } }` — musi być naprawiony w fazie 3 |
| 3. Tests | TD-3 test + TD-4 update + TD-6 (5 testów) | Poprawność setupu do `conversation`/`questions` state przed testami handlerów |

**Prerequisites:** npm i vitest dostępne (`npx vitest run` działa)
**Estimated effort:** ~1 sesja, 3 fazy

## Open Risks & Assumptions

- Re-entry guard test (L344) ma błędny mock `{ id: "q1" }` — faza 3 naprawia go razem z dodaniem asercji TD-4
- Zakładam, że `/quotes/[id].astro` renderuje wycenę po ID (potwierdzono istnienie pliku, nie weryfikowano treści)

## Success Criteria (Summary)

- `npm run lint` + `npx vitest run` przechodzą po każdej fazie
- Po zapisie wyceny link "Otwórz wycenę" otwiera konkretną wycenę
- Input < 20 znaków nie wychodzi do sieci
