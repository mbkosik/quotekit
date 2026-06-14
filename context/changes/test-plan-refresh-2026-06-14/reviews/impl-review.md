<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Test Plan Refresh R1–R3

- **Plan**: context/changes/test-plan-refresh-2026-06-14/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION → APPROVED after triage fixes
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Fail-open rate-limit bypass has no call-site comment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: questions.ts:42, scope.ts:46, chat.ts:87
- **Detail**: All three `if (supabase)` guards silently skip rate-limiting when client is null (misconfigured env). src/lib/rate-limit.ts line 8 already has the canonical comment but nothing at call sites points back to this intent.
- **Fix**: Add one-line comment above each `if (supabase)` block: `// fail-open: no client means no rate-limit (mirrors rate-limit.ts)`
- **Decision**: SKIPPED

### F2 — error-sanitization.test.ts: rate-limit bypass relies on env-var side-effect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/__tests__/error-sanitization/error-sanitization.test.ts
- **Detail**: @/lib/anthropic is mocked explicitly but @/lib/supabase is not. Rate-limit block is skipped only because astro:env/server returns empty SUPABASE_KEY from the virtual-module mock. In CI where SUPABASE_KEY is exported to GITHUB_ENV, createClient() returns a real client and checkRateLimit fires (fail-open, so tests still pass — but for a different structural reason).
- **Fix**: Add `vi.mock("@/lib/supabase", () => ({ createClient: () => null }));` after existing vi.mock calls.
- **Decision**: FIXED — added explicit vi.mock to make the rate-limit bypass env-independent.

### F3 — Risk label mismatch in describe strings

- **Severity**: OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: query-filter-isolation.test.ts:15, settings-idor.test.ts:16
- **Detail**: Files used "Risk #3" and "Risk #4" (pre-refresh numbering). After spec-first update, test-plan.md §2 renumbered these as #10 and #11.
- **Fix**: Update describe labels and file-header comments to "Risk #10" and "Risk #11".
- **Decision**: FIXED — updated both files.

### F4 — scope.ts: parse failure returns misleading 422 (pre-existing)

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/scope.ts:100–107
- **Detail**: When zodOutputFormat parsing fails, scope.ts collapsed both "parse failed" and "AI returned empty items" into items=[] and returned 422 "inquiry_too_short". questions.ts and chat.ts return 502 for the parse-failure case.
- **Fix**: Check `parsed_output.success` separately; return 502 on parse failure, 422 only when AI intentionally returns empty items.
- **Decision**: FIXED — scope.ts now returns 502 on parse failure, 422 only on empty items.

### F5 — prompt_context appended without length cap (pre-existing)

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/chat.ts:113
- **Detail**: userContext appended to system prompt verbatim. Rate limiting is the only spend guard against runaway prompt_context values. POST /api/settings already enforces z.string().max(500) but values inserted via admin/migrations bypass this.
- **Fix**: `(data?.prompt_context ?? "").slice(0, 500)` in chat.ts; settings API already validates max(500).
- **Decision**: FIXED — added `.slice(0, 500)` in chat.ts for defensive consistency.
