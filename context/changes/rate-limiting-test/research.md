---
date: 2026-06-08T09:30:00+00:00
researcher: Claude Sonnet 4.6
git_commit: 89656b5edcd26c8d0dc2437a06c23e860ebcfda2
branch: main
repository: quotekit
topic: "Current state of AI endpoints and rate limiting — Risk #5"
tags: [research, rate-limiting, ai-endpoints, middleware, cloudflare-workers]
status: complete
last_updated: 2026-06-08
last_updated_by: Claude Sonnet 4.6
---

# Research: Current state of AI endpoints and rate limiting — Risk #5

**Date**: 2026-06-08  
**Git Commit**: 89656b5  
**Branch**: main

## Research Question

Zmapuj stan obecny: AI endpointy (`/api/ai/scope`, `/api/ai/chat`), middleware chain, i czy jakikolwiek rate limiting już istnieje. Risk #5 z test-plan.md: jeden uwierzytelniony użytkownik może wygenerować nieograniczone koszty Anthropic API.

## Summary

**Zero rate limitingu istnieje.** Oba endpointy AI (`/api/ai/chat`, `/api/ai/scope`) wymagają tylko uwierzytelnienia — każdy zalogowany użytkownik może wysyłać nieograniczoną liczbę żądań. Middleware (`src/middleware.ts`) ustawia `context.locals.user` przez Supabase auth, ale nie zawiera żadnej logiki ograniczania. Nie zainstalowano żadnych pakietów rate-limitingowych. Cloudflare wrangler.jsonc nie konfiguruje żadnych reguł rate limiting.

**Kluczowa obserwacja dla planowania testów**: jeśli rate limiting zostanie zaimplementowany w middleware aplikacyjnym (a nie na poziomie Cloudflare WAF), będzie można go przetestować lokalnie integracją — co jest tańszą opcją i zgodną z „likely cheapest layer" z test-plan.md.

## Detailed Findings

### AI Endpoint 1 — POST /api/ai/chat

**Plik**: `src/pages/api/ai/chat.ts`

- **Eksporty**: `prerender = false`, `POST: APIRoute`
- **Uwierzytelnienie**: `context.locals.user` (linia 76) → 401 jeśli brak
- **Model**: `claude-haiku-4-5-20251001` (linie 64, 139)
- **SDK calls**: 
  - `client.messages.parse()` z `zodOutputFormat()` — tryb generowania (linia 63)
  - `client.messages.create()` — tryb pytań (linia 138)
- **max_tokens**: 2048 (generowanie), 512 (pytania)
- **Rate limiting**: brak
- **Error handling**: generyczny `catch` → 502 „AI service error"; brak rozróżnienia między API failure, quota exhaustion, rate limit
- **Kody odpowiedzi**: 200, 400, 401, 422, 502, 503

**Tryby działania**:
- `generate: false` (domyślny) — pyta użytkownika o zakres projektu
- `generate: true` — generuje pozycje wyceny na podstawie nagromadzonej rozmowy

Limit `MAX_QUESTIONS` istnieje **tylko po stronie klienta** w `src/components/hooks/useQuoteCreator.ts` — nie jest egzekwowany przez serwer.

### AI Endpoint 2 — POST /api/ai/scope

**Plik**: `src/pages/api/ai/scope.ts`

- **Eksporty**: `prerender = false`, `POST: APIRoute`
- **Uwierzytelnienie**: `context.locals.user` (linia 36) → 401 jeśli brak
- **Model**: `claude-haiku-4-5-20251001` (linia 74)
- **SDK call**: `client.messages.parse()` z `zodOutputFormat()` (linia 73)
- **max_tokens**: 2048 (linia 75)
- **Rate limiting**: brak
- **Error handling**: generyczny `catch` → 502 „AI service error"
- **Kody odpowiedzi**: 200, 400, 401, 422, 502, 503

Prostszy endpoint — jeden request, brak multi-turn.

### Middleware — src/middleware.ts

- Implementuje `defineMiddleware` z `astro:middleware`
- Tworzy Supabase SSR client z request headers/cookies
- Ustawia `context.locals.user` przez `supabase.auth.getUser()`
- **Chronione trasy stron**: `/new`, `/quotes` (redirect → `/auth/signin`)
- **API routes**: NIE są chronione przez middleware na poziomie trasy — każdy endpoint sam sprawdza `context.locals.user`
- **Rate limiting**: brak jakiejkolwiek logiki

Middleware jest naturalnym punktem do dodania rate limitingu: działa na każdym requescie, zna użytkownika po Supabase auth, może zwrócić 429 zanim request trafi do handlera AI.

