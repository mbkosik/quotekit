# Code Review CI/CD — Plan Brief

> Full plan: `context/changes/code-review-ci-cd/plan.md`

## What & Why

Add an AI-powered code review agent that runs on every PR targeting `develop`. The agent evaluates the diff against the five criteria defined in `review-criteria.md` (ARCH, READABILITY, SCOPE, COMPLEXITY, SECURITY) and posts a structured, advisory review comment to the PR. Also expand `ci.yml` to run the build/test pipeline on PRs to `develop` — currently it only covers `main`.

## Starting Point

An existing `npm run review` local script (`scripts/code-review-agent.mjs`) already uses Claude to review staged diffs and print findings to the terminal, but it is not CI-integrated and uses a different set of review categories. The CI workflow (`ci.yml`) fires on push/PR to `main` only. `review-criteria.md` defines five project-specific review criteria that are not yet consumed by any automation.

## Desired End State

Opening a PR (or pushing a commit) to `develop` triggers two independent GitHub Actions workflows: the existing CI pipeline (lint/test/build), and a new Code Review job that posts a formal GitHub PR review — never blocking merge — with a per-criterion table (PASS / WARN / SKIP) and a bullet-list of findings. When the branch name maps to a change folder (e.g., `feat/quote-creator-refactor` → `context/changes/quote-creator-refactor/plan.md`), the agent also evaluates SCOPE compliance against the plan.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Workflow structure | Separate `code-review.yml` | Different trigger (`develop`) and permissions (`pull-requests: write`) than `ci.yml` | Plan |
| Trigger | PRs to `develop` only | feature→develop is where review is meaningful; develop→main release PRs are out of scope | Plan |
| Model | `claude-sonnet-4-6` | Five criteria require more nuanced pattern reasoning than the old SECURITY/BUG/QUALITY scan that Haiku handled | Plan |
| Output format | `tool_use` forced JSON | Reliable structured parsing; enables future automation (metrics, badges) without regex | Plan |
| Rating scale | PASS / WARN / SKIP | FAIL would be misleading for a purely advisory reviewer; SKIP handles inapplicable criteria cleanly | Plan |
| Plan mapping | Branch prefix strip → change-id | Zero-config; consistent with the existing branch naming convention in git log | Plan |
| Re-review | New review each push (history kept) | Full audit trail; simpler than upsert (no previous-comment lookup) | Plan |
| Diff scope | `*.ts`, `*.tsx`, `*.astro`, `*.sql` | SQL migrations are needed for the SECURITY criterion's RLS policy check | Plan |
| Diff command | `git diff <base>...<head>` | `gh pr diff` doesn't support file-path filtering; three-dot git diff shows only PR-own changes | Plan |
| Review posting | `gh pr review --comment --body-file` | First-class GitHub review event; `--body-file` avoids multi-line shell quoting issues | Plan |

## Scope

**In scope:**
- `.github/workflows/ci.yml` — add `develop` to PR trigger branches
- `scripts/pr-review-agent.mjs` — new CI-specific review script
- `.github/workflows/code-review.yml` — new workflow

**Out of scope:**
- Changes to `npm run review` (local script)
- Per-line inline diff comments
- Merge blocking
- Code review on `main`-targeting PRs
- Test coverage for the review script

## Architecture / Approach

```
PR opened/pushed → develop
  ├─ ci.yml:     checkout → lint → test → build
  └─ code-review.yml:
       checkout (fetch-depth: 0)
         → npm ci
         → pr-review-agent.mjs
              ├─ strip branch prefix → changeId
              ├─ read review-criteria.md (always)
              ├─ read context/changes/<id>/plan.md (optional)
              ├─ git diff <base>...<head> -- *.ts *.tsx *.astro *.sql
              ├─ messages.create (tool_use → submit_review JSON)
              ├─ render markdown (table + findings)
              └─ gh pr review <num> --comment --body-file <tmpfile>
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Expand CI trigger | `ci.yml` fires on PRs to `develop` | None — trivial one-line change |
| 2. Create PR review script | `scripts/pr-review-agent.mjs` with tool_use, branch parsing, diff, gh posting | `gh pr review` auth requires `GH_TOKEN` (not `GITHUB_TOKEN`) in the env |
| 3. Create code-review workflow | `.github/workflows/code-review.yml` wiring trigger + secrets + envs | `fetch-depth: 0` is required; forgetting it breaks `git diff` with SHAs |

**Prerequisites:** `ANTHROPIC_KEY` secret added to the GitHub repo settings  
**Estimated effort:** ~1 session, 3 files

## Open Risks & Assumptions

- `ANTHROPIC_KEY` must be added as a GitHub Actions secret before the workflow can run — the job exits 0 with a notice if missing, but produces no review.
- Diffs larger than 30 000 chars are truncated — the tail of large refactors may be missed.
- Branch naming convention (prefix/change-id) must be followed for SCOPE to activate; no enforcement exists.
