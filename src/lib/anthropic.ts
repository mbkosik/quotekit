import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_KEY } from "astro:env/server";

export function createAnthropicClient(): Anthropic | null {
  if (!ANTHROPIC_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: ANTHROPIC_KEY });
}
