# Code Review Agent Implementation Plan

## Overview

A standalone Node.js ESM script (`scripts/code-review-agent.mjs`) that reads the staged git diff for TypeScript and Astro files, calls Claude with a security-and-conventions-focused system prompt, and prints an advisory review to stdout. Wired as `npm run review` — manual trigger only, never blocks commits.

## Current State Analysis

- `@anthropic-ai/sdk ^0.100.1` already installed (`package.json:18`)
- `ANTHROPIC_KEY` already declared in `.env.example:3` and `astro.config.mjs:24` (optional server secret)
- `src/lib/anthropic.ts` exports a factory function but uses `astro:env/server` — not importable from a plain Node.js process
- `.husky/pre-commit` runs lint-staged → tsc → vitest; no existing review step
- No `scripts/` directory exists yet
- `ANTHROPIC_KEY` value currently lives in `.dev.vars` (Cloudflare runtime); user must also add it to `.env` for the npm script to work

## Desired End State

Running `npm run review` after staging TypeScript/Astro changes prints Claude's advisory review to the terminal, grouped by file and labeled by category. The script exits 0 in all cases. If no TS/Astro files are staged, the script exits silently.

### Key Discoveries

- `src/lib/anthropic.ts:2` imports from `astro:env/server` — script must NOT import this file
- `package.json:3` — `"type": "module"` means `.mjs` or `import`/`export` syntax is required
- Node 22 supports `--env-file=.env` natively — no dotenv package needed
- Env var is named `ANTHROPIC_KEY`, not `ANTHROPIC_API_KEY` — must be passed explicitly to the constructor or the SDK silently initializes without a key

## What We're NOT Doing

- No pre-commit hook integration — manual trigger only
- No exit 1 / commit blocking
- No agentic tool-use loop (BetaToolRunner) — single-turn `messages.create()`
- No streaming — wait for full response
- No review of SQL migrations, JSON configs, or lockfiles — code files only
- No test coverage for the script itself
- No output saved to file — terminal only

## Implementation Approach

Two small changes: create the script file, add one npm script entry. Guards for missing key and empty diff ensure silent exit 0. Diff capture is scoped to `*.ts *.tsx *.astro`. System prompt is cached with `cache_control: { type: 'ephemeral' }` — same prompt on every call benefits from Anthropic's prompt cache.

## Critical Implementation Details

**Env variable name mismatch**: The SDK's default env var is `ANTHROPIC_API_KEY`; this project uses `ANTHROPIC_KEY`. The Anthropic constructor must receive `apiKey: process.env.ANTHROPIC_KEY` explicitly — if omitted the client silently initializes without a key and all calls fail with a 401.

**`.env` vs `.dev.vars`**: The `ANTHROPIC_KEY` value lives in `.dev.vars` for the Cloudflare Workers runtime. The npm script uses `--env-file=.env`. The user must copy the key value from `.dev.vars` to `.env` once before using `npm run review`.

---

## Phase 1: Create the review script

### Overview

Create `scripts/code-review-agent.mjs` — a self-contained ESM script that captures staged diff, calls Claude, and prints the review.

### Changes Required

#### 1. New script file

**File**: `scripts/code-review-agent.mjs`

**Intent**: Implement the full review pipeline — load env, guard on missing key and empty diff, capture filtered staged diff, truncate at 30k chars if needed, call Claude with a cached system prompt focused on security and code quality, print output, always exit 0.

**Contract**: Top-level `await` (Node 22 ESM supports this). Imports: `Anthropic` from `@anthropic-ai/sdk`, `execSync` from `node:child_process`.

Diff capture command:
```js
execSync("git diff --cached -- '*.ts' '*.tsx' '*.astro'", { encoding: 'utf8' })
```

The system prompt must:
1. Establish context: TypeScript/Astro SSR + React islands app deployed on Cloudflare Workers, Supabase backend
2. Specify two review categories:
   - **[SECURITY] / [BUG]**: missing auth guards, unchecked user input, exposed secrets, edge cases in business logic, incorrect async/await handling
   - **[QUALITY]**: deviations from project patterns (factory pattern for clients, hooks for state machine logic), unnecessary complexity, confusing naming
