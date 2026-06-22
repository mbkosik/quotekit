import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CONVENTIONAL_PREFIX = /^(?:feat|fix|chore|refactor|docs|test|style|perf|ci|build)\/(.+)$/;
const CHANGE_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CRITERIA_ORDER = ["ARCH", "READABILITY", "SCOPE", "COMPLEXITY", "SECURITY"];
const RATING_ICON = { PASS: "✅", WARN: "⚠️", SKIP: "⏭️" };
const MAX_DIFF_CHARS = 30_000;

function extractChangeId(ref) {
  if (!ref) return null;
  const m = ref.match(CONVENTIONAL_PREFIX);
  const candidate = m ? m[1] : ref;
  return CHANGE_ID_RE.test(candidate) ? candidate : null;
}

function renderReview(review) {
  const tableRows = CRITERIA_ORDER.map(
    (c) => `| ${c} | ${RATING_ICON[review.criteria[c].rating]} ${review.criteria[c].rating} |`,
  ).join("\n");

  const findings = CRITERIA_ORDER.filter(
    (c) => review.criteria[c].rating === "WARN" && review.criteria[c].findings.length > 0,
  )
    .map((c) => `**[${c}]**\n${review.criteria[c].findings.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");

  return [
    `## 🤖 Code Review — ${review.verdict}`,
    "",
    review.summary,
    "",
    "| Criterion | Rating |",
    "|-----------|--------|",
    tableRows,
    ...(findings ? ["", "### Findings", "", findings] : []),
    "",
    "---",
    "*Advisory only — never blocks merge.*",
  ].join("\n");
}

function postReview(prNum, body) {
  const tmpPath = join(tmpdir(), "pr-review.md");
  writeFileSync(tmpPath, body, "utf8");
  try {
    execSync(`gh pr review ${prNum} --comment --body-file "${tmpPath}"`, { encoding: "utf8" });
    console.log(`Review posted to PR #${prNum}`);
  } catch (err) {
    console.error("Failed to post review:", err instanceof Error ? err.message : String(err));
  }
}

// --- guards ---
const apiKey = process.env.ANTHROPIC_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_KEY not set — skipping review");
  process.exit(0);
}

const prNumber = process.env.GITHUB_PR_NUMBER;
const headRef = process.env.GITHUB_HEAD_REF ?? "";
const baseSha = process.env.GITHUB_BASE_SHA;
const headSha = process.env.GITHUB_HEAD_SHA;

if (!prNumber || !baseSha || !headSha) {
  console.error("Required env vars missing (GITHUB_PR_NUMBER, GITHUB_BASE_SHA, GITHUB_HEAD_SHA) — skipping review");
  process.exit(0);
}

// --- change-id / plan lookup ---
const changeId = extractChangeId(headRef);
let planContent = null;
if (changeId) {
  try {
    planContent = readFileSync(`context/changes/${changeId}/plan.md`, "utf8");
  } catch {
    // not found — SCOPE will be SKIP
  }
}

// --- review criteria ---
let criteriaContent;
try {
  criteriaContent = readFileSync("context/foundation/review-criteria.md", "utf8");
} catch {
  console.error("review-criteria.md not found — skipping review");
  process.exit(0);
}

// --- diff ---
let diff;
try {
  diff = execSync(`git diff ${baseSha}...${headSha} -- '*.ts' '*.tsx' '*.astro' '*.sql'`, {
    encoding: "utf8",
  });
} catch {
  console.error("git diff failed — skipping review");
  process.exit(0);
}

if (!diff.trim()) {
  postReview(
    prNumber,
    "## 🤖 Code Review — PASS\n\nNo reviewable changes in this PR.\n\n---\n*Advisory only — never blocks merge.*",
  );
  process.exit(0);
}

const diffInput =
  diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large to review in full]"
    : diff;

// --- system prompt ---
const planSection = planContent
  ? `# Change Plan (for [SCOPE] criterion)\n\n${planContent}`
  : "# Change Plan (for [SCOPE] criterion)\n\nNot available — rate SCOPE as SKIP.";

const systemPrompt = `You are a code reviewer. Review the provided git diff and evaluate it against the criteria below. Call the submit_review tool with your findings.

For each criterion:
- PASS: no issues found
- WARN: one or more issues found (list each in findings[], include file and line reference where applicable)
- SKIP: not applicable — use only for SCOPE when no plan.md is provided

Overall verdict: PASS when every evaluated criterion is PASS; WARN when at least one is WARN.

${criteriaContent}

${planSection}`;

// --- tool definition ---
const criterionSchema = {
  type: "object",
  required: ["rating", "findings"],
  properties: {
    rating: { type: "string", enum: ["PASS", "WARN", "SKIP"] },
    findings: { type: "array", items: { type: "string" } },
  },
};

const REVIEW_TOOL = {
  name: "submit_review",
  description: "Submit the structured code review result",
  input_schema: {
    type: "object",
    required: ["verdict", "criteria", "summary"],
    properties: {
      verdict: { type: "string", enum: ["PASS", "WARN"] },
      summary: { type: "string" },
      criteria: {
        type: "object",
        required: CRITERIA_ORDER,
        properties: {
          ARCH: criterionSchema,
          READABILITY: criterionSchema,
          SCOPE: criterionSchema,
          COMPLEXITY: criterionSchema,
          SECURITY: criterionSchema,
        },
      },
    },
  },
};

// --- API call ---
const client = new Anthropic({ apiKey });

let message;
try {
  message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [REVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_review" },
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: diffInput }],
  });
} catch (err) {
  console.error("Claude API error:", err instanceof Error ? err.message : String(err));
  process.exit(0);
}

// --- extract and post ---
const toolUse = message.content.find((b) => b.type === "tool_use");
if (!toolUse) {
  console.error("No tool_use block in response — skipping review");
  process.exit(0);
}

try {
  postReview(prNumber, renderReview(toolUse.input));
} catch (err) {
  console.error("Failed to render/post review:", err instanceof Error ? err.message : String(err));
  process.exit(0);
}
