import type { APIRoute } from "astro";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";

export const prerender = false;

const InputSchema = z.object({
  inquiry_text: z.string().min(20),
});

const LineItemsSchema = z.object({
  items: z.array(
    z.object({
      task: z.string(),
      hours: z.number(),
      rate: z.number(),
    }),
  ),
});

const SYSTEM_PROMPT = `Jesteś asystentem wyceny dla junior freelancera na polskim rynku.
Twoim zadaniem jest rozbicie zapytania klienta na konkretne pozycje wyceny.

Kotwice cenowe (PLN/h):
- UI/UX design: 80–100
- Frontend development: 90–130
- Backend development: 100–150
- Integracja API: 100–130
- DevOps/deployment: 120–150
- Zarządzanie projektem: 80–100

Zasady:
- Rozłóż pracę na 3–10 konkretnych deliverables
- Bądź konserwatywny w estymacji godzin
- Używaj liczb całkowitych lub kroków po 0.5 dla godzin
- Jeśli zapytanie jest zbyt ogólne lub mało informatywne, zwróć pustą tablicę items`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = createAnthropicClient();
  if (!client) {
    return new Response(JSON.stringify({ error: "AI unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { inquiry_text } = parsed.data;

  const message = await client.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: inquiry_text }],
    output_config: { format: zodOutputFormat(LineItemsSchema) },
  });

  const items = message.parsed_output?.items ?? [];

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: "inquiry_too_short" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
