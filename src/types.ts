export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

export interface QuoteItem {
  task: string;
  hours: number;
  rate: number;
}

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
