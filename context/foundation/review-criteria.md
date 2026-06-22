---
title: PR Review Criteria
created: 2026-06-22
updated: 2026-06-22
---

# PR Review Criteria

Five criteria for the CI/CD code-review agent. Listed in priority order. All findings are advisory — the agent never blocks a merge.

The agent receives: staged diff + `plan.md` from the corresponding change folder (when available).

---

## [ARCH] Architectural pattern compliance

Check that the code respects established project patterns: SDK clients created via factory functions (never `new` directly), stateful logic extracted to hooks (`src/components/hooks/`), Astro components for static content / React only when interactivity is required, `cn()` for merging Tailwind classes, services and helpers placed in `src/lib/`. Report each deviation with the offending line and a suggestion that aligns with the pattern.

## [READABILITY] Readability and naming

Check that function, variable, component, and type names clearly communicate intent without requiring the reader to inspect the implementation. Report: misleading abbreviations, names that describe implementation rather than intent (e.g. `handleData` instead of `updateQuoteLineItems`), components that do too much described too generically. Do not comment on formatting — ESLint and Prettier handle that automatically.

## [SCOPE] Implementation scope vs. plan

You have access to the change's `plan.md`. Check that the diff implements exactly what the plan describes — no more, no less. Report: unjustified changes outside the described scope, violations of the "What We're NOT Doing" section, unsolicited refactors of files unrelated to the change. If `plan.md` is unavailable, skip this criterion.

## [COMPLEXITY] Complexity growth

Check that new abstractions, helpers, and intermediate layers are justified. Report: a new helper used only once, error handling for scenarios that cannot occur in this context, unnecessary generalisation of code that solves a specific case. Guiding principle: three similar lines are better than a premature abstraction.

## [SECURITY] Security at system boundaries

Check system entry points only — do not flag internal code. Report: new API routes missing session verification via `context.locals.user`, new Supabase tables without visible RLS policies in the migration, data from the request (`params`, `request.json()`) passed to DB queries without zod validation.
