---
title: "QuoteKit — Anti-Corruption Layer: Izolacja @anthropic-ai/sdk"
created: 2026-06-15
type: refactor-plan
---

# QuoteKit — Plan Refaktoru: Anti-Corruption Layer dla AI

---

## Krok 0 — Odkrycie kontekstu

### Stack i warstwy kodu

| Warstwa           | Technologia                           | Rola                                              |
| ----------------- | ------------------------------------- | ------------------------------------------------- |
| HTTP/Route        | Astro API routes (`src/pages/api/`)   | Parse wejścia, wywołanie logiki, mapowanie błędów |
| Stan klienta      | React hooks (`src/components/hooks/`) | State machine UI, wywołania fetch                 |
| Infrastruktura    | `src/lib/`                            | Klient Supabase, klient Anthropic, utils          |
| Typy domenowe     | `src/types.ts`                        | Schematy Zod i typy encji                         |
| Persystencja / DB | `supabase/migrations/` + RLS          | Izolacja danych per-user                          |

### Zewnętrzne zależności (z package.json)

| Pakiet                  | Rola                         | Oficjalna warstwa izolacji?                     |
| ----------------------- | ---------------------------- | ----------------------------------------------- |
| `@anthropic-ai/sdk`     | Klient HTTP do modeli Claude | `src/lib/anthropic.ts` (9 linii — niekompletna) |
| `@supabase/ssr`         | SSR-aware klient Supabase    | `src/lib/supabase.ts` ✅                        |
| `@supabase/supabase-js` | Typy + bezpośredni klient JS | `src/lib/supabase.ts` (typy przeciekają)        |
| `zod`                   | Walidacja schematów          | `src/types.ts` + API routes                     |

### Deklaracje wymienialności w dokumentacji

| Dokument                                   | Linia | Cytat                                                                                                                                     |
| ------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `context/foundation/tech-stack.md`         | 24    | _"Astro 6 server-side API routes provide the runtime to call an LLM (**e.g.**, `@anthropic-ai/sdk`) without a separate backend service."_ |
| `context/domain/01-domain-distillation.md` | 166   | _"Integracja Anthropic SDK — **Generic**: Transport HTTP do modelu AI. Commodity pattern — plik `src/lib/anthropic.ts` to 9 linii."_      |

`(e.g., ...)` w tech-stack.md i klasyfikacja **Generic** w destylacji domenowej są jednoznaczne: autorzy uznali SDK za wymienialny transport, nie za część domeny.

---

## Krok 1 — Identyfikacja przeciekających zależności

### Zależność A: `@anthropic-ai/sdk`

Wszystkie pliki, które dziś "znają" SDK:

| Plik                            | Linia | Co importuje                                                      |
| ------------------------------- | ----- | ----------------------------------------------------------------- |
| `src/lib/anthropic.ts`          | 1     | `import Anthropic from "@anthropic-ai/sdk"` — factory (planowa)   |
| `src/pages/api/ai/chat.ts`      | 3     | `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` |
| `src/pages/api/ai/questions.ts` | 3     | `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` |
| `src/pages/api/ai/scope.ts`     | 3     | `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` |

Oprócz importów, SDK-specyficzne wzorce wywołań są rozsianie w 3 plikach tras:

