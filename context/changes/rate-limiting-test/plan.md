# Rate Limiting Integration Tests — Risk #5

## Overview

Implement per-user rate limiting on AI endpoints (`/api/ai/scope` and `/api/ai/chat`) backed by a Supabase table, then write integration tests that verify the limit is enforced using real Supabase state. Risk #5: jeden uwierzytelniony użytkownik może generować nieograniczone koszty Anthropic API.

## Current State Analysis

Zero rate limitingu istnieje. Oba endpointy AI (`src/pages/api/ai/scope.ts:35-101`, `src/pages/api/ai/chat.ts:75-188`) sprawdzają wyłącznie `context.locals.user` — dowolny zalogowany użytkownik może wysyłać nieograniczoną liczbę żądań. `src/middleware.ts` ustawia `context.locals.user` przez Supabase SSR client (cookie-based), ale nie zawiera żadnej logiki ograniczania. `wrangler.jsonc` nie ma KV bindings. Żadnych pakietów rate-limitingowych w `package.json`.

Kluczowe ograniczenie: Cloudflare Workers — każdy request w oddzielnej izolacji, in-memory counter nie przetrwa między requestami. Wymagany jest zewnętrzny store.

## Desired End State

`src/__tests__/rate-limiting/rate-limit.test.ts` istnieje i przechodzi 6 testów. `src/lib/rate-limit.ts` eksportuje `checkRateLimit(supabase, userId, limit, windowSecs)`. `src/middleware.ts` wywołuje `checkRateLimit` dla `/api/ai/*` po rozwiązaniu użytkownika. Supabase tabela `rate_limit_events` rejestruje eventy. Zalogowany użytkownik, który wyśle 21+ requestów w 60s, dostaje `429 { error: "rate_limit_exceeded", retry_after: 60 }` — nie 200, nie błąd Anthropic.

### Key Discoveries

- `src/middleware.ts:7` — `createClient()` tworzy SSR client (user-scoped, cookie-based); ten sam klient może być przekazany do `checkRateLimit` bez żadnych nowych sekretów w env
- `src/middleware.ts:9-16` — `supabase` może być null; rate limit check musi być wewnątrz `if (supabase && context.locals.user)` guard
- `src/lib/supabase-test.ts` — eksportuje `TEST_URL`, `TEST_ANON_KEY`, `createAdminClient()`; wzorzec testów z `createTestUser` / `cleanupTestUser` działa identycznie jak dla idor-read/idor-write
- `TestUser.client` (`src/lib/test-helpers.ts`) to user-scoped Supabase client — identyczny typ i zachowanie co middleware SSR client; testy mogą przekazywać `user.client` bezpośrednio do `checkRateLimit`
- Lekcja z `lessons.md`: RLS policies muszą używać `(select auth.uid())` zamiast `auth.uid()` — dotyczy każdej polityki na tej tabeli
- `ON DELETE CASCADE` na `user_id → auth.users.id` — cleanup przez `cleanupTestUser` usuwa eventy automatycznie

## What We're NOT Doing

- Nie testujemy przez HTTP (nie startujemy serwera Astro ani wrangler dev) — testujemy `checkRateLimit` bezpośrednio z `user.client`
- Nie implementujemy rate limitingu na poziomie Cloudflare WAF — nie można przetestować lokalnie Vitetem
- Nie implementujemy per-endpoint limitu — limit jest wspólny dla obu AI endpointów
- Nie dodajemy nagłówków `X-RateLimit-Remaining` / `Retry-After` w HTTP response — tylko w body JSON
- Nie implementujemy `PATCH /api/quotes` rate limitingu — scope to wyłącznie `/api/ai/*`
- Nie testujemy window-reset przez czekanie realnego czasu — używamy podejścia z admin-inserted old events

## Implementation Approach

**Supabase jako store** — tabela `rate_limit_events(id, user_id, created_at)` z RLS i CASCADE. Użytkownik może INSERTować i SELECTować tylko swoje eventy. Middleware używa istniejącego SSR client (żadnych nowych sekretów). `checkRateLimit` jest czystą funkcją przyjmującą Supabase client — testowalną bezpośrednio z `user.client`.

