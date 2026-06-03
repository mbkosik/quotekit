# Testing AI State Machine — Implementation Plan

## Overview

Adds the first working test suite to QuoteKit. Scope: unit tests for `useQuoteCreator` — the client-side state machine driving the AI quote creation flow (Risk #3, test-plan §2). Also bootstraps Vitest, which was never installed (testing-access-control, the planned Phase 1 vehicle, does not exist).

## Current State Analysis

- **No test runner installed.** `package.json` has no `vitest`, `@testing-library/*`, or `jsdom`. `npm test` doesn't exist.
- **`useQuoteCreator.ts`** (`src/components/hooks/useQuoteCreator.ts`) holds the entire state machine. `callChat` is a **module-private function** that wraps `fetch` directly (line 13). It is not exported — the only viable mock strategy is `vi.stubGlobal('fetch', ...)`.
- **Messages are appended optimistically.** `handleAnswer` builds `newMessages` and calls `setMessages(newMessages)` before the fetch (lines 76–81). This means on a network error, the user's answer + the AI question are already in `state.messages`. The Behavior A assertion works on a fresh hook after a single `handleInquirySubmit` success — no prior successful exchange is required.
- **`handleSave` does not modify `state.items`.** It accepts `finalItems` as a parameter for the POST body, but `items` state is only updated via `setItems` (the exposed action). On save failure (lines 161–164), only `phase` and `error` change.
- **`handleSave` has a re-entry guard** (`if (phase === "saving") return`, line 139). Tests must call it from `"items"` phase.
- **3s reset timer** fires after successful save (line 150). Golden path tests must use `vi.useFakeTimers()` and `vi.runAllTimers()` to advance past it cleanly, otherwise the test ends with a dangling timer warning.
- **`testing-access-control`** was the planned Phase 1 bootstrap vehicle (test-plan §3). It does not exist as an active or archived change — bootstrap is owned by this plan.

## Desired End State

Running `npm test` executes the hook unit tests and exits 0. The three oracle behaviors from research.md are each asserted by at least one test:

- **A** — mid-conversation error: `phase === "conversation"`, `messages.length ≥ 2` (optimistic append preserved), `error` truthy
- **B** — save failure: `phase === "items"`, `state.items deepEqual editedItems`, `error` truthy
- **C** — loading is transient: `phase !== "loading"` after every `await act()`

A golden-path smoke test verifies the full happy-path sequence (inquiry → conversation → items → done) with all fetch calls mocked.

### Key Discoveries

- `callChat` (line 13): `async function callChat(inquiry, msgs, generate)` — module-private, wraps `fetch`. Mock target is `globalThis.fetch`.
- `handleAnswer` (line 74): optimistically calls `setMessages(newMessages)` before `await callChat(...)`. Error recovery sets `phase = "conversation"` without touching `messages`.
- `handleSave` (line 138): calls `fetch("/api/quotes", ...)` directly (not through `callChat`). Does not call `setItems`. On catch: `setPhase("items")`, `setError(...)`.
- `Phase` type (line 4): `"inquiry" | "loading" | "conversation" | "items" | "saving" | "done"` — exported from the hook module.
- `setItems` and `setError` are exposed in the return's `actions` object (line 180) and can be called in tests to set up state.

## What We're NOT Doing

- CRUD API tests (Risk #1) — separate phase (test-plan §3 Phase 2 is broader; this change covers only Risk #3)
- Integration tests against real Anthropic API or real Supabase
- `handleSkip` error path tests — same behavioral guarantee as A; can be added in the cookbook phase as an exercise
- Pre-commit test hook — deferred to Phase 4 (CI wiring) per test-plan §5
- `testing-access-control` / access control tests — separate future change

## Implementation Approach

Three phases: (1) bootstrap Vitest with jsdom + React Testing Library, (2) write hook unit tests using global fetch stubbing and full-action state setup, (3) fill in the test-plan §6.3 cookbook entry with the patterns used.

## Critical Implementation Details

**Mock strategy for `callChat`**: `callChat` internally calls `fetch`. Use `vi.stubGlobal('fetch', fetchMock)` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`. Sequence calls with `fetchMock.mockReturnValueOnce(...)` — the first call is always the AI chat endpoint, the last call (in save tests) is `/api/quotes`. `callChat` throws on non-2xx except 422 (line 19): `if (!res.ok && res.status !== 422) throw new Error(...)`.

**Optimistic message append**: `handleAnswer` calls `setMessages(newMessages)` on line 81, before `await callChat`. This means Behavior A tests start from a fresh `messages: []` state and after one `handleInquirySubmit` (which sets `currentQuestion` but NOT `messages`), the first `handleAnswer` call with a thrown fetch will already produce `messages.length === 2` (one assistant entry + one user entry).

**Fake timers for golden path**: `handleSave` success schedules `setTimeout(..., 3000)` (line 150). Use `vi.useFakeTimers()` before the test and `vi.runAllTimers()` after asserting `phase === "done"` to cleanly advance the timer and avoid React state-update warnings.

---

## Phase 1: Vitest Bootstrap

### Overview

Install the test runner and configure it for jsdom + React hooks + path alias. No test files yet — this phase only establishes the infrastructure. The `npm test` script is wired but requires `--passWithNoTests` until Phase 2 lands tests.

### Changes Required

#### 1. Install test dependencies

**File**: `package.json` (devDependencies, via npm install)

**Intent**: Add Vitest, jsdom (DOM environment for hooks), `@vitejs/plugin-react` (React transform in Vitest context — `@astrojs/react` only applies to the Astro build pipeline), and `@testing-library/react` v16+ (required for React 19 and provides `renderHook` in the main package).

**Contract**: Run `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react`. All four packages appear in `devDependencies` with resolved versions.

#### 2. Create `vitest.config.ts`

**File**: `vitest.config.ts` (project root, sibling of `astro.config.mjs`)

**Intent**: Configure Vitest to use jsdom as the test environment, wire the React plugin for JSX/TSX transforms, and replicate the `@/*` path alias from `tsconfig.json` so test files can import from `@/components/...`.

**Contract**: The config must extend `vitest/config` (not `vite/config`) and define `resolve.alias` pointing `@` to `./src`. Environment: `"jsdom"`. Do not enable `globals: true` — tests will import from `"vitest"` explicitly.

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

#### 3. Add `test` script to `package.json`

**File**: `package.json` (`scripts` section)

**Intent**: Expose `npm test` for CI and `npm run test:watch` for local development. The run script uses `--passWithNoTests` so Phase 1 can be verified independently of Phase 2.

**Contract**: Two new scripts — `"test": "vitest run --passWithNoTests"` and `"test:watch": "vitest"`. After Phase 2 ships tests, the `--passWithNoTests` flag is removed from the `test` script so CI fails correctly on empty suites.

### Success Criteria

#### Automated Verification

- `npm install` completes without errors; `node_modules/vitest` exists
- `npm test` exits 0 (no test files found, but `--passWithNoTests` suppresses the error)
- `npx astro check` still exits 0 — the new `vitest.config.ts` must not introduce type errors

#### Manual Verification

- `npm run test:watch` starts Vitest in watch mode and shows "No test files found" (not a crash)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Hook Unit Tests

### Overview

Create the test file for `useQuoteCreator`. Tests cover four groups: Behavior A (mid-conversation error recovery), Behavior B (save failure preserves items), Behavior C (loading is transient), and the golden path smoke. Mock strategy: `vi.stubGlobal("fetch", ...)` — the only viable approach since `callChat` is module-private.

### Changes Required

#### 1. Create test file

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: House all hook unit tests in a single file colocated with the hook. Use explicit imports from `"vitest"` and `"@testing-library/react"` (no globals).

**Contract**: Top-level imports are `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"` and `import { renderHook, act } from "@testing-library/react"` and `import { useQuoteCreator } from "@/components/hooks/useQuoteCreator"`.

#### 2. Mock infrastructure and helpers

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: Provide shared fetch mock setup and response factory helpers so test bodies focus on assertions, not plumbing.

**Contract**: Declare `const fetchMock = vi.fn()` at module scope. In `beforeEach`: `vi.stubGlobal("fetch", fetchMock)` + `fetchMock.mockReset()`. In `afterEach`: `vi.unstubAllGlobals()`. Provide a `jsonResponse(body, status = 200)` helper that returns `Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))`.

#### 3. Behavior A — mid-conversation error stays in `"conversation"`

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: Prove that a network error or API error during `handleAnswer` does not evict the user from the conversation or erase the optimistically-appended messages.

**Contract**: Two `it` blocks inside `describe("Behavior A: mid-conversation error stays in conversation")`:

1. **Network error** — setup: `fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "Q?" }))` then `await act(() => result.current.actions.handleInquirySubmit("some inquiry text long enough"))`. This produces `phase = "conversation"`, `currentQuestion = "Q?"`, `messages = []`. Then: `fetchMock.mockReturnValueOnce(Promise.reject(new Error("network")))` and `await act(() => result.current.actions.handleAnswer("my answer"))`. After act: `expect(state.phase).toBe("conversation")`, `expect(state.messages.length).toBe(2)` (assistant question + user answer appended before the throw), `expect(state.error).toBeTruthy()`.

2. **API error response** — same setup, but the second fetch mock returns `jsonResponse({ error: "AI error" }, 200)`. Same assertions.

#### 4. Behavior B — save failure preserves edited items

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: Prove that a failed `POST /api/quotes` call leaves the hook in `"items"` phase with the user's edited items intact — not reset to the AI's original proposal.

**Contract**: One `it` block inside `describe("Behavior B: save failure preserves edited items")`. Setup: two sequenced fetch mocks to reach `"items"` state (first: `{ type: "question" }` for `handleInquirySubmit`, second: `{ type: "complete", items: aiItems, title: "T" }` for `handleAnswer`). Then: `await act(() => result.current.actions.setItems(editedItems))`. Then: `fetchMock.mockReturnValueOnce(jsonResponse({}, 500))` and `await act(() => result.current.actions.handleSave(editedItems))`. Assertions: `expect(state.phase).toBe("items")`, `expect(state.items).toEqual(editedItems)`, `expect(state.error).toBeTruthy()`.

#### 5. Behavior C — `"loading"` is always transient

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: Assert that no `act()` call can leave the hook resting in `"loading"`. This catches any `catch` block that forgets to reset `phase`.

**Contract**: Rather than a standalone `describe` block, add `expect(result.current.state.phase).not.toBe("loading")` immediately after every `await act()` in Behaviors A, B, and the golden path test. Document this as the Behavior C contract in a comment at the top of the file: `// Behavior C: every await act() below asserts phase !== "loading" (implicitly via the specific phase assertion that follows)`.

#### 6. Golden path smoke

**File**: `src/components/hooks/useQuoteCreator.test.tsx`

**Intent**: Verify the full happy-path transition sequence produces the correct terminal state. Mocked at every fetch call — no real network.

**Contract**: One `it` block inside `describe("Golden path")`. Use `vi.useFakeTimers()` at the start and `vi.useRealTimers()` in the cleanup. Fetch mock sequence: (1) `{ type: "question", content: "Q?" }` for `handleInquirySubmit`, (2) `{ type: "complete", items: [{ task: "Dev", hours: 5, rate: 100 }], title: "T" }` for `handleAnswer`, (3) `jsonResponse({ id: "x" }, 200)` for `handleSave`. After `handleSave`, assert `phase === "done"` and `savedTitle === "T"`. Then `vi.runAllTimers()` and assert `phase === "inquiry"` (auto-reset fired).

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with all tests passing (remove `--passWithNoTests` from the test script after this phase)
- Test output shows 4 `describe` groups, all green, no skipped tests

#### Manual Verification

- `npm run test:watch` shows live test results; editing `useQuoteCreator.ts` triggers a re-run
- No console warnings about React state updates outside `act()`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Cookbook §6.3 Update

### Overview

Fill in `test-plan.md §6.3` with the patterns established in Phases 1 and 2. The cookbook is the persistent record that future changes (and other engineers) use to write tests for React hooks in this project.

### Changes Required

#### 1. Update `test-plan.md §6.3`

**File**: `context/foundation/test-plan.md` (section `### 6.3 React hook state machine unit test`)

**Intent**: Replace the "TBD" placeholder with a concrete cookbook entry covering Vitest setup, the fetch-stub mock strategy, the full-flow state setup pattern, and timer handling.

**Contract**: The updated section should document:
- **Deps installed**: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`
- **Config**: `vitest.config.ts` at project root — jsdom environment, `@/*` alias, react plugin
- **Mock strategy**: `vi.stubGlobal("fetch", fetchMock)` — use for any hook whose API calls go through `fetch`. `mockReturnValueOnce` to sequence calls in order. Restore with `vi.unstubAllGlobals()` in `afterEach`.
- **State setup pattern**: to reach a non-initial hook state, drive the hook through its real `actions` with sequenced fetch mocks. Do not try to inject state directly (state setters beyond `setItems`/`setError` are internal).
- **Async pattern**: `await act(async () => { ... })` for every action call that triggers state updates. Assert `phase !== "loading"` after every `act()`.
- **Timer pattern**: `vi.useFakeTimers()` + `vi.runAllTimers()` for any test that triggers the 3s auto-reset after successful save.
- **Test file location**: colocate with the hook — `src/components/hooks/useQuoteCreator.test.tsx`.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0 (Prettier formats the updated markdown; lint-staged runs Prettier on `*.md`)

#### Manual Verification

- Read `test-plan.md §6.3` — it answers: (a) which deps to install, (b) how to mock `fetch`, (c) how to reach non-initial hook state, (d) how to handle the auto-reset timer

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the cookbook entry is complete.

---

## Testing Strategy

### Unit Tests

- **A — mid-conversation error (network throw)**: `handleAnswer` after conversation reached; `phase === "conversation"`, `messages.length === 2`, `error` truthy
- **A — mid-conversation error (API error response)**: same shape but `{ error: "..." }` response instead of throw
- **B — save failure preserves edited items**: `handleSave` on items state with `setItems` called first; `phase === "items"`, `state.items deepEqual editedItems`, `error` truthy
- **Golden path**: full inquiry → conversation → items → done → inquiry (after timer) with mocked fetch at each step

### Manual Testing Steps

1. Run `npm test` — all 4 groups pass
2. Edit `useQuoteCreator.ts` — change `setPhase("conversation")` in a catch block to `setPhase("inquiry")` — confirm test A turns red
3. Revert the edit — confirm tests go green again

## References

- Research: `context/changes/testing-ai-state-machine/research.md`
- Test plan oracle: `context/foundation/test-plan.md` §2 Risk #3, §3 Phase 2, §6.3
- Hook implementation: `src/components/hooks/useQuoteCreator.ts`
- API endpoint (stateless): `src/pages/api/ai/chat.ts`
- Quote save endpoint: `src/pages/api/quotes/index.ts` (or similar — POST /api/quotes)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm install` completes; `node_modules/vitest` exists
- [x] 1.2 `npm test` exits 0 (`--passWithNoTests` flag)
- [x] 1.3 `npx astro check` exits 0 after adding `vitest.config.ts`

#### Manual

- [x] 1.4 `npm run test:watch` starts and shows "No test files found" without crashing

### Phase 2: Hook Unit Tests

#### Automated

- [ ] 2.1 `npm test` exits 0 (all test groups pass, `--passWithNoTests` removed)
- [ ] 2.2 Test output shows 4 `describe` groups, all green, no skipped

#### Manual

- [ ] 2.3 `npm run test:watch` shows live re-run on hook file changes
- [ ] 2.4 No console warnings about React state updates outside `act()`

### Phase 3: Cookbook §6.3 Update

#### Automated

- [ ] 3.1 `npm run lint` exits 0 after `test-plan.md` update

#### Manual

- [ ] 3.2 `test-plan.md §6.3` answers: deps, fetch mock strategy, state setup pattern, timer pattern