| Plik:linia                            | Wzorzec SDK-specyficzny                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/pages/api/ai/chat.ts:66-72`      | `client.messages.parse({ output_config: { format: zodOutputFormat(Schema) } })` — structured output API |
| `src/pages/api/ai/chat.ts:74`         | `message.parsed_output` — pole specyficzne dla SDK structured output                                    |
| `src/pages/api/ai/chat.ts:170-175`    | `client.messages.create({...})` — surowe wywołanie SDK                                                  |
| `src/pages/api/ai/chat.ts:183`        | `questionResponse.content[0]?.type === "text"` — SDK-specyficzny format bloku odpowiedzi                |
| `src/pages/api/ai/chat.ts:68`         | `model: "claude-haiku-4-5-20251001"` — hardkodowana nazwa modelu #1                                     |
| `src/pages/api/ai/questions.ts:82-88` | `client.messages.parse({ output_config: { format: zodOutputFormat(Schema) } })`                         |
| `src/pages/api/ai/questions.ts:96`    | `message.parsed_output`                                                                                 |
| `src/pages/api/ai/questions.ts:83`    | `model: "claude-haiku-4-5-20251001"` — hardkodowana nazwa modelu #2                                     |
| `src/pages/api/ai/scope.ts:82-88`     | `client.messages.parse({ output_config: { format: zodOutputFormat(Schema) } })`                         |
| `src/pages/api/ai/scope.ts:96`        | `message.parsed_output`                                                                                 |
| `src/pages/api/ai/scope.ts:86`        | `model: "claude-haiku-4-5-20251001"` — hardkodowana nazwa modelu #3                                     |

**Typ przecieku**: Importy z sub-path publicznego SDK (`/helpers/zod`) + wielokrotna duplikacja wzorca wywołania + hardkodowana nazwa modelu × 3.

---

### Zależność B: `@supabase/supabase-js` (typy)

| Plik                        | Linia | Co importuje                                                  |
| --------------------------- | ----- | ------------------------------------------------------------- |
| `src/lib/rate-limit.ts`     | 1     | `import type { SupabaseClient } from "@supabase/supabase-js"` |
| `src/pages/api/settings.ts` | 2     | `import type { PostgrestError } from "@supabase/supabase-js"` |
| `src/pages/settings.astro`  | 5     | `import type { PostgrestError } from "@supabase/supabase-js"` |
| `src/env.d.ts`              | 3     | `user: import("@supabase/supabase-js").User \| null`          |

**Typ przecieku**: Type-only imports poza warstwą infrastruktury — typ `PostgrestError` w handlerach API i stronach, typ `User` w deklaracji Astro Locals, typ `SupabaseClient` w module rate-limit.

---

## Krok 2 — Klasyfikacja i wybór #1

| Przeciek                     | (a) Pliki / warstwy dotknięte                                                        | (b) Koszt wymiany dziś                                                                                                                           | (c) Rozjazd intencja-vs-kod                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@anthropic-ai/sdk`**      | 4 pliki: 1 lib + 3 API routes. Sub-path import × 3, call pattern × 3, model name × 3 | **Wysoki** — wymiana AI providera (np. OpenAI, Gemini) wymaga edycji 3 tras, re-implementacji zodOutputFormat, przepisania parsowania odpowiedzi | **Krytyczny** — `tech-stack.md:24` pisze `(e.g., ...)`, `01-domain-distillation.md:166` klasyfikuje jako Generic. Plik `src/lib/anthropic.ts` istnieje jako zalążek izolacji, ale nie domknął granicy |
| `@supabase/supabase-js` typy | 4 pliki: 1 lib + 2 API routes + 1 page + env.d.ts                                    | **Niski** — type-only; zamiana = podmiana typów; klient już poprawnie owinięty w `src/lib/supabase.ts`                                           | **Umiarkowany** — brak deklaracji wymienialności, ale klasyfikacja Generic                                                                                                                            |

### Wybór: `@anthropic-ai/sdk`

**Uzasadnienie**: To jest **failed ACL** — ktoś zaczął izolację (factory `createAnthropicClient()` w `src/lib/anthropic.ts`), ale zatrzymał się w połowie drogi. Granica zatrzymała się na poziomie konstruktora klienta, podczas gdy cały wzorzec wywołania (helper `zodOutputFormat`, metody `messages.parse()`/`messages.create()`, pola odpowiedzi `parsed_output`/`content[0].type`, nazwa modelu) wyciekł bezpośrednio do tras HTTP. Dokumenty jednoznacznie deklarują wymienialność tego komponentu — rozjazd między intencją a kodem jest największy i najkosztowniejszy spośród kandydatów.

