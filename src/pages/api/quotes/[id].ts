import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { QuoteItemSchema, QUOTE_STATUSES, type Quote } from "@/types";

export const prerender = false;

const idSchema = z.uuid();

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  content: z.object({ items: z.array(QuoteItemSchema) }).optional(),
});

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

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return new Response(JSON.stringify({ error: "Invalid id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const id = parsedId.data;
  const result = (await supabase.from("quotes").select("*").eq("id", id).eq("user_id", user.id).single()) as
    | { data: Quote; error: null }
    | { data: null; error: Error };

  if (result.error) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ quote: result.data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const PATCH: APIRoute = async (context) => {
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (Object.keys(parsed.data).length === 0) {
    return new Response(JSON.stringify({ error: "Nothing to update" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return new Response(JSON.stringify({ error: "Invalid id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const id = parsedId.data;
  const result = (await supabase
    .from("quotes")
    .update(parsed.data)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()) as { data: Quote; error: null } | { data: null; error: Error };

  if (result.error) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ quote: result.data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
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

  const parsedId = idSchema.safeParse(context.params.id);
  if (!parsedId.success) {
    return new Response(JSON.stringify({ error: "Invalid id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const id = parsedId.data;
  const { error, count } = await supabase.from("quotes").delete({ count: "exact" }).eq("id", id).eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Delete failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (count === 0) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(null, { status: 204 });
};
