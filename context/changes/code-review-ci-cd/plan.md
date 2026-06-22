# Code Review CI/CD — Implementation Plan

## Overview

Add an AI-powered code review agent that runs as a GitHub Actions job on every PR targeting `develop`. The agent evaluates the PR diff against the five criteria in `review-criteria.md`, posts a formal GitHub PR review (never blocks merge), and reads the change's `plan.md` when available to evaluate SCOPE compliance. Also expand the existing `ci.yml` to run lint/test/build on PRs to `develop` (currently only covers `main`).

## Current State Analysis

- `scripts/code-review-agent.mjs` — a manual local script (`npm run review`) that reads staged diff and outputs `[SECURITY]`, `[BUG]`, `[QUALITY]` findings to the terminal. Not used in CI.
- `.github/workflows/ci.yml` — fires on `push → main` and `PR → main` only. No review step.
- `context/foundation/review-criteria.md` — defines five criteria (ARCH, READABILITY, SCOPE, COMPLEXITY, SECURITY) with detailed instructions. Not yet consumed by any automation.
- `@anthropic-ai/sdk ^0.100.1` — already installed.
- `gh` CLI — available by default on `ubuntu-latest` GitHub Actions runners.

## Desired End State

Opening a PR (or pushing a new commit to one) targeting `develop` triggers two GitHub Actions workflows:

1. **CI** (`ci.yml`) — lint, test, build (now also on PRs to `develop`).
2. **Code Review** (`code-review.yml`) — AI review using the five criteria, result posted as a formal GitHub PR review comment (COMMENT event, never blocks) with a criterion-by-criterion table and a findings list.

When the PR branch name maps to a known change folder (e.g., `feat/code-review-ci-cd` → `context/changes/code-review-ci-cd/plan.md`), the agent also evaluates SCOPE; otherwise SCOPE is rated SKIP.

### Key Discoveries

- `review-criteria.md:9` — all findings are advisory; the agent never blocks a merge.
- `scripts/code-review-agent.mjs:25` — the existing script uses `git diff --cached` (staged changes, pre-commit). The CI script must use `git diff <base>...<head>` instead (PR diff).
- `.github/workflows/ci.yml:6` — current trigger covers `main` only for PRs; `develop` must be added.
- `package.json:8` — `"review"` script exists for local use; no new npm script needed for the CI path.

## What We're NOT Doing

- No changes to the existing `npm run review` local script.
- No inline per-line diff comments — review body is a single comment.
- No merge blocking (always posts as COMMENT, never REQUEST_CHANGES).
- No code review on PRs targeting `main` (those are `develop → main` release PRs).
- No test coverage for the review script itself.
- No streaming — single-turn `messages.create`.

## Implementation Approach

Three-file change: (1) add `develop` to `ci.yml`'s PR trigger, (2) new `scripts/pr-review-agent.mjs` that gets the PR diff via `git diff`, calls Claude with a `tool_use`-forced JSON schema, and posts the result via `gh pr review`, (3) new `.github/workflows/code-review.yml` that wires the workflow trigger, permissions, secrets, and env vars to the script.

## Critical Implementation Details

