# User Prompt Context Implementation Plan

## Overview

Add a user-editable free-text "context" field stored in Supabase that gets silently appended to AI system prompts when generating quotes and clarifying questions. The user sets it once in a dedicated settings page; AI responses become more relevant to their specialization, market, and rates without repeating this information each time.

## Current State Analysis

- No `user_settings` table or equivalent exists. The only user-level table is `quotes`, which is per-quote.
- `src/pages/api/ai/chat.ts` has two hardcoded system prompt constants: `QUESTION_SYSTEM_PROMPT` (lines 20–27) and `GENERATION_SYSTEM_PROMPT` (lines 29–44). Both are static strings; neither accepts dynamic user context.
- `generateItems()` (lines 46–73) takes `(client, inquiry_text, messages)` — no provision for user context. It closes over the hardcoded `GENERATION_SYSTEM_PROMPT` directly.
- `src/pages/api/ai/chat.ts` has no Supabase dependency — fetching user context requires adding `createClient` import (new dependency for this file).
- `src/components/Topbar.astro` has "Wyceny" and sign-out; no settings link.
- `src/middleware.ts` protects `["/new", "/quotes"]` — `/settings` must be added.
- SSR fetch pattern is established: Astro pages create a Supabase client server-side and pass data as props to React island components (`client:load`).
- Textarea style pattern established in `src/components/quotes/InquiryForm.tsx:42–52`: `bg-white/5 border border-white/10 rounded-xl px-4 py-3`.

## Desired End State

User navigates to `/settings` via Topbar, sees a textarea with their saved context (empty on first visit), edits it, and saves. On the next quote creation, `POST /api/ai/chat` fetches the user's context server-side from `user_settings` and appends it as a `## Kontekst użytkownika` section to both `QUESTION_SYSTEM_PROMPT` and `GENERATION_SYSTEM_PROMPT` — only if non-empty. Empty context = prompts unchanged; AI behaves exactly as before.

### Key Discoveries

- `chat.ts` currently has no Supabase import — adding user context requires importing `createClient` from `@/lib/supabase` and constructing the client with `(context.request.headers, context.cookies)`, the same pattern used in `middleware.ts:8`.
- `generateItems()` uses `GENERATION_SYSTEM_PROMPT` directly at line 66 — must be refactored to accept a `systemPrompt: string` parameter so the POST handler can pass the already-built (context-enriched) prompt. Two call sites exist: line 114 and line 163.
- `PROTECTED_ROUTES` in `src/middleware.ts` uses `startsWith` matching at line 29 — adding `"/settings"` to the array is sufficient.
- Lessons learned apply: all RLS policies must use `(select auth.uid())` not `auth.uid()`. Trigger functions must pin `SET search_path = ''`.

## What We're NOT Doing

- No nudge banner or inline prompt on `/new` or `/quotes` — Topbar link is the only discovery mechanism.
- No injection into `src/pages/api/ai/questions.ts` — that serves the archived client-questions flow (S-03), not the main creation flow.
- No injection into `src/pages/api/ai/scope.ts` — legacy F-02 scaffold, not called from the main creation flow.
- No user profile fields beyond `prompt_context` — no hourly rate column, currency, etc.
- No hard character block that prevents save — API returns 400 for > 500 chars; UI shows error feedback.

## Implementation Approach

Three sequential phases: **DB first** (so Phases 2 and 3 have a real endpoint to call), **UI second** (verifiable settings CRUD before touching AI logic), **AI injection last** (smallest blast radius, only modifies prompt construction in `chat.ts`).

## Critical Implementation Details

**`generateItems()` signature change**: The function closes over `GENERATION_SYSTEM_PROMPT` at line 66. Change the signature to `generateItems(client, inquiry_text, messages, systemPrompt: string)` and replace the hardcoded constant reference with the parameter. Both call sites in the POST handler (lines 114 and 163) must pass the dynamically built prompt — the context is fetched once at the top of the handler and reused at both sites.

**Supabase client in `chat.ts`**: Fetch user context after the auth check and before the `generate` branch. If the Supabase query throws or returns no row, fall back to the base prompts — do not abort the request. This keeps the AI flow resilient to DB hiccups.

**Upsert pattern for `user_settings`**: Use `.upsert({ user_id, prompt_context }, { onConflict: 'user_id' })` — handles both first-save (INSERT) and subsequent saves (UPDATE) without branching logic in the API. `GET /api/settings` uses `.maybeSingle()` and returns `{ prompt_context: '' }` when no row exists.

---

## Phase 1: Database + Settings API

### Overview

Create the `user_settings` Supabase table with per-user RLS and expose two API endpoints: `GET /api/settings` (fetch current context) and `POST /api/settings` (validate + upsert context).

### Changes Required

#### 1. Supabase migration

**File**: `supabase/migrations/20260613000000_create_user_settings.sql`

**Intent**: Create a `user_settings` table with one row per authenticated user, enabling read/write of `prompt_context` with proper per-user RLS isolation.

