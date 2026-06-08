# RLS Write-Path — Plan Brief

> Full plan: `context/changes/rls-write-path/plan.md`

## What & Why

Risk #6 w test-planie: polityki RLS UPDATE i DELETE na tabeli `quotes` muszą blokować modyfikację cudzych wycen. Polityki istnieją w migracji i wyglądają poprawnie — ale bez testu nie ma gwarancji, że nie zostaną przypadkowo usunięte lub zneutralizowane przy przyszłej zmianie schematu. Celem jest empiryczne zamknięcie tej gwarancji testem integracyjnym.

## Starting Point

Infrastruktura testowa jest gotowa (`createTestUser`, `createAdminClient`, `cleanupTestUser`). Wzorzec dla risk #2 (SELECT RLS) istnieje w `src/__tests__/access-control/idor-read.test.ts`. Polityki `quotes_update_own` i `quotes_delete_own` są zdefiniowane w `supabase/migrations/20260526000000_create_quotes.sql` (linie 44–49).

## Desired End State

Plik `src/__tests__/access-control/idor-write.test.ts` z 3 testami: (1) sanity — właściciel może zaktualizować własną wycenę, (2) cross-user UPDATE zwraca 0 wierszy i admin re-read potwierdza brak mutacji, (3) cross-user DELETE zwraca count=0 i admin re-read potwierdza że rekord istnieje.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Source |
|---------|-------|----------|--------|
| Warstwa testu | DB/RLS (Supabase client bezpośrednio) | Ryzyko leży w polityce RLS, nie w HTTP — spójne z idor-read.test.ts | Plan |
| Zakres operacji | UPDATE + DELETE | Wprost wymienione w risk #6; INSERT spoofing to odrębny attack vector | Plan |
| Asercja braku mutacji | count=0 + admin re-read | Dwie niezależne wyroczni; re-read przez service-role jest niepodważalny | Plan |
| Lokalizacja pliku | Nowy `idor-write.test.ts` | Jeden plik = jedno ryzyko; spójne z naming convention | Plan |

## Scope

**In scope:** Jeden plik testowy, 3 testy, 0 nowych dependencji, 0 nowych helper functions.

**Out of scope:** Testy przez HTTP API, INSERT user_id spoofing, sanity test dla DELETE właściciela, mocki Supabase.

## Architecture / Approach

Bezpośrednie wywołania Supabase client jako User B z tokenem JWT (RLS aktywne). Admin client (service-role, omija RLS) używany tylko do setup fixture i re-read po asercjach. Identyczny pattern co idor-read.test.ts — różni się tylko typem operacji (UPDATE/DELETE zamiast SELECT).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Write idor-write.test.ts | 3 testy integracyjne dla risk #6 | Supabase zwraca `{ data: [], error: null }` (nie błąd) dla zablokowanego UPDATE — asercja musi sprawdzać długość tablicy, nie error |

**Prerequisites:** `npx supabase start` uruchomiony lokalnie; zmienne `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` w `.env`.  
**Estimated effort:** ~1 sesja (jeden plik, ustalony wzorzec).

## Open Risks & Assumptions

- Supabase może zwrócić różne kształty dla `update().select()` w zależności od wersji SDK — należy zweryfikować że `data` jest tablicą po operacji i sprawdzić `data.length === 0`, nie `data === null`.
- `count` z `.delete({ count: "exact" })` może być `null` jeśli SDK zmieni kontrakt — plan zakłada że jest `number`.

## Success Criteria (Summary)

- `npx tsc --noEmit` i `npx eslint` czysty na nowym pliku.
- `npm test src/__tests__/access-control/idor-write.test.ts -- --reporter=verbose` → 3 testy zielone.