---

## Krok 3 — Diagnoza

### 3.1 Rozjazd intencja-vs-kod (zacytowane dokumenty)

**Dokument mówi** (`tech-stack.md:24`):

> "Astro 6 server-side API routes provide the runtime to call an LLM (**e.g.**, `@anthropic-ai/sdk`) without a separate backend service."

`(e.g., ...)` = SDK jest egzemplifikacją, nie jedynym wariantem. Autorzy zakładają wymienialność.

**Dokument mówi** (`01-domain-distillation.md:166`):

> "Integracja Anthropic SDK — **Generic**: Transport HTTP do modelu AI. Commodity pattern — plik `src/lib/anthropic.ts` to 9 linii."

Klasyfikacja Generic = warstwa infrastruktury, nie domeny. Powinna być opakowana.

**Kod robi** — sub-path SDK importowany w 3 trasach:

```
src/pages/api/ai/chat.ts:3
  import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

src/pages/api/ai/questions.ts:3
  import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

src/pages/api/ai/scope.ts:3
  import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
```

### 3.2 Duplikacja wzorca wywołania

Trzy pliki tras niezależnie implementują ten sam wzorzec structured output:

```typescript
// chat.ts:66-75
const message = await client.messages.parse({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 2048,
  system: systemPrompt,
  messages: [...],
  output_config: { format: zodOutputFormat(ChatOutputSchema) },
});
const parsed = ChatOutputSchema.safeParse(message.parsed_output);

// questions.ts:82-96 — identyczny wzorzec, inny schema
const message = await client.messages.parse({
  model: "claude-haiku-4-5-20251001",
  ...
  output_config: { format: zodOutputFormat(QuestionsOutputSchema) },
});
const parsedOutput = QuestionsOutputSchema.safeParse(message.parsed_output);

// scope.ts:82-96 — identyczny wzorzec, trzecia kopia
const message = await client.messages.parse({
  model: "claude-haiku-4-5-20251001",
  ...
  output_config: { format: zodOutputFormat(LineItemsSchema) },
});
```

### 3.3 SDK-specyficzny format odpowiedzi przecieka do trasy

Parsing tekstu z bloku odpowiedzi (`chat.ts:183`):

```typescript
const responseText = questionResponse.content[0]?.type === "text" ? questionResponse.content[0].text.trim() : "";
```

`content[0].type === "text"` to wewnętrzny format ContentBlock z Anthropic API. Gdyby przejść na innego providera, ten warunek musiałby zniknąć z handlera HTTP i zostać zastąpiony logiką adaptera.

### 3.4 Przerywacze granic: serwer vs klient

`@anthropic-ai/sdk` jest czysto serwerową zależnością (`ANTHROPIC_KEY` pochodzi z `astro:env/server`). Żaden klient UI nie importuje SDK. Granica nie jest naruszona po stronie klient/serwer — przeciek jest poziomy (wewnątrz warstwy serwera: lib → API routes).

### 3.5 Efekt uboczny: podwójne rate-limiting

Middleware (`src/middleware.ts:19-26`) wywołuje `checkRateLimit()` dla `/api/ai/*` i inserts event. Następnie każdy z 3 endpointów (`chat.ts:86-94`, `questions.ts:41-49`, `scope.ts:44-52`) wywołuje `checkRateLimit()` ponownie i inserts kolejny event. Każde żądanie AI konsumuje **2 eventy** z budżetu zamiast 1. To nie jest podstawowy problem ACL, ale jest symptomem tego, że logika infrastrukturalna (rate limiting) nie jest scentralizowana — w identycznej sytuacji jak logika AI.

---

## Krok 4 — Projekt ACL

### 4.1 Domenowy value object: wynik operacji AI

Operacje domenowe modułu AI scoping (niezależne od SDK):

