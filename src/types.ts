import { z } from "zod";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

export const QuoteItemSchema = z.object({
  id: z.string().optional(),
  task: z.string(),
  hours: z.number(),
  rate: z.number(),
});

export type QuoteItem = z.infer<typeof QuoteItemSchema>;

export interface Quote {
  id: string;
  user_id: string;
  status: QuoteStatus;
  title: string;
  inquiry_text: string;
  content: { items: QuoteItem[] };
  created_at: string;
  updated_at: string;
}

export type QuoteInsert = Omit<Quote, "id" | "user_id" | "created_at" | "updated_at">;
export type QuoteUpdate = Partial<Pick<Quote, "title" | "status" | "content">>;

export interface ChatRequest {
  inquiry_text: string;
  messages: Message[];
  generate: boolean;
}

export type ChatResponse =
  | { type: "question"; content: string }
  | { type: "sparse" }
  | { type: "complete"; items: QuoteItem[]; title: string }
  | { type: "error"; error: string };

function isChatResponse(value: unknown): value is ChatResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case "question":
      return typeof v.content === "string";
    case "sparse":
      return true;
    case "complete":
      return Array.isArray(v.items) && typeof v.title === "string";
    case "error":
      return typeof v.error === "string";
    default:
      return false;
  }
}

export function parseChatResponse(raw: unknown): ChatResponse {
  if (!isChatResponse(raw)) throw new Error("Malformed response");
  return raw;
}

export interface QuestionsRequest {
  inquiry_text: string;
}

export interface QuestionsResponse {
  questions: string[];
}

export type QuoteCreateRequest = Omit<QuoteInsert, "status">;
