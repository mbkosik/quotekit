---
project: "QuoteKit"
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

A solo freelancer, early in their career, receives a client inquiry with a vague scope and has no reliable way to answer one question: "what should I charge for this?" The manual process of translating a rough client message into a scoped, line-by-line quote takes hours they don't have — and the cognitive load of estimating rates they've never set before compounds it. The result is binary: a rushed, underpriced quote, or silence ("I'll deal with it later") that kills the deal.

LLMs changed the calculus. Until recently, turning a raw client message into a credible scoped estimate required domain expertise that beginner freelancers don't yet have. That expertise can now be approximated at request time — asking the right clarifying questions, suggesting reasonable line items, and proposing rates grounded in the project's shape. QuoteKit is the tool that collapses "vague inquiry → deliverable quote" from hours to minutes.

## User & Persona

**Primary persona: early-career solo freelancer**

Someone who has started taking on freelance work but hasn't yet built the pattern-matching that experienced freelancers use to scope and price quickly. They know their craft (development, design, copywriting) but not the business side. When a client message lands in their inbox, the question "how do I even start?" is the blocker — not the work itself.

The moment: a client inquiry arrives. It's vague, promising, and slightly intimidating. The freelancer has never quoted this type of project before. They open a blank document and stare at it.

## Success Criteria

### Primary

- A freelancer goes from pasting a client inquiry to a saved, editable quote in under 10 minutes.

### Secondary

- At least 80% of AI-generated line items require only minor corrections before the freelancer saves the quote.

### Guardrails

- Quote data isolation: a signed-in freelancer must never be able to see or reach another user's quotes. A data-visibility bug here is a trust-breaking regression regardless of any other feature working.
- Core quote management (viewing, editing, and deleting saved quotes) must remain functional regardless of whether the AI-assisted scoping feature is available.

## User Stories

### US-01: Freelancer creates a quote from a client inquiry

- **Given** a signed-in freelancer with no existing quotes
- **When** they paste a client's inquiry and complete the AI clarifying conversation
- **Then** they see an editable list of AI-generated line items they can approve and save as a quote

#### Acceptance Criteria

- The AI clarifying conversation must complete before line items are shown
- Each line item shows: task name, estimated hours, suggested rate, and a computed subtotal
- The freelancer can approve the quote without modifying any item
- The saved quote appears in their quote list with status "draft"

## Functional Requirements

### Authentication

- FR-001: User can sign up with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "Registration adds friction and day-1 drop-off risk." Resolution: kept; multi-user auth requires sign-up. The concern about confirmation email UX is real and should inform the sign-up flow design — minimise steps before first value.

- FR-002: User can sign in with email and password or OAuth. Priority: must-have
  > Socrates: Counter-argument considered: "GitHub or Google OAuth alone covers the persona." Resolution: kept as-is for now; the Supabase scaffold supports both. OAuth-only simplification is a valid v1 decision to revisit when building the auth UI — the FR does not mandate both, it permits both.

- FR-003: User can sign out. Priority: must-have
  > Socrates: Counter-argument considered: "Trivially required; this challenge adds noise." Resolution: kept; it stands.

### Quote Creation

- FR-004: User can create a new quote by pasting a client inquiry. Priority: must-have
  > Socrates: Counter-argument considered: "A blank textarea looks like a notes file; if the AI extracts weak signal, the tool looks broken." Resolution: kept; the paste-first UX is correct. The concern points to a prompt engineering and empty-state design requirement — the tool must handle vague input gracefully and guide the user if the paste is too sparse.

- FR-005: User can respond to AI clarifying questions about scope, stack, deadline, and client budget. Priority: must-have
  > Socrates: Counter-argument considered: "How many questions is 'right'? Too few = bad quotes; too many = user feels interrogated." Resolution: kept; the clarifying round is core. The count and stopping rule are an open design question — see Open Questions.

- FR-006: User can receive a list of AI-generated line items (task name, estimated hours, suggested rate). Priority: must-have
  > Socrates: Counter-argument considered: "If AI hallucinates tasks that don't apply, the user wastes more time deleting wrong items than they saved." Resolution: kept; this is the central value delivery. The concern elevates AI output quality to a hard requirement — an AI that produces mostly-wrong line items is worse than no AI. This must be reflected in the NFRs.

### Quote Editing

- FR-007: User can edit individual line items (task name, estimated hours, rate). Priority: must-have
  > Socrates: No counter-argument; it stands as written.

- FR-008: User can add a line item manually. Priority: nice-to-have
  > Socrates: Counter-argument considered: "80% AI-generated items don't justify a full manual-creation UI in MVP." Resolution: demoted to nice-to-have. Users work with AI-generated items in v1. Manual add ships in v2.

