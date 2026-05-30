import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Quote, QuoteStatus } from "@/types";
import { QUOTE_STATUSES } from "@/types";
import { STATUS_LABELS } from "@/lib/quotes";

type QuoteRow = Pick<Quote, "id" | "title" | "status" | "created_at">;

interface Props {
  initialQuotes: QuoteRow[];
  initialTotal: number;
  pageSize: number;
}

export function QuotesList({ initialQuotes, initialTotal, pageSize }: Props) {
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [total, setTotal] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageLoadingRef = useRef(false);

  const totalPages = Math.ceil(total / pageSize);

  async function handleStatusChange(id: string, newStatus: QuoteStatus) {
    const prev = quotes.find((q) => q.id === id)?.status;
    setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status: newStatus } : q)));
    try {
      const res = await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status: prev ?? q.status } : q)));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (quotes.length === 1 && currentPage > 1) {
        void handlePageChange(currentPage - 1);
      } else {
        setQuotes((qs) => qs.filter((q) => q.id !== id));
        setTotal((t) => t - 1);
      }
    } catch {
      setError("Nie udało się usunąć wyceny. Spróbuj ponownie.");
    }
  }

  async function handlePageChange(page: number) {
    if (pageLoadingRef.current) return;
    pageLoadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?page=${page}&limit=${pageSize}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { quotes: QuoteRow[]; total: number; page: number };
      setQuotes(data.quotes);
      setTotal(data.total);
      setCurrentPage(data.page);
    } catch {
      // page change failed — stay on current page
    } finally {
      pageLoadingRef.current = false;
      setLoading(false);
    }
  }

  if (quotes.length === 0 && total === 0) {
    return <p className="text-sm text-white/40">Nie masz jeszcze żadnych wycen.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
        {quotes.map((q) => (
          <li
            key={q.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-white/10 px-5 py-4"
          >
            <a
              href={`/quotes/${q.id}`}
              className="flex-1 truncate text-sm font-medium text-white transition-colors hover:text-white/70"
            >
              {q.title}
            </a>

            <select
              value={q.status}
              onChange={(e) => {
                void handleStatusChange(q.id, e.target.value as QuoteStatus);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {QUOTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-white/30 transition-colors hover:text-red-400" aria-label="Usuń wycenę">
                  ✕
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Usunąć wycenę?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ta operacja jest nieodwracalna. Wycena zostanie trwale usunięta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      void handleDelete(q.id);
                    }}
                    className="bg-red-600 hover:bg-red-500"
                  >
                    Usuń
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              void handlePageChange(currentPage - 1);
            }}
            disabled={currentPage <= 1 || loading}
            className="rounded-lg px-4 py-2 text-sm text-white/60 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Poprzednia
          </button>
          <span className="text-xs text-white/40">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => {
              void handlePageChange(currentPage + 1);
            }}
            disabled={currentPage >= totalPages || loading}
            className="rounded-lg px-4 py-2 text-sm text-white/60 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Następna →
          </button>
        </div>
      )}
    </div>
  );
}