```typescript
// src/lib/ai/port.ts — NOWY PLIK

import type { Message, QuoteItem } from "@/types";

// Wynik pytania doprecyzowującego
export type ClarifyingQuestionResult =
  | { type: "question"; content: string }
  | { type: "done" } // AI uznało kontekst za wystarczający
  | { type: "too_short" }; // zapytanie zbyt lakoniczne

// Wynik generacji pozycji wyceny
export type ScopingGenerationResult = {
  items: QuoteItem[];
  title: string;
};

// Parametry wspólne
export interface ScopingParams {
  inquiryText: string;
  messages: Message[];
  userContext?: string;
}

export interface ClientQuestionsParams {
  inquiryText: string;
}
```

### 4.2 Port (interfejs domenowy)

```typescript
// src/lib/ai/port.ts (ciąg dalszy)

export interface AIScopingPort {
  // Pyta jedno pytanie doprecyzowujące lub sygnalizuje zakończenie
  askClarifyingQuestion(params: ScopingParams): Promise<ClarifyingQuestionResult>;

  // Generuje pozycje wyceny na podstawie inquiry + rozmowy
  generateQuoteItems(params: ScopingParams): Promise<ScopingGenerationResult | null>;

  // Generuje pytania, które freelancer wyśle klientowi (tryb sparse)
  generateClientQuestions(params: ClientQuestionsParams): Promise<string[]>;
}
```

Reszta kodu (API routes) zna **wyłącznie** ten interfejs. Nie wie nic o Anthropic, OpenAI, ani żadnym innym SDK.

### 4.3 Adapter: `AnthropicScopingAdapter`

```typescript
// src/lib/ai/anthropic-adapter.ts — NOWY PLIK
// JEDYNY plik, który importuje @anthropic-ai/sdk i @anthropic-ai/sdk/helpers/zod

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type {
  AIScopingPort,
  ClarifyingQuestionResult,
  ScopingGenerationResult,
  ScopingParams,
  ClientQuestionsParams,
} from "./port";
import { QuoteItemSchema, MessageSchema } from "@/types";

// Schematy wyjścia — wewnętrzne dla adaptera
const _ChatOutputSchema = z.object({
  items: z.array(QuoteItemSchema),
  title: z.string(),
});
const _QuestionsOutputSchema = z.object({
  questions: z.array(z.string()).min(5).max(7),
});

// Stałe infrastrukturalne — zamknięte w adapterze
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_QUESTION = 512;
const MAX_TOKENS_GENERATION = 2048;
const MAX_TOKENS_CLIENT_QUESTIONS = 1024;

// System prompty — domena biznesowa (kotwice cenowe, rynek PL)
// Pozostają w adapterze, ponieważ są niezwiązane ze specyfiką SDK;
// przy ewentualnej migracji do innego providera przenosi się je razem z logiką.
const QUESTION_SYSTEM_PROMPT = /* ... */ "";
const GENERATION_SYSTEM_PROMPT = /* ... */ "";
const CLIENT_QUESTIONS_SYSTEM_PROMPT = /* ... */ "";

export class AnthropicScopingAdapter implements AIScopingPort {
  constructor(private readonly client: Anthropic) {}

  async askClarifyingQuestion(params: ScopingParams): Promise<ClarifyingQuestionResult> {
    const systemPrompt = this._buildSystemPrompt(QUESTION_SYSTEM_PROMPT, params.userContext);
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_QUESTION,
      system: systemPrompt,
      messages: [{ role: "user", content: `Zapytanie: ${params.inquiryText}` }, ...params.messages],
    });
    // Parsowanie SDK-specyficznego content block — zamknięte tu, nie w trasie
    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (text === "TOO_SHORT") return { type: "too_short" };
    if (text === "DONE") return { type: "done" };
    return { type: "question", content: text };
  }

  async generateQuoteItems(params: ScopingParams): Promise<ScopingGenerationResult | null> {
    const systemPrompt = this._buildSystemPrompt(GENERATION_SYSTEM_PROMPT, params.userContext);
    const userContent = this._buildGenerationContent(params.inquiryText, params.messages);
    const message = await this.client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS_GENERATION,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      output_config: { format: zodOutputFormat(_ChatOutputSchema) },
    });
    // message.parsed_output — SDK-specyficzne pole, zamknięte tu
    const parsed = _ChatOutputSchema.safeParse(message.parsed_output);
    return parsed.success && parsed.data.items.length > 0 ? parsed.data : null;
  }

  async generateClientQuestions(params: ClientQuestionsParams): Promise<string[]> {
    const message = await this.client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS_CLIENT_QUESTIONS,
      system: CLIENT_QUESTIONS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: params.inquiryText }],
      output_config: { format: zodOutputFormat(_QuestionsOutputSchema) },
    });
    const parsed = _QuestionsOutputSchema.safeParse(message.parsed_output);
    return parsed.success ? parsed.data.questions : [];
  }

  private _buildSystemPrompt(base: string, userContext?: string): string {
    return userContext ? `${base}\n\n## Kontekst użytkownika\n${userContext}` : base;
  }

  private _buildGenerationContent(inquiryText: string, messages: { role: string; content: string }[]): string {
    const pairs: string[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      const cur = messages[i];
      const nxt = messages[i + 1];
      if (cur.role === "assistant" && nxt.role === "user") {
        pairs.push(`P: ${cur.content}\nO: ${nxt.content}`);
      }
    }
    const qaHistory = pairs.join("\n\n");
    return qaHistory ? `${inquiryText}\n\nDodatkowe informacje:\n${qaHistory}` : inquiryText;
  }
}
```

### 4.4 Fabryka adaptera

```typescript
// src/lib/ai/index.ts — NOWY PLIK
// Zastępuje src/lib/anthropic.ts lub ją uzupełnia

