# Test Plan Refresh R1–R3 — Implementation Plan

## Overview

Dodajemy trzy nowe fazy testowe (R1, R2, R3) pokrywające funkcje wysłane od 2026-06-01, które nie mają żadnych testów: `/api/ai/questions`, filtrowanie `GET /api/quotes`, i `user_settings` + `/api/settings`. Przy okazji backfillujemy brakujący wiring rate limitera do wszystkich trzech AI endpointów — funkcja istnieje od Fazy 3, ale nigdy nie była wywoływana z żadnego handlera.

## Current State Analysis

- `src/lib/rate-limit.ts` — `checkRateLimit` istnieje i jest przetestowana na poziomie funkcji (`rate-limit.test.ts`), ale **żaden AI endpoint** (scope.ts, chat.ts, questions.ts) jej nie wywołuje
- `src/pages/api/ai/questions.ts` — brak Supabase klienta, brak wywołania `checkRateLimit`, brak rate limitingu; catch block na linii 76–80 poprawnie sanityzuje błędy Anthropic
- `src/pages/api/ai/scope.ts` — brak Supabase klienta, brak `checkRateLimit`
- `src/pages/api/ai/chat.ts` — Supabase klient istnieje (linia 94, dla user_settings), ale brak `checkRateLimit`
- `src/pages/api/quotes/index.ts` — GET handler ma bezpieczną kompozycję zapytań: `.eq("user_id", user.id)` zawsze na pierwszym miejscu, niezależnie od filtrów URL
- `supabase/migrations/20260613000000_create_user_settings.sql` — polityki RLS kompletne: SELECT, INSERT WITH CHECK, UPDATE z USING+WITH CHECK, brak DELETE (intentional)
- `supabase/migrations/20260614000000_grant_table_permissions.sql` — `GRANT SELECT, INSERT, UPDATE ON TABLE user_settings TO authenticated`
- `src/__tests__/error-sanitization/error-sanitization.test.ts` — 4 testy dla scope.ts i chat.ts; wzorzec `vi.hoisted` + `vi.mock("@/lib/anthropic")` gotowy do rozszerzenia
- Wzorce testowe: `createTestUser`, `createAdminClient`, `createUserClient` w `src/lib/test-helpers.ts` i `src/lib/supabase-test.ts`

## Desired End State

Po zakończeniu planu:
- Wszystkie trzy AI endpointy zwracają HTTP 429 z nagłówkiem `Retry-After` gdy użytkownik przekroczy limit zapytań
- `error-sanitization.test.ts` pokrywa questions.ts (łącznie 5 testów)
- Dwa nowe pliki testów (`query-filter-isolation.test.ts`, `settings-idor.test.ts`) dowodzą izolacji danych
- `context/foundation/test-plan.md` §2 i §3 są zsynchronizowane z nowym stanem pokrycia
- CI zielone; pre-commit hook nie blokuje

**Weryfikacja**: `npm test` przechodzi, `npx astro check` czyste, wszystkie 3 PR przechodzą CI gate.

### Key Discoveries

- Żaden AI endpoint nigdy nie wywołał `checkRateLimit` — wiring jest brakujący wkład Fazy 3, nie nowy scope (`src/pages/api/ai/*.ts`)
- questions.ts używa `client.messages.parse` (linia 69) — tylko `mockParse` potrzebny w teście sanityzacji, `mockCreate` nie jest wywoływany
- `inquiry_text` min 3 znaki w questions.ts (nie 20 jak scope/chat) — `z.string().min(3)` na linii 11 — wpływa na `makeContext` w teście
- chat.ts ma już Supabase klient (linia 94) — wiring rate limitera to jeden `import` + jedno wywołanie bez nowej inicjalizacji klienta; scope.ts i questions.ts wymagają nowego `createClient`
- Upsert `user_settings` w API używa `user_id: user.id` z middleware (nie z body) — IDOR przez API niemożliwy; test weryfikuje ochronę na poziomie DB/RLS

