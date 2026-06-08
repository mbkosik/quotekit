import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSecs: number;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
  windowSecs = 60,
): Promise<RateLimitResult> {
  const threshold = new Date(Date.now() - windowSecs * 1000).toISOString();

  const { count, error: selectError } = await supabase
    .from("rate_limit_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", threshold);

  if (selectError) {
    return { allowed: true, retryAfterSecs: 0 };
  }

  if (count !== null && count >= limit) {
    return { allowed: false, retryAfterSecs: windowSecs };
  }

  const { error: insertError } = await supabase.from("rate_limit_events").insert({ user_id: userId });

  if (insertError) {
    return { allowed: true, retryAfterSecs: 0 };
  }

  return { allowed: true, retryAfterSecs: 0 };
}
