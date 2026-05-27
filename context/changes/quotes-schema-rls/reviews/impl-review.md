<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Quotes Schema + RLS

- **Plan**: context/changes/quotes-schema-rls/plan.md
- **Scope**: Phase 1 + Phase 2 of 2 (all phases)
- **Date**: 2026-05-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 2 warnings | 2 observations

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

### F1 — QuoteInsert includes user_id — ownership not enforced by type

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:20
- **Detail**: QuoteInsert = Omit<Quote, "id" | "created_at" | "updated_at"> still carries user_id as a required field. Any service layer code (S-01, S-02) that accepts a dto and spreads it into a Supabase insert could accidentally forward a caller-supplied user_id from a request body, enabling impersonation at the application layer. RLS blocks this at the DB — but the type creates a pit of failure for the next developer. Note: this shape was explicitly planned; the plan specified the exact Omit<> signature. This is a safe-by-design concern the plan didn't address, not a deviation.
- **Fix A ⭐ Recommended**: Remove user_id from QuoteInsert; set server-side only (from context.locals.user.id). Type models reality — callers never own user_id. Strength: makes impersonation a compile error. Tradeoff: slightly changes the contracted type before F-02/S-01 are implemented (low cost now). Confidence: HIGH. Blind spot: None significant.
- **Fix B**: Keep as-is; rely on RLS enforcement at DB layer. Strength: zero type contract change. Tradeoff: leaves a pit for future implementers. Confidence: MEDIUM.
- **Decision**: FIXED via Fix A — removed user_id from QuoteInsert

### F2 — JSONB default '{}' misaligns with TypeScript content type

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/types.ts:15 / supabase/migrations/20260526000000_create_quotes.sql:17
- **Detail**: Migration sets `content JSONB NOT NULL DEFAULT '{}'` but TypeScript type is `content: { items: QuoteItem[] }` with items non-optional. A row inserted without content gets `{}` from the DB default; when typed as Quote, `quote.content.items` is undefined — not []. QuoteInsert includes content as required so normal service inserts are safe, but any direct DB insert or future seed script using the default creates a poisoned row.
- **Fix A ⭐ Recommended**: Change migration default to `DEFAULT '{"items": []}'::jsonb`. Strength: DB and TypeScript become consistent; any row using the default is safe to iterate. Pre-production so a new migration or local reset is fine. Confidence: HIGH. Blind spot: None significant.
- **Fix B**: Change TypeScript type to `content: { items?: QuoteItem[] }`. Strength: no migration change. Tradeoff: all downstream code must null-check items; DB and TS still conceptually diverge. Confidence: MEDIUM.
- **Decision**: FIXED via Fix A — migration default changed to '{"items": []}'::jsonb

### F3 — update_updated_at() not schema-qualified

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260526000000_create_quotes.sql:2
- **Detail**: Function created without schema qualifier, relying on search_path. Generic name risks silent collision if a future migration creates another function with the same name via CREATE OR REPLACE.
- **Fix**: Rename to `public.set_updated_at()` or `quotes_set_updated_at()` and reference the qualified name in the trigger definition.
- **Decision**: FIXED — renamed function to public.set_updated_at() and updated trigger reference

### F4 — Unplanned supabase/config.toml project_id rename

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/config.toml:5
- **Detail**: project_id changed from "10x-astro-starter" to "quotekit". Not in the plan but necessary — avoids container name collisions when running supabase start alongside other projects from the same template. Benign and correct.
- **Fix**: No code change. Worth recording as a lessons.md rule: rename project_id in supabase/config.toml immediately after bootstrapping from the 10x-astro-starter template.
- **Decision**: ACCEPTED-AS-RULE — config.toml already correctly renamed; lesson recorded in context/foundation/lessons.md
