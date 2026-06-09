# Error Response Sanitization — Plan Brief

> Full plan: `context/changes/error-response-sanitization/plan.md`

## What & Why

Write unit tests that prove the two AI endpoints (`/api/ai/scope`, `/api/ai/chat`) never expose the Anthropic API key or internal stack traces in error responses sent to clients. This is the test coverage for Risk #7 from the Quality Contract — the cheapest layer that gives a real signal for this risk is a unit test that injects a fake credential into a thrown SDK error and asserts it never reaches the response body.

## Starting Point

Both endpoints already use bare `catch {}` blocks (no error variable referenced), so they return the generic `{ error: "AI service error" }` message today. The protection is implicit — a future refactor to `catch (e) { return Response.json({ error: e.message }) }` would silently re-open the leak. Vitest is already configured; the `src/__tests__/` folder has four existing integration test files to follow.

## Desired End State

`src/__tests__/error-sanitization/error-sanitization.test.ts` exists with 4 passing tests — one per catch surface — each asserting status 502, `body.error === "AI service error"`, and the absence of the fake key in the response body. §6.5 in `context/foundation/test-plan.md` is filled in with the verified pattern.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Production code change | Tests only, no sanitizeError helper | Bare catch blocks already prevent leakage; explicit abstraction adds diff surface without reducing risk | Plan |
| Endpoint coverage | Both scope.ts AND chat.ts | chat.ts is an equally real attack surface with three independent catch blocks | Plan |
| Chat path coverage | All three catch blocks | Each block is independent code; one representative path wouldn't catch a future per-block divergence | Plan |
| Assertions per test | Status 502 + body.error string + no key in body | Pins the negative (no leak), the positive (correct message), and the protocol (correct status) in one shot | Plan |
| Mock target | `@/lib/anthropic` factory | Bypasses the `astro:env/server` virtual module; simpler than mocking the SDK directly | Plan |
| Mock setup pattern | `vi.hoisted` + `vi.mock` factory | Required because `vi.mock` is hoisted — module-level `vi.fn()` declarations aren't safely referenceable from the factory without `vi.hoisted` | Plan |

## Scope

**In scope:**
- `src/__tests__/error-sanitization/error-sanitization.test.ts` — 4 unit tests
- §6.5 in `context/foundation/test-plan.md` — fill in the cookbook entry

**Out of scope:**
- Production code changes
- Auth endpoint error sanitization (`/api/auth/*` — different risk)
- Middleware-level tests
- Mutation testing

## Architecture / Approach

Import the `POST` handlers from both endpoint files directly into the test. Mock `@/lib/anthropic` so `createAnthropicClient` returns a fake client with `messages.create` and `messages.parse` as `vi.fn()`. Build a minimal `APIContext` stub (`locals.user` + a `Request` with valid JSON). Configure the relevant mock to `mockRejectedValue(new Error("...FAKE_KEY..."))` per test. The DONE-path test requires `mockCreate` to resolve with a DONE sentinel first, then `mockParse` to throw.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Test file | 4 passing tests locking in all catch surfaces | `vi.hoisted` pattern may need adjustment if Vitest version has edge cases |
| 2. §6.5 documentation | Cookbook entry for future maintainers and agents | Low — purely additive doc update |

**Prerequisites:** None — Vitest is already installed, no new deps needed.  
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- `@anthropic-ai/sdk/helpers/zod` (imported in scope.ts/chat.ts) must be importable in the node test environment — assumed safe since it's a pure utility function with no Node.js API side effects.
- The `Request` global is available in Node.js 22 (confirmed via `.nvmrc`).

## Success Criteria (Summary)

- `npm test` passes with all 4 new tests green alongside the 4 existing hook tests
- Running `npm run lint` produces no errors
- §6.5 in test-plan.md documents the implemented pattern (no longer "TBD")
