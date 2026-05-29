import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { QuoteItemSchema, type Quote } from "@/types";

export const prerender = false;

const CreateSchema = z.object({
  title: z.string().min(1),
  inquiry_text: z.string().min(1),
  content: z.object({ items: z.array(QuoteItemSchema) }),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "DB unavailable" }), {
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

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { title, inquiry_text, content } = parsed.data;
  const result = (await supabase
    .from("quotes")
    .insert({ title, inquiry_text, content, status: "draft", user_id: user.id })
    .select()
    .single()) as { data: Quote; error: null } | { data: null; error: Error };

  if (result.error) {
    return new Response(JSON.stringify({ error: "Failed to create quote" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ quote: result.data }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "DB unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, title, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch quotes" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ quotes }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