import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_KEY } from "astro:env/server";
import { AnthropicScopingAdapter } from "./anthropic-adapter";
import type { AIScopingPort } from "./port";

export function createAIScopingService(): AIScopingPort | null {
  if (!ANTHROPIC_KEY) return null;
  return new AnthropicScopingAdapter(new Anthropic({ apiKey: ANTHROPIC_KEY }));
}

export type { AIScopingPort };
```

### 4.5 Cienka trasa HTTP — `chat.ts` po refaktorze (pseudokod)

```typescript
// src/pages/api/ai/chat.ts — PO REFAKTORZE
import { createAIScopingService } from "@/lib/ai"; // jedyny import AI
import type { AIScopingPort } from "@/lib/ai"; // bez @anthropic-ai/sdk

// ...

const aiService = createAIScopingService();
if (!aiService) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 503 });

if (parsed.data.generate) {
  // Trasa deleguje do portu domenowego; nic nie wie o zodOutputFormat ani messages.parse
  const result = await aiService.generateQuoteItems({
    inquiryText: parsed.data.inquiry_text,
    messages: parsed.data.messages,
    userContext,
  });
  if (!result) return new Response(JSON.stringify({ error: "inquiry_unusable" }), { status: 422 });
  return new Response(JSON.stringify({ type: "complete", items: result.items, title: result.title }), { status: 200 });
}

