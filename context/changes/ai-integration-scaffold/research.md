---
date: 2026-05-28T00:00:00+02:00
researcher: Mateusz Kosik
git_commit: 9502415b4751a6a1e8a791c5fde56330a1b3e87f
branch: main
repository: quotekit
topic: "AI integration scaffold — @anthropic-ai/sdk + /api/ai/scope endpoint"
tags: [research, codebase, anthropic, api-routes, env-vars, types, middleware]
status: complete
last_updated: 2026-05-28
last_updated_by: Mateusz Kosik
sources: exa.ai (2026-05-28), Context7 /anthropics/anthropic-sdk-typescript (2026-05-28), Context7 /websites/astro_build_en (2026-05-28), internal codebase (2026-05-28)
---

# Research: AI Integration Scaffold

**Date**: 2026-05-28  
**Researcher**: Mateusz Kosik  
**Git Commit**: `9502415b4751a6a1e8a791c5fde56330a1b3e87f`  
**Branch**: main  
**Repository**: [mbkosik/quotekit](https://github.com/mbkosik/quotekit)

---

## Research Question

Jak podłączyć `@anthropic-ai/sdk` do projektu Astro 6 + Cloudflare Workers i stworzyć endpoint `/api/ai/scope` zwracający sparsowaną listę pozycji `{task, hours, rate}` ze strukturalnym outputem?

---

## Summary

Research potwierdził: SDK działa na workerd z flagą `nodejs_compat_v2` już obecną w projekcie. **Krytyczne odkrycie:** ani `@anthropic-ai/sdk`, ani `zod` nie są zainstalowane — oba wymagają `npm install`. Typ `QuoteItem` (`{ task, hours, rate }`) istnieje już w `src/types.ts` i jest dokładnie tym, co endpoint ma zwracać. Endpoint `/api/ai/scope` będzie pierwszym w projekcie, który zwraca JSON zamiast redirect — należy stworzyć nowy wzorzec odpowiedzi. Auth: `context.locals.user` jest dostępny z middleware, ale `/api/*` nie jest domyślnie chronione — wymagany ręczny guard 401.

---

## Detailed Findings

### 1. Zależności — co brakuje, co jest

**Źródło:** `package.json` (internal)

| Pakiet | Status | Wersja |
|---|---|---|
| `@anthropic-ai/sdk` | ❌ NIE zainstalowany | — |
| `zod` | ❌ NIE zainstalowany | — |
| `astro` | ✅ | ^6.3.1 |
| `@astrojs/cloudflare` | ✅ | ^13.5.0 |
| `@supabase/ssr` | ✅ | ^0.10.3 |
| `react` | ✅ | ^19.2.6 |
| `typescript` | ✅ | ^5.9.3 |
| `wrangler` | ✅ (dev) | ^4.90.0 |

**Implikacja:** plan musi uwzględnić `npm install @anthropic-ai/sdk zod` jako krok 1.

Poprzedni research zewnętrzny zakładał, że Zod jest już zainstalowany (wnioskowanie z konwencji projektu) — **to było błędne**. Wewnętrzny research koryguje.

---

### 2. wrangler.jsonc — nodejs_compat_v2 jest

**Źródło:** `wrangler.jsonc`

```jsonc
{
  "compatibility_date": "2026-05-08",
  "compatibility_flags": ["nodejs_compat_v2"],
}
```

`nodejs_compat_v2` + `compatibility_date >= 2024-09-23` → pełne polyfille Node.js APIs dla `@anthropic-ai/sdk`. **Brak zmian w wrangler.jsonc.** Exa.ai potwierdziło: Cloudflare używa Anthropic SDK w oficjalnych tutorialach z tą flagą.

---

### 3. Typ QuoteItem już istnieje

**Źródło:** [`src/types.ts:3-7`](https://github.com/mbkosik/quotekit/blob/9502415b4751a6a1e8a791c5fde56330a1b3e87f/src/types.ts#L3-L7)

```typescript
export interface QuoteItem {
  task: string;
  hours: number;
  rate: number;
}
```

**To dokładnie schemat outputu endpointu.** Nie tworzyć nowego typu — reużyć `QuoteItem` z `@/types`.

Powiązane typy w [`src/types.ts:9-18`](https://github.com/mbkosik/quotekit/blob/9502415b4751a6a1e8a791c5fde56330a1b3e87f/src/types.ts#L9-L18):

```typescript
export interface Quote {
  content: { items: QuoteItem[] }; // <- struktura JSONB w bazie
  // ...
}
```

Schemat Zod dla outputu Claude musi być zgodny z `QuoteItem[]`.

---

### 4. Wzorzec istniejących API routes

**Źródło:** `src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts` (internal)

Wszystkie trzy auth routes mają ten sam wzorzec:

```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const field = form.get("field") as string; // bez Zod, rzutowanie as string
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/route?error=...`); // błąd → redirect
  }
  const { error } = await supabase.operation();
  if (error) {
    return context.redirect(`/route?error=${encodeURIComponent(error.message)}`);
  }
  return context.redirect("/success");
};
```

**Kluczowe obserwacje:**
- Brak Zod w auth routes — surowe `form.get() as string`
- Brak JSON responses — wszystko przez `context.redirect()`
- `/api/ai/scope` będzie **pierwszym endpointem w projekcie zwracającym JSON**
- Brak `export const prerender = false` — zgodne z docs (tryb `output: 'server'`, zbędna linia)
- Input: `request.formData()` — scope endpoint użyje `request.json()` (nowy wzorzec)

---

### 5. Middleware i ochrona endpointu

**Źródło:** [`src/middleware.ts`](https://github.com/mbkosik/quotekit/blob/9502415b4751a6a1e8a791c5fde56330a1b3e87f/src/middleware.ts)

```typescript
const PROTECTED_ROUTES = ["/dashboard"]; // tylko strony, nie /api/*

