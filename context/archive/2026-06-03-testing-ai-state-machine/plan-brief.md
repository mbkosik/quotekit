# Testing AI State Machine — Plan Brief

> Full plan: `context/changes/testing-ai-state-machine/plan.md`
> Research: `context/changes/testing-ai-state-machine/research.md`

## What & Why

Adds the first working test suite to QuoteKit — unit tests for the `useQuoteCreator` hook, which owns the entire AI quote creation state machine. The motivation is Risk #3 from the quality contract: the hook can enter invalid states mid-conversation (stuck in loading, wrong phase after an error, line items wiped on save failure) with no automated regression safety net. This change also bootstraps Vitest, which was never installed.

## Starting Point

No test runner exists — `package.json` has no Vitest, no testing-library, no jsdom. The hook (`src/components/hooks/useQuoteCreator.ts`) is the only home of the state machine; the API endpoint (`/api/ai/chat`) is stateless. `callChat` is module-private and wraps `fetch` directly, so `vi.stubGlobal("fetch", ...)` is the only viable mock path.

## Desired End State

`npm test` exits 0, running a suite that asserts three oracle behaviors: (A) a network error mid-conversation keeps the user in `"conversation"` with their messages intact, (B) a save failure keeps the hook in `"items"` with the user's edited items preserved, (C) `"loading"` is always transient. A golden-path smoke test verifies the full happy-path sequence end-to-end with mocked fetch calls.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Bootstrap scope | Include Vitest setup in this change | `testing-access-control` (the planned Phase 1 vehicle) never existed; no prerequisite to depend on | Plan |
| Mock strategy | `vi.stubGlobal("fetch", vi.fn())` | `callChat` is module-private and wraps fetch directly — no other hook point exists | Research |
| Golden path test | Mocked unit test, not real API | Zero infra dependency; catches phase-sequence regressions without Anthropic key or wrangler dev | Plan |
| Test scope | All three behaviors (A + B + C) | C (loading transient) is a free assertion on every `act()` — trivial cost, real signal | Plan |
| State setup | Full flow through real actions | `callChat` is private; state setters are internal except `setItems`/`setError`; driving through actions tests earlier transitions too | Research |
| Pre-commit wiring | Deferred to Phase 4 (CI wiring) | test-plan §5 explicitly marks pre-commit test run as "optional — consider after Phase 1" | Research |
| Test environment | jsdom | Standard React hook testing environment; happy-dom offers marginal speed gain that doesn't justify compatibility risk with React 19 | Plan |

## Scope

**In scope:**
- Vitest + jsdom + `@testing-library/react` bootstrap
- Unit tests for `useQuoteCreator` — error paths A (mid-conversation), B (save failure), C (loading transient)
- Golden path smoke test (mocked)
- `test-plan.md §6.3` cookbook entry

**Out of scope:**
- CRUD API tests (Risk #1 — separate phase)
- `handleSkip` error path (same guarantee as A; omitted for focus)
- Real Anthropic API or Supabase in tests
- Pre-commit test hook (Phase 4)
- Access control tests (separate future change)

## Architecture / Approach

All tests live in `src/components/hooks/useQuoteCreator.test.tsx`, colocated with the hook. The global `fetch` is stubbed per test with sequenced `mockReturnValueOnce` calls — one per API hop in the flow. State setup reaches target phases by driving the hook through its real `actions` (e.g., `handleInquirySubmit` → mocked question response → hook enters `"conversation"`). The 3s auto-reset timer in the golden path test is advanced with `vi.useFakeTimers()` + `vi.runAllTimers()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Bootstrap | `npm test` script, `vitest.config.ts`, deps installed | `@vitejs/plugin-react` version compatibility with Vite 7 override |
| 2. Hook Unit Tests | 4 test groups covering A, B, C, and golden path | Fetch mock sequence must match exact call order: AI chat calls first, save call last |
| 3. Cookbook §6.3 | `test-plan.md §6.3` filled with reusable patterns | Risk is omission — the entry must answer deps, mock strategy, state setup, and timer handling |

**Prerequisites:** Docker + `npx supabase start` not needed (no real DB). No Anthropic key needed. Node.js v22.14.0 (see `.nvmrc`).

**Estimated effort:** ~1 session across 3 phases. Phase 1 is mechanical (install + config). Phase 2 is the main work (test authoring with careful fetch mock sequencing). Phase 3 is documentation.

## Open Risks & Assumptions

- `@testing-library/react` v16 is required for React 19 — the latest version should satisfy this, but verify after install that `renderHook` is exported from the main package (not from a separate `@testing-library/react-hooks` package, which is legacy).
- The `vite: "^7.3.2"` override in `package.json` may conflict with `@vitejs/plugin-react` peer deps. If so, install `@vitejs/plugin-react@latest` explicitly and check for peer warnings.
- `handleAnswer` appending messages optimistically (before the fetch) is a current implementation detail, not a PRD requirement. If the hook is refactored to append messages only on success, the Behavior A test's `messages.length === 2` assertion will need updating.

## Success Criteria (Summary)

- `npm test` exits 0 with all 4 test groups green
- Deliberately breaking a `catch` block in `useQuoteCreator.ts` (e.g., `setPhase("inquiry")` instead of `setPhase("conversation")`) turns test A red
- `test-plan.md §6.3` is filled and answers the four cookbook questions: deps, mock strategy, state setup pattern, timer pattern