const qResult = await aiService.askClarifyingQuestion({
  inquiryText: parsed.data.inquiry_text,
  messages: parsed.data.messages,
  userContext,
});
if (qResult.type === "too_short") return new Response(JSON.stringify({ type: "sparse" }), { status: 200 });
if (qResult.type === "done") {
  /* generateQuoteItems ... */
}
return new Response(JSON.stringify({ type: "question", content: qResult.content }), { status: 200 });
```

Trasa nie wie **niczego** o `zodOutputFormat`, `messages.parse`, `parsed_output`, `content[0].type`, ani nazwie modelu.

---

## Krok 5 — Dowód izolacji i before/after

### 5.1 Dowód izolacji: wymiana biblioteki

Wymiana `@anthropic-ai/sdk` → inny provider (np. `@google-ai/generativelanguage`, OpenAI SDK) po refaktorze:

| Co trzeba zmienić                 | Po refaktorze               | Przed refaktorem         |
| --------------------------------- | --------------------------- | ------------------------ |
| `src/lib/ai/anthropic-adapter.ts` | ✅ TAK — jedyny plik        | —                        |
| `src/lib/ai/port.ts`              | ❌ NIE — interfejs domenowy | —                        |
| `src/pages/api/ai/chat.ts`        | ❌ NIE                      | ✅ TAK (import + logika) |
| `src/pages/api/ai/questions.ts`   | ❌ NIE                      | ✅ TAK                   |
| `src/pages/api/ai/scope.ts`       | ❌ NIE (martwy kod)         | ✅ TAK                   |
| `src/lib/anthropic.ts`            | ❌ NIE (zastąpiony)         | ✅ TAK                   |
| `src/types.ts`                    | ❌ NIE                      | ❌ NIE                   |
| Komponenty UI / hooki klienta     | ❌ NIE                      | ❌ NIE                   |

Kryterium sukcesu spełnione: **wymiana dotyka wyłącznie `src/lib/ai/anthropic-adapter.ts`**.

### 5.2 Before / After: `src/pages/api/ai/chat.ts`

#### BEFORE (linie 1–5, 48–76, 170–215)

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";  // ← leak
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase";
// ...

async function generateItems(
  client: NonNullable<ReturnType<typeof createAnthropicClient>>, // ← typ SDK
  inquiry_text: string,
  messages: z.infer<typeof MessageSchema>[],
  systemPrompt: string,
) {
  // ...
  const message = await client.messages.parse({          // ← metoda SDK
    model: "claude-haiku-4-5-20251001",                  // ← hardkodowany model #1
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(ChatOutputSchema) }, // ← helper SDK
  });
  const parsed = ChatOutputSchema.safeParse(message.parsed_output); // ← pole SDK
  return parsed.success ? parsed.data : null;
}

// Tryb question mode:
questionResponse = await client.messages.create({...}); // ← metoda SDK
const responseText =
  questionResponse.content[0]?.type === "text"           // ← format SDK
    ? questionResponse.content[0].text.trim()
    : "";
```

