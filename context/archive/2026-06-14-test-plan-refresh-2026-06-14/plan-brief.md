# Test Plan Refresh R1–R3 — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-06-14/plan.md`
> Research: `context/changes/test-plan-refresh-2026-06-14/research.md`

## What & Why

Trzy funkcje wysłane od 2026-06-01 nie mają żadnych testów: `/api/ai/questions`, filtrowanie `GET /api/quotes?status=&search=`, i `user_settings` + `/api/settings`. Ten plan zamyka te luki, jednocześnie backfillując brakujący wiring rate limitera, który istniał jako funkcja od Fazy 3, ale nigdy nie był wywoływany z żadnego AI endpointu.

## Starting Point

Cztery oryginalne fazy testowe są zakończone. `checkRateLimit` jest przetestowana na poziomie funkcji, ale `scope.ts`, `chat.ts` i `questions.ts` nigdy jej nie wywołują — każdy API endpoint AI ma niezabezpieczony kanał do Anthropic bez żadnego spend cap na poziomie aplikacji.

## Desired End State

Wszystkie trzy AI endpointy zwracają HTTP 429 gdy user przekroczy limit zapytań. `error-sanitization.test.ts` pokrywa questions.ts. Dwa nowe pliki testów (`query-filter-isolation.test.ts`, `settings-idor.test.ts`) dowodzą że filtry i RLS nie ujawniają cudzych danych. `test-plan.md` §3 ma kompletne fazy R1–R3 ze statusami.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Zakres wiringu rate limitera | Wszystkie 3 AI endpointy | Phase 3 nigdy nie wired funkcji w endpointy — backfill w jednym commicie | Plan |
| Poziom testu rate limitingu | Funkcja (bez endpoint-level 429 testu) | Istniejący `rate-limit.test.ts` pokrywa funkcję; wiring = wystarczający sygnał dla scope/chat; spójność | Plan |
| Delivery | 3 osobne PR-y | Każdy PR zamknięty przez CI gate przed mergem | Plan |
| test-plan.md update | Spec-first (pierwszy commit PR 1) | Test-plan.md jest QA spec, nie dziennikiem | Plan |
| R2 test approach | Bezpośrednio na Supabase kliencie | Wzorzec z idor-read.test.ts; handler query = DB query (bez parsowania URL params) | Research |
| R3 test approach | Bezpośrednio na Supabase kliencie | Bezpośrednia weryfikacja RLS; IDOR przez API niemożliwy (user_id z middleware) | Research |

## Scope

**In scope:**
- Wiring `checkRateLimit` do questions.ts, scope.ts, chat.ts (implementacja + 429 odpowiedź)
- Rozszerzenie `error-sanitization.test.ts` o questions.ts describe block
- Nowy `query-filter-isolation.test.ts` (2 użytkowników, kombinacje filtrów)
- Nowy `settings-idor.test.ts` (cross-user SELECT + upsert + admin re-read)
- Spec-first update `test-plan.md` §2 i §3

**Out of scope:**
- Endpoint-level test HTTP 429 (hybrid pattern odrzucony na rzecz spójności z istniejącymi testami)
- Nowe testy rate limitowania dla scope.ts i chat.ts (tylko wiring)
- UI/frontend testy (negative space per test-plan.md §7)
- Zmiana parametrów rate limitera (defaults 20 req/60s)
- Polityka DELETE dla user_settings (intentional no-policy)

## Architecture / Approach

Rate limit wiring: po auth check (`context.locals.user`) tworzymy Supabase klient → wywołujemy `checkRateLimit(supabase, userId)` → jeśli `!allowed` zwracamy 429 z `Retry-After` header, fail-open jeśli klient null. W chat.ts Supabase klient jest już tworzony (dla user_settings) — wymagany reorder by był dostępny przed Anthropic check.

Testy integracyjne (R2, R3): bezpośrednio na Supabase kliencie (bez importowania handlera), dwa prawdziwi użytkownicy z nakładającymi się fixtures, asercje cross-user na ID + admin re-read.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. R1 AI safety | Rate limiter wired w 3 endpoints + questions.ts sanitization test | chat.ts wymaga reorder Supabase/Anthropic inicjalizacji |
| 2. R2 Filter isolation | `query-filter-isolation.test.ts` — 3 testy cross-user z filtrami | Proste; wymaga `npx supabase start` |
| 3. R3 Settings RLS | `settings-idor.test.ts` — 4 testy IDOR dla user_settings | Upsert pod RLS może zwrócić brak błędu (admin re-read = autorytatywna asercja) |

**Prerequisites:** `npx supabase start` dla Faz 2 i 3. Konto Cloudflare + `wrangler dev` dla manual verification Fazy 1.

**Estimated effort:** ~2-3 sesje robocze; Faza 1 największa (5 zmian), Fazy 2 i 3 to po jednym pliku testowym.

## Open Risks & Assumptions

- `createClient(context.request.headers, context.cookies)` w questions.ts i scope.ts — poprawnie wyciągnie JWT w środowisku wrangler dev; nie przetestowane jeszcze w tym wzorcu dla tych endpointów
- Upsert w settings-idor.test.ts pod RLS: zachowanie może zależeć od wersji Supabase — admin re-read jest jedyną autorytywną asercją

## Success Criteria (Summary)

- `npm test` green po każdym z 3 PR-ów (z `npx supabase start` dla Faz 2/3)
- 3 AI endpointy zwracają 429 gdy limit przekroczony (manual verification w wrangler dev)
- `test-plan.md` §3 ma fazy R1–R3 ze statusem `done` po ostatnim merge
