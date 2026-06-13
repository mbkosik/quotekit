<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User Prompt Context

- **Plan**: context/changes/user-prompt-context/plan.md
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — GET /api/settings swallows DB errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/settings.ts (GET handler)
- **Detail**: When the Supabase SELECT fails, the try/catch silently returns `{ prompt_context: '' }` with status 200. The caller cannot distinguish "no saved context" from a DB error.
- **Fix**: Destructure `error` from `.maybeSingle()`; return 500 if non-null.
- **Decision**: FIXED — destructured `error`, added 500 response on failure.

### F2 — settings.astro renders blank form on DB error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/settings.astro
- **Detail**: SSR page ignores `error` field from `.maybeSingle()`. A DB failure renders a blank form indistinguishable from a new user's first visit; user might overwrite their context.
- **Fix**: Check `error`; return 503 response on DB failure.
- **Decision**: FIXED — added `if (error) return new Response("Błąd serwera", { status: 503 })`.

### F3 — No DB CHECK constraint; no slice guard at prompt injection

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260613000000_create_user_settings.sql + src/pages/api/ai/chat.ts:108
- **Detail**: API validates max 500 chars via Zod before upsert, but no DB CHECK constraint exists and chat.ts injects `userContext` without capping length. A direct DB write or future migration could store an unbounded string appended to every Anthropic request.
- **Fix A ⭐ Recommended**: Add migration with CHECK constraint + `.slice(0, 500)` in chat.ts.
- **Fix B**: Accept and document the gap.
- **Decision**: SKIPPED.

### F4 — Type cast hides Supabase error field

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/settings.ts:28, src/pages/settings.astro:13
- **Detail**: Both files cast `.maybeSingle()` result with `error: unknown`, which is imprecise (real type is `PostgrestError | null`). F1/F2 fixes resolved the underlying issue; this is a type accuracy improvement.
- **Fix**: Tighten cast to `error: PostgrestError | null` from `@supabase/supabase-js`.
- **Decision**: FIXED — imported `PostgrestError` and tightened the cast in both files.

### F5 — No DELETE RLS policy on user_settings

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260613000000_create_user_settings.sql
- **Detail**: Migration has SELECT/INSERT/UPDATE policies but no DELETE policy. RLS deny-all is the safe default, but the intent is undocumented.
- **Fix**: Add a comment explaining the intentional omission.
- **Decision**: FIXED — added comment documenting that deny-all is desired; ON DELETE CASCADE handles account deletion.
