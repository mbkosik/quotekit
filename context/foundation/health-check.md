---
project: quotekit
checked_at: 2026-05-20T00:00:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 1
  moderate: 10
  low: 0
test_runner_detected: false
ci_provider: GitHub Actions
recommended_fixes: 5
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
Direct vs transitive: 3 direct (all MODERATE, all dev-only tools), 8 transitive
```

#### HIGH findings

- **devalue** 5.6.3–5.8.0 — GHSA-77vg-94rm-hx3p: DoS via sparse array deserialization (CVSS 7.5, CWE-770). Transitive — pulled in by Astro's SSR serialization. Fix: `npm audit fix` resolves this automatically.

#### MODERATE findings (10 total — all in dev/build toolchain, not production runtime)

- **wrangler** — via `miniflare` → `ws` uninitialized memory disclosure (CVSS 4.4). Direct devDependency. Fix available (major bump to 3.107.3, but project uses wrangler 4.x — monitor for an upstream patch).
- **@astrojs/cloudflare** — via `wrangler` / `@cloudflare/vite-plugin`. Direct dependency. Fix requires major downgrade — monitor upstream.
- **@astrojs/check** — via `@astrojs/language-server` → `volar-service-yaml` → `yaml` (stack overflow in deeply nested YAML, CVSS 4.3). Direct devDependency. Fix available (major downgrade to 0.9.2).
- **miniflare**, **ws**, **yaml**, **yaml-language-server**, **volar-service-yaml**, **@astrojs/language-server**, **@cloudflare/vite-plugin** — all transitive, all dev/build tools only.

All MODERATE findings are confined to the dev/build toolchain and do not affect the production Cloudflare Worker runtime.

### Outdated Dependencies

```
Packages with major version gaps: 2
```

- **typescript**: 5.9.3 → 6.0.3 (1 major version behind). TypeScript 6 includes breaking changes in type narrowing and decorator handling — review the migration guide before upgrading.
- **eslint**: 9.39.4 → 10.4.0 (1 major version behind). ESLint 10 drops some legacy config APIs — verify plugins are compatible before upgrading.

---

## Test Suite

```
Test runner: not detected
Tests found: not applicable
Test execution: not attempted
```

⚠ No test runner detected. The agent cannot verify its own changes.

No test script, no testing framework dependency, and no test configuration file (`vitest.config.*`, `jest.config.*`, `playwright.config.*`) were found in the project. This is the most impactful gap for agent-assisted workflows: when an agent edits code, it has no automated way to confirm the change is correct.

**Recommended**: Vitest is the natural fit for this Astro + Vite stack.

```bash
npm install -D vitest @vitest/ui
```

Then add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

For end-to-end coverage, Playwright integrates cleanly with Astro:
```bash
npm init playwright@latest
```

---

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                    |
|------------|--------|----------------------------------------------------------|
| Lint       | ✓      | `npm run lint` (ESLint with type-checked rules)          |
| Test       | ✗      | No test step — no test runner installed yet              |
| Build      | ✓      | `astro build` with Cloudflare adapter                    |
| Type check | ✗      | No `astro check` or `tsc --noEmit` step in pipeline      |
| Security   | ✗      | No `npm audit` or third-party scanner configured         |

**Branch mismatch**: the workflow triggers on `master` (`on: push: branches: [master]`), but the repository's default branch is `main`. CI will not run on pushes to `main` until this is corrected.

```yaml
# Fix in .github/workflows/ci.yml:
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

---

## Configuration

### High severity

- **CI branch mismatch** — the workflow targets `master` but the default branch is `main`. CI is effectively disabled on the main development branch. Fix: update `branches: [master]` → `branches: [main]` in `.github/workflows/ci.yml`. Effort: quick.

### Medium severity