export const onRequest = defineMiddleware(async (context, next) => {
  // ...
  context.locals.user = user ?? null; // User | null z Supabase
  // redirect tylko jeśli route w PROTECTED_ROUTES
});
```

**Wnioski:**
- `/api/ai/scope` **nie jest** domyślnie chroniony
- `context.locals.user` jest jednak **dostępny** (middleware ustawia go dla każdego requestu)
- Wymagany ręczny guard w endpointcie:
  ```typescript
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  ```

---

### 6. Wzorzec fabryki klienta z src/lib/supabase.ts

**Źródło:** [`src/lib/supabase.ts:1-23`](https://github.com/mbkosik/quotekit/blob/9502415b4751a6a1e8a791c5fde56330a1b3e87f/src/lib/supabase.ts)

```typescript
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null; // graceful fallback — nie rzuca wyjątku
  }
  return createServerClient(/* ... */);
}
```

**Wzorzec do naśladowania** dla `src/lib/anthropic.ts`:
```typescript
import { ANTHROPIC_KEY } from "astro:env/server";
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient() {
  if (!ANTHROPIC_KEY) return null;
  return new Anthropic({ apiKey: ANTHROPIC_KEY });
}
```

Projekt ma też `src/lib/config-status.ts` i `src/lib/utils.ts` — `anthropic.ts` wchodzi naturalnie do tego katalogu.

---

### 7. Konfiguracja env — astro.config.mjs i .dev.vars

**Źródło:** `astro.config.mjs`, `.dev.vars` (internal)

Istniejący env.schema (linie 17-20):
```javascript
env: {
  schema: {
    SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
    SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  },
},
```

`.dev.vars` istnieje i ma wpisy dla Supabase — wystarczy dołożyć `ANTHROPIC_KEY`.

**Do zmiany w planie:**
1. `astro.config.mjs` — dodać `ANTHROPIC_KEY: envField.string({ context: "server", access: "secret", optional: false })`
2. `.dev.vars` — dodać `ANTHROPIC_KEY=sk-ant-...` (lokalnie)
3. `.env.example` — dodać `ANTHROPIC_KEY=###`
4. Produkcja: `wrangler secret put ANTHROPIC_KEY`

---

### 8. Metoda structured output — messages.parse() + zodOutputFormat()

**Źródło:** Context7 `/anthropics/anthropic-sdk-typescript` (helpers.md)

SDK udostępnia czystszy mechanizm niż ręczne tool_use:

```typescript
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const LineItemsSchema = z.object({
  items: z.array(z.object({
    task:  z.string(),
    hours: z.number(),
    rate:  z.number(),
  })),
});

const message = await client.messages.parse({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: inquiryText }],
  output_config: {
    format: zodOutputFormat(LineItemsSchema),
  },
});

const items = message.parsed_output?.items; // QuoteItem[] — w pełni typowane
```

`parsed_output` jest typowany przez TypeScript jako wynik schematu Zod — brak `as any`, brak `JSON.parse()`, brak `response.content.find(b => b.type === "tool_use")`.

---

### 9. Astro 6 + workerd w dev

**Źródło:** exa.ai — how2.sh, DEV Community (2026-05-28)

`npm run dev` (`astro dev`) w Astro 6 z `@astrojs/cloudflare` uruchamia workerd — ten sam runtime co Cloudflare Workers produkcyjny. Ryzyko z roadmapy `workerd ≠ Node.js` jest zniwelowane — testowanie działa przez `npm run dev`.

---

## Code References

