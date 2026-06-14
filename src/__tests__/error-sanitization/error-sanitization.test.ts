// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as scopePOST } from "@/pages/api/ai/scope";
import { POST as chatPOST } from "@/pages/api/ai/chat";
import { POST as questionsPOST } from "@/pages/api/ai/questions";
import type { APIContext } from "astro";

const FAKE_KEY = "sk-ant-api03-test-fake-key";

const { mockCreate, mockParse } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockParse: vi.fn(),
}));

vi.mock("@/lib/anthropic", () => ({
  createAnthropicClient: () => ({
    messages: { create: mockCreate, parse: mockParse },
  }),
}));

function makeContext(body: Record<string, unknown>): APIContext {
  return {
    locals: { user: { id: "test-user-1" } },
    request: new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as unknown as APIContext;
}

const VALID_INQUIRY = "Potrzebuję aplikacji webowej z panelem administratora";

beforeEach(() => {
  mockCreate.mockReset();
  mockParse.mockReset();
});

describe("error response sanitization", () => {
  describe("scope.ts — Anthropic SDK error does not leak API key", () => {
    it("returns generic error without key when messages.parse throws", async () => {
      mockParse.mockRejectedValue(
        new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
      );

      const ctx = makeContext({ inquiry_text: VALID_INQUIRY });
      const res = await scopePOST(ctx);
      const body = (await res.json()) as { error: unknown };

      expect(res.status).toBe(502);
      expect(body.error).toBe("AI service error");
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    });
  });

  describe("chat.ts — question mode (messages.create throws)", () => {
    it("returns generic error without key when messages.create throws", async () => {
      mockCreate.mockRejectedValue(
        new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
      );

      const ctx = makeContext({
        inquiry_text: VALID_INQUIRY,
        messages: [],
        generate: false,
      });
      const res = await chatPOST(ctx);
      const body = (await res.json()) as { error: unknown };

      expect(res.status).toBe(502);
      expect(body.error).toBe("AI service error");
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    });
  });

  describe("chat.ts — generate mode (messages.parse throws)", () => {
    it("returns generic error without key when messages.parse throws", async () => {
      mockParse.mockRejectedValue(
        new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
      );

      const ctx = makeContext({
        inquiry_text: VALID_INQUIRY,
        messages: [],
        generate: true,
      });
      const res = await chatPOST(ctx);
      const body = (await res.json()) as { error: unknown };

      expect(res.status).toBe(502);
      expect(body.error).toBe("AI service error");
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    });
  });

  describe("chat.ts — DONE path (messages.create returns DONE, messages.parse throws)", () => {
    it("returns generic error without key when generateItems throws after DONE", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "DONE" }],
      });
      mockParse.mockRejectedValue(
        new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
      );

      const ctx = makeContext({
        inquiry_text: VALID_INQUIRY,
        messages: [],
        generate: false,
      });
      const res = await chatPOST(ctx);
      const body = (await res.json()) as { error: unknown };

      expect(res.status).toBe(502);
      expect(body.error).toBe("AI service error");
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    });
  });

  describe("questions.ts — Anthropic SDK error does not leak API key", () => {
    it("returns generic error without key when messages.parse throws", async () => {
      mockParse.mockRejectedValue(
        new Error(`401 {"error":{"message":"invalid x-api-key ${FAKE_KEY}","type":"authentication_error"}}`),
      );

      // inquiry_text min 3 chars (questions.ts uses z.string().min(3), not min(20))
      const ctx = makeContext({ inquiry_text: "strona www" });
      const res = await questionsPOST(ctx);
      const body = (await res.json()) as { error: unknown };

      expect(res.status).toBe(502);
      expect(body.error).toBe("AI service error");
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    });
  });
});
