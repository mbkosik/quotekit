---
project: QuoteKit
created: 2026-06-01
prd_version: 1
roadmap_version: 1
test_base_profile: none
status: active
---

# QuoteKit — Quality Contract

## §1 Strategy

Three principles every rollout phase must obey:

1. **Cost × signal.** Every test added — classic or AI-native — must answer: *what is the cheapest test that gives a real signal for this risk?* Do not promote to e2e because it "feels safer"; do not layer a model on a deterministic diff that already catches the regression.

2. **User concerns are evidence.** Risks the user has lived through — or explicitly fears — carry the same weight as PRD lines or hot-spot data.

3. **Risks are scenarios, not code locations.** §2 cites evidence that raised the risk (PRD lines, interview answers, hot-spot directories). It never asserts a file as "where the failure lives." That anchor is `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec, not a code audit.

---

## §2 Risk Map

### Top Risks

| # | Risk (failure scenario — user/business terms) | Impact | Likelihood | Source — evidence, not anchors |
|---|---|---|---|---|
| 1 | Core CRUD regression: user cannot list, view, or save their quotes | High | Medium | Interview Q1 (primary stated fear: "wyceny nie działają, user traci dostęp do swojej pracy"); PRD US-01 acceptance criteria; hot-spot dir `src/pages/api` — 7 commits/30d |
| 2 | IDOR (read): authenticated user reads another user's quote by guessing/knowing its ID | High | Medium | PRD §NFR data isolation: "signed-in freelancer must never be able to view, edit, or reach quote data belonging to another account — a data-visibility failure here is a critical regression regardless of any other feature state"; roadmap F-01 risk note; hot-spot dir `src/pages/api` — 7 commits/30d |
| 3 | AI creation flow state machine fails: hook enters invalid state mid-conversation (stuck loading, wrong phase transition, lost line items) | High | Medium | Interview Q3 (explicit: "przepływ tworzenia wyceny — komunikacja z AI, proces wyceniania (pytania, aktualny stan, zatwierdzenie) — najniższa pewność"); hot-spot dirs `src/components/hooks` — 3 commits/30d, `src/pages/api` — 7 commits/30d |
| 4 | Broken change reaches production: CI gate not running on main branch — defect discovered post-push | High | High | Interview Q2: "działało lokalnie, wysypało się na produkcji — błąd znaleziony już po spushowaniu"; health-check (CI targets `master`, default branch is `main` — CI is effectively disabled; no test step; no type-check step) |
| 5 | AI endpoint without rate limiting: one authenticated user generates unlimited Anthropic API spend | High | Medium | Roadmap S-01 pre-launch gate (explicit: "per-user rate limiting na `/api/ai/scope` jest wymaganym prerequisite przed udostępnieniem prawdziwym użytkownikom — brak limitu pozwala jednemu użytkownikowi generować nieograniczone koszty API"); hot-spot dir `src/pages/api` — 7 commits/30d |
| 6 | RLS write-path gap: UPDATE or DELETE policy does not enforce resource ownership — another user's quote is modified or deleted | High | Low | PRD §NFR data isolation (same guardrail as Risk 2 — applies to all operations); lessons.md RLS auth.uid() wrap pattern (evidence of prior RLS policy bugs in this codebase); roadmap F-01 risk note: "błąd w polityce to regresja krytyczna" |
| 7 | API key leakage: Anthropic SDK error propagated to client response exposes the API key or internal stack trace | High | Low | tech-stack.md (has_ai: true — Anthropic SDK in production runtime); hot-spot dir `src/pages/api` — 7 commits/30d (AI endpoint actively modified) |
| 8 | `/api/ai/questions` without rate limiting — authenticated user generates unlimited Anthropic API spend | High | Medium | refresh 2026-06-14: questions.ts shipped (S-03) after Phase 3; `checkRateLimit` never wired into any AI endpoint including scope/chat |
| 9 | `/api/ai/questions` error sanitization gap — Anthropic SDK exception may expose API key or stack trace | High | Low | refresh 2026-06-14: questions.ts catch block not covered by existing error-sanitization tests (only scope/chat covered) |
| 10 | `GET /api/quotes` with `?status=` and `?search=` filters silently returns rows outside authenticated user's ownership | High | Medium | refresh 2026-06-14: filter params shipped (S-08) without cross-user isolation test; filter logic could theoretically override user_id scope |
| 11 | IDOR on `user_settings` — User B reads or modifies User A's settings via `/api/settings` | High | Low | refresh 2026-06-14: user_settings table (S-04) shipped without RLS isolation test; missing UPDATE WITH CHECK policy suspected |

### Risk Response Guidance

| Risk # | What would prove protection | Must challenge | Context needed (for `/10x-research`) | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| 1 | `GET /api/quotes` returns the correct list for the authenticated user; `POST /api/quotes` saves and returns the new quote; `DELETE /api/quotes/[id]` removes the correct quote | "The endpoint returned 200" does NOT imply the data is correct — verify payload shape and DB state | How each CRUD endpoint resolves the authenticated user; what Zod schemas validate input/output; what Supabase error responses look like when save fails | Integration test against real Supabase (local) | Testing only the status code; mocking Supabase and bypassing RLS |
| 2 | `GET /api/quotes/[id]` authenticated as User B for a quote owned by User A returns 403 or 404, never the quote payload | "User is authenticated" does NOT mean "user owns this resource" — the auth check and the ownership check are separate concerns | How the `[id]` endpoint resolves ownership — does it rely solely on RLS, or does it also filter by user in the query? Whether RLS SELECT policy covers direct-by-id access | Integration test with two real test users, two owned quotes, cross-access assertion — against real local Supabase | Mocking Supabase; testing SELECT RLS only; asserting authentication without asserting ownership |
| 3 | Hook transitions correctly through: idle → inquiry-entered → clarifying → line-items-ready → saving → saved; a simulated API timeout leaves the hook in an error state with line items preserved (not reset) | "The happy path works" does NOT mean error/edge transitions are correct — test failure paths and state boundaries explicitly | The state machine in the hook: what states exist, how API errors are handled, whether line items survive a failed save | Unit tests on the hook state machine (mocked API calls for error scenarios) + one integration smoke test for the golden path | Testing only the golden path; asserting `console.error` instead of user-visible hook state |
| 4 | Every push to `main` triggers CI; CI runs lint + test + type-check; a deliberate type error or failing test blocks the merge | "CI is configured" does NOT mean "CI is running on the right branch" — verify the trigger branch matches the actual default branch | Current `.github/workflows/ci.yml` trigger configuration; which steps exist; what the test and type-check commands are once tests are installed | CI configuration fix + smoke: push a deliberate error and confirm CI catches it | Fixing CI config without verifying it actually runs; adding a test step before tests exist |
| 5 | Making N+1 sequential POST requests to `/api/ai/scope` (or `/api/ai/chat`) from the same authenticated user within the rate window results in HTTP 429 — and the response body is a clean error, not an Anthropic SDK exception | "Rate limiting is configured" does NOT mean both AI endpoints are covered — scope and chat may be separate surfaces | Whether rate limiting will be implemented at app middleware level or Cloudflare WAF level; which endpoints are in scope; whether `/api/ai/chat` is a separate attack surface | Integration test (if app-level middleware) — send N+1 requests, assert 429; assert error body is clean | Testing rate limiting by mocking the rate-limiter itself; testing only `/api/ai/scope` and missing `/api/ai/chat` |
| 6 | `DELETE /api/quotes/[id]` authenticated as User B for User A's quote ID returns 404/403 and leaves User A's record intact in the DB; `PATCH /api/quotes/[id]` with User B's token does not modify User A's record | "RLS SELECT policy is correct" does NOT imply RLS DELETE/UPDATE `WITH CHECK` is also correct — each operation has its own policy | Which Supabase RLS policies exist for INSERT/UPDATE/DELETE operations and whether they use the `WITH CHECK` clause with `(select auth.uid())` as per lessons.md pattern | Integration test: two test users, two quotes, cross-user write operations, assert no mutation and correct HTTP status | Checking only the SELECT policy and declaring the table secured; testing only with the record owner |
| 7 | A request to `/api/ai/scope` that triggers an Anthropic SDK error returns a client response whose body contains no API key substring, no environment variable name/value, and no internal stack trace | "Error handling exists" does NOT mean it scrubs sensitive data — a bare `catch (e) { return Response.json({ error: e.message }) }` leaks SDK error messages that may contain key prefixes | How the AI endpoints catch and translate Anthropic SDK errors; whether `console.log`/`console.error` in Cloudflare Workers logs the full error object | Unit test: mock Anthropic client throwing an error with a fake key string in the message; assert response body does not contain the string | Testing only that the response status is 500; asserting response structure without checking body content for credential patterns |
| 8 | N+1 sequential POSTs to `/api/ai/questions` from same authenticated user within rate window return 429 with clean body | "Rate limiting is configured" does NOT mean questions.ts is covered — scope/chat may be separately gated | Whether `checkRateLimit` is called from the handler; whether the 429 response body leaks SDK error | Integration test (real Supabase) for function-level rate limit + code review for wiring | Testing rate limiting by mocking the rate-limiter itself; asserting only status code |
| 9 | A request to `/api/ai/questions` that triggers an Anthropic SDK error returns a client response whose body contains no API key substring | "Error handling exists" does NOT mean it scrubs sensitive data | How the questions.ts catch block translates SDK errors; whether `catch (e)` vs bare `catch {}` matters | Unit test: mock Anthropic client throwing error with fake key string; assert response body does not contain the string | Testing only that response status is 502 without checking body content |
| 10 | `GET /api/quotes?status=draft&search=test` authenticated as User B returns only User B's rows even when User A has matching rows | "Filters return correct results for the owner" does NOT prove cross-user isolation | How query composition in `quotes/index.ts` GET applies `user_id` scope when filters are active | Integration test (two users, overlapping data, filtered cross-access assertions) — direct Supabase client | Testing only that filters work for the record owner; asserting only non-empty results |
| 11 | `GET /api/settings` as User B for User A's settings returns null; `POST /api/settings` with User B's token does not modify User A's record | "RLS SELECT policy is correct" does NOT imply UPDATE WITH CHECK is also correct | Which RLS policies exist on `user_settings`; whether UPDATE has both USING and WITH CHECK | Integration test (two users, cross-access assertions) — direct Supabase client | Checking only the SELECT policy; testing only with the record owner |

### Negative Space (§7)

The following are **deliberately not tested** in this rollout:

- **UI / component snapshot tests** — User explicitly excluded: "UI." Solo MVP, small user base, low blast radius for visual regressions. No Storybook, no Playwright screenshot comparisons, no React Testing Library for component markup.
- **Marketing pages / static content** — No user-facing value in testing unchanging static content.
- **Generated TypeScript types / Supabase client types** — The generator is the test; checking its output is redundant.
- **Internal admin tooling** — No admin panel exists in this product.
- **AI output quality / hallucination rate** — PRD NFR targets ≥80% line items needing only minor corrections. This is a human-evaluated product metric, not an automated test gate. Covered by real-user feedback, not a test suite.
- **Offline behavior** — PRD §Non-Goals: no offline-first guarantee.

---

## §3 Phased Rollout

| # | Phase name | Goal | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Access control coverage | Prove per-user data isolation holds at DB and API layers before any real users arrive | #2 (IDOR read), #6 (RLS write-path) | Integration — real local Supabase | done | Risk #2: src/__tests__/access-control/idor-read.test.ts; Risk #6: src/__tests__/access-control/idor-write.test.ts |
| 2 | Core flow reliability | Prove quote CRUD and AI creation state machine are regression-safe | #1 (core CRUD), #3 (AI flow state machine) | Unit (hook), integration (API) | done | Risk #1: src/__tests__/core-crud/crud.test.ts; Risk #3: src/components/hooks/useQuoteCreator.test.ts |
| 3 | AI endpoint safety | Implement and test rate limiting; prove error responses don't leak credentials | #5 (rate limiting), #7 (key leakage) | Integration (rate limit), unit (error response) | done | Risk #5: src/lib/rate-limit.ts + src/__tests__/rate-limiting/rate-limit.test.ts; Risk #7: context/changes/error-response-sanitization |
| 4 | Quality gates wiring | Wire lint + test + type-check into CI on the correct branch; lock all prior tests into the gate | #4 (CI gate), all | CI configuration + smoke | done | ci.yml commit 6beab3c on main; smoke PR #2 confirmed gate blocks |
| R1 | AI questions safety | Backfill rate limiting wiring to all 3 AI endpoints; prove `/api/ai/questions` error responses don't leak credentials | #8 (rate limit), #9 (sanitization) | Integration (rate limit — function level), unit (error sanitization mock) | done | test-plan-refresh-2026-06-14 |
| R2 | Query param data isolation | Prove `GET /api/quotes` filters always stay within authenticated user's own rows | #10 (filter isolation) | Integration — real local Supabase | done | test-plan-refresh-2026-06-14 |
| R3 | Settings RLS | Prove `user_settings` RLS blocks cross-user read and write via `/api/settings` | #11 (settings IDOR) | Integration — real local Supabase | done | test-plan-refresh-2026-06-14 |

---

## §4 Stack

| Layer | Technology | Test runner / tool | Notes |
|---|---|---|---|
| Language | TypeScript 5.x (strict) | — | `tsconfig.json` extends `astro/tsconfigs/strict`; type errors caught by `npx astro check` in CI (Phase 4) |
| Framework | Astro 6 SSR + React 19 islands | Vitest 4.x | Installed (testing-ai-state-machine, 2026-06-03). Config: `vitest.config.ts`. No `@vitejs/plugin-react` — incompatible with Vite 7 (tests use no JSX; esbuild handles TypeScript) |
| Database / Auth | Supabase (PostgreSQL + RLS + `@supabase/ssr`) | Real local Supabase via `npx supabase start` | Access control tests MUST run against real Supabase — mocking bypasses the RLS layer that provides the isolation guarantee |
| Runtime | Cloudflare Workers (workerd) | `wrangler dev` for local dev | workerd ≠ Node.js; SDK compatibility must be verified under `wrangler dev`, not `npm run dev` (per roadmap F-02 risk note) |
| AI | `@anthropic-ai/sdk` (Anthropic) | Mocked for unit tests; real endpoint for rate-limit integration tests | No Claude tool use in current prompts — prompt injection risk is limited to output manipulation |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | — | Targets `main`; runs lint → `npm test` → `npx astro check` → build (Phase 4) |
| Pre-commit | Husky + lint-staged | ESLint + Prettier + Vitest | Runs lint-staged, `tsc --noEmit`, and `vitest run --related` on staged files |

**Test-base profile: `sparse`** — Vitest configured; 1 test file (`src/components/hooks/useQuoteCreator.test.ts`), 4 tests. Coverage clusters in hooks only; API layer and access control have no tests yet. Bootstrapped via testing-ai-state-machine (2026-06-03).

**Stack grounding tools (current session):**
- Docs: Context7 MCP — available; can be used in research phases to fetch Vitest, Supabase, Cloudflare Workers, and Astro testing documentation; checked: 2026-06-01
- Search: Exa.ai MCP (`web_search_exa`) — available; can be used to find current testing patterns, Cloudflare Workers test setups, and Supabase RLS testing approaches; checked: 2026-06-01
- Runtime/browser: Playwright MCP (`browser_*`) — available; not used in this rollout (UI excluded per negative space §7); could be used for critical-path smoke in future phases
- Provider/platform: IDE MCP (`getDiagnostics`, `executeCode`) — available; useful for verifying type correctness during implementation phases

---

## §5 Quality Gates

| Gate | Type | Current state | Required by | Wired in CI |
|---|---|---|---|---|
| Lint | Required | Running (ESLint + lint-staged pre-commit + CI) | Always | Yes |
| Type-check | Required | `npx astro check` in CI; `tsc --noEmit` in pre-commit | Always | Yes |
| Unit + integration tests | Required | Vitest; `npm test` in CI; `vitest run --related` in pre-commit | Always | Yes |
| E2e on critical flows | Not planned | — | Not applicable (UI excluded; access-control covered by integration) | — |
| Post-edit hook (pre-commit test run) | Recommended local | Configured — `vitest run --related $STAGED --passWithNoTests` | Active | N/A (pre-commit) |
| Multimodal visual review | Not applicable | — | UI excluded per §7 | — |

---

## §6 Cookbook (fills in as phases ship)

### 6.1 Access control test (per-user data isolation)

TBD — see §3 Phase 1. Will document: Vitest setup, local Supabase test client pattern, two-user fixture setup, cross-access assertion pattern for both read and write operations.

### 6.2 Quote CRUD integration test

TBD — see §3 Phase 2. Will document: API endpoint test pattern for Astro SSR routes, Zod payload validation approach, save-failure simulation.

### 6.3 React hook state machine unit test

Implemented in `context/changes/testing-ai-state-machine` (2026-06-03). Reference: `src/components/hooks/useQuoteCreator.test.ts`.

**Deps installed** (all in `devDependencies`):

```
npm install -D vitest jsdom @testing-library/react
```

Do NOT install `@vitejs/plugin-react` — it requires Vite `^8` but this project pins Vite 7. Tests that use no JSX work without it; Vitest's built-in esbuild handles TypeScript.

**Config** — `vitest.config.ts` at project root:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: { environment: "jsdom" },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
```

