---
date: 2026-06-22T00:00:00+02:00
researcher: Mateusz Kosik
git_commit: 93e8949d340c24798c80cba8f148fe99811d04d1
branch: develop
repository: quotekit
topic: "Claude Agent SDK integration — standalone code-review script configuration"
tags: [research, anthropic-sdk, code-review, node-script, git-diff, pre-commit]
status: complete
last_updated: 2026-06-22
last_updated_by: Mateusz Kosik
---

# Research: Claude Agent SDK integration — standalone code-review script configuration

**Date**: 2026-06-22  
**Researcher**: Mateusz Kosik  
**Git Commit**: `93e8949d340c24798c80cba8f148fe99811d04d1`  
**Branch**: `develop`  
**Repository**: quotekit

## Research Question

Pobierz dokumentację jako kontekst i wykonaj research w temacie konfiguracji — jak zintegrować Claude Agent SDK w projekcie jako prosty, oskryptowany agent do code review.  
Runtime: standalone Node.js script. Input: `git diff --cached` (staged changes).

---

## Summary

**Excellent news — almost everything needed is already in place:**

1. `@anthropic-ai/sdk` v0.100.1 is already installed (`package.json:18`)
2. `ANTHROPIC_KEY` is already declared in `.env.example` and `astro.config.mjs`
3. An Anthropic client factory already exists at `src/lib/anthropic.ts` — but **it uses `astro:env/server`**, so it cannot be reused from a plain Node.js script. The script needs its own direct `process.env.ANTHROPIC_KEY` init.
4. `.husky/pre-commit` already captures staged files with `git diff --cached` — a natural integration point.
5. No `scripts/` directory exists yet — must be created.
6. `dotenv` is not in `package.json`; Node 22 `--env-file=.env` flag covers this natively.

A "simple scripted agent" here means: get diff → call `messages.create()` → print review. No agentic tool-use loop required.

---

## Detailed Findings

### 1. SDK & Dependency Status

| Item | Status | Location |
|------|--------|----------|
| `@anthropic-ai/sdk` | ✅ installed `^0.100.1` | `package.json:18` |
| `ANTHROPIC_KEY` env var | ✅ declared | `.env.example:3`, `astro.config.mjs:24` |
| `zod` | ✅ installed | `package.json` (used by existing AI endpoints) |
| `dotenv` | ❌ not installed | Not needed — use Node 22 `--env-file` flag |
| `scripts/` directory | ❌ does not exist | Must be created |

No new npm packages needed for a simple review script.

### 2. API Key Configuration Critical Detail

The project uses `ANTHROPIC_KEY` (not the SDK's default `ANTHROPIC_API_KEY`). The SDK defaults to reading `process.env.ANTHROPIC_API_KEY` — so the key **must be passed explicitly**:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_KEY,  // ← not ANTHROPIC_API_KEY
});
```

Source: `astro.config.mjs:24` — `ANTHROPIC_KEY: envField.string({ context: "server", access: "secret", optional: true })`

### 3. Existing Client Factory — NOT Reusable from Script

`src/lib/anthropic.ts` (GitHub: https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/src/lib/anthropic.ts) imports from `astro:env/server` — a build-time injection only available inside the Astro/Cloudflare runtime. Importing this from a plain Node.js script will throw.

The script must have its own minimal client bootstrap:

```typescript
// scripts/code-review-agent.mjs
import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_KEY not set — skipping review');
  process.exit(0);  // non-blocking: missing key doesn't fail commits
}
const client = new Anthropic({ apiKey });
```

### 4. Git Diff Access from a Node.js Script

The pre-commit hook at `.husky/pre-commit:5` already uses:

```bash
STAGED=$(git diff --cached --name-only --diff-filter=ACMR | tr '\n' ' ')
```

For the review script, the full diff content is needed:

```typescript
import { execSync } from 'node:child_process';

