import type { APIRoute } from "astro";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import type { QuestionsRequest, QuestionsResponse } from "@/types";

export const prerender = false;

const InputSchema = z.object({
  // min(3) intentional: questions endpoint serves short briefs (e.g. "strona www"),
  // unlike chat/scope which need ≥20 chars for quote generation context
  inquiry_text: z.string().min(3),
});

const QuestionsOutputSchema = z.object({
  questions: z.array(z.string()).min(5).max(7),
});

const SYSTEM_PROMPT = `Jesteś asystentem wyceny dla junior freelancera na polskim rynku.
Na podstawie opisu projektu klienta wygeneruj listę 5–7 konkretnych pytań wyjaśniających,
które freelancer powinien zadać klientowi przed wyceną.

Pytania powinny dotyczyć: zakresu funkcjonalności, stosu technologicznego, terminu realizacji,
budżetu klienta, istniejących zasobów (design, backend, baza kodu) oraz wymagań hostingowych i utrzymania.

Zasady:
- Każde pytanie musi być konkretne i jednoznaczne
- Nie zadawaj pytań wieloczęściowych
- Pytania muszą być w języku polskim
- Wygeneruj 5–7 pytań w zależności od złożoności projektu`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const rl = await checkRateLimit(supabase, context.locals.user.id);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSecs) },
      });
    }
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
  void (parsed.data satisfies QuestionsRequest);

  let message;
  try {
    message = await client.messages.parse({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: inquiry_text }],
      output_config: { format: zodOutputFormat(QuestionsOutputSchema) },
    });
  } catch {
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsedOutput = QuestionsOutputSchema.safeParse(message.parsed_output);
  if (!parsedOutput.success) {
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ questions: parsedOutput.data.questions } satisfies QuestionsResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