3. Output format: group findings by filename, label each finding with `[SECURITY]`, `[BUG]`, or `[QUALITY]`, include the relevant line/snippet. If there are no findings, say "No issues found." and stop. Do not comment on formatting — ESLint and Prettier handle that automatically.

`cache_control: { type: 'ephemeral' }` on the system text block (stable API, no beta header needed).

### Success Criteria

#### Automated Verification

- File exists: `ls scripts/code-review-agent.mjs`
- No syntax errors: `node --check scripts/code-review-agent.mjs`

#### Manual Verification

- Running with `ANTHROPIC_KEY` unset (or not in `.env`): script prints a "key not set — skipping review" notice and exits 0
- Running with no staged TS/Astro files: prints "No staged changes — skipping review" and exits 0
- Running with staged TS/Astro files and a valid key: Claude's review prints to terminal, process exits 0

**Implementation Note**: After completing Phase 1 and verifying automated checks pass, run the manual tests before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding checkboxes live in the `## Progress` section below.

---

## Phase 2: Wire npm script

### Overview

Expose the script as `npm run review` using Node 22's native `--env-file` flag to load `.env`.

### Changes Required

#### 1. Add script entry to package.json

**File**: `package.json`

**Intent**: Make the script runnable with `npm run review` from the project root, with `.env` automatically loaded.

**Contract**: Add `"review": "node --env-file=.env scripts/code-review-agent.mjs"` to the `"scripts"` object, positioned after `"format"`. No other changes to `package.json`.

### Success Criteria

#### Automated Verification

- `npm run review` resolves to the new script without a "missing script" error — run with no staged changes, it should print the skip message and exit 0

#### Manual Verification

- Stage one or more `.ts` files, run `npm run review`, verify review prints to terminal
- Commit is not blocked by the script (exit 0 in all cases confirmed)
- Running without `ANTHROPIC_KEY` in `.env` exits gracefully with a notice

---

## Testing Strategy

### Manual Testing Steps

1. Ensure `ANTHROPIC_KEY` is set in `.env` (copy value from `.dev.vars` if needed)
2. Make a small change to any `.ts` file and `git add` it
3. Run `npm run review` — verify review output appears in the terminal
4. Add a deliberate issue (e.g., `console.log(process.env)` or missing auth check pattern) and confirm Claude flags it under `[SECURITY]` or `[BUG]`
5. Unstage all TS/Astro files, run `npm run review` — confirm silent exit 0
6. Temporarily remove `ANTHROPIC_KEY` from `.env` — confirm graceful skip message

## References

- Research: `context/changes/code-review-agent/research.md`
- Existing factory (do NOT import from script): `src/lib/anthropic.ts:1-9`
- Reference endpoint using `messages.create()`: `src/pages/api/ai/chat.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Create the review script

#### Automated

- [x] 1.1 File exists: `ls scripts/code-review-agent.mjs` — 11dd107
- [x] 1.2 No syntax errors: `node --check scripts/code-review-agent.mjs` — 11dd107

#### Manual

- [x] 1.3 Running with `ANTHROPIC_KEY` unset: prints notice and exits 0 — 11dd107
- [x] 1.4 Running with no staged TS/Astro files: prints skip message and exits 0 — 11dd107
- [x] 1.5 Running with staged files and valid key: review appears in terminal, exits 0 — 11dd107

### Phase 2: Wire npm script

#### Automated

- [x] 2.1 `npm run review` resolves without error (no staged changes — exits 0 immediately) — 98895cc

#### Manual

- [x] 2.2 Stage a `.ts` file, `npm run review` prints review to terminal — 98895cc
- [x] 2.3 Commit not blocked after running review — 98895cc
- [x] 2.4 Running without `ANTHROPIC_KEY` in `.env` exits gracefully with notice — 98895cc
