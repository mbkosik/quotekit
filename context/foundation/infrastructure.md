---
project: QuoteKit
researched_at: 2026-05-22
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR, output: "server")
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare
  database: Supabase (external)
  ai: OpenRouter / @anthropic-ai/sdk (external)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already configured for this platform: `wrangler.jsonc` sets `"main": "@astrojs/cloudflare/entrypoints/server"` and the `@astrojs/cloudflare` adapter is the only adapter installed — no swap required. Of the six platforms evaluated, Cloudflare Workers is the only one where the existing codebase deploys without adapter changes. It also scored the highest on all five agent-friendly criteria, offers the most cost-effective path for an MVP (free tier covers 100k requests/day; paid tier is $5/month), and ships the strongest MCP + Claude Code integration of any candidate platform. The interview confirmed cost minimization is the top priority and that single-region is fine — both of which Cloudflare Workers satisfies.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | **5/5** |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Netlify | Pass | Pass | Pass | Partial | Pass | 4.5/5 |
| Railway | Partial | Pass | Partial | Pass | Partial | 3/5 |
| Render | Partial | Pass | Pass | Partial | Partial | 3/5 |
| Fly.io | Partial | Partial | Partial | Pass | Partial | 2.5/5 |

**Scoring notes:**

- **Cloudflare Workers CLI**: `wrangler` covers deploy, rollback (`wrangler rollback`), secrets (`wrangler secret put`), log streaming (`wrangler tail`), and deployment history — all scriptable with predictable exit codes. **Pass.**
- **Vercel CLI**: `vercel`, `vercel --prod`, `vercel rollback`, `vercel logs` — fully scriptable. **Pass.** Penalized on cost (Q2): $20/month required for commercial use (Hobby is personal-only). The project is a commercial SaaS. Familiarity bonus (Q3) applied but insufficient to offset cost penalty and one open Astro 6 esbuild bug (#16258).
- **Netlify CLI**: `netlify deploy` defaults to a draft preview, not production — `--prod` must be passed explicitly. This is an intentional safety default but a subtle footgun for agent-driven deploys. The free tier pauses the entire site on credit exhaustion. **Partial on stable deploy API.** GA MCP server (`@netlify/mcp`) is the cleanest MCP install of the group. Familiarity bonus (Q3) and free tier (Q2) make this a credible runner-up.
- **Railway**: No `railway rollback` CLI command — rollback requires the dashboard. MCP server is explicitly marked "work in progress" in docs (beta, 2026-05-22). No `llms.txt` index. **Partial on CLI-first, docs, and MCP.**
- **Render**: No CLI rollback (`render rollback` does not exist — requires dashboard or direct REST call). MCP server cannot trigger deploys. **Partial on CLI-first, stable deploy API, and MCP.**
- **Fly.io**: Container-based VMs — more operational surface (Dockerfile, autostop configuration). No free tier. No `fly rollback` command (redeploy previous image tag). No `llms.txt`. MCP server is experimental. **Partial on CLI-first, managed/serverless, docs, and MCP.**

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

The project is already configured for Workers. No adapter swap, no Docker setup, no extra configuration required beyond updating the project name in `wrangler.jsonc` and setting two secrets. Scores 5/5 on all agent-friendly criteria. The free tier covers this MVP's traffic ceiling (100k requests/day). The paid plan ($5/month) is the cheapest of all candidates when the free tier is outgrown by SSR CPU usage. The MCP integration with Claude Code is the most mature of any evaluated platform — Cloudflare documents it explicitly at `developers.cloudflare.com/agent-setup/claude-code/`. The main operational risks (workerd vs. Node.js compatibility, the `nodejs_compat_v2` flag gap, CPU billing for SSR) are surfaced in the risk register and are mitigatable before the first deploy.

#### 2. Netlify

Netlify scored 4.5/5 and is familiar to the developer (Q3). The `@astrojs/netlify` adapter is GA for Astro 6 (confirmed March 2026), the MCP server (`@netlify/mcp`) installs with a single command and is the most polished of the MCP offerings evaluated, and the free tier covers this MVP's request volume. The gap vs. Cloudflare is: an adapter swap is required (Cloudflare → Netlify, ~5 minutes of work), the free tier pauses the site on credit exhaustion (not suitable for production without monitoring or upgrading to Pro at $20/month), and the stable-deploy-API partial score means agents must always pass `--prod` explicitly. It is the correct fallback if any Cloudflare-specific runtime issue proves unsolvable.

#### 3. Vercel

Vercel scored 5/5 on the criteria and is familiar to the developer (Q3), but the $20/month Pro plan is mandatory for commercial SaaS use (Hobby is explicitly personal-only) — directly contradicting Q2's "minimize cost" preference. An open Astro 6 SSR esbuild parse error bug (#16258) has no official fix as of 2026-05-22, meaning SSR builds may fail on generated `_astro/` component script chunks. Both of these are disqualifying for a cost-sensitive MVP where the stack is already configured for a different platform.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU ceiling on the free tier will fail production SSR workloads.** React 19 server-side rendering is CPU-bound, not I/O-bound. A page with multiple islands can spend 40–80 ms CPU per invocation — 4–8× the free tier's hard limit. The paid plan ($5/month) with its 30 ms default per invocation and 30 M CPU-ms/month included is the realistic starting point for this SSR app.

2. **`workerd` ≠ Node.js — transitive dependency failures are invisible until production.** `npm run dev` runs on Node.js and masks workerd-specific incompatibilities. Any npm dependency using Node APIs not covered by the compatibility flags fails silently in the build and throws only at request time. Debugging requires `wrangler tail`, which is harder to parse than a Node.js stacktrace.

3. **`nodejs_compat` (the current flag) is less complete than `nodejs_compat_v2`.** The project's `wrangler.jsonc` sets `"compatibility_flags": ["nodejs_compat"]`, not `"nodejs_compat_v2"`. The `_v2` flag covers more Node built-ins (including broader `node:crypto` and `node:stream` support). This is a latent compatibility gap that compounds risk #2.

4. **The project name in `wrangler.jsonc` is `"10x-astro-starter"`, not `"quote-kit"`.** Deploying without changing this creates a Worker named `10x-astro-starter` in the Cloudflare account — a cosmetic issue now, an operational confusion issue later if other projects are deployed.

5. **`wrangler rollback` rolls back code only, not Supabase data.** If a deploy includes a Supabase migration that runs at startup, rolling back the Worker code leaves the database in the migrated state. This is standard for any external-database architecture, but the apparent simplicity of `wrangler rollback` can mislead a developer into thinking it's a full system rollback.

### Pre-Mortem — How This Could Fail

The team shipped in week 3. The deploy was smooth — `npm run build && npx wrangler deploy` worked on the first try, the Worker came up, auth worked, and the quote list rendered. Confidence was high.

Three weeks post-launch, the AI scoping flow — the product's core — started producing intermittent 500 errors. `wrangler tail` showed `Worker threw exception` with no line number. The errors were non-deterministic: some users hit them, others did not. The solo developer spent two evenings on it, each session ending with a working `npm run dev` locally and broken production.

The root cause, found on the third evening: an `@anthropic-ai/sdk` minor-version update had introduced a dependency on `node:AsyncLocalStorage` — available in Node 22 (`npm run dev`) but not in `workerd` with the `nodejs_compat` flag (as opposed to `nodejs_compat_v2`). The Worker threw on first invocation of the AI flow, succeeded for cached sessions, and the error message was swallowed by a try/catch in the SDK internals that returned `null` to the caller. The fix was one line in `wrangler.jsonc` (`nodejs_compat_v2`), but finding it required knowing to look there.

The compounding factor: there was no staging Worker. The paid plan's $5/month base was covering one production Worker. Testing changes required a local `wrangler dev` session, which — until the developer learned this lesson — had also been using Node.js via `npm run dev`. The gap between the dev environment and the production runtime was invisible until a dependency update made it visible in the worst possible context.

### Unknown Unknowns

1. **`npm run dev` and `wrangler dev` run different runtimes.** `npm run dev` uses Astro's Vite-based Node.js dev server. `wrangler dev` uses the actual `workerd` runtime locally. Only `wrangler dev` will surface Workers-specific failures (binding access, compatibility flag gaps, `cloudflare:workers` imports) before they hit production.

2. **`nodejs_compat` vs `nodejs_compat_v2` is a silent compatibility cliff.** The current `wrangler.jsonc` uses `nodejs_compat`. Upgrading to `nodejs_compat_v2` is a one-field change and provides broader Node.js API coverage. This should be done before the first production deploy, not after a runtime failure surfaces the gap.

3. **The project is Workers, not Pages** — and the two products have different feature sets. Workers (`wrangler deploy`) is what this project uses. Pages (`wrangler pages deploy`) would add automatic branch preview URLs but requires a different deploy pipeline and doesn't use the same `wrangler.jsonc` `main` field. Do not mix up the two deploy commands; they are not interchangeable.

4. **CPU billing is per-invocation CPU time, not wall-clock.** I/O waits (Supabase queries, OpenRouter/Anthropic API calls) are free. SSR rendering (React 19 component trees) is not. The CPU cost of an SSR page with islands needs to be measured with `wrangler dev --inspect` before the production CPU budget is sized.

5. **Hyperdrive can pool Supabase connections** — not needed at MVP traffic, but at higher load, Workers will exhaust Supabase's connection limit because each Worker invocation opens a fresh connection (no native connection pooling in the stateless model). Hyperdrive (Cloudflare's connection-pooling proxy for external Postgres) is the fix. It requires the paid plan and binding configuration in `wrangler.jsonc`. Plan for it before traffic warrants it.