**Algorytm sliding window**: COUNT wierszy WHERE `user_id = userId AND created_at > NOW() - windowSecs * INTERVAL '1 second'`. Jeśli count ≥ limit → blocked. Jeśli count < limit → INSERT nowy event → allowed.

**Fail open**: wszelkie błędy SELECT lub INSERT w `checkRateLimit` zwracają `{ allowed: true }` — dostępność > rygor dla MVP.

---

## Phase 1: Migration + checkRateLimit function

### Overview

Tworzy tabelę `rate_limit_events` z RLS i INDEX, oraz funkcję `checkRateLimit` w `src/lib/rate-limit.ts` z injectable `limit` i `windowSecs` — dzięki czemu testy mogą używać małych wartości (3 req/10s) zamiast produkcyjnych (20 req/60s).

### Changes Required

#### 1. Supabase migration — `supabase/migrations/20260608000000_create_rate_limit_events.sql`

**File**: `supabase/migrations/20260608000000_create_rate_limit_events.sql`

**Intent**: Utwórz tabelę `rate_limit_events` ze wszystkimi polami, indexem dla zapytań sliding window i granularnymi politykami RLS (per-operation, per-role zgodnie z CLAUDE.md i lessons.md).

**Contract**:
- Kolumny: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at timestamptz NOT NULL DEFAULT NOW()`
- Index: `(user_id, created_at DESC)` — optymalizuje COUNT z filtrem `created_at > threshold` per user
- RLS: `ENABLE ROW LEVEL SECURITY`
- Policy INSERT: `FOR INSERT WITH CHECK ((select auth.uid()) = user_id)` — zgodnie z lessons.md (opakowanie w `select`)
- Policy SELECT: `FOR SELECT USING ((select auth.uid()) = user_id)` — zgodnie z lessons.md
- Brak UPDATE i DELETE policies — tabela jest append-only; CASCADE obsługuje cleanup

#### 2. Rate limit function — `src/lib/rate-limit.ts`

**File**: `src/lib/rate-limit.ts`

**Intent**: Wyeksportuj `checkRateLimit` jako czystą funkcję przyjmującą Supabase client. Injectable `limit` i `windowSecs` umożliwiają testy z małymi wartościami bez mockowania.

**Contract**:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSecs: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
  windowSecs = 60,
): Promise<RateLimitResult>
```

Logika:
1. Oblicz próg: `new Date(Date.now() - windowSecs * 1000).toISOString()`
2. `SELECT COUNT(*) FROM rate_limit_events WHERE user_id = userId AND created_at > threshold` przez `{ count: "exact", head: true }`
3. Jeśli `selectError` → `return { allowed: true, retryAfterSecs: 0 }` (fail open)
4. Jeśli `count !== null && count >= limit` → `return { allowed: false, retryAfterSecs: windowSecs }`
5. `INSERT { user_id: userId }` (created_at i id są generowane przez DB)
6. Jeśli `insertError` → `return { allowed: true, retryAfterSecs: 0 }` (fail open)
7. `return { allowed: true, retryAfterSecs: 0 }`

### Success Criteria

#### Automated Verification

- `npx supabase db reset` lub `npx supabase migration up` aplikuje bez błędów i tabela `rate_limit_events` istnieje z poprawnymi kolumnami
- `npx tsc --noEmit` exits 0
- `npx eslint src/lib/rate-limit.ts` exits 0

#### Manual Verification