**Contract**: Table columns: `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `prompt_context TEXT NOT NULL DEFAULT ''`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. RLS enabled (`ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY`). SELECT policy: `(select auth.uid()) = user_id`. UPDATE policy (WITH CHECK): `(select auth.uid()) = user_id`. A `set_updated_at` trigger function with `SET search_path = ''` updates `updated_at` on each row change.

#### 2. Settings API endpoint

**File**: `src/pages/api/settings.ts`

**Intent**: Serve GET (return current `prompt_context` or empty string) and POST (validate + upsert `prompt_context`) for the authenticated user. Follows the existing auth-check + Zod-validation pattern used in other API routes.

**Contract**:
- `export const prerender = false`
- `GET`: auth check → Supabase `.from('user_settings').select('prompt_context').eq('user_id', uid).maybeSingle()` → return `{ prompt_context: row?.prompt_context ?? '' }`
- `POST`: auth check → parse body → Zod: `z.object({ prompt_context: z.string().max(500) })` → `.upsert({ user_id: uid, prompt_context }, { onConflict: 'user_id' })` → return `{ prompt_context }` or status 400 on validation failure

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db reset`
- Linting passes: `npm run lint`
- `GET /api/settings` returns `{ prompt_context: '' }` for a user with no row
- `POST /api/settings` with `{ prompt_context: "test" }` returns `{ prompt_context: "test" }` and upserts the row
- `POST /api/settings` with a 501-char string returns 400

#### Manual Verification

- RLS isolation: authenticated as User A, save a context value; authenticated as User B (different account), confirm `GET /api/settings` returns their own empty context

**Implementation Note**: After all automated verification passes, confirm RLS isolation manually before proceeding to Phase 2.

---

## Phase 2: Settings UI

### Overview

Add a `/settings` Astro page that SSR-fetches the user's context and renders a React form component with a textarea, character counter, and save feedback. Link it from the Topbar and protect the route.

### Changes Required

#### 1. Middleware — protect /settings route

**File**: `src/middleware.ts`

**Intent**: Prevent unauthenticated access to the settings page; the existing `startsWith` guard handles this automatically once the route is added to the array.

**Contract**: Add `"/settings"` to the `PROTECTED_ROUTES` array at line 5: `const PROTECTED_ROUTES = ["/new", "/quotes", "/settings"];`

#### 2. Settings Astro page

**File**: `src/pages/settings.astro`

**Intent**: Server-render the settings page — fetch the current `prompt_context` from Supabase via SSR client and pass it to the React form component.

**Contract**: SSR page (`output: "server"` is already the default). Reads user from `Astro.locals.user`. Creates Supabase client from request/cookies via `createClient(Astro.request.headers, Astro.cookies)`. Queries `user_settings` for `prompt_context` (`.maybeSingle()`). Renders `<UserContextForm client:load context={promptContext ?? ''} />` inside the standard Layout wrapper with a `max-w-3xl` container — same structure as `src/pages/quotes/index.astro`.

#### 3. UserContextForm React component

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: Textarea with a 500-char counter, Save button, and success/error feedback that POSTs to `/api/settings` on save.

**Contract**: Props: `{ context: string }`. Internal state: `value: string` (initialized from prop), `status: 'idle' | 'saving' | 'saved' | 'error'`. Character counter displayed below textarea as `value.length / 500`; counter turns red when `value.length > 500`. Save button disabled when `status === 'saving'` or `value === context` (unchanged). On save: POST to `/api/settings` with `{ prompt_context: value }`; on success set status to `'saved'` then back to `'idle'` after 2 s; on failure set `'error'`. Textarea style matches `src/components/quotes/InquiryForm.tsx:42–52`. Placeholder: `"Np. Specjalizuję się w aplikacjach webowych (Laravel, Vue). Pracuję z małymi firmami na rynku polskim. Moja stawka to 120–180 PLN/h. Zawsze wyceniam czas na dokumentację i komunikację."`. Section heading above the textarea: "Kontekst użytkownika" with a subline: "Te informacje są dołączane do każdego promptu AI i pomagają dopasować wyceny do Twojej specjalizacji."

#### 4. Topbar — add settings link

**File**: `src/components/Topbar.astro`

**Intent**: Surface the settings page from the persistent navigation bar so authenticated users can discover it.

**Contract**: Add an "Ustawienia" anchor link pointing to `/settings`, placed next to the existing "Wyceny" link. Conditionally rendered only when user is authenticated (same condition as the "Wyceny" link). Uses the same Tailwind style as the "Wyceny" link.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- `/settings` redirects to `/auth/signin` when unauthenticated (browser test: open in incognito)

#### Manual Verification

- Authenticated user sees "Ustawienia" in Topbar and can navigate to `/settings`
- Textarea shows current saved context (empty on first visit)
- Character counter updates as user types; turns red above 500
- Save button is disabled when value is unchanged from what was loaded
- Saving valid text shows "Zapisano" (or equivalent) success feedback, persists after page reload
- Saving 501+ chars triggers error feedback (API returns 400)

**Implementation Note**: After manual verification passes, proceed to Phase 3.

---

## Phase 3: AI Prompt Injection

### Overview

Modify `chat.ts` to fetch the authenticated user's `prompt_context` from Supabase at the start of each POST request, then build system prompts dynamically — appending a `## Kontekst użytkownika` section only when the context is non-empty.