## Operational Story

- **Preview deploys**: Workers does not generate automatic preview URLs per branch. Each `wrangler deploy` deploys to the production Worker. For branch previews, the conventional approach is to add a GitHub Actions step that deploys to a second Worker named `quote-kit-preview` on non-main branches, then tears it down after merge. Alternatively, switch to Cloudflare Pages (`wrangler pages deploy`) which auto-generates preview URLs per branch — but requires migrating the deploy pipeline. MVP recommendation: a single Worker with no branch previews; add preview Workers via GitHub Actions when branch isolation becomes necessary.

- **Secrets**: Stored in Cloudflare's encrypted secret store per Worker. Set via `npx wrangler secret put SECRET_NAME` (prompts for value interactively, or pipe via stdin for CI). View secret names (never values) in Cloudflare dashboard → Workers & Pages → `quote-kit` → Settings → Variables. Rotation: run `wrangler secret put` again to overwrite. The new value takes effect on next request after deploy — no redeployment required for secrets-only changes.

- **Rollback**: `npx wrangler rollback` reverts to the prior Worker version (code only — Supabase data is not rolled back). `npx wrangler rollback <version-id>` targets a specific version from `npx wrangler deployments list`. Time-to-revert is typically under 30 seconds. Caveat: if the deploy included a Supabase migration, the rolled-back Worker code runs against the migrated schema — plan migrations to be backward-compatible with the prior code version.

