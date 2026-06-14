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
import type { QuoteStatus } from "@/types";
import { QUOTE_STATUSES } from "@/types";
import { STATUS_LABELS } from "@/lib/quotes";
import { useQuotesList, type FilterState, type QuoteRow } from "@/components/hooks/useQuotesList";
import { QuoteFilterBar } from "@/components/quotes/QuoteFilterBar";

const DEFAULT_FILTERS: FilterState = { statusFilter: [], searchFilter: "", sortOrder: "desc" };

interface Props {
  initialQuotes: QuoteRow[];
  initialTotal: number;
  pageSize: number;
  initialFilters?: FilterState;
}

export function QuotesList({ initialQuotes, initialTotal, pageSize, initialFilters = DEFAULT_FILTERS }: Props) {
  const {
    quotes,
    total,
    currentPage,
    totalPages,
    loading,
    error,
    statusError,
    statusFilter,
    searchFilter,
    sortOrder,
    hasActiveFilters,
    handleStatusChange,
    handleDelete,
    handlePageChange,
    handleStatusFilterToggle,
    handleSearchChange,
    handleSortChange,
    handleClearFilters,
  } = useQuotesList({ initialQuotes, initialTotal, pageSize, initialFilters });

  const isEmpty = total === 0 && !hasActiveFilters;
  const isFilteredEmpty = quotes.length === 0 && hasActiveFilters;

  if (isEmpty) {
    return <p className="text-sm text-white/40">Nie masz jeszcze żadnych wycen.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <QuoteFilterBar
        statusFilter={statusFilter}
        searchFilter={searchFilter}
        sortOrder={sortOrder}
        hasActiveFilters={hasActiveFilters}
        onStatusFilterToggle={handleStatusFilterToggle}
        onSearchChange={handleSearchChange}
        onSortChange={handleSortChange}
        onClearFilters={handleClearFilters}
      />

      <p role="alert" aria-live="assertive" className="text-sm text-red-400">
        {error ?? ""}
      </p>
      <p role="status" aria-live="polite" className="text-sm text-red-400">
        {statusError ?? ""}
      </p>

      {isFilteredEmpty ? (
        <div className="flex flex-col items-start gap-2 py-4">
          <p className="text-sm text-white/40">Brak wycen dla wybranych filtrów.</p>
          <button
            onClick={handleClearFilters}
            className="text-xs text-purple-400 underline-offset-2 transition-colors hover:text-purple-300 hover:underline"
          >
            Wyczyść filtry
          </button>
        </div>
      ) : (
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
                aria-label={`Status wyceny: ${q.title}`}
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
                  <button
                    className="text-white/50 transition-colors hover:text-red-400"
                    aria-label={`Usuń wycenę: ${q.title}`}
                  >
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
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              handlePageChange(currentPage - 1);
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
              handlePageChange(currentPage + 1);
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