### Changes Required

#### 1. Refactor generateItems() to accept a systemPrompt parameter

**File**: `src/pages/api/ai/chat.ts`

**Intent**: Decouple `generateItems()` from the hardcoded `GENERATION_SYSTEM_PROMPT` constant so the POST handler can inject a dynamically built prompt (with or without user context appended) at both call sites.

**Contract**: Change the function signature to `generateItems(client, inquiry_text, messages, systemPrompt: string)`. Replace `system: GENERATION_SYSTEM_PROMPT` at line 66 with `system: systemPrompt`. Update both call sites (lines 114 and 163) to pass the pre-built prompt.

#### 2. Fetch user context and build dynamic prompts in POST handler

**File**: `src/pages/api/ai/chat.ts`

**Intent**: Retrieve the user's saved `prompt_context` once per request (after auth check, before branching) and conditionally append it to both system prompts. Gracefully fall back to base prompts if the DB query fails.

**Contract**: Add `import { createClient } from "@/lib/supabase"` at the top of the file. After the `client = createAnthropicClient()` check (around line 83), add the following logic:

```ts
const supabase = createClient(context.request.headers, context.cookies);
let userContext = '';
if (supabase) {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('prompt_context')
      .eq('user_id', context.locals.user.id)
      .maybeSingle();
    userContext = data?.prompt_context ?? '';
  } catch {
    // fallback to empty — AI continues without user context
  }
}

const contextSection = userContext ? `\n\n## Kontekst użytkownika\n${userContext}` : '';
const questionSystemPrompt = QUESTION_SYSTEM_PROMPT + contextSection;
const generationSystemPrompt = GENERATION_SYSTEM_PROMPT + contextSection;
```

Replace `system: QUESTION_SYSTEM_PROMPT` at line 141 with `system: questionSystemPrompt`. Pass `generationSystemPrompt` to both `generateItems()` call sites.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- With no context saved: creating a quote works exactly as before — no regression in questions or line items
- With context "Specjalizuję się w Laravel, stawka 150 PLN/h": AI clarifying questions reference Laravel-relevant concerns (hosting, framework version, timeline for this type of project)
- With context "Specjalizuję się w Laravel, stawka 150 PLN/h": generated line items use rates aligned with the stated range and include Laravel-appropriate task names
- Supabase query failure simulated (e.g., wrong table name in test): quote creation flow still completes — graceful degradation, no 500

**Implementation Note**: After all manual verification passes, the feature is complete.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in as a new user → navigate to `/settings` via Topbar → confirm empty textarea and placeholder text visible
2. Type 501 chars → Save → confirm error message appears
3. Type a 2–3 sentence context about specialization + rates → Save → reload page → confirm context persisted
4. Navigate to `/new` → create a quote in the same domain as the context → observe that AI questions and generated items reflect the context
5. Sign in as a second user → navigate to `/settings` → confirm they see their own empty context, not the first user's

## Performance Considerations

One additional Supabase query per AI call (primary key lookup on `user_settings.user_id` — O(1), indexed). Negligible vs. the Anthropic API round-trip (~1–3 s). No caching needed at this scale.

## Migration Notes

No existing data to migrate. Users who never visit `/settings` get the default behavior (empty context = unchanged prompts). No backfill required.

## References

- Roadmap entry S-04: `context/foundation/roadmap.md` (lines 127–139)
- Lessons learned (auth.uid wrapping + search_path): `context/foundation/lessons.md`
- Textarea style pattern: `src/components/quotes/InquiryForm.tsx:42–52`
- SSR fetch pattern: `src/pages/quotes/index.astro`
- Supabase client pattern: `src/middleware.ts:8`
- AI endpoint to modify: `src/pages/api/ai/chat.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database + Settings API

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 61e1a38
- [x] 1.2 Linting passes: `npm run lint` — 61e1a38
- [x] 1.3 GET /api/settings returns `{ prompt_context: '' }` for user with no row — 61e1a38
- [x] 1.4 POST /api/settings with valid text upserts and returns the value — 61e1a38
- [x] 1.5 POST /api/settings with 501-char string returns 400 — 61e1a38

#### Manual

- [x] 1.6 RLS isolation: User A's context not visible to User B — 61e1a38

### Phase 2: Settings UI

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 /settings redirects to /auth/signin when unauthenticated

#### Manual

- [x] 2.3 Authenticated user sees "Ustawienia" in Topbar and reaches /settings
- [x] 2.4 Textarea shows current context (empty on first visit)
- [x] 2.5 Character counter updates; turns red above 500
- [x] 2.6 Save button disabled when value is unchanged
- [x] 2.7 Valid save shows success feedback and persists on reload
- [x] 2.8 501+ chars save shows error feedback

### Phase 3: AI Prompt Injection

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Build succeeds: `npm run build`

#### Manual

- [ ] 3.3 No context: quote creation works as before (no regression)
- [ ] 3.4 With context: AI clarifying questions reference specialization domain
- [ ] 3.5 With context: generated line items reflect stated rates/domain
- [ ] 3.6 Supabase failure during AI call: flow continues without error
