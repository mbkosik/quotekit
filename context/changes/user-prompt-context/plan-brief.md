# User Prompt Context — Plan Brief

> Full plan: `context/changes/user-prompt-context/plan.md`

## What & Why

Add a user-editable free-text "context" field that gets silently appended to AI system prompts on every quote generation. The motivation: AI line-item quality is the core NFR of QuoteKit, and personalizing the prompt (specialization, market, rates) is the cheapest quality lever available without changing the model or prompt engineering from scratch.

## Starting Point

Two hardcoded system prompts (`QUESTION_SYSTEM_PROMPT`, `GENERATION_SYSTEM_PROMPT`) live in `src/pages/api/ai/chat.ts`. No user-level settings table exists. The Topbar has no settings link and the app has no `/settings` page.

## Desired End State

User writes a free-text context once (e.g., "Specjalizuję się w Laravel, stawka 150 PLN/h, rynek: małe firmy") on a dedicated `/settings` page. From that point forward, every AI interaction — both clarifying questions and line item generation — benefits from this context. Users who never set context see no change in behavior.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| ---|---|--- |
| Storage | New `user_settings` table | Follows the quotes table pattern — full RLS control, standard Supabase SQL |
| UI placement | Dedicated `/settings` page + Topbar link | Clearly discoverable, doesn't clutter the creation flow, easy to extend |
| AI scope | Both prompts in `chat.ts` (questions + generation) | Knowing user's specialization improves both clarifying Q quality and line item accuracy |
| Character limit | 500-char soft+hard limit | Enough for a paragraph; prevents runaway token cost and prompt dilution |
| Empty context | Skip injection silently | Clean prompts, zero regression for users who never set context |
| Placeholder text | Concrete Polish examples in textarea | Reduces blank-canvas paralysis; immediately shows what to write |
| Discovery nudge | None — Topbar link only | Solo MVP; authenticated users will find it in the nav |

## Scope

**In scope:**
- `user_settings` Supabase migration + RLS
- `GET /api/settings` + `POST /api/settings` endpoints
- `/settings` Astro page with `UserContextForm` React component (textarea + char counter + save)
- Topbar "Ustawienia" link
- `chat.ts` modification: dynamic system prompt building for both Q and generation

**Out of scope:**
- Injection into `questions.ts` (client-questions / S-03 flow)
- Injection into `scope.ts` (legacy F-02 scaffold, unused by main flow)
- Any other profile fields (hourly rate, currency, avatar)
- Discovery nudge banner on `/new` or `/quotes`

## Architecture / Approach

`/settings` page does an SSR Supabase fetch of `user_settings` → passes `prompt_context` as prop to `UserContextForm` React island. The form POSTs to `/api/settings` which upserts the row. On each `POST /api/ai/chat` request, the endpoint creates a Supabase client, fetches the user's context once (primary key lookup), builds both system prompts with an optional `## Kontekst użytkownika` section appended, and passes the built prompt into `generateItems()`. Graceful fallback to base prompts if DB query fails.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. DB + Settings API | `user_settings` table + CRUD API | RLS policy correctness (per-user isolation) |
| 2. Settings UI | `/settings` page + Topbar link + form component | None major |
| 3. AI Injection | Context in both system prompts in `chat.ts` | Regression in existing quote creation flow |

**Prerequisites:** S-01 done (quote creation flow exists), Supabase local dev running (`npx supabase start`)
**Estimated effort:** ~1 session across 3 short phases

## Open Risks & Assumptions

- User may write contradictory or misleading context (e.g., wrong rates) — the AI will honor it; no validation of semantic correctness is planned.
- `chat.ts` currently has no Supabase dependency — adding it introduces a new import; if `createClient` returns null (env vars missing), the code must handle this without crashing the AI flow.

## Success Criteria (Summary)

- User can save free-text context at `/settings` and see it persist across sessions
- Quote creation with context produces more domain-relevant questions and line items
- Quote creation without context is identical to current behavior (no regression)
