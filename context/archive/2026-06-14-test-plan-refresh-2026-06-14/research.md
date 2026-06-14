---
date: 2026-06-14T18:00:00+02:00
researcher: Mateusz Kosik
git_commit: 529f71e2e1ab8a00e7d4166795c8aac4c6af149f
branch: main
repository: quotekit
topic: "Research przed planowaniem faz testowych R1–R3 (test-plan-refresh-2026-06-14)"
tags: [research, testing, rate-limiting, rls, access-control, error-sanitization, ai-questions]
status: complete
last_updated: 2026-06-14
last_updated_by: Mateusz Kosik
---

# Research: Fazy testowe R1–R3 — stan kodu przed planowaniem

**Date**: 2026-06-14T18:00:00+02:00
**Researcher**: Mateusz Kosik
**Git Commit**: 529f71e2e1ab8a00e7d4166795c8aac4c6af149f
**Branch**: main
**Repository**: quotekit

## Research Question

Przygotuj research przed zaplanowaniem kolejnej fazy implementacji testów (refresh 2026-06-14). Zbadaj stan kodu dla trzech nowych faz: R1 (AI questions safety), R2 (query param data isolation), R3 (settings RLS). Ustal luki w implementacji, reużywalne wzorce testowe i potrzebne nowe podejścia.

## Summary

Wszystkie trzy fazy testowe mają solidne podstawy w istniejących wzorcach, ale każda wymaga uwagi na jeden krytyczny fakt odkryty w kodzie:

- **R1/Risk R1 (rate limiting)**: `checkRateLimit` istnieje i jest przetestowany na poziomie funkcji, ale **nie jest wywołany w żadnym AI endpoincie** (`scope.ts`, `chat.ts`, `questions.ts`). Plan musi uwzględnić implementację (wiring) w `questions.ts` PRZED testem. Istniejący `rate-limit.test.ts` nie testuje endpointu — testuje funkcję. Do testu endpointu potrzebny jest nowy wzorzec hybrydowy (real Supabase + mocked Anthropic + bezpośrednie wywołanie POST handlera).
- **R1/Risk R2 (error sanitization)**: `questions.ts` ma już poprawny catch block (`{ error: "AI service error" }`). Test można dołączyć do istniejącego `error-sanitization.test.ts` jako nowy `describe` blok — minimalna nowa praca.
- **R2/Risk R3 (query filter isolation)**: Kod `quotes/index.ts` jest bezpieczny — `.eq("user_id", user.id)` zawsze pierwszy. Test wprost na Supabase kliencie (bez importowania handlera), nowy plik analogiczny do `idor-read.test.ts`.
- **R3/Risk R4 (settings RLS)**: Migracja `user_settings` ma kompletne i poprawne polityki RLS (SELECT, INSERT, UPDATE z `(select auth.uid())`). Test wprost na Supabase kliencie, nowy plik analogiczny do `idor-write.test.ts`.

---

## Detailed Findings

### Phase R1 — Risk R1: Rate limiting gap w questions.ts

**Kluczowe odkrycie: `checkRateLimit` nie jest wywołany w żadnym AI endpoincie.**

Przejrzano wszystkie trzy AI endpointy:

- [`src/pages/api/ai/questions.ts`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/ai/questions.ts) — brak `checkRateLimit`, brak Supabase klienta (linia 31–95)
- [`src/pages/api/ai/scope.ts`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/ai/scope.ts) — brak `checkRateLimit`, brak Supabase klienta (linia 35–101)
- [`src/pages/api/ai/chat.ts`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/ai/chat.ts) — tworzy Supabase klient (linia 94, dla `user_settings`), ale brak `checkRateLimit`

Istniejący test `src/__tests__/rate-limiting/rate-limit.test.ts` testuje **tylko funkcję `checkRateLimit`** (importuje ją bezpośrednio) — nie testuje żadnego endpointu HTTP. Faza 3 z test-plan.md dostarczyła infrastrukturę (funkcja + testy funkcji), ale nie wired ją w endpointy.

**Co to oznacza dla planu R1:**
Plan musi zawierać krok implementacyjny: dodanie wywołania `checkRateLimit` do `questions.ts`. Dopiero wtedy test "N+1 requests zwraca 429" ma sens.

**Sygnatura `checkRateLimit`** (`src/lib/rate-limit.ts:9`):
```ts
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
  windowSecs = 60,
): Promise<RateLimitResult>
```

