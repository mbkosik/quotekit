import type { APIRoute } from "astro";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const UpdateSchema = z.object({
  prompt_context: z.string().max(500),
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

  const { data, error } = (await supabase
    .from("user_settings")
    .select("prompt_context")
    .eq("user_id", user.id)
    .maybeSingle()) as { data: { prompt_context: string } | null; error: PostgrestError | null };

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to load settings" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ prompt_context: data?.prompt_context ?? "" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

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

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt_context } = parsed.data;
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, prompt_context }, { onConflict: "user_id" });

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to save settings" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ prompt_context }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