**Mock strategy — `vi.stubGlobal("fetch", fetchMock)`**

Use when the hook under test reaches the network through the module-private `callChat` helper (which wraps `fetch` directly and is not exported). Stub the global `fetch` per-test; restore in `afterEach`:

```ts
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers(); // no-op for tests that never called useFakeTimers; safe always
});
```

Sequence calls with `mockReturnValueOnce` in the order the hook makes them (AI chat first, `/api/quotes` save last). Response factory:

```ts
function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
```

**State setup pattern — drive through real actions**

To reach a non-initial hook state, call the hook's own `actions` with sequenced fetch mocks. Do not attempt to inject state directly (internal state setters are not exported beyond `setItems`/`setError`):

```ts
// Reach "conversation" state
fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "Q?" }));
await act(() => result.current.actions.handleInquirySubmit("inquiry text…"));

// Reach "items" state from "conversation"
fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items: [...], title: "T" }));
await act(() => result.current.actions.handleAnswer("my answer"));
```

**Async pattern**

Wrap every action call in `await act(() => ...)`. Assert `phase !== "loading"` after every `act()` — this is the Behavior C contract: any `catch` block that forgets to reset `phase` will leave `"loading"` and the assertion catches it.

**Timer pattern — golden path / auto-reset**

`handleSave` on success schedules a 3 s `setTimeout` to reset the form. Use fake timers in the test and advance them inside `act()`:

```ts
vi.useFakeTimers();
// … run test …
await act(() => { vi.runAllTimers(); });
expect(result.current.state.phase).toBe("inquiry"); // reset fired
// vi.useRealTimers() lives in afterEach — do not call it inline
```

**Test file location**: colocate with the hook — `src/components/hooks/useQuoteCreator.test.ts`.

### 6.4 Rate limiting integration test

TBD — see §3 Phase 3. Will document: test strategy for Cloudflare Workers rate limiting (app-level vs WAF), N+1 request assertion pattern, endpoint coverage checklist (scope + chat).

### 6.5 Error response sanitization test

Implemented in `context/changes/error-response-sanitization` (2026-06-09). Reference: `src/__tests__/error-sanitization/error-sanitization.test.ts`.

**Deps installed** — none new. Vitest, jsdom, and @testing-library/react are already present from §6.3.

**Config** — `// @vitest-environment node` docblock at the top of the test file. Consistent with all other `src/__tests__/` files; no DOM needed. `Request` is available as a global in Node.js 22.

**Mock strategy — `vi.hoisted` + `vi.mock` factory**

`vi.mock` calls are hoisted by Vite's transform step, so a module-level `vi.fn()` declaration is not safely referenceable from the factory closure. Use `vi.hoisted` to create the mock functions before hoisting runs:

```ts
const { mockCreate, mockParse } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockParse: vi.fn(),
}));

vi.mock("@/lib/anthropic", () => ({
  createAnthropicClient: () => ({
    messages: { create: mockCreate, parse: mockParse },
  }),
}));
```

Mocking `@/lib/anthropic` (the factory) rather than `@anthropic-ai/sdk` directly prevents the `astro:env/server` virtual module from executing (it is only imported inside `anthropic.ts`, which the mock replaces).

**FAKE_KEY pattern**

```ts
const FAKE_KEY = "sk-ant-api03-test-fake-key";
```

Inject it into the thrown `Error` message to simulate a realistic Anthropic SDK auth error:

```ts
mockParse.mockRejectedValue(
  new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
);
```

**Context builder**

```ts
function makeContext(body: Record<string, unknown>): APIContext {
  return {
    locals: { user: { id: "test-user-1" } },
    request: new Request("http://localhost/api/ai/scope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as unknown as APIContext;
}
```

**Assertion recipe — three assertions per test**

```ts
const body = (await res.json()) as { error: unknown };
expect(res.status).toBe(502);                              // correct protocol status
expect(body.error).toBe("AI service error");               // safe generic message
expect(JSON.stringify(body)).not.toContain(FAKE_KEY);      // no credential in body
```