- FR-009: User can remove a line item. Priority: must-have
  > Socrates: Counter-argument considered: "Deletion without undo is a frustration point; undo adds state complexity." Resolution: kept as must-have; removal is necessary. Undo is explicitly not in MVP — this is an accepted trade-off.

- FR-010: User can save a quote (saved with status "draft"). Priority: must-have
  > Socrates: Counter-argument considered: "'Approve' vs 'save' is ambiguous — two-phase state needs design." Resolution: revised. The 'approve' concept is dropped. One action: saving a quote always creates or updates it with status "draft". The quote is not locked by an approval step.

### Quote Management

- FR-011: User can view a list of all their own quotes. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

- FR-012: User can update a quote's status (draft → sent → accepted / rejected). Priority: must-have
  > Socrates: Counter-argument considered: "Most freelancers won't remember to update status — the field becomes noise." Resolution: kept; the status field gives the freelancer a lightweight pipeline view even if imperfect. Its value is not predicated on perfect hygiene.

- FR-013: User can delete a quote. Priority: must-have
  > Socrates: Counter-argument considered: "Hard delete loses the pricing reference — freelancers may want to look back at past quotes." Resolution: kept as hard delete for MVP. Pricing history / soft-delete is a non-goal for v1; the trade-off is accepted.

## Non-Functional Requirements

- AI-generated line items must be credible enough that a majority require only minor corrections before the freelancer saves the quote. An AI that consistently produces wrong or inapplicable tasks is worse than no AI — it costs the freelancer more time than the tool saves.
- A signed-in freelancer must never be able to view, edit, or reach quote data belonging to another account, under any circumstances. A data-visibility failure here is a critical regression regardless of any other feature state.

## Business Logic

Given a client inquiry and the freelancer's answers to clarifying questions, QuoteKit decides what tasks are involved in the project, how long each task will take, and what rates are appropriate — producing a scoped, line-item estimate the freelancer can review and edit.

The inputs the rule consumes are: the raw client inquiry text and the freelancer's responses to a structured set of clarifying questions about project scope, technical stack preferences, deadline constraints, and the client's stated or implied budget. These inputs are user-provided at request time; the application does not maintain a profile or history of past rates.

The output is an ordered list of line items. Each item has a task name, an estimated duration in hours, and a suggested hourly rate. The list is the application's proposal; the freelancer is the final authority. No line item is locked — all are editable, removable, or supplementable before the quote is saved.

The freelancer encounters the rule immediately after completing the clarifying conversation. The list appears as the first concrete, actionable artifact of the session. Whether the rule succeeded is judged by whether the freelancer had to make only minor corrections before saving.

## Access Control

Multi-user web app. Every freelancer creates an account (email + password, or OAuth). Once signed in, they see only their own quotes — there is no shared workspace, no admin panel, no team concept. The access model is flat: one role, one level of access.

Sign-up behavior: standard registration flow. Unauthenticated users cannot access any quote data; they are redirected to sign-in.

## Non-Goals

- **No sending quotes to clients** (no PDF export, no shareable link, no email delivery): QuoteKit creates the quote; how it reaches the client is out of scope for v1. This is deliberate — delivery requires client identity, which opens a product door we're explicitly not walking through yet.
- **No client management**: Clients are not tracked as separate entities. There are no client records, contact history, or CRM-style features. A quote references a client only implicitly through the inquiry text.
- **No invoicing or billing**: Quotes only. The moment a quote becomes a financial document (invoice, contract, receipt), that's a different product domain.
- **No integrations with external tools** (Notion, Jira, Cal.com, Slack, etc.): QuoteKit is standalone in v1. No import or export to external productivity tools.
- **No multi-currency support**: Each quote assumes a single currency. There is no currency selection, no conversion, and no locale-aware formatting beyond a basic currency symbol.
- **No manual line item creation in MVP** (FR-008, deferred to v2): Adding new line items from scratch is out of scope. The editing surface covers only AI-generated items.
- **No undo or edit history for line items**: Deletion is permanent. The complexity of undo is not justified for MVP.
- **No offline-first guarantee**: The product requires a live network connection. No offline data access or background sync is provided.

## Open Questions

1. ~~**How many clarifying questions should the AI ask, and what is the stopping rule?**~~ **RESOLVED 2026-05-26** — User-driven with upper limit (max 5 questions). User can skip at any point via "skip / enough" button. Architecture: multi-turn conversation with explicit skip affordance in UI.

2. ~~**How should the tool handle a very sparse or uninformative paste?**~~ **RESOLVED 2026-05-26 (Option B)** — Dual-mode routing: AI assesses inquiry quality and routes to (a) quote generation or (b) questions for the client, with user confirmation before mode switch. Entered into S-01 scope. Motivation: freelancers paste listings from portals (Useme, etc.) where briefs are intentionally brief.