const diff = execSync('git diff --cached', { encoding: 'utf8' });
if (!diff.trim()) {
  console.log('No staged changes — skipping review');
  process.exit(0);
}
```

To scope to code files only (skip lockfiles, migrations, etc.):

```typescript
const diff = execSync(
  "git diff --cached -- '*.ts' '*.tsx' '*.astro' '*.css'",
  { encoding: 'utf8' }
);
```

### 5. Integration Points

**Option A: Pre-commit hook (`.husky/pre-commit`)**  
Append after line 8 (after the vitest step). This runs on every commit automatically.

```bash
# Add to .husky/pre-commit:
node --env-file=.env scripts/code-review-agent.mjs
```

**Option B: Standalone npm script**  
Add to `package.json` scripts section:

```json
"review": "node --env-file=.env scripts/code-review-agent.mjs"
```

Then run manually: `npm run review`

**Recommendation:** Start with Option B (manual) during development; add Option A (pre-commit) once the script is stable. The hook should always `exit 0` to avoid blocking commits.

### 6. Node.js Runtime Environment

- **Node version**: 22.14.0 (`.nvmrc`)
- **Module system**: ESM (`"type": "module"` in `package.json:3`) → use `.mjs` extension or `.js` with `import`/`export`
- **Env loading**: Node 22 supports `--env-file=.env` natively — no `dotenv` package needed
- **TypeScript**: Can use `.ts` with `tsx` runner if needed, but plain `.mjs` avoids build-step complexity for a script

### 7. SDK Patterns for a Code Review Script

**Minimal pattern (no tool use needed):**

```typescript
import Anthropic from '@anthropic-ai/sdk';

const message = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',  // cheap & fast; upgrade to sonnet-4-6 for richer review
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },  // cache the static system prompt
    },
  ],
  messages: [{ role: 'user', content: diff }],
});

const review = message.content[0].type === 'text' ? message.content[0].text : '';
console.log(review);
```

**Prompt caching** (stable API — no beta header needed):  
The system prompt is constant across all review calls, making it a good candidate for `cache_control: { type: 'ephemeral' }`. This reduces cost and latency on repeated calls.

Source: SDK docs — `cache_control` on system text blocks is in the stable `messages.create()` API.

**Streaming**: Available but not needed — a review script can wait for the full response.

**Tool use / agentic loop**: The `BetaToolRunner` is available for autonomous multi-step agents, but a simple "diff → review → print" pipeline does not need it. YAGNI.

### 8. Token / Diff Size Constraints

Large diffs can exceed context or hit cost limits. A guard:

```typescript
const MAX_DIFF_CHARS = 30_000;  // ~7-8k tokens, well within haiku's 200k context
const truncated = diff.length > MAX_DIFF_CHARS
  ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n[diff truncated — too large]'
  : diff;
