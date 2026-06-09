// Deliberate failure — CI gate smoke test. Delete this file after CI confirms the gate blocks.
import { expect, test } from "vitest";

test("smoke: CI gate blocks on failing test", () => {
  expect(true).toBe(false);
});