## What We're NOT Doing

- Endpoint-level test 429 (hybrid pattern) — pokrycie na poziomie funkcji w `rate-limit.test.ts` jest wystarczającym sygnałem dla scope i chat; dla questions.ts wiring + ten sam test funkcji wystarczy
- Nowe testy rate limitingu dla scope.ts i chat.ts — wiring backfill, istniejący test funkcji pozostaje niezmieniony
- Zmiana parametrów rate limitera — używamy defaults `limit=20, windowSecs=60`
- Testowanie UI / komponentów React (negative space, test-plan.md §7)
- Dodawanie polityki DELETE dla user_settings — intentional no-policy, ON DELETE CASCADE obsługuje usunięcie konta

## Implementation Approach

Trzy osobne PR-y, każdy zamknięty przez CI gate przed mergem.

**PR 1 (Faza 1)**: spec-first update test-plan.md → wiring rate limitera we wszystkich 3 AI endpointach → rozszerzenie error-sanitization testu o questions.ts.

**PR 2 (Faza 2)**: nowy plik `query-filter-isolation.test.ts` — wzorzec z `idor-read.test.ts`, dwóch użytkowników z nakładającymi się danymi.

**PR 3 (Faza 3)**: nowy plik `settings-idor.test.ts` — wzorzec z `idor-write.test.ts` + `idor-read.test.ts`, dwóch użytkowników, cross-user SELECT i upsert.

## Critical Implementation Details

**Kolejność operacji w handlerze po wiringkę rate limitingu:** auth check → Supabase client → `checkRateLimit` → jeśli `!allowed` zwróć 429 → Anthropic client → dalsze operacje. Dla scope.ts i questions.ts: nowy `createClient(context.request.headers, context.cookies)` dodany przed `checkRateLimit`. Jeśli klient zwróci `null`, pomijamy rate limit i kontynuujemy (fail-open, spójne z istniejącym zachowaniem `checkRateLimit` na błędach DB).

**Dla chat.ts**: reorder operacji — Supabase klient (przeniesiony lub współdzielony) musi być dostępny przed wywołaniem `checkRateLimit`. Aktualnie klient jest tworzony po `createAnthropicClient()` (linia 85 → 94); rate limit check wchodzi między linie 84 (auth check) a 85 (Anthropic client), ale klient Supabase musi być dostępny. Można stworzyć klient wcześniej (przed Anthropic check) i przekazać go dalej do user_settings.

**Format odpowiedzi 429** (nowy wzorzec w codebase):
```ts
return new Response(JSON.stringify({ error: "Too many requests" }), {
  status: 429,
  headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSecs) },
});
```

**makeContext dla questions.ts w teście sanityzacji:** `inquiry_text` musi mieć co najmniej 3 znaki (np. `"strona www"`), nie 20 jak w scope/chat. Obecna funkcja `makeContext` w `error-sanitization.test.ts` jest re-używalna bez zmian.

---

## Phase 1: R1 — AI Questions Safety

### Overview

Backfill wiringu rate limitera do wszystkich 3 AI endpointów + dodanie brakującego testu sanityzacji dla questions.ts. Pierwszym commitem tego PR jest spec-first update test-plan.md.

### Changes Required:

#### 1. Spec-first — zaktualizuj test-plan.md

**File**: `context/foundation/test-plan.md`

**Intent**: Dodaj nowe ryzyka i fazy zanim cokolwiek zostanie zaimplementowane — test-plan.md jest specyfikacją, nie dziennikiem.