Wymaga: `SupabaseClient` (do zapisu `rate_limit_events`) + `userId`. `questions.ts` nie ma teraz Supabase klienta — trzeba go dodać.

**Nowy wzorzec testu endpointu (R1 rate-limit):**

Istniejące testy to albo "mock all" (error-sanitization) albo "real DB, no endpoint" (idor-*, crud, rate-limit). Do testu że endpoint zwraca 429 potrzebny jest wzorzec hybrydowy:
1. Import `POST` z `questions.ts`
2. Mock `@/lib/anthropic` via `vi.hoisted` + `vi.mock` (jak error-sanitization.test.ts)
3. Prawdziwy Supabase klient (jak idor-read.test.ts) — potrzebny do `rate_limit_events`
4. `makeContext` musi dostarczyć JWT użytkownika w headerach żeby `createClient(headers, cookies)` działał

**Jak skonstruować context z prawdziwym JWT:**
```ts
function makeContextWithToken(accessToken: string, body: Record<string, unknown>): APIContext {
  return {
    locals: { user: { id: userId } },
    request: new Request("http://localhost/api/ai/questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
    cookies: {} as AstroCookies,  // createClient w questions.ts używa header, nie cookies
  } as unknown as APIContext;
}
```

Alternatywa tańsza: pre-seed `rate_limit_events` przez admin klient, potem wywołaj handler — Supabase klient wewnątrz handlera wykona SELECT i zobaczy pełny bucket.

---

### Phase R1 — Risk R2: Error sanitization w questions.ts

**questions.ts ma już poprawny catch block.**

