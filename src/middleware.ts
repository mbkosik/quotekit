import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

const PROTECTED_ROUTES = ["/new", "/quotes"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (supabase && context.locals.user && context.url.pathname.startsWith("/api/ai/")) {
    const { allowed, retryAfterSecs } = await checkRateLimit(supabase, context.locals.user.id);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "rate_limit_exceeded", retry_after: retryAfterSecs }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSecs) },
      });
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
