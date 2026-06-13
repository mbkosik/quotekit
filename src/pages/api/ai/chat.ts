import type { APIRoute } from "astro";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase";
import { QuoteItemSchema, MessageSchema } from "@/types";

export const prerender = false;

const RequestSchema = z.object({
  inquiry_text: z.string().min(20),
  messages: z.array(MessageSchema),
  generate: z.boolean().default(false),
});

const ChatOutputSchema = z.object({
  items: z.array(QuoteItemSchema),
  title: z.string(),
});

const QUESTION_SYSTEM_PROMPT = `Jesteś asystentem wyceny dla junior freelancera na polskim rynku.
Twoim zadaniem jest zebranie informacji o projekcie klienta.

Zadaj JEDNO konkretne pytanie wyjaśniające — o zakres, tech stack, termin, budżet klienta lub podobne.
Nie zadawaj pytania ogólnego ani wieloczęściowego.

Jeśli masz już wystarczająco informacji do wyceny — odpowiedz TYLKO: DONE
Jeśli zapytanie jest za krótkie lub nieczytelne — odpowiedz TYLKO: TOO_SHORT`;

const GENERATION_SYSTEM_PROMPT = `Jesteś asystentem wyceny dla junior freelancera na polskim rynku.
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

async function generateItems(
  client: NonNullable<ReturnType<typeof createAnthropicClient>>,
  inquiry_text: string,
  messages: z.infer<typeof MessageSchema>[],
  systemPrompt: string,
) {
  const pairs: string[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = messages[i];
    const nxt = messages[i + 1];
    if (cur.role === "assistant" && nxt.role === "user") {
      pairs.push(`P: ${cur.content}\nO: ${nxt.content}`);
    }
  }
  const qaHistory = pairs.join("\n\n");

  const userContent = qaHistory ? `${inquiry_text}\n\nDodatkowe informacje:\n${qaHistory}` : inquiry_text;

  const message = await client.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(ChatOutputSchema) },
  });

  const parsed = ChatOutputSchema.safeParse(message.parsed_output);
  return parsed.success ? parsed.data : null;
}

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

  let userContext = "";
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    try {
      const { data } = (await supabase
        .from("user_settings")
        .select("prompt_context")
        .eq("user_id", context.locals.user.id)
        .maybeSingle()) as { data: { prompt_context: string } | null; error: unknown };
      userContext = data?.prompt_context ?? "";
    } catch {
      // fallback to empty — AI continues without user context
    }
  }

  const contextSection = userContext ? `\n\n## Kontekst użytkownika\n${userContext}` : "";
  const questionSystemPrompt = QUESTION_SYSTEM_PROMPT + contextSection;
  const generationSystemPrompt = GENERATION_SYSTEM_PROMPT + contextSection;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { inquiry_text, messages, generate } = parsed.data;

  if (generate) {
    let result;
    try {
      result = await generateItems(client, inquiry_text, messages, generationSystemPrompt);
    } catch {
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!result || result.items.length === 0) {
      return new Response(JSON.stringify({ error: "inquiry_unusable" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ type: "complete", items: result.items, title: result.title }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Question mode
  let questionResponse;
  try {
    questionResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: questionSystemPrompt,
      messages: [{ role: "user", content: `Zapytanie: ${inquiry_text}` }, ...messages],
    });
  } catch {
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const responseText = questionResponse.content[0]?.type === "text" ? questionResponse.content[0].text.trim() : "";

  if (responseText === "TOO_SHORT") {
    return new Response(JSON.stringify({ type: "sparse" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (responseText === "DONE") {
    let result;
    try {
      result = await generateItems(client, inquiry_text, messages, generationSystemPrompt);
    } catch {
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!result || result.items.length === 0) {
      return new Response(JSON.stringify({ error: "inquiry_unusable" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ type: "complete", items: result.items, title: result.title }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ type: "question", content: responseText }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
