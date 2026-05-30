import type { QuoteStatus } from "@/types";

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Szkic",
  sent: "Wysłana",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
};