**git diff strategy**: `gh pr diff` does not support file-path filtering. Use `git diff <base_sha>...<head_sha> -- '*.ts' '*.tsx' '*.astro' '*.sql'` instead (three-dot notation — shows only the PR's own changes, not anything merged into `develop` since the branch was created). Requires `fetch-depth: 0` in the checkout step so both SHAs are available.

**gh CLI auth in Actions**: `gh` reads `GH_TOKEN` first, then `GITHUB_TOKEN`. The workflow must pass `GH_TOKEN: ${{ github.token }}` as an env var to the review step — `GITHUB_TOKEN` alone is not reliably picked up outside the Actions context.

**Multi-line review body**: Pass the review body via a temp file using `gh pr review <num> --comment --body-file <path>` to avoid shell quoting issues with multi-line strings. Write to `os.tmpdir()`.

**Prompt caching**: Cache the system prompt block (criteria + plan content) with `cache_control: { type: "ephemeral" }` so re-runs on the same PR (same system prompt) benefit from the cache.

---

## Phase 1: Expand CI Trigger

### Overview

Update `ci.yml` so the build/test/lint pipeline also runs on PRs targeting `develop`. Currently only `main` is covered.

### Changes Required

#### 1. Add `develop` to PR trigger branches

**File**: `.github/workflows/ci.yml`

**Intent**: Add `develop` to the `pull_request.branches` list so the CI pipeline runs on feature → develop PRs.

**Contract**: The `on.pull_request.branches` array changes from `[main]` to `[main, develop]`. No other changes to the file.

### Success Criteria

#### Automated Verification

- `ci.yml` YAML is syntactically valid: `npx js-yaml .github/workflows/ci.yml`
- `develop` appears in the `pull_request.branches` list

#### Manual Verification

- Open a test PR targeting `develop`; the `CI` workflow appears in the PR's Checks section and runs to completion

---

## Phase 2: Create PR Review Script

### Overview

New `scripts/pr-review-agent.mjs` — the CI-specific review script. Reads env vars injected by the workflow, fetches the PR diff via `git diff`, builds a system prompt from `review-criteria.md` and an optional `plan.md`, calls Claude with forced `tool_use` to get structured JSON output, renders a markdown review body, and posts it as a formal GitHub PR review.

### Changes Required

#### 1. New script file

**File**: `scripts/pr-review-agent.mjs`

**Intent**: Implement the end-to-end review pipeline: diff → Claude (tool_use) → structured JSON → markdown → GitHub PR review comment.

**Contract**: Reads these env vars (all provided by the workflow in Phase 3):
- `ANTHROPIC_KEY` — Claude API key
- `GH_TOKEN` — GitHub token for `gh` CLI
- `GITHUB_PR_NUMBER` — PR number as a string
- `GITHUB_HEAD_REF` — head branch name (e.g., `feat/code-review-ci-cd`)
- `GITHUB_BASE_SHA` — base commit SHA
- `GITHUB_HEAD_SHA` — head commit SHA

**Change-id extraction**: strip a leading conventional commit prefix (`feat/`, `fix/`, `chore/`, `refactor/`, `docs/`, `test/`, `style/`, `perf/`, `ci/`, `build/`) from `GITHUB_HEAD_REF` using a regex, use the remainder as `changeId`. If the result doesn't look like a valid change-id (no match or empty), set `changeId` to `null`.

**plan.md lookup**: if `changeId` is non-null, attempt `fs.readFileSync(`context/changes/${changeId}/plan.md`, "utf8")`. On any error (file not found etc.), treat as unavailable — SCOPE will be SKIP.

**Diff command**: `git diff ${baseSha}...${headSha} -- '*.ts' '*.tsx' '*.astro' '*.sql'` via `execSync`. If empty after trim, post a review body "No reviewable changes in this PR." and exit 0.

**Truncation**: same as existing script — cap at 30 000 chars with a `[diff truncated]` notice.

**tool_use schema** for `submit_review`:
```json
{
  "name": "submit_review",
  "description": "Submit the structured code review result",
  "input_schema": {
    "type": "object",
    "required": ["verdict", "criteria", "summary"],
    "properties": {
      "verdict": { "type": "string", "enum": ["PASS", "WARN"] },
      "summary": { "type": "string" },
      "criteria": {
        "type": "object",
        "required": ["ARCH", "READABILITY", "SCOPE", "COMPLEXITY", "SECURITY"],
        "properties": {
          "ARCH":        { "$ref": "#/$defs/criterion" },
          "READABILITY": { "$ref": "#/$defs/criterion" },
          "SCOPE":       { "$ref": "#/$defs/criterion" },
          "COMPLEXITY":  { "$ref": "#/$defs/criterion" },
          "SECURITY":    { "$ref": "#/$defs/criterion" }
        }
      }
    },
    "$defs": {
      "criterion": {
        "type": "object",
        "required": ["rating", "findings"],
        "properties": {
          "rating":   { "type": "string", "enum": ["PASS", "WARN", "SKIP"] },
          "findings": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```

**API call**: `client.messages.create` with `model: "claude-sonnet-4-6"`, `max_tokens: 2048`, `tool_choice: { type: "tool", name: "submit_review" }`, system prompt cached with `cache_control: { type: "ephemeral" }`.

**Response extraction**: find the `tool_use` block in `message.content`, read its `.input` as the structured review object.

**Markdown rendering** (`renderReview(review)`):
- Header: `## 🤖 Code Review — <verdict>`
- Summary line (from `review.summary`)
- Table: five rows, one per criterion, with emoji rating (`✅ PASS`, `⚠️ WARN`, `⏭️ SKIP`)
- Findings section (only criteria with `rating === "WARN"` and non-empty `findings[]`), formatted as `**[CRITERION]**` heading + bullet list
- Footer: `*Advisory only — never blocks merge.*`

**Posting**: write rendered body to `path.join(os.tmpdir(), "pr-review.md")`, then `execSync(\`gh pr review ${prNumber} --comment --body-file ${tmpPath}\`)`.

**Error handling**: wrap the Claude API call and the `gh pr review` call in try/catch — on any error, `console.error` and `process.exit(0)` (never fail the CI job).

### Success Criteria

#### Automated Verification

- Syntax check passes: `node --check scripts/pr-review-agent.mjs`
- Lint passes: `npm run lint`

#### Manual Verification

- Run locally with mocked env vars and a sample diff piped in; verify the script prints a correctly-structured markdown body and exits 0
- Run locally with `ANTHROPIC_KEY` unset; verify the script exits 0 with a notice and does not attempt any API call

---

## Phase 3: Create Code Review Workflow

### Overview

New `.github/workflows/code-review.yml` — fires on PRs targeting `develop`, provides the necessary secrets and env vars, and runs the script from Phase 2.

### Changes Required

#### 1. New workflow file

**File**: `.github/workflows/code-review.yml`

**Intent**: Define the GitHub Actions workflow that triggers the AI review on PRs to `develop` and injects the required environment.

**Contract**:
- Trigger: `on: pull_request: branches: [develop]`
- `pull_request` event types default (`opened`, `synchronize`, `reopened`) — each push triggers a new review (history preserved, no deletion of previous reviews).
- Top-level `permissions: pull-requests: write` (scoped to this workflow only).
- Single job `code-review` on `ubuntu-latest`.
- Steps:
  1. `actions/checkout@v4` with `fetch-depth: 0` (required for `git diff` with SHAs)
  2. `actions/setup-node@v4` with `node-version: 22`, `cache: npm`
  3. `npm ci`
  4. Run step with `node scripts/pr-review-agent.mjs`, env:
     - `ANTHROPIC_KEY: ${{ secrets.ANTHROPIC_KEY }}`
     - `GH_TOKEN: ${{ github.token }}`
     - `GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}`
     - `GITHUB_HEAD_REF: ${{ github.head_ref }}`
     - `GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}`
     - `GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha }}`

### Success Criteria

#### Automated Verification

- YAML is syntactically valid: `npx js-yaml .github/workflows/code-review.yml`
- Workflow file contains `pull-requests: write` permission

#### Manual Verification

- Open a real PR targeting `develop` and verify the `Code Review` workflow appears in the PR Checks section
- Verify a review comment appears on the PR with the expected table + findings layout
- Verify the `CI` workflow also appears (from Phase 1 change) and runs in parallel

---

## Testing Strategy

### Manual Testing Steps

1. Create a feature branch with a small TS change and open a PR to `develop`
2. Verify both `CI` and `Code Review` workflow jobs appear in the PR Checks section
3. Confirm the Code Review job posts a review comment with the criteria table
4. Verify the SCOPE criterion shows `⏭️ SKIP` when the branch name doesn't match a change folder
5. Create a branch named `feat/<existing-change-id>` with a change outside the plan's scope; verify SCOPE shows `⚠️ WARN` with a finding

## References

- Review criteria: `context/foundation/review-criteria.md`
- Prior local review script: `scripts/code-review-agent.mjs`
- Existing CI workflow: `.github/workflows/ci.yml`
- Anthropic tool_use docs: claude-api skill

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Expand CI Trigger

#### Automated

- [x] 1.1 `ci.yml` YAML is syntactically valid — e9af117
- [x] 1.2 `develop` appears in `pull_request.branches` — e9af117

#### Manual

- [x] 1.3 Test PR to `develop` triggers the CI workflow

### Phase 2: Create PR Review Script

#### Automated

- [x] 2.1 `node --check scripts/pr-review-agent.mjs` passes — e6155b1
- [x] 2.2 `npm run lint` passes — e6155b1

#### Manual

- [x] 2.3 Script runs locally with mocked env vars and exits 0 — e6155b1
- [x] 2.4 Script exits 0 with notice when `ANTHROPIC_KEY` is unset — e6155b1

### Phase 3: Create Code Review Workflow

#### Automated

- [x] 3.1 `code-review.yml` YAML is syntactically valid — bbeabb9
- [x] 3.2 Workflow contains `pull-requests: write` permission — bbeabb9

#### Manual

- [x] 3.3 Code Review workflow appears in PR Checks on a real PR to `develop` — bbeabb9
- [x] 3.4 Review comment appears with criteria table and correct layout — bbeabb9
- [x] 3.5 SCOPE shows SKIP when branch name has no matching change folder — bbeabb9
- [x] 3.6 CI workflow also runs in parallel (Phase 1 confirmed) — bbeabb9
