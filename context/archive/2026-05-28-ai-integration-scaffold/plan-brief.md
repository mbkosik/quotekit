# AI Integration Scaffold — Plan Brief

> Full plan: `context/changes/ai-integration-scaffold/plan.md`
> Research: `context/changes/ai-integration-scaffold/research.md`

## What & Why

Wire `@anthropic-ai/sdk` into the Astro 6 / Cloudflare Workers project and expose `POST /api/ai/scope` — the first AI endpoint. F-02 is the technical prerequisite for S-01 (the core product flow); without a working, structured-output endpoint, AI-assisted quote creation cannot be built.

## Starting Point

The project has no AI dependencies installed. All existing API routes are auth-only and return redirects, not JSON. `QuoteItem` (`{ task, hours, rate }`) already exists in `src/types.ts` and `wrangler.jsonc` already has `nodejs_compat_v2`, so the runtime is ready.

## Desired End State

`POST /api/ai/scope` runs under `npm run dev` (workerd runtime). An authenticated request with a client inquiry text returns `HTTP 200` with `{ items: QuoteItem[] }`. Unauthenticated → 401. Nonsensical/vague input → 422. The endpoint is wired to Claude Haiku via Zod structured output and is ready for S-01 to consume.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| SDK method | `messages.parse()` + `zodOutputFormat()` | Clean typed output without manual `tool_use` parsing | Research (Context7 SDK docs) |
| Model | `claude-haiku-4-5-20251001` | Fast + cheap for scaffold validation; swap to Sonnet in S-01 if quality misses NFR | Plan |
| System prompt | Freelancer context + PLN rate anchors + output format | Enough domain signal to produce credible estimates without few-shot examples | Plan |
| ANTHROPIC_KEY | `optional: true` in env.schema | Consistent with Supabase pattern; CI builds without the secret | Plan |
| Sparse guard | HTTP 422 + `{ error: "inquiry_too_short" }` | Explicit semantic code lets S-01 show a targeted UI message without inspecting items | Plan |
| Response shape | `{ items: QuoteItem[] }` | Wraps the array for forward compatibility; matches `Quote.content` structure | Plan |
| Auth guard | Manual `if (!context.locals.user)` → 401 | `/api/*` not in `PROTECTED_ROUTES`; endpoint guards itself | Research |

## Scope

**In scope:**
- `npm install @anthropic-ai/sdk zod`
- `ANTHROPIC_KEY` registered in `astro.config.mjs`, `.dev.vars`, `.env.example`
- `src/lib/anthropic.ts` factory (null-returning, mirrors `supabase.ts`)
- `src/pages/api/ai/scope.ts` — POST endpoint with auth guard, Zod input, Claude call, sparse guard

**Out of scope:**
- Streaming responses
- Rate limiting
- User-editable prompt context (parked as future slice)
- Changes to `wrangler.jsonc`

## Architecture / Approach

```
POST /api/ai/scope
  ↓ 401 if !user (context.locals from middleware)
  ↓ 503 if !ANTHROPIC_KEY (factory returns null)
  ↓ 400 if inquiry_text < 20 chars (Zod InputSchema)
  ↓ Claude Haiku — messages.parse() + zodOutputFormat(LineItemsSchema)
  ↓ 422 if items === [] (sparse guard)
  → 200 { items: QuoteItem[] }
```

`createAnthropicClient()` in `src/lib/anthropic.ts` follows the `createClient()` factory in `src/lib/supabase.ts` exactly. `LineItemsSchema` maps to the existing `QuoteItem` type — no new types needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Dependencies & Environment | Both packages installed; `ANTHROPIC_KEY` in env schema + local secrets | Developer forgets to populate `.dev.vars` before Phase 3 test |
| 2. Anthropic client factory | `src/lib/anthropic.ts` — typed factory, graceful null | Wrong import path from `astro:env/server` (copy from `supabase.ts`) |
| 3. Scope endpoint | Working `POST /api/ai/scope` under workerd runtime | `zodOutputFormat` import path is `@anthropic-ai/sdk/helpers/zod`, not root package |

**Prerequisites:** Node.js v22.14.0, Docker running (Supabase local), `ANTHROPIC_KEY` value  
**Estimated effort:** ~1 session, 3 phases

## Open Risks & Assumptions

- Haiku quality may not reach the ≥80% NFR without further prompt engineering — verified empirically during Phase 3 manual testing
- `messages.parse()` API is confirmed in SDK docs but not yet tested under workerd; Phase 3 manual test is the de-risking checkpoint
- Rate anchors in the system prompt are estimates for the Polish freelance market — intentionally wrong-then-editable per the product design

## Success Criteria (Summary)

- `POST /api/ai/scope` returns `200 + { items: [...] }` for a real inquiry under `npm run dev` (workerd)
- Unauthenticated → 401, short input → 400, vague brief → 422
- `npm run lint` and `npm run build` pass with no new errors