The third assertion is the core of Risk #7 — it catches the specific regression of a bare `catch {}` being refactored to `catch (e) { return Response.json({ error: e.message }) }`.

**Covered surfaces** (4 tests total):

| Test | Endpoint | Throw point |
|---|---|---|
| scope.ts POST | `/api/ai/scope` | `messages.parse` |
| chat.ts question mode | `/api/ai/chat` | `messages.create` (`generate: false`) |
| chat.ts generate mode | `/api/ai/chat` | `messages.parse` (`generate: true`) |
| chat.ts DONE path | `/api/ai/chat` | `messages.create` → resolves "DONE", then `messages.parse` throws |

**DONE-path setup** (the only non-trivial case): `mockCreate` must resolve with a valid Anthropic-like response before `mockParse` is configured to reject:

```ts
mockCreate.mockResolvedValue({
  content: [{ type: "text", text: "DONE" }],
});
mockParse.mockRejectedValue(new Error(`... ${FAKE_KEY} ...`));
```

**Test file location**: `src/__tests__/error-sanitization/error-sanitization.test.ts`

### 6.6 CI gate verification

Implemented in `.github/workflows/ci.yml` (commit 6beab3c on main). Smoke-tested via PR #2 (2026-06-09).

**Gate order:**
```
npm ci → npx astro sync → npm run lint → npm test → npx astro check → npm run build
```

`npx astro check` requires `SUPABASE_URL` / `SUPABASE_KEY` env vars — Astro type-checks server files that import `astro:env/server`; set these as repository secrets.

**How to verify CI runs on a PR:**
1. Create a branch with a deliberate failing test (`expect(true).toBe(false)`)
2. Push and open a PR targeting `main`
3. CI triggers on `pull_request: branches: [main]`; `npm test` step must show `fail`
4. Close PR without merging; delete branch

**Smoke result:** PR #2 — CI failed in 51s on `npm test` step as expected. Gate confirmed.

---

## §7 Negative Space

*(Moved inline to §2 for readability — see "Negative Space" block after the Risk Response Guidance table.)*