- Tabela widoczna w lokalnym Supabase Studio (http://localhost:54323) z policies SELECT i INSERT

---

## Phase 2: Wire into middleware

### Overview

Integruje `checkRateLimit` z `src/middleware.ts` — wywołanie po rozwiązaniu użytkownika, tylko dla ścieżek `/api/ai/*`. Zwraca 429 z JSON body jeśli blocked.

### Changes Required

#### 1. Update middleware — `src/middleware.ts`

**File**: `src/middleware.ts`

**Intent**: Po rozwiązaniu `context.locals.user`, sprawdź rate limit dla wszystkich requestów do `/api/ai/*`. Jeśli blocked, zwróć 429 przed przekazaniem do `next()`.

**Contract**: Import `checkRateLimit` z `@/lib/rate-limit`. Dodaj blok po linii `context.locals.user = user ?? null`:

```typescript
// Rate limiting for AI endpoints
if (supabase && context.locals.user && context.url.pathname.startsWith("/api/ai/")) {
  const { allowed, retryAfterSecs } = await checkRateLimit(supabase, context.locals.user.id);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limit_exceeded", retry_after: retryAfterSecs }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
}
```

`supabase` jest już sprawdzony jako non-null przez warunek; `context.locals.user` jest non-null przez warunek. Używa domyślnych wartości `checkRateLimit` (limit=20, windowSecs=60).

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0
- `npx eslint src/middleware.ts` exits 0

#### Manual Verification

- Uruchom `npx supabase start` + `npm run dev` (port 4321)
- Wyślij 21 POST requestów do `/api/ai/scope` z tokenem zalogowanego użytkownika (np. przez `curl` w pętli) — 21. zwraca status 429 z body `{ "error": "rate_limit_exceeded", "retry_after": 60 }`
- Sprawdź lokalny Supabase Studio — widoczne 20 wierszy w `rate_limit_events` dla tego użytkownika

---

## Phase 3: Integration tests

### Overview

Sześć testów weryfikujących `checkRateLimit` z real Supabase (local). Testy używają `user.client` z `createTestUser` — identyczny flow jak w idor-read/idor-write. Limit=3, windowSecs=10 dla szybkości.

### Changes Required

#### 1. Test file — `src/__tests__/rate-limiting/rate-limit.test.ts`

**File**: `src/__tests__/rate-limiting/rate-limit.test.ts`

**Intent**: Pełny integration test suite dla Risk #5. Dwie wersje użytkownika (user1 dla testów 1-3 i 5, user2 dla testu izolacji), real Supabase, injectable niskie limity.

**Contract**:
- Top-of-file: `// @vitest-environment node`
- Imports: `{ describe, it, expect, beforeAll, afterAll }` z `"vitest"`; `checkRateLimit` z `"@/lib/rate-limit"`; `createAdminClient, TEST_URL, TEST_ANON_KEY` z `"@/lib/supabase-test"`; `createClient` z `"@supabase/supabase-js"`; `createTestUser, cleanupTestUser, type TestUser` z `"@/lib/test-helpers"`
- `beforeAll(20_000)`: provisioning `user1 = await createTestUser("rl1")`, `user2 = await createTestUser("rl2")`
- `afterAll(10_000)`: `Promise.allSettled([user1 ? cleanupTestUser(user1.id) : ...], [user2 ? cleanupTestUser(user2.id) : ...])`
- Stałe w scope describe: `const LIMIT = 3` i `const WINDOW = 10`

**Test 1** — `"first LIMIT requests are all allowed"`:
- Wywołaj `checkRateLimit(user1.client, user1.id, LIMIT, WINDOW)` trzy razy
- Assert każde `result.allowed` jest `true`

**Test 2** — `"(LIMIT+1)th request is blocked"`:
- Wywołaj `checkRateLimit(user1.client, user1.id, LIMIT, WINDOW)` (kumuluje po teście 1 — 4. call łącznie)
- Assert `result.allowed` jest `false`
- Assert `result.retryAfterSecs` jest `WINDOW` (10)

**Test 3** — `"blocked result has correct shape: retryAfterSecs equals windowSecs"`:
- Wywołaj jeszcze raz `checkRateLimit(user1.client, user1.id, LIMIT, WINDOW)`
- Assert `result.allowed === false` oraz `result.retryAfterSecs === WINDOW`
- (Weryfikuje spójność shape przy multiple blocked calls)

**Test 4** — `"second user is not rate-limited by first user's events"`:
- `user2` jest świeży — wywołaj `checkRateLimit(user2.client, user2.id, LIMIT, WINDOW)` raz
- Assert `result.allowed === true`

**Test 5** — `"fail-open: unauthenticated client INSERT error returns allowed"`:
- Utwórz `anonClient = createClient(TEST_URL, TEST_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })`
- Wywołaj `checkRateLimit(anonClient, crypto.randomUUID(), LIMIT, WINDOW)` — SELECT zwróci pustą tablicę (RLS filtruje anon), ale INSERT zwróci policy violation error
- Assert `result.allowed === true` (fail open — `insertError` jest non-null, function returns allowed)

**Test 6** — `"events outside the window do not count toward the limit"`:
- Użyj `admin = createAdminClient()` — wstaw 3 stare eventy dla user2: `admin.from("rate_limit_events").insert([{ user_id: user2.id, created_at: new Date(Date.now() - 120_000).toISOString() }, ...])`
- Wywołaj `checkRateLimit(user2.client, user2.id, LIMIT, WINDOW)` — stare eventy są poza oknem 10s
- Assert `result.allowed === true` (stare eventy nie liczą się)

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit` exits 0
- `npx eslint src/__tests__/rate-limiting/rate-limit.test.ts` exits 0
- `npm test src/__tests__/rate-limiting/rate-limit.test.ts -- --reporter=verbose` — 6 testów green (wymaga `npx supabase start`)

#### Manual Verification

- Brak — wszystkie oracles są automatycznymi asercjami

---

## Testing Strategy

### Integration Tests

Wszystkie 6 testów działa bezpośrednio przeciwko lokalnemu Supabase via `createTestUser` / `user.client`. Brak mocków rate limitera.

- Testy 1-3 weryfikują happy path i granicę limitu na user1; kumulatywne wywołania w obrębie jednego describe block budują stan naturalnie (test 1 robi 3 inserty, test 2 widzi 3+1=4).
- Test 4 dowodzi izolacji per-user — kluczowe dla biznesowej poprawności.
- Test 5 dowodzi fail-open — anonowy INSERT error → allowed.
- Test 6 dowodzi sliding window — admin-inserted old events nie zawyżają licznika.

### Uwaga dot. kumulacji stanu między testami

Testy 1-3 kumulują eventy dla `user1` (3 eventy po teście 1, blokada po teście 2, blokada po teście 3). Jest to celowe — każdy test buduje na poprzednim, co eliminuje potrzebę resetu DB między testami. `afterAll` z `cleanupTestUser` czyści wszystko przez CASCADE.

## References

- Risk #5 definition: `context/foundation/test-plan.md` §2 row #5
- Research: `context/changes/rate-limiting-test/research.md`
- Pattern reference: `src/__tests__/access-control/idor-read.test.ts`
- Middleware: `src/middleware.ts`
- RLS pattern (lessons.md): `(select auth.uid())` wrap, granularne polityki per-operation

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration + checkRateLimit function

#### Automated

- [x] 1.1 Migration applies cleanly (`npx supabase migration up` or `npx supabase db reset`)
- [x] 1.2 `npx tsc --noEmit` exits 0
- [x] 1.3 `npx eslint src/lib/rate-limit.ts` exits 0

#### Manual

- [x] 1.4 Table `rate_limit_events` visible in local Supabase Studio with SELECT and INSERT policies

### Phase 2: Wire into middleware

#### Automated

- [ ] 2.1 `npx tsc --noEmit` exits 0
- [ ] 2.2 `npx eslint src/middleware.ts` exits 0

#### Manual

- [ ] 2.3 21 sequential POST requests to `/api/ai/scope` → 21st returns 429 with `{ error: "rate_limit_exceeded", retry_after: 60 }`
- [ ] 2.4 Supabase Studio shows 20 rows in `rate_limit_events` for the test user

### Phase 3: Integration tests

#### Automated

- [ ] 3.1 `npx tsc --noEmit` exits 0
- [ ] 3.2 `npx eslint src/__tests__/rate-limiting/rate-limit.test.ts` exits 0
- [ ] 3.3 `npm test src/__tests__/rate-limiting/rate-limit.test.ts -- --reporter=verbose` — 6 tests green