- **Approval (human-only operations)**: Deleting the Worker, changing the `workers.dev` subdomain or custom domain routing, rotating secrets when downstream systems depend on the old value, any billing tier changes. An agent may deploy, rollback code versions, update secrets, and tail logs unattended.

- **Logs**: `npx wrangler tail` streams real-time logs from the production Worker to stdout (format: `--format=pretty` or `--format=json`). The free tier provides aggregated metrics in the Cloudflare dashboard (Workers Analytics). Full structured log retention (up to 7 days, filterable) requires the Workers Observability paid add-on (`observability.enabled: true` is already set in `wrangler.jsonc` — verify this is enabled in the account).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free tier 10 ms CPU cap fails SSR pages | Devil's advocate | High | High | Upgrade to Workers Paid ($5/month) before first public user; measure CPU per request with `wrangler dev --inspect` |
| `nodejs_compat` gap — Node built-ins missing in workerd | Devil's advocate + Unknown unknowns | Medium | High | Change `"nodejs_compat"` to `"nodejs_compat_v2"` in `wrangler.jsonc` before first deploy; verify with `wrangler dev` after each dependency update |
| `npm run dev` masks workerd runtime failures | Pre-mortem + Unknown unknowns | High | Medium | Use `wrangler dev` for all workerd-specific feature testing; reserve `npm run dev` for UI-only iteration |
| Project name is `10x-astro-starter` in wrangler.jsonc | Research finding | Certain | Low | Change `"name"` field to `"quote-kit"` before first deploy |
| Code rollback does not roll back Supabase migrations | Devil's advocate | Low | High | Write migrations to be backward-compatible with the prior code version; never run a migration that breaks the prior deploy |
| Hyperdrive needed at scale for Supabase connections | Unknown unknowns | Low (at MVP) | Medium | Note the pattern; add Hyperdrive binding when Supabase connection errors appear in logs |
| Branch preview URLs require separate Workers or Pages migration | Research finding | Low | Low | Accept single-Worker MVP posture; add GitHub Actions preview Workers when branch isolation is needed |

## Getting Started

Before the first deploy, apply these fixes to the existing configuration:

1. **Update the project name in `wrangler.jsonc`:** Change `"name": "10x-astro-starter"` to `"name": "quote-kit"`. This is the Worker name that appears in the Cloudflare dashboard and in `*.workers.dev` URLs.

2. **Upgrade the compatibility flag:** Change `"compatibility_flags": ["nodejs_compat"]` to `"compatibility_flags": ["nodejs_compat_v2"]`. This broadens Node.js API coverage in the workerd runtime and closes the most common compatibility gap for Astro SSR + SDK dependencies.

3. **Authenticate with Cloudflare:**
   ```bash
   npx wrangler login
   ```

4. **Set production secrets** (requires a Cloudflare account and the Worker to exist after first deploy):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

5. **Build and deploy:**
   ```bash
   npm run build && npx wrangler deploy
   ```

6. **Verify the live Worker with log streaming:**
   ```bash
   npx wrangler tail --format=pretty
   ```

7. **Use `wrangler dev` for workerd-runtime testing** (not `npm run dev`) whenever testing Cloudflare-specific code paths, bindings, or new SDK dependencies:
   ```bash
   npx wrangler dev
   ```

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions auto-deploy is already configured per CLAUDE.md)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare Pages migration (branch preview URL setup)