- **No type-check step in CI** — `tsconfig.json` extends `astro/tsconfigs/strict` (strict mode enabled, which is excellent), but CI does not run `npx astro check` or `tsc --noEmit`. Type errors will pass CI undetected. Fix: add `- run: npx astro check` to the CI job, after `npx astro sync`. Effort: quick.

### Low severity

- **.editorconfig missing** — ensures consistent indentation, line endings, and charset across editors and contributors. Fix: create `.editorconfig` with standard settings. Effort: quick (< 5 min).

### Present and correct

- `.prettierrc.json` ✓ — Prettier configured with Astro and Tailwind plugins
- `eslint.config.js` ✓ — ESLint configured with type-checked rules, React, Astro, and a11y plugins
- `tsconfig.json` ✓ — extends `astro/tsconfigs/strict` (strict TypeScript enabled)
- `.gitignore` ✓
- `.env.example` ✓ — environment variable documentation present
- `CLAUDE.md` ✓ — AI agent instructions present
- Husky + lint-staged ✓ — pre-commit hooks run ESLint and Prettier automatically

---

## Stack Assessment Cross-Reference

```
No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis.
```

---

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Fix CI branch mismatch

**Impact**: CI is not running on any push to `main`. The agent's changes ship without automated lint or build verification.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```yaml
# .github/workflows/ci.yml — change both occurrences:
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

#### 2. Install a test runner

**Impact**: Without tests, the agent has no automated feedback loop. It will propose changes, make them, and report success — but cannot prove correctness. Every change requires manual verification.
**Severity**: high
**Effort**: moderate (15–30 min to install and write first tests)
**Fix**:

```bash
# Install Vitest (unit tests — pairs naturally with Vite/Astro):
npm install -D vitest @vitest/ui

# Add to package.json scripts:
# "test": "vitest run",
# "test:watch": "vitest"

# Optional: end-to-end tests with Playwright:
npm init playwright@latest
```

Start with unit tests for utility functions in `src/lib/` and integration tests for API routes. Even a small test suite gives the agent a working feedback loop.

#### 3. Fix the HIGH audit finding (devalue)

**Impact**: `devalue` (used for SSR serialization) has a DoS vulnerability via crafted sparse arrays. Low exploitability in a controlled SaaS context, but HIGH-rated — worth patching immediately.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm audit fix
```

Verify the build still passes after the fix:

```bash
npm run build
```

#### 4. Add type-check step to CI

**Impact**: TypeScript strict mode is configured, but CI does not enforce it. Type regressions introduced by the agent (or anyone else) will merge silently.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

Add a step to `.github/workflows/ci.yml` after `npx astro sync`:

```yaml
- run: npx astro check
```

This runs the Astro type checker (which is already installed as `@astrojs/check`).

#### 5. Add .editorconfig

**Impact**: Without `.editorconfig`, editors that ignore Prettier (terminal vim, some JetBrains defaults) may commit inconsistent indentation. Minor but accumulates as noise in diffs.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

Create `.editorconfig` at the project root:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

---

### Addressed in upcoming lessons (Category B)

#### Missing AGENTS.md

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: Build `AGENTS.md` with the right content for this project — routing conventions, tool restrictions, preferred patterns, and feedback loops — so every agent session starts with full context. A stub generated now would be premature and likely incomplete.

---

## Summary

```
Health status: needs-attention
```

The project has a strong configuration baseline: strict TypeScript, ESLint with type-checked rules, Prettier, pre-commit hooks, a lockfile, and environment variable documentation. The stack is well-chosen and the CLAUDE.md is present. The primary gaps are operational: there is no test runner (meaning the agent cannot verify its own changes), and CI is effectively disabled because the workflow targets `master` while the default branch is `main`. One HIGH audit advisory (`devalue`) is straightforwardly patchable with `npm audit fix`.

Next step: fix the CI branch mismatch (5 minutes), patch the HIGH advisory (`npm audit fix`), then invest in a test runner. With those three items addressed, the project will be in a healthy state for agent-assisted development.
