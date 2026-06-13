import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { QuoteItemSchema, QUOTE_STATUSES, type Quote, type QuoteStatus } from "@/types";

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

  const url = new URL(context.request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const rawStatus = url.searchParams.get("status") ?? "";
  const statusFilter = rawStatus
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is QuoteStatus => (QUOTE_STATUSES as readonly string[]).includes(s));

  const searchFilter = (url.searchParams.get("search") ?? "").trim();

  const sortRaw = url.searchParams.get("sort");
  const sortOrder: "asc" | "desc" = sortRaw === "asc" ? "asc" : "desc";

  let query = supabase
    .from("quotes")
    .select("id, title, status, created_at", { count: "exact" })
    .eq("user_id", user.id);

  if (statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }
  if (searchFilter) {
    const escaped = searchFilter.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.ilike("title", `%${escaped}%`);
  }

  const {
    data: quotes,
    error,
    count,
  } = await query.order("created_at", { ascending: sortOrder === "asc" }).range(from, to);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch quotes" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const total = count ?? 0;
  return new Response(JSON.stringify({ quotes, total, page, totalPages: Math.ceil(total / limit) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