[`src/pages/api/ai/questions.ts:69-80`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/ai/questions.ts#L69-L80):
```ts
try {
  message = await client.messages.parse({ ... });
} catch {
  return new Response(JSON.stringify({ error: "AI service error" }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
```

Pattern identyczny jak `scope.ts`. Żaden `catch (e)` — `e` nie jest używane, więc klucz API nie może wyciec.

**Jak testować:** Rozszerzyć istniejący `src/__tests__/error-sanitization/error-sanitization.test.ts` o nowy `describe` blok:
```ts
import { POST as questionsPOST } from "@/pages/api/ai/questions";
// ...
describe("questions.ts — Anthropic SDK error does not leak API key", () => {
  it("returns generic error without key when messages.parse throws", async () => {
    mockParse.mockRejectedValue(new Error(`401 {...${FAKE_KEY}...}`));
    const ctx = makeContext({ inquiry_text: "strona www" }); // min 3 chars (nie 20!)
    const res = await questionsPOST(ctx);
    const body = await res.json() as { error: unknown };
    expect(res.status).toBe(502);
    expect(body.error).toBe("AI service error");
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });
});
```

`makeContext` z `error-sanitization.test.ts` działa bez zmian — `questions.ts` nie wymaga Supabase i nie sprawdza Supabase klienta po stronie sanitization path.

**Ważne**: `questions.ts` używa `client.messages.parse` (linia 69), nie `messages.create`. Tylko `mockParse` musi być skonfigurowany — `mockCreate` nie jest wywoływany.

---

### Phase R2 — Risk R3: Query param data isolation

**Kod GET /api/quotes jest bezpieczny — user_id filter zawsze pierwszy.**

[`src/pages/api/quotes/index.ts:103-113`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/quotes/index.ts#L103-L113):
```ts
let query = supabase
  .from("quotes")
  .select("id, title, status, created_at", { count: "exact" })
  .eq("user_id", user.id);           // ← zawsze pierwsza — nie można ominąć

if (statusFilter.length > 0) {
  query = query.in("status", statusFilter);
}
if (searchFilter) {
  const escaped = searchFilter.replace(/%/g, "\\%").replace(/_/g, "\\_");
  query = query.ilike("title", `%${escaped}%`);
}
```

Podwójna ochrona: (1) explicit `.eq("user_id", user.id)` w query, (2) RLS SELECT policy na tabeli `quotes` również wymusza właściciela.

**Jak testować:** Nie trzeba importować handlera — test działa bezpośrednio na Supabase kliencie (wzorzec z `idor-read.test.ts`):

```ts
// Setup: User A ma draft "Alpha test project", User B ma draft "Beta test project"
// Wykonaj jako User B: query z status=draft i search=test
const { data } = await userB.client
  .from("quotes")
  .select("id, title")
  .eq("user_id", userB.id)
  .in("status", ["draft"])
  .ilike("title", "%test%");

// Wynik: tylko Beta test project (User B)
expect(ids).toContain(quoteBId);
expect(ids).not.toContain(quoteAId);
```

**Kluczowy scenariusz:** User A i User B mają dane pasujące do obu filtrów (status=draft, title zawiera "test"). Po zastosowaniu filtrów przez User B powinien widzieć tylko swoje wiersze.

**Lokalizacja pliku:** `src/__tests__/access-control/query-filter-isolation.test.ts`

---

### Phase R3 — Risk R4: Settings RLS

**Migracja ma kompletne i poprawne polityki RLS.**

[`supabase/migrations/20260613000000_create_user_settings.sql`](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/supabase/migrations/20260613000000_create_user_settings.sql):
```sql
-- SELECT: own row only
CREATE POLICY "user_settings_select_own" ON user_settings
  FOR SELECT USING ((select auth.uid()) = user_id);

-- INSERT: own row only
CREATE POLICY "user_settings_insert_own" ON user_settings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE: own row only (USING + WITH CHECK)
CREATE POLICY "user_settings_update_own" ON user_settings
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- DELETE: intentionally no policy — deny-all (ON DELETE CASCADE handles account deletion)
```

Wzorzec `(select auth.uid())` jest poprawny (zgodny z lessons.md). Polityka UPDATE ma USING i WITH CHECK — brak luki, którą change.md zidentyfikował jako "may be missing UPDATE WITH CHECK policy".

**Endpoint settings.ts:**
- GET ([linia 29-33](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/settings.ts#L29-L33)): `.eq("user_id", user.id)` — nie można odczytać cudzego wiersza
- POST ([linia 84-86](https://github.com/mbkosik/quotekit/blob/529f71e2e1ab8a00e7d4166795c8aac4c6af149f/src/pages/api/settings.ts#L84-L86)): `upsert({ user_id: user.id, ... })` — `user_id` pochodzi z middleware, nie z body requestu, więc atak IDOR przez API jest niemożliwy

**Jak testować:** Bezpośrednio na Supabase kliencie (wzorzec z `idor-write.test.ts`):
```ts
// Cross-user SELECT: User B próbuje odczytać wiersz User A → null
const { data } = await userB.client
  .from("user_settings")
  .select("prompt_context")
  .eq("user_id", userA.id)
  .maybeSingle();
expect(data).toBeNull();

// Cross-user upsert (INSERT path): User B próbuje upsert z userA.id → error
const { error } = await userB.client
  .from("user_settings")
  .upsert({ user_id: userA.id, prompt_context: "HACKED" }, { onConflict: "user_id" });
expect(error).not.toBeNull(); // INSERT WITH CHECK blokuje

// Cross-user upsert (UPDATE path): admin zakłada wiersz dla A, B próbuje update → brak mutacji
// Admin potwierdza: wiersz User A niezmieniony
```

**Lokalizacja pliku:** `src/__tests__/access-control/settings-idor.test.ts`

---

## Code References

| Plik | Linia | Opis |
|------|-------|------|
| `src/pages/api/ai/questions.ts` | 31–95 | POST handler — brak checkRateLimit, brak Supabase |
| `src/pages/api/ai/questions.ts` | 69–80 | Catch block — poprawna sanityzacja, brak wycieku klucza |
| `src/pages/api/ai/questions.ts` | 69 | `client.messages.parse` — jedyna call do Anthropic SDK |
| `src/pages/api/ai/scope.ts` | 35–101 | POST handler — brak checkRateLimit (scope też nie ma!) |
| `src/pages/api/ai/chat.ts` | 94 | Supabase klient — present (user_settings), ale brak checkRateLimit |
| `src/lib/rate-limit.ts` | 9–38 | `checkRateLimit` — wymaga SupabaseClient + userId |
| `src/__tests__/rate-limiting/rate-limit.test.ts` | 1–82 | Test funkcji (nie endpointu) |
| `src/__tests__/error-sanitization/error-sanitization.test.ts` | 1–117 | Wzorzec do reużycia dla questions.ts |
| `src/pages/api/quotes/index.ts` | 103–113 | GET query — user_id filtr zawsze pierwszy |
| `src/pages/api/settings.ts` | 29–33 | GET — zawsze .eq("user_id", user.id) |
| `src/pages/api/settings.ts` | 84–86 | POST upsert — user_id z middleware, nie z body |
| `supabase/migrations/20260613000000_create_user_settings.sql` | 16–28 | RLS policies user_settings — kompletne |
| `supabase/migrations/20260614000000_grant_table_permissions.sql` | 10 | `GRANT SELECT, INSERT, UPDATE ON TABLE user_settings TO authenticated` |
| `src/lib/test-helpers.ts` | 19–45 | `createTestUser` — standard fixture pattern |
| `src/lib/supabase-test.ts` | 28–45 | `createAdminClient` + `createUserClient` |

---

## Architecture Insights

### Wzorzec "real DB only" (idor-*.test.ts, crud.test.ts, rate-limit.test.ts)
- Import `createTestUser`, `createAdminClient`, `createUserClient`
- Brak importowania handlera endpointu — test na poziomie Supabase klienta
- `beforeAll` tworzy użytkowników + fixture data (admin), `afterAll` czyści przez `cleanupTestUser`
- Asercje na `data` / `error` / `count` — nie na HTTP response

### Wzorzec "mock all" (error-sanitization.test.ts)
- `vi.hoisted` + `vi.mock("@/lib/anthropic")` — mock fabryki klienta
- Import POST handlera bezpośrednio z `@/pages/api/ai/...`
- `makeContext` — tworzy minimal APIContext z `locals.user.id` i Request
- Brak Supabase — handler nie potrzebuje DB w ścieżce testowanej
- `@vitest-environment node` — Request globalny dostępny w Node 22

### Nowy wzorzec potrzebny dla R1/rate-limit endpoint test
- Hybrydowy: "mock Anthropic" (jak error-sanitization) + "real Supabase" (jak idor-*)
- `makeContext` musi dostarczyć Authorization header z prawdziwym JWT
- `createClient(context.request.headers, context.cookies)` w handlerze potrzebuje headera
- Lub: pre-seed rate_limit_events przez admin, potem call handler z tokenem

### Minimalna różnica w inputs między endpointami
- `scope.ts`: `inquiry_text` min 20 chars (`z.string().min(20)`)
- `chat.ts`: `inquiry_text` min 20 chars + `messages` array + `generate` boolean
- `questions.ts`: `inquiry_text` min **3** chars (`z.string().min(3)`) — inna reguła walidacji!

---

## Historical Context (from prior changes)

- `context/foundation/test-plan.md` §3 — Phase 3 "done": dostarcza `src/lib/rate-limit.ts` + `src/__tests__/rate-limiting/rate-limit.test.ts` ale NIE wires rate limitera do żadnego endpointu. Plan R1 musi to uwzględnić.
- `context/foundation/test-plan.md` §6.5 — error-sanitization cookbook: dokładny przepis reużywalny dla questions.ts (`vi.hoisted`, `FAKE_KEY`, `makeContext`, 3 asercje)
- `context/foundation/lessons.md` — `(select auth.uid())` w RLS: user_settings migration poprawnie stosuje ten wzorzec we wszystkich politykach
- `src/__tests__/access-control/idor-read.test.ts` — wzorzec dwóch użytkowników z fixtures dla R2 i R3

---

## Open Questions

1. **Scope.ts i chat.ts też nie mają rate limiting** — czy plan R1 ma backfillować oba endpointy jednocześnie, czy tylko questions.ts? Phase 3 oznaczyła risk #5 jako "done" mimo braku wiringu w endpointach. Decyzja: jeśli plan R1 skupia się tylko na questions.ts, ryzyko dla scope/chat pozostaje. Rekomendacja: wiring we wszystkich trzech AI endpointach w jednym commicie.

2. **Hybridowy test endpointu dla 429** — czy `createClient(request.headers, request.cookies)` w questions.ts poprawnie wyciągnie JWT z Authorization headera w środowisku testowym (Vitest + Node.js)? Wzorzec nie był jeszcze użyty w tym projekcie. Pierwsza implementacja powinna zawierać weryfikację.

3. **chat.ts czyta user_settings** (linia 97–102) — czy chat.ts po dodaniu rate limitera będzie miał dwa odwołania do Supabase (settings + rate_limit_events)? Może to wpłynąć na kolejność operacji i error handling.
