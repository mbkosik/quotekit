---
change_id: test-plan-refresh-2026-06-14
title: Test plan refresh — cover /api/ai/questions, query param data isolation, and settings RLS
status: impl_reviewed
created: 2026-06-14
updated: 2026-06-14
archived_at: null
---

## Notes

Open a refresh change folder for context/foundation/test-plan.md (refresh dated 2026-06-14).

Context: All 4 original rollout phases are complete. Three new features shipped since 2026-06-01 are entirely untested: /api/ai/questions (S-03), GET /api/quotes?status=&search= (S-08), and user_settings table + /api/settings (S-04). This refresh adds 3 new rollout phases to cover the gaps.

Refresh phases to add to §3 of test-plan.md:

Phase R1 — AI questions safety (Risks R1 + R2)
- Goal: Prove /api/ai/questions is rate-limited and does not leak credentials on error — same coverage as existing Phase 3 but for the new endpoint.
- Risk R1: /api/ai/questions without rate limiting — authenticated user generates unlimited Anthropic spend. Prove: N+1 sequential POSTs from same user within rate window return 429 with a clean body. Challenge: rate limiting middleware may only cover /api/ai/scope and /api/ai/chat, not the new endpoint. Cheapest layer: integration test. Anti-pattern: mocking the rate-limiter; assuming coverage extends.
- Risk R2: /api/ai/questions error sanitization gap — Anthropic SDK exception exposes API key or stack trace. Prove: response body on SDK error contains no API key substring, no env var, no stack trace. Challenge: questions.ts may have a bare catch without sanitization. Cheapest layer: unit test (mock Anthropic client). Anti-pattern: testing only status code.

Phase R2 — Query param data isolation (Risk R3)
- Goal: Prove GET /api/quotes with ?status= and ?search= filters always stays within the authenticated user's own rows — no cross-user data exposure under filter combinations.
- Risk R3: filter silently returns rows outside user's ownership. Prove: GET /api/quotes?status=draft&search=test as User B returns only User B's rows even when User A has matching rows. Challenge: RLS alone may not catch a logical AND error in query composition. Cheapest layer: integration test (two users, overlapping data, filtered cross-access assertions). Anti-pattern: testing only that filters return correct results for the owner.

Phase R3 — Settings RLS (Risk R4, optional)
- Goal: Prove user_settings RLS blocks cross-user read and write via /api/settings.
- Risk R4: IDOR on new table — User B reads/modifies User A's settings. Prove: GET /api/settings as User B for User A's settings returns 404/403; PUT does not modify User A's record. Challenge: may be missing UPDATE WITH CHECK policy. Cheapest layer: integration test (two-user cross-access). Anti-pattern: checking only SELECT policy.