**Contract**: W §2 Risk Map dodaj 4 nowe wiersze do tabeli Top Risks (R1–R4 jako kontynuacja od #7); uzupełnij tabelę Risk Response Guidance dla R1–R4. W §3 Phased Rollout dodaj 3 nowe wiersze: R1 (status: in_progress, change folder: `test-plan-refresh-2026-06-14`), R2 (pending), R3 (pending). Nie zmieniaj statusu istniejących faz 1–4.

#### 2. Wire checkRateLimit do questions.ts

**File**: `src/pages/api/ai/questions.ts`

**Intent**: Dodaj Supabase klient i wywołaj `checkRateLimit` po auth check, przed Anthropic client. Zwróć 429 gdy `!allowed`, pomijaj rate limit (fail-open) gdy klient null.

**Contract**: Import `createClient` z `@/lib/supabase` i `checkRateLimit` z `@/lib/rate-limit`. Wywołanie po linii 37 (`if (!context.locals.user) ...`). Jeśli `supabase` jest `null` — kontynuuj bez rate limitingu. Jeśli `!allowed` — zwróć 429 z `{ error: "Too many requests" }` i `Retry-After: retryAfterSecs` header (patrz Critical Implementation Details).

#### 3. Wire checkRateLimit do scope.ts

**File**: `src/pages/api/ai/scope.ts`

**Intent**: Identyczny wzorzec jak w questions.ts — dodaj Supabase klient i `checkRateLimit` po auth check.

**Contract**: Wzorzec identyczny z questions.ts (linia 35 w scope.ts = auth check). Ten endpoint nie miał Supabase klienta — nowy `createClient(context.request.headers, context.cookies)` dodany tylko do rate limiting.

#### 4. Wire checkRateLimit do chat.ts

**File**: `src/pages/api/ai/chat.ts`

**Intent**: Dodaj wywołanie `checkRateLimit` używając istniejącego Supabase klienta (już tworzony dla user_settings). Klient musi być dostępny przed rate limit check, więc może wymagać reorder relative to Anthropic client check.

**Contract**: Import `checkRateLimit` z `@/lib/rate-limit`. Supabase client creation (`createClient(...)`) przenieść lub zduplikować przed `createAnthropicClient()` (linia 85). Rate limit check po Supabase client, przed Anthropic check. Jeśli `!allowed` → 429 (identyczny format jak w questions.ts i scope.ts).

#### 5. Rozszerz error-sanitization.test.ts o questions.ts

**File**: `src/__tests__/error-sanitization/error-sanitization.test.ts`

**Intent**: Udowodnij że questions.ts catch block nie wycieka API key — identyczny risk jak R2 z change.md.

**Contract**: Dodaj `import { POST as questionsPOST } from "@/pages/api/ai/questions"` na górze. Dodaj nowy `describe("questions.ts — Anthropic SDK error does not leak API key")` blok. Użyj istniejącego `mockParse` (questions.ts wywołuje tylko `messages.parse`, nie `messages.create`). `makeContext({ inquiry_text: "strona www" })` — 3 znaki wystarczą (min 3, nie 20). Trzy asercje: `res.status === 502`, `body.error === "AI service error"`, `JSON.stringify(body)` nie zawiera `FAKE_KEY`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi — wszystkie istniejące testy green, nowy test questions.ts sanitization green
- `npm run lint` czyste
- `npx astro check` czyste (brak błędów TypeScript)
- Manualna weryfikacja w `wrangler dev`: request do `/api/ai/questions` po 20 szybkich requestach zwraca 429

#### Manual Verification:

- POST do `/api/ai/questions` z poprawnym body i auth → 200 (nic się nie zepsuło)
- POST do `/api/ai/scope` z poprawnym body i auth → 200 (wiring scope.ts nie broke nic)
- POST do `/api/ai/chat` z poprawnym body i auth → 200 (wiring chat.ts nie broke nic)

**Implementation Note**: Po ukończeniu fazy i weryfikacji automated + manual, zmerge PR 1 przed przejściem do Fazy 2.

---

## Phase 2: R2 — Query Param Data Isolation

### Overview

Udowodnij że `GET /api/quotes` z filtrami `?status=` i `?search=` zawsze zwraca tylko wiersze uwierzytelnionego użytkownika — nawet gdy inny użytkownik ma pasujące dane.

### Changes Required:

#### 1. Napisz query-filter-isolation.test.ts

**File**: `src/__tests__/access-control/query-filter-isolation.test.ts`

**Intent**: Integracyjny test izolacji danych — dwóch użytkowników z nakładającymi się danymi, asercje cross-user przy różnych kombinacjach filtrów.

**Contract**: Wzorzec identyczny z `idor-read.test.ts` (bez importowania handlera — query wprost przez Supabase klient, lustrzanie logiki z `quotes/index.ts` GET). `@vitest-environment node` docblock. `beforeAll` tworzy userA i userB via `createTestUser`; admin wstawia fixtures:
- userA: `{ title: "Alpha test project", status: "draft" }` i `{ title: "Alpha production", status: "accepted" }`
- userB: `{ title: "Beta test project", status: "draft" }`

Trzy testy:
1. Sanity — owner widzi własne wiersze z filtrem `draft` + `%test%`
2. Cross-user status filter — User B query `.in("status", ["accepted"])` zwraca 0 wyników (nie widzi userA's accepted row)
3. Cross-user combined filter — User B query `.in("status", ["draft"]).ilike("title", "%test%")` zwraca tylko "Beta test project", nie zawiera ID wierszy userA

Asercja na ID (nie na title) — ID jest nieprzewidywalne więc ujawnienie go jest dowodem wycieku. `quoteA_draftId` nie może się pojawić w żadnym wyniku User B.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi — nowe 3 testy green (wymaga `npx supabase start`)
- `npm run lint` czyste
- `npx astro check` czyste

#### Manual Verification:

- `GET /api/quotes?status=draft&search=test` jako zalogowany user zwraca tylko własne wyceny

**Implementation Note**: Po ukończeniu Fazy 2 i CI green na PR 2, zmerge przed Fazą 3.

---

## Phase 3: R3 — Settings RLS

### Overview

Udowodnij że `user_settings` RLS blokuje cross-user odczyt i zapis — SELECT zwraca null, upsert z obcym `user_id` nie mutuje danych.

### Changes Required:

#### 1. Napisz settings-idor.test.ts

**File**: `src/__tests__/access-control/settings-idor.test.ts`

**Intent**: Integracyjny test IDOR dla user_settings — dwóch użytkowników, asercje cross-user SELECT i cross-user upsert.

**Contract**: Wzorzec z `idor-read.test.ts` + `idor-write.test.ts`. `@vitest-environment node`. `beforeAll` tworzy userA i userB via `createTestUser`; admin wstawia:
- `user_settings` dla userA: `{ user_id: userA.id, prompt_context: "User A private context" }`

Cztery testy:
1. Sanity — owner czyta własne ustawienia (SELECT `.eq("user_id", userA.id)` jako userA → `prompt_context: "User A private context"`)
2. Cross-user SELECT — User B `.from("user_settings").select("prompt_context").eq("user_id", userA.id).maybeSingle()` → `data` jest `null`, `error` jest `null` (RLS SELECT filtruje wiersz)
3. Cross-user INSERT attempt — User B `.from("user_settings").insert({ user_id: userA.id, prompt_context: "HACKED" })` → `error` jest **non-null** (INSERT WITH CHECK blokuje)
4. Cross-user upsert + admin re-read — User B `.from("user_settings").upsert({ user_id: userA.id, prompt_context: "HACKED" }, { onConflict: "user_id" })` → admin re-read potwierdza `prompt_context` userA niezmieniony (`"User A private context"`, nie `"HACKED"`)

Uwaga na test 4: upsert pod RLS może zwrócić brak błędu ale 0 mutacji (zachowanie analogiczne do UPDATE w `idor-write.test.ts`). Autorytatywna asercja = admin re-read, nie sam wynik upserta.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi — nowe 4 testy green (wymaga `npx supabase start`)
- `npm run lint` czyste
- `npx astro check` czyste

#### Manual Verification:

- `GET /api/settings` jako zalogowany user zwraca własne ustawienia (lub `""` jeśli brak)
- `POST /api/settings` z `{ prompt_context: "..." }` zapisuje i zwraca te same dane

**Implementation Note**: Po ukończeniu Fazy 3 i CI green na PR 3, zmerge. Zaktualizuj statusy faz R1, R2, R3 w `test-plan.md` §3 na `done`.

---

## Testing Strategy

### Integration Tests (Fazy 2 i 3):

- Wymagają `npx supabase start` przed uruchomieniem
- Wzorzec: `createTestUser` → admin fixtures → asercje cross-user → `cleanupTestUser` w `afterAll`
- Nie importują handlerów API — operują bezpośrednio na Supabase kliencie
- `beforeAll` timeout 20_000ms, `afterAll` timeout 10_000ms (spójne z istniejącymi testami)

### Unit Tests (Faza 1):

- `error-sanitization.test.ts` — środowisko Node, brak Supabase, mock Anthropic przez `vi.hoisted`
- Uruchamia się bez zewnętrznych zależności

### Manual Testing Steps:

1. Wiring rate limitera: `wrangler dev` → 21 szybkich POST do jednego AI endpointu → sprawdź 429 z Retry-After
2. questions.ts sanitization: POST do `/api/ai/questions` z niepoprawnym kluczem Anthropic → sprawdź że response nie zawiera żadnych kluczy
3. Filters isolation: `GET /api/quotes?status=draft&search=[term]` → sprawdź że wyniki należą do zalogowanego usera
4. Settings RLS: `GET /api/settings` → zwraca własne ustawienia (nie cudze)

## References

- Research: `context/changes/test-plan-refresh-2026-06-14/research.md`
- Test-plan spec: `context/foundation/test-plan.md`
- Wzorzec sanitization: `src/__tests__/error-sanitization/error-sanitization.test.ts`
- Wzorzec IDOR read: `src/__tests__/access-control/idor-read.test.ts`
- Wzorzec IDOR write: `src/__tests__/access-control/idor-write.test.ts`
- `checkRateLimit` impl: `src/lib/rate-limit.ts`
- Test helpers: `src/lib/test-helpers.ts`, `src/lib/supabase-test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: R1 — AI Questions Safety

#### Automated

- [ ] 1.1 npm test przechodzi (wszystkie istniejące testy green + nowy questions.ts sanitization test)
- [ ] 1.2 npm run lint czyste
- [ ] 1.3 npx astro check czyste

#### Manual

- [ ] 1.4 POST /api/ai/questions z auth i poprawnym body → 200 (wiring nie broke)
- [ ] 1.5 POST /api/ai/scope z auth → 200 (scope wiring nie broke)
- [ ] 1.6 POST /api/ai/chat z auth → 200 (chat wiring nie broke)

### Phase 2: R2 — Query Param Data Isolation

#### Automated

- [ ] 2.1 npm test przechodzi (nowe 3 testy query-filter-isolation green, wymaga supabase start)
- [ ] 2.2 npm run lint czyste
- [ ] 2.3 npx astro check czyste

#### Manual

- [ ] 2.4 GET /api/quotes?status=draft&search=[term] zwraca tylko własne wyceny zalogowanego usera

### Phase 3: R3 — Settings RLS

#### Automated

- [ ] 3.1 npm test przechodzi (nowe 4 testy settings-idor green, wymaga supabase start)
- [ ] 3.2 npm run lint czyste
- [ ] 3.3 npx astro check czyste

#### Manual

- [ ] 3.4 GET /api/settings zwraca własne ustawienia użytkownika
- [ ] 3.5 POST /api/settings zapisuje i zwraca dane
- [ ] 3.6 Statusy faz R1, R2, R3 w test-plan.md §3 zaktualizowane na done