| Plik | Linia | Znaczenie |
|---|---|---|
| `src/types.ts` | 3-7 | `QuoteItem` — reużyć, nie tworzyć nowego |
| `src/types.ts` | 9-18 | `Quote.content.items: QuoteItem[]` — zgodność z JSONB |
| `src/middleware.ts` | 4 | `PROTECTED_ROUTES` — `/api/*` nie jest chronione |
| `src/middleware.ts` | 11-12 | `context.locals.user` — dostępne w scope.ts |
| `src/lib/supabase.ts` | 5-7 | Wzorzec fabryki z graceful null — kopiować do anthropic.ts |
| `src/lib/supabase.ts` | 3 | `import { ... } from "astro:env/server"` — wzorzec env |
| `astro.config.mjs` | 17-20 | env.schema — dodać ANTHROPIC_KEY |
| `wrangler.jsonc` | 5-6 | `nodejs_compat_v2` — wystarczające, bez zmian |
| `package.json` | deps | `@anthropic-ai/sdk` i `zod` brak — zainstalować |

---

## Architecture Insights

**Nowe wzorce wprowadzane przez F-02:**

1. **Pierwszy JSON endpoint** — scope.ts inicjuje konwencję `new Response(JSON.stringify({...}), { status: 200, headers: { 'Content-Type': 'application/json' } })` w projekcie.
2. **Pierwszy endpoint z ręcznym auth guardem** — wzorzec `if (!context.locals.user) return 401` do przeniesienia do helper function lub middleware przy S-01.
3. **Pierwsza biblioteka AI** — `src/lib/anthropic.ts` jako fabryka, analogicznie do `supabase.ts`.
4. **Pierwsza walidacja Zod** — Zod instalowany do walidacji inputu (`inquiry_text`) i parsowania outputu (`zodOutputFormat`).

---

## Historical Context

**F-01 (quotes-schema-rls)** — done 2026-05-28. Tabela `quotes` + RLS polityki gotowe. Kolumna `content JSONB` ma strukturę `{ items: [{task, hours, rate}] }` — dokładnie to, co F-02 generuje. Typy z `src/types.ts` odzwierciedlają tę strukturę.

**Lessons.md** — reguły dotyczą Supabase/SQL (search_path, auth.uid() w RLS). Nie mają bezpośredniego zastosowania do F-02 (brak SQL w tym changeie).

---

## Decyzje do planu — skompilowane

| Aspekt | Decyzja | Źródło |
|---|---|---|
| Instalacja | `npm install @anthropic-ai/sdk zod` | package.json (brak obu) |
| Typ pozycji | Reużyć `QuoteItem` z `src/types.ts:3-7` | Identyczna struktura |
| Klient Anthropic | `src/lib/anthropic.ts` — fabryka wzorowana na supabase.ts | supabase.ts pattern |
| Env var | `ANTHROPIC_KEY` w astro.config.mjs env.schema + .dev.vars | astro.config.mjs + docs |
| Structured output | `messages.parse()` + `zodOutputFormat(LineItemsSchema)` | Context7 SDK docs |
| Model (default) | `claude-haiku-4-5-20251001` — koszt ~$0.0025/req | Pricing research |
| Auth guard | `if (!context.locals.user) return 401` — ręcznie w endpointcie | middleware.ts |
| Input format | `request.json()` (nie formData) — scope to JSON API | nowy wzorzec |
| Input walidacja | Zod: `z.object({ inquiry_text: z.string().min(20) })` | nowy wzorzec |
| Sparse guard | HTTP 422 + `{ error: "inquiry_too_short" }` jeśli Claude zwróci puste items | do decyzji planera |
| wrangler.jsonc | Brak zmian — nodejs_compat_v2 już jest | wrangler.jsonc |
| .dev.vars | Dodać `ANTHROPIC_KEY=sk-ant-...` | .dev.vars exists |

---

## Open Questions

1. **Model wybór:** `claude-haiku-4-5-20251001` (tani, szybki) vs `claude-sonnet-4-6` (lepsza jakość). NFR mówi ≥80% pozycji bez dużych edycji — czy Haiku to spełni bez rozbudowanego prompt engineeringu? Do przetestowania w scaffoldzie.
2. **System prompt:** Co powinien zawierać system prompt dla generowania pozycji wyceny? Jaki kontekst o roli freelancera i strukturze wyceny? To jest ważna decyzja promptowa — plan powinien zawierać draft.
3. **Sparse guard response shape:** `{ error: "inquiry_too_short", items: [] }` vs HTTP 422? Zależy od tego jak S-01 będzie obsługiwać odpowiedź.
4. **Rate limiting:** Czy endpoint potrzebuje throttlingu? Przy MVP z małą liczbą użytkowników — prawdopodobnie nie.
5. **Czy `ANTHROPIC_KEY` powinien być `optional: true` czy `false` w env.schema?** `false` = build fail jeśli brak; `true` = graceful null fallback (jak Supabase). Supabase używa `optional: true` z ręcznym guard `if (!SUPABASE_URL) return null` — ten sam wzorzec sensowny dla ANTHROPIC_KEY.