#### AFTER (linie 1–5 i handler)

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
// BRAK: zodOutputFormat, createAnthropicClient, NonNullable<ReturnType<...>>
import { createAIScopingService } from "@/lib/ai";       // ← jedyny import AI
import { createClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { MessageSchema } from "@/types";
// ...

// BRAK: funkcja generateItems — przeniesiona do adaptera
// BRAK: QUESTION_SYSTEM_PROMPT, GENERATION_SYSTEM_PROMPT — w adapterze

export const POST: APIRoute = async (context) => {
  // ... auth + rate limit (bez zmian) ...

  const aiService = createAIScopingService();
  if (!aiService) return 503;

  if (parsed.data.generate) {
    const result = await aiService.generateQuoteItems({ inquiryText, messages, userContext });
    // ← nie wie o zodOutputFormat, messages.parse, parsed_output
    if (!result) return 422;
    return 200 { type: "complete", ...result };
  }

  const qResult = await aiService.askClarifyingQuestion({ inquiryText, messages, userContext });
  // ← nie wie o content[0].type === "text", "TOO_SHORT", "DONE"
  if (qResult.type === "too_short") return { type: "sparse" };
  if (qResult.type === "done") { /* generateQuoteItems */ }
  return { type: "question", content: qResult.content };
};
```

### 5.3 Before / After: `src/pages/api/ai/questions.ts`

#### BEFORE

```typescript
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"; // ← leak
// ...
message = await client.messages.parse({
  model: "claude-haiku-4-5-20251001", // ← model #2
  output_config: { format: zodOutputFormat(QuestionsOutputSchema) },
});
const parsedOutput = QuestionsOutputSchema.safeParse(message.parsed_output);
```

#### AFTER

```typescript
// BRAK importu @anthropic-ai/sdk
import { createAIScopingService } from "@/lib/ai";
// ...
const aiService = createAIScopingService();
const questions = await aiService.generateClientQuestions({ inquiryText });
return 200 { questions };
```

### 5.4 Otwarte pytanie: kontrakt `zodOutputFormat`

`zodOutputFormat` to helper konwertujący schemat Zod do formatu `output_config` wymaganego przez Anthropic API structured output. Jego obecność jest integralnie związana z `client.messages.parse()` — te dwa wywołania muszą być zawsze razem. **Decyzja**: Oba trafiają do adaptera. Tras HTTP nie interesuje sposób serializacji schematu — dostają domenowy wynik (`ScopingGenerationResult`). Zakodowanie tej decyzji: metoda `_callStructuredOutput<T>` w klasie adaptera, która hermetycznie łączy `zodOutputFormat` + `messages.parse` + parsowanie `parsed_output`.

---

## Krok 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu

**Przed refaktorem:**

```bash
grep -r "@anthropic-ai/sdk" src/
# Wynik: 4 pliki
#   src/lib/anthropic.ts:1
#   src/pages/api/ai/chat.ts:3
#   src/pages/api/ai/questions.ts:3
#   src/pages/api/ai/scope.ts:3
```

**Po refaktorze:**

```bash
grep -r "@anthropic-ai/sdk" src/
# Wynik: 1 plik — src/lib/ai/anthropic-adapter.ts
```

Pliki, które DZIŚ znają SDK → po refaktorze nie będą:

| Plik                              | Status przed                  | Status po                      |
| --------------------------------- | ----------------------------- | ------------------------------ |
| `src/lib/anthropic.ts`            | znany (import)                | usunięty lub deprecjonowany    |
| `src/pages/api/ai/chat.ts`        | znany (import + call pattern) | nie zna                        |
| `src/pages/api/ai/questions.ts`   | znany (import + call pattern) | nie zna                        |
| `src/pages/api/ai/scope.ts`       | znany (import + call pattern) | usunięty (martwy kod M5)       |
| `src/lib/ai/anthropic-adapter.ts` | — (nowy)                      | jedyny znający                 |
| `src/lib/ai/port.ts`              | — (nowy)                      | nie zna (interfejs domenowy)   |
| `src/lib/ai/index.ts`             | — (nowy)                      | nie zna (deleguje do adaptera) |

### 6.2 Plan faz

#### Faza 1 — Port i typy domenowe (zero blast radius)

1. Utwórz `src/lib/ai/port.ts`:
   - Typy wynikowe: `ClarifyingQuestionResult`, `ScopingGenerationResult`
   - Interfejs: `AIScopingPort` z 3 metodami
2. Brak importów z `@anthropic-ai/sdk`.
3. Brak zmian w istniejących plikach.

#### Faza 2 — Adapter Anthropic

1. Utwórz `src/lib/ai/anthropic-adapter.ts`:
   - Klasa `AnthropicScopingAdapter implements AIScopingPort`
   - Przenieś logikę z `chat.ts` (funkcje `generateItems`, parsowanie `content[0]`) i z `questions.ts`
   - Przenieś system prompty (QUESTION_SYSTEM_PROMPT, GENERATION_SYSTEM_PROMPT, CLIENT_QUESTIONS_SYSTEM_PROMPT)
   - Przenieś kotwice cenowe z `chat.ts:31-40`
   - Zamknij: `zodOutputFormat`, `messages.parse`, `messages.create`, `parsed_output`, `content[0].type`, `MODEL` stała
2. Utwórz `src/lib/ai/index.ts` z funkcją `createAIScopingService(): AIScopingPort | null`
3. Stary `src/lib/anthropic.ts` zachowaj lub wchłoń do `index.ts` — bez zmian w API routes na tym etapie.

#### Faza 3 — Refaktor tras HTTP (zmiana krytyczna)

1. Podmień `src/pages/api/ai/chat.ts`:
   - Usuń import `zodOutputFormat`, `createAnthropicClient`
   - Usuń funkcję `generateItems`
   - Usuń system prompty
   - Zastąp wywołania SDK przez `aiService.askClarifyingQuestion()` i `aiService.generateQuoteItems()`
2. Podmień `src/pages/api/ai/questions.ts`:
   - Usuń import `zodOutputFormat`, `createAnthropicClient`
   - Zastąp przez `aiService.generateClientQuestions()`
3. Usuń `src/pages/api/ai/scope.ts` (martwy kod — M5 z `01-domain-distillation.md:265-269`).
4. Zaktualizuj `src/__tests__/error-sanitization/error-sanitization.test.ts` — zamień `scopePOST` na `chatPOST`.

#### Faza 4 — Napraw podwójne rate-limiting (zysk przy okazji)

Middleware (`src/middleware.ts:19-26`) i endpointy (`chat.ts:86-94`, `questions.ts:41-49`) wywołują `checkRateLimit()` dwukrotnie na każde żądanie. Usunąć wywołania z endpointów — middleware wystarczy.

#### Faza 5 — Weryfikacja grep

```bash
grep -r "@anthropic-ai/sdk" src/
# Oczekiwany wynik: src/lib/ai/anthropic-adapter.ts (jedyna linia)
```

### 6.3 Ograniczenia planu

1. System prompty (QUESTION_SYSTEM_PROMPT, GENERATION_SYSTEM_PROMPT) zawierają domenową wiedzę o rynku PL (kotwice cenowe), ale zostają w adapterze — są niezwiązane ze specyfiką SDK, przy migracji providera przenoszą się razem z logiką wywołań.
2. `AIScopingPort` zawiera metodę `generateClientQuestions` — obejmuje endpoint `/api/ai/questions`, który de facto nakłada się funkcjonalnie z `generateQuoteItems`. Decyzja o merge obu w jedną ścieżkę jest oddzielna od refaktoru ACL.
3. Analiza opiera się na commit `3c9a5af`. Jeśli w tym czasie zostaną dodane nowe endpointy AI, wymagają one podpięcia do portu przed zamknięciem Fazy 3.
4. Typ `User` z `@supabase/supabase-js` w `src/env.d.ts:3` pozostaje poza zakresem tego refaktoru — to osobny (mniejszy) przeciek, wymagający decyzji o typie domenowym użytkownika.

---

## Podsumowanie

Analiza wykazała dwa przecieki zależności w projekcie QuoteKit. Najpoważniejszy to niekompletna izolacja `@anthropic-ai/sdk`: fabryka `createAnthropicClient()` w `src/lib/anthropic.ts` zatrzymała się na poziomie konstruktora klienta, podczas gdy helper `zodOutputFormat` z sub-path SDK oraz SDK-specyficzne wzorce wywołań (`messages.parse`, `messages.create`, `parsed_output`, `content[0].type`) wyciekły bezpośrednio do 3 tras HTTP (`chat.ts:3`, `questions.ts:3`, `scope.ts:3`), a nazwa modelu `"claude-haiku-4-5-20251001"` jest hardkodowana trzykrotnie. Dokumenty (`tech-stack.md:24`, `01-domain-distillation.md:166`) explicite deklarują SDK jako wymienialny, co czyni rozjazd intencja-vs-kod krytycznym. Rozwiązaniem jest domknięcie ACL przez port `AIScopingPort` i adapter `AnthropicScopingAdapter` — po refaktorze `grep -r "@anthropic-ai/sdk" src/` zwróci dokładnie jeden plik. Jako efekt uboczny refaktoru zidentyfikowano podwójne rate-limiting dla zapytań AI (middleware + endpoint = 2 eventy zamiast 1), które zostaje naprawione w Fazie 4 bez dodatkowego kosztu.
