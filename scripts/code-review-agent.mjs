import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";

const SYSTEM_PROMPT = `You are a thorough code reviewer. Review the provided git diff for two categories of issues only:

[SECURITY] / [BUG]: missing input validation, unchecked user input, exposed secrets or API keys, missing error handling, edge cases in business logic, incorrect async/await handling, potential null/undefined errors, unsafe type assertions.

[QUALITY]: unnecessary complexity, confusing or misleading naming, logic that is hard to follow, missing error handling for external calls, code that will silently fail.

Format:
- Group findings under the filename where they appear
- Label each finding [SECURITY], [BUG], or [QUALITY]
- Include the relevant line or snippet
- If there are no findings, respond with exactly: No issues found.
- Do NOT comment on formatting, indentation, imports, or style — linters handle those.`;

const apiKey = process.env.ANTHROPIC_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_KEY not set — skipping review");
  process.exit(0);
}

const diff = execSync("git diff --cached -- '*.ts' '*.tsx' '*.astro'", { encoding: "utf8" });
if (!diff.trim()) {
  console.log("No staged changes — skipping review");
  process.exit(0);
}

const MAX_DIFF_CHARS = 30_000;
const input =
  diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[diff truncated — too large to review in full]"
    : diff;

const client = new Anthropic({ apiKey });

let message;
try {
  message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: input }],
  });
} catch (err) {
  console.error("Review failed:", err instanceof Error ? err.message : String(err));
  process.exit(0);
}

const review = message.content[0]?.type === "text" ? message.content[0].text : "";
console.log("\n── Code Review ──────────────────────────────────────────\n");
console.log(review);
console.log("\n─────────────────────────────────────────────────────────\n");
