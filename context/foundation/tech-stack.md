---
starter_id: 10x-astro-starter
package_manager: npm
project_name: quote-kit
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

QuoteKit is a solo-built, 3-week MVP requiring auth, a PostgreSQL-backed quote store, and an AI-powered scoping flow. 10x Astro Starter ships exactly these: Supabase covers email/OAuth auth and Row-Level Security enforces per-user quote isolation — directly satisfying the PRD's hard guardrail that a signed-in freelancer must never see another user's quotes. Astro 6 server-side API routes provide the runtime to call an LLM (e.g., `@anthropic-ai/sdk`) without a separate backend service. TypeScript and Zod-typed boundaries let agents reason over the codebase confidently, and React 19 islands handle the interactive quote-editing UI with minimal JavaScript sent to the browser. Cloudflare Pages gives near-zero-cost edge deployment from the first commit, and GitHub Actions auto-deploys on every merge to main — matching the after-hours, solo delivery cadence the PRD's 3-week timeline assumes.