### Anthropic client factory — src/lib/anthropic.ts

```typescript
export function createAnthropicClient(): Anthropic | null {
  if (!ANTHROPIC_KEY) return null;
  return new Anthropic({ apiKey: ANTHROPIC_KEY });
}
```

- **Brak**: custom timeout, retry policy, max_retries
- **Klucz**: `ANTHROPIC_KEY` z `astro:env/server`
- Zwraca `null` jeśli brak klucza (→ oba endpointy zwracają 503)

### Konfiguracja Cloudflare — wrangler.jsonc

- **Brak** `rate_limiting` sekcji
- **Brak** KV bindings (potrzebnych do app-level rate limit store)
- **Brak** niestandardowych reguł routingu
- Observability: włączona (linia 12–14), ale bez metryk rate limitów
- App type: Cloudflare Pages (Astro adapter)

### Zależności — package.json

Żadnych pakietów rate-limitingowych:
- brak `@upstash/ratelimit`
- brak `express-rate-limit`
- brak `hono/throttle`
- brak jakiegokolwiek odpowiednika

`@upstash/redis` pojawia się w `package-lock.json` wyłącznie jako tranzytywna zależność opcjonalna — nie jest importowany ani konfigurowany w kodzie aplikacji.

## Code References

- `src/pages/api/ai/chat.ts:76` — auth check: `context.locals.user`
- `src/pages/api/ai/chat.ts:64,139` — model: `claude-haiku-4-5-20251001`
- `src/pages/api/ai/chat.ts:63,138` — SDK calls: `messages.parse()` / `messages.create()`
- `src/pages/api/ai/scope.ts:36` — auth check: `context.locals.user`
- `src/pages/api/ai/scope.ts:73-79` — SDK call + model
- `src/middleware.ts` — middleware chain, brak rate limitingu
- `src/lib/anthropic.ts:1-9` — client factory, brak timeout/retry config
- `src/components/hooks/useQuoteCreator.ts` — `MAX_QUESTIONS` — client-side only

## Architecture Insights

### Powierzchnia ataku Risk #5

| Endpoint | Method | Auth | Rate limit | Koszt/call (est.) |
|---|---|---|---|---|
| `/api/ai/chat` | POST | `locals.user` | brak | ~0.001–0.003 USD |
| `/api/ai/scope` | POST | `locals.user` | brak | ~0.003 USD |

Oba endpointy to **oddzielne powierzchnie ataku** — test-plan ostrzega przed testowaniem tylko `/api/ai/scope` i pominięciem `/api/ai/chat`. Muszą być pokryte osobnymi asercjami 429.

### Punkt do wstrzyknięcia rate limitingu

`src/middleware.ts` to naturalne miejsce — jeden plik, działa przed każdym handlerem, zna użytkownika. Alternatywa: osobny helper `src/lib/rate-limit.ts` wywołany na początku każdego handlera AI (code-duplication, ale łatwiejsza granulacja per-endpoint).

### Implikacje dla testowalności

- **App-level middleware** → testowalny lokalnie integracją (zgodnie z test-plan: „likely cheapest layer: Integration test (if app-level middleware)")
- **Cloudflare WAF** → wymaga produkcyjnego wdrożenia lub wrangler + niestandardowych reguł; nie da się przetestować lokalnie Vitetem
- **Wniosek**: app-level to jedyna opcja, która pozwala napisać integracyjny test w tym samym paradygmacie co istniejące testy (Vitest + local Supabase)

### Store dla liczników

App-level rate limiting w Cloudflare Workers wymaga trwałego store między requestami:
- **Cloudflare KV** — eventual consistency, wystarczający dla sliding window ≥ 1 min
- **Durable Objects** — silna konsystencja, wyższy koszt
- **In-memory** — nie działa: każdy Worker izolat ma osobną pamięć

KV nie jest skonfigurowane w wrangler.jsonc — wymagałoby dodania bindingu. To kluczowa zależność dla planowania.

## Open Questions

1. **KV vs alternatywy**: Czy projekt chce dodać Cloudflare KV binding (wymagana zmiana wrangler.jsonc + secret), czy użyć prostszego mechanizmu (np. Supabase jako rate-limit store)?
2. **Granulacja**: Jeden wspólny limit dla obu AI endpointów, czy osobne limity per endpoint?
3. **Wartości limitu**: N requests / T seconds — test-plan nie precyzuje wartości; plan powinien wybrać testowalne wartości (np. 5 req/min) nawet jeśli prod będzie inne.
4. **Środowisko testowe**: Jak zasymulować Cloudflare KV lokalnie? Vitest nie uruchamia workerd — store musi być mock-able albo zamieniony na Supabase.
