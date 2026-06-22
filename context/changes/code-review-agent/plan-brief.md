# Code Review Agent — Plan Brief

> Full plan: `context/changes/code-review-agent/plan.md`
> Research: `context/changes/code-review-agent/research.md`

## What & Why

Add `npm run review` — a manual, advisory Claude-powered code review that reads staged TypeScript/Astro changes and prints security and code quality findings to the terminal. The goal is a lightweight safety net that catches what ESLint and Prettier miss, without interrupting the commit flow.

## Starting Point

The project already has `@anthropic-ai/sdk ^0.100.1` installed and `ANTHROPIC_KEY` declared in `.env.example`. The existing `src/lib/anthropic.ts` factory is NOT reusable (imports from `astro:env/server`). No `scripts/` directory exists yet. The `ANTHROPIC_KEY` value lives in `.dev.vars` — the user needs to copy it to `.env` once.

## Desired End State

Running `npm run review` after staging code shows Claude's advisory review grouped by file, with each finding labeled `[SECURITY]`, `[BUG]`, or `[QUALITY]`. The script always exits 0 — it never blocks a commit.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Trigger | `npm run review` (manual only) | Advisory-only — user controls when to invoke | Plan |
| Commit blocking | Always exit 0 | Prevents API/network errors from breaking git flow | Plan |
| Review focus | Security/bugs + code quality | Covers gaps ESLint doesn't fill | Plan |
| Diff scope | `*.ts`, `*.tsx`, `*.astro` | Avoids noise from migrations, lockfiles, JSON | Research |
| Agentic loop | No — single-turn `messages.create()` | Diff→review is a one-shot pipeline, tool use is overkill | Research |
| Script format | `.mjs` (plain ESM) | No build step; project is already ESM; no tsx needed | Research |
| Env loading | `node --env-file=.env` | Node 22 native; no dotenv package needed | Research |
| API key init | Explicit `apiKey: process.env.ANTHROPIC_KEY` | SDK defaults to `ANTHROPIC_API_KEY`; project uses different name | Research |

## Scope

**In scope:** `scripts/code-review-agent.mjs` (new), `package.json` `"review"` script entry (edit)

**Out of scope:** pre-commit hook integration, commit blocking, test coverage for the script, file-based output, streaming, SQL/JSON/lockfile review

## Architecture / Approach

Single ESM script, no new dependencies. Guards at top (missing key → notice + exit 0; empty diff → notice + exit 0). Diff scoped to code files. System prompt cached with `cache_control: { type: 'ephemeral' }` for cost/latency. Output is plain text to stdout.

```
npm run review
  └─ node --env-file=.env scripts/code-review-agent.mjs
        ├─ guard: ANTHROPIC_KEY present? (else exit 0 + notice)
        ├─ git diff --cached -- '*.ts' '*.tsx' '*.astro'
        ├─ guard: diff non-empty? (else exit 0 + notice)
        ├─ truncate if > 30 000 chars
        ├─ messages.create() with cached system prompt
        └─ console.log(review) + exit 0
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Create script | Runnable `scripts/code-review-agent.mjs` | `ANTHROPIC_KEY` name mismatch causes silent 401 |
| 2. Wire npm script | `npm run review` works from project root | Key may only be in `.dev.vars`, not `.env` |

**Prerequisites:** `ANTHROPIC_KEY` value available to copy into `.env`  
**Estimated effort:** ~1 session, 2 files

## Open Risks & Assumptions

- User has the `ANTHROPIC_KEY` value to put in `.env` — the script exits gracefully if not, but the review won't run
- Diffs larger than 30k chars are truncated — the tail of a large refactor may be missed
