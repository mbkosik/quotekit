import { z } from "zod";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

export const QuoteItemSchema = z.object({
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
