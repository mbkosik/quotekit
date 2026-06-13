import type { QuoteStatus } from "@/types";
import { QUOTE_STATUSES } from "@/types";
import { STATUS_LABELS } from "@/lib/quotes";

interface Props {
  statusFilter: QuoteStatus[];
  searchFilter: string;
  sortOrder: "asc" | "desc";
  hasActiveFilters: boolean;
  onStatusFilterToggle: (status: QuoteStatus) => void;
  onSearchChange: (value: string) => void;
  onSortChange: () => void;
  onClearFilters: () => void;
}

export function QuoteFilterBar({
  statusFilter,
  searchFilter,
  sortOrder,
  hasActiveFilters,
  onStatusFilterToggle,
  onSearchChange,
  onSortChange,
  onClearFilters,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {QUOTE_STATUSES.map((s) => {
          const active = statusFilter.includes(s);
          return (
            <button
              key={s}
              onClick={() => {
                onStatusFilterToggle(s);
              }}
              aria-pressed={active}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-purple-600 text-white"
                  : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={searchFilter}
        onChange={(e) => {
          onSearchChange(e.target.value);
        }}
        placeholder="Szukaj po tytule…"
        aria-label="Szukaj po tytule wyceny"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
      />

      <button
        onClick={onSortChange}
        aria-label={
          sortOrder === "desc"
            ? "Sortuj: najnowsze. Kliknij, by sortować od najstarszych"
            : "Sortuj: najstarsze. Kliknij, by sortować od najnowszych"
        }
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        {sortOrder === "desc" ? "Najnowsze ↓" : "Najstarsze ↑"}
      </button>

      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs text-white/40 underline-offset-2 transition-colors hover:text-white/70 hover:underline"
        >
          Wyczyść filtry
        </button>
      )}
    </div>
  );
}