```

### 9. Model Selection

| Model | Cost | Quality | Use case |
|-------|------|---------|----------|
| `claude-haiku-4-5-20251001` | ~$0.0025/req | Fast, functional | Default — matches existing endpoints |
| `claude-sonnet-4-6` | ~$0.015/req | Richer analysis | Higher-quality review if cost allows |

The existing AI endpoints all use Haiku — consistent to start with the same model.

---

## Code References

- [`package.json:18`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/package.json#L18) — `@anthropic-ai/sdk` installed
- [`package.json:3`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/package.json#L3) — `"type": "module"` (ESM)
- [`package.json:71-78`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/package.json#L71) — lint-staged config (no separate `.lintstagedrc`)
- [`.env.example:3`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/.env.example#L3) — `ANTHROPIC_KEY=###`
- [`astro.config.mjs:24`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/astro.config.mjs#L24) — env schema declares `ANTHROPIC_KEY` as optional server secret
- [`src/lib/anthropic.ts`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/src/lib/anthropic.ts) — existing factory (uses `astro:env/server` — not reusable from script)
- [`src/pages/api/ai/scope.ts`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/src/pages/api/ai/scope.ts) — reference implementation of messages.parse() + zodOutputFormat
- [`.husky/pre-commit`](https://github.com/mbkosik/quotekit/blob/93e8949d340c24798c80cba8f148fe99811d04d1/.husky/pre-commit) — hook that runs on every commit (integration target)

---

## Architecture Insights

### Minimal viable script shape

```
scripts/
  code-review-agent.mjs       ← new file (plain ESM, no build step)
```

Flow:
1. `process.env.ANTHROPIC_KEY` guard — exit 0 if missing (non-blocking)
2. `execSync('git diff --cached -- *.ts *.tsx *.astro')` — get diff
3. Early exit if empty diff
4. Truncate diff if > 30k chars
5. `client.messages.create()` with cached system prompt + diff as user message
6. Print review to stdout
7. `process.exit(0)` — never block commits

### What "Claude Agent SDK" means in this context

The phrase "Claude Agent SDK" in the change notes refers to the standard `@anthropic-ai/sdk` used in an agentic pattern — NOT a separate package. The `@anthropic-ai/sdk` package includes:
- `client.messages.create()` — simple prompt/response
- `client.beta.messages.toolRunner()` — autonomous tool-use loop (BetaToolRunner)
- `betaTool` / `betaZodTool` helpers — typed tool definitions

For a "simple scripted agent", `messages.create()` is sufficient. The BetaToolRunner is only needed if the agent needs to call tools (e.g., read files, run linters, post GitHub comments) autonomously.

### Pattern consistency with existing code

The existing AI endpoints use:
- `messages.parse()` + `zodOutputFormat()` for structured output
- Manual `messages.create()` for conversational output

The review script fits the conversational pattern: unstructured text output is fine for a review printed to the terminal.

---

## Historical Context (from prior changes)

- [`context/archive/2026-05-28-ai-integration-scaffold/research.md`](../../archive/2026-05-28-ai-integration-scaffold/research.md) — Deep research on SDK/Cloudflare compatibility, `astro:env/server` pattern, factory function design. Key finding: `nodejs_compat_v2` was already in `wrangler.jsonc` (SDK works in Workers without changes).
- [`context/archive/2026-05-28-ai-integration-scaffold/plan.md`](../../archive/2026-05-28-ai-integration-scaffold/plan.md) — Established `src/lib/anthropic.ts` factory and env schema pattern.
- [`context/archive/2026-05-29-ai-quote-creation-flow/plan.md`](../../archive/2026-05-29-ai-quote-creation-flow/plan.md) — Multi-turn conversation pattern (messages[] array), sentinel-based state transitions. Applicable if review agent evolves to interactive mode.
- [`context/archive/2026-06-09-error-response-sanitization/`](../../archive/2026-06-09-error-response-sanitization/) — Error handling for Anthropic SDK errors; verifies API keys don't leak in error responses.

---

## Related Research

No other `research.md` artifacts exist yet under active changes.

---

## Open Questions

1. **Script language**: `.mjs` (no build) vs `.ts` with `tsx` runner? `.mjs` is simpler — no dev dependency needed.
2. **Commit blocking**: Should critical findings exit 1 (block commit) or always exit 0 (advisory only)? Advisory mode (`exit 0`) is safer for developer experience.
3. **Output format**: Plain text printed to terminal, or saved to a file (e.g., `.review-output.md`)? Terminal output is simpler and fits the "scripted" intent.
4. **System prompt**: What should the review focus on — security, style, logic bugs, all three? This drives the system prompt design.
5. **Diff scope**: Review all staged files, or only TypeScript/Astro files (skip SQL migrations, JSON config changes)?
6. **dotenv alternative**: Node 22 `--env-file=.env` is used in the npm script; for the pre-commit hook, the `.env` file may not be loaded automatically — the hook should use `--env-file=.env` explicitly or fail gracefully if `ANTHROPIC_KEY` is missing.
