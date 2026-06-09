# Error Response Sanitization — Implementation Plan

## Overview

Write unit tests that prove both AI endpoints (`/api/ai/scope`, `/api/ai/chat`) never expose Anthropic API keys or internal stack traces in their client-facing error responses. This is the test coverage for Risk #7 from the Quality Contract.

## Current State Analysis

Both endpoints already use bare `catch {}` blocks — the error object is never referenced, so no credential can leak:

- `src/pages/api/ai/scope.ts:80` — `catch {}` returns `{ error: "AI service error" }`, status 502
- `src/pages/api/ai/chat.ts:115` — generate path, same pattern
- `src/pages/api/ai/chat.ts:144` — question mode (`messages.create`), same pattern
- `src/pages/api/ai/chat.ts:165` — auto-generate-on-DONE path, same pattern

The behavior is already safe. The tests lock it in as a regression guard — preventing a future refactor from silently opening the leak (e.g. changing to `catch (e) { return Response.json({ error: e.message }) }`).

**Vitest infrastructure in place:**
- `vitest.config.ts` — node/jsdom environments, `@` alias, env var loading via loadEnv
- `src/__tests__/` — existing folder for unit/integration tests
- `vi.hoisted` / `vi.fn()` patterns documented in §6.3 of test-plan.md

## Desired End State

`src/__tests__/error-sanitization/error-sanitization.test.ts` contains 4 tests covering all 4 catch surfaces across both endpoints. Each test:
1. Injects a fake Anthropic API key string into the thrown error message
2. Calls the endpoint handler with a minimal APIContext stub
3. Asserts: `status === 502`, `body.error === "AI service error"`, body does not contain the fake key

§6.5 in `context/foundation/test-plan.md` is filled in (no longer "TBD") with the verified pattern.

### Key Discoveries

- `src/lib/anthropic.ts:4` — `createAnthropicClient()` is the mock injection point; mocking this module means `astro:env/server` (imported inside it) never executes, so no virtual-module issue
- `chat.ts:46-73` — `generateItems()` is a module-private helper that receives the client as a parameter; mocking `createAnthropicClient` covers all three catch paths without additional setup
- `chat.ts:160` — the DONE path needs `mockCreate` to resolve first (returning a response with `content[0].text === "DONE"`) before `mockParse` throws; this is the only non-trivial test setup
- Test environment: `// @vitest-environment node` — consistent with all other `src/__tests__/` files; `Request` is available as a global in Node.js 22

## What We're NOT Doing

- No production code changes — bare catch blocks are already safe
- No sanitizeError helper abstraction — user confirmed tests-only scope
- No middleware-level or integration-level test for these catch paths — unit test is the cheapest layer per test-plan §2
- No mutation testing for this change — there is no boolean predicate to mutate; the regression risk is a future refactor to `catch (e)`, which the test already guards
- No coverage of auth endpoints (`/api/auth/*`) — the Supabase error leakage there is a separate risk not in scope for this change

## Implementation Approach

Use `vi.hoisted` to create `mockCreate` and `mockParse` before the `vi.mock` factory runs (required because `vi.mock` is hoisted by Vite's transform step, so factory closures can't reference module-level `vi.fn()` declarations safely). Mock `@/lib/anthropic` so `createAnthropicClient` returns a fake client. Build a minimal `APIContext` stub with `locals.user` set and a `Request` carrying valid JSON. Reset both mocks in `beforeEach`.

---

## Phase 1: Error-sanitization test file

### Overview

Create `src/__tests__/error-sanitization/error-sanitization.test.ts` with 4 tests that each throw an Anthropic SDK error containing a fake key and assert the response body stays clean.

### Changes Required

#### 1. Test file

**File**: `src/__tests__/error-sanitization/error-sanitization.test.ts`

**Intent**: Cover all 4 catch surfaces — scope.ts POST, chat.ts question mode, chat.ts generate mode, chat.ts DONE path — with a fake API key in the thrown error and triple assertions on the response.

**Contract**: The file uses `vi.hoisted` to create `mockCreate` and `mockParse`, then `vi.mock("@/lib/anthropic")` with a factory that references them. A `makeContext(body)` helper builds the minimal `APIContext`. The fake key constant `FAKE_KEY = "sk-ant-api03-test-fake-key"` is used in each thrown `Error` message and in each "does not contain" assertion.

DONE-path setup (the only non-trivial case): `mockCreate` must resolve with a valid Anthropic-like response whose first content item has `type: "text"` and `text: "DONE"`, before `mockParse` is set to reject with the fake key error.

```typescript
// vi.hoisted creates the fns before vi.mock hoisting runs
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

### Success Criteria

#### Automated Verification

- All 4 new tests pass: `npm test`
- No lint errors: `npm run lint`

**Implementation Note**: No manual confirmation needed after this phase — this is a pure test addition with no user-visible behavior.

---

## Phase 2: §6.5 documentation

### Overview

Fill in the "TBD" placeholder in §6.5 of `context/foundation/test-plan.md` with the verified pattern, so future maintainers have a concrete cookbook entry.

### Changes Required

#### 1. §6.5 in test-plan.md

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the TBD block in §6.5 with the implemented pattern — test location, `vi.hoisted` mock factory, `FAKE_KEY` pattern, `makeContext` helper shape, and the three assertion types. Keep the format and tone consistent with §6.3.

**Contract**: The update covers the same sections §6.3 covers: deps installed (none new), config notes (node environment via docblock, no jsdom needed), mock strategy, and the assertion recipe. Reference the test file at `src/__tests__/error-sanitization/error-sanitization.test.ts`.

### Success Criteria

#### Manual Verification

- §6.5 in `context/foundation/test-plan.md` no longer contains "TBD"
- The documented pattern matches the test file that was written in Phase 1

---

## Testing Strategy

### Unit Tests

- 4 cases in `src/__tests__/error-sanitization/error-sanitization.test.ts`
- Mock boundary: `@/lib/anthropic` factory — not the SDK directly
- No DOM, no Supabase, no real network — pure handler invocation with a `Request` stub

### Manual Testing Steps

1. Run `npm test` — verify all tests pass (including the 4 pre-existing hook tests and any integration tests if local Supabase is running)
2. Confirm §6.5 in test-plan.md reads as documentation, not a placeholder

## References

- Risk 7 definition: `context/foundation/test-plan.md` §2, row #7
- Cookbook placeholder: `context/foundation/test-plan.md` §6.5
- Similar mock pattern (vi.stubGlobal): `src/components/hooks/useQuoteCreator.test.ts`
- Endpoint under test: `src/pages/api/ai/scope.ts`, `src/pages/api/ai/chat.ts`
- Mock injection point: `src/lib/anthropic.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Error-sanitization test file

#### Automated

- [x] 1.1 All 4 new tests pass: `npm test`
- [x] 1.2 No lint errors: `npm run lint`

### Phase 2: §6.5 documentation

#### Manual

- [ ] 2.1 §6.5 in test-plan.md no longer contains "TBD"
- [ ] 2.2 Documented pattern matches the test file written in Phase 1
