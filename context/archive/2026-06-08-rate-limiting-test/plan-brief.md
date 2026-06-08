# Rate Limiting Integration Tests — Plan Brief

> Full plan: `context/changes/rate-limiting-test/plan.md`
> Research: `context/changes/rate-limiting-test/research.md`

## What & Why

Implementujemy per-user rate limiting na endpointach AI (`/api/ai/scope`, `/api/ai/chat`) i piszemy testy integracyjne, które weryfikują, że limit jest egzekwowany. Risk #5 z test-plan.md: jeden zalogowany użytkownik może generować nieograniczone koszty Anthropic API bez żadnych barier — oba endpointy sprawdzają wyłącznie obecność tokenu, nie liczbę requestów.

## Starting Point

Zero rate limitingu istnieje: brak logiki w middleware, brak pakietów, brak KV bindings. Middleware (`src/middleware.ts`) ustawia `context.locals.user` przez istniejący SSR Supabase client — ten sam client możemy przekazać do funkcji rate-limitingowej bez żadnych nowych sekretów.

## Desired End State

Zalogowany użytkownik, który wyśle 21+ POST requestów do `/api/ai/*` w ciągu 60s, otrzymuje HTTP 429 `{ error: "rate_limit_exceeded", retry_after: 60 }`. Logika weryfikowana przez 6 testów integracyjnych (Vitest + local Supabase) bez żadnych mocków rate limitera.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Rate limit store | Supabase (`rate_limit_events` table) | Testowalne lokalnie z istniejącą infrastrukturą; zero nowych zależności | Plan |
| Test approach | Testuj `checkRateLimit()` bezpośrednio z `user.client` | Brak mocków zgodnie z wytyczną test-plan; ten sam typ co middleware SSR client | Plan |
| Limit | 20 req/60s, wspólny dla `/api/ai/*` | Praktyczna bariera dla obu endpointów; brak granulacji per-endpoint na MVP | Plan |
| Algorytm | Sliding window (COUNT WHERE created_at > NOW()-60s) | Prosta implementacja jednym zapytaniem SQL; deterministic w testach | Plan |
| Fail behavior | Fail open (allow on store error) | Dostępność > rygor dla MVP; błąd infrastruktury nie blokuje użytkownika | Plan |
| Error body | `{ error: "rate_limit_exceeded", retry_after: 60 }` | Spójny z formatem 401/502 (`{ error: string }`); `retry_after` przydatny dla UI | Plan |
| Test values | limit=3, windowSecs=10 (injectable params) | Testy szybkie bez czekania 60s; kumulacja eventów między testami jest celowa | Plan |

## Scope

**In scope:** Implementacja `checkRateLimit` + migracja Supabase + integracja w middleware + 6 testów integracyjnych dla `/api/ai/*`.

**Out of scope:** Cloudflare WAF/KV rate limiting; nagłówki HTTP `X-RateLimit-*`; per-endpoint granulacja; rate limiting innych endpointów (`/api/quotes`); window-reset test z realnym czekaniem.

## Architecture / Approach

```
Middleware (src/middleware.ts)
  → createClient(headers, cookies)   ← istniejący SSR client
  → auth.getUser()                   ← user resolution (istniejące)
  → checkRateLimit(supabase, userId) ← NOWE: tylko dla /api/ai/* requestów
      → SELECT COUNT(*) FROM rate_limit_events  (RLS: widzi tylko swoje)
      → if count >= 20 → return { allowed: false }
      → INSERT { user_id }                       (RLS: tylko własne)
      → return { allowed: true }
  → if !allowed → Response(429, { error: "rate_limit_exceeded" })
  → next()
```

Tabela `rate_limit_events` używa RLS z `(select auth.uid()) = user_id` (zgodnie z lessons.md pattern). ON DELETE CASCADE na `user_id` — cleanup przez `cleanupTestUser` automatyczny.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Migration + function | Tabela Supabase z RLS + `src/lib/rate-limit.ts` z injectable params | RLS policy musi używać `(select auth.uid())` — pominięcie wrappera to performance bug wg lessons.md |
| 2. Middleware wiring | `src/middleware.ts` wywołuje `checkRateLimit` dla `/api/ai/*`, 429 jeśli blocked | Null-safety: `supabase` może być null; guard `if (supabase && user)` wymagany |
| 3. Integration tests | 6 testów green: limit, izolacja, fail-open, sliding window | Testy 1-3 kumulują eventy user1 — kolejność testów ma znaczenie |

**Prerequisites:** `npx supabase start` (local Supabase running); `.env` z `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Estimated effort:** ~1 sesja; 3 fazy sekwencyjne.

## Open Risks & Assumptions

- Sliding window z Supabase round-trip dodaje ~5-20ms do każdego AI requestu — akceptowalne (Anthropic call trwa 500ms-3s).
- Tabela `rate_limit_events` rośnie bez cleanup job (poza CASCADE on user delete) — stare eventy (>60s) są martwe, ale nie usuwane automatycznie. Nie problem na MVP z małą liczbą użytkowników.

## Success Criteria (Summary)

- `npm test src/__tests__/rate-limiting/rate-limit.test.ts -- --reporter=verbose` → 6 green tests
- Ręcznie: 21 requestów do `/api/ai/scope` → 21. zwraca 429 z `{ "error": "rate_limit_exceeded", "retry_after": 60 }`
- `npx tsc --noEmit` i `npx eslint` exits 0 na wszystkich zmienionych plikach
