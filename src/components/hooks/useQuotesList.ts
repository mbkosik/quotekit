import { useEffect, useRef, useState } from "react";
import type { Quote, QuoteStatus } from "@/types";

export type QuoteRow = Pick<Quote, "id" | "title" | "status" | "created_at">;

export interface FilterState {
  statusFilter: QuoteStatus[];
  searchFilter: string;
  sortOrder: "asc" | "desc";
}

interface Options {
  initialQuotes: QuoteRow[];
  initialTotal: number;
  pageSize: number;
  initialFilters: FilterState;
}

function buildPageURL(page: number, filters: FilterState): string {
  const params = new URLSearchParams();
  if (filters.statusFilter.length > 0) params.set("status", filters.statusFilter.join(","));
  if (filters.searchFilter) params.set("search", filters.searchFilter);
  if (filters.sortOrder !== "desc") params.set("sort", filters.sortOrder);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return window.location.pathname + (query ? `?${query}` : "");
}

function buildAPIURL(page: number, pageSize: number, filters: FilterState): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (filters.statusFilter.length > 0) params.set("status", filters.statusFilter.join(","));
  if (filters.searchFilter) params.set("search", filters.searchFilter);
  if (filters.sortOrder !== "desc") params.set("sort", filters.sortOrder);
  return `/api/quotes?${params.toString()}`;
}

export function useQuotesList({ initialQuotes, initialTotal, pageSize, initialFilters }: Options) {
  const [quotes, setQuotes] = useState<QuoteRow[]>(initialQuotes);
  const [total, setTotal] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus[]>(initialFilters.statusFilter);
  const [searchFilter, setSearchFilter] = useState(initialFilters.searchFilter);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialFilters.sortOrder);

  const pageLoadingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(total / pageSize);
  const hasActiveFilters = statusFilter.length > 0 || searchFilter !== "" || sortOrder !== "desc";

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  async function fetchQuotes(page: number, filters: FilterState) {
    if (pageLoadingRef.current) return;
    setLoading(true);
    try {
      pageLoadingRef.current = true;
      const res = await fetch(buildAPIURL(page, pageSize, filters));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { quotes: QuoteRow[]; total: number; page: number };
      setQuotes(data.quotes);
      setTotal(data.total);
      setCurrentPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się pobrać wycen. Spróbuj ponownie.");
    } finally {
      pageLoadingRef.current = false;
      setLoading(false);
    }
  }

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
    const filters: FilterState = { statusFilter, searchFilter, sortOrder };
    try {
      const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (quotes.length === 1 && currentPage > 1) {
        const newPage = currentPage - 1;
        history.replaceState(null, "", buildPageURL(newPage, filters));
        void fetchQuotes(newPage, filters);
      } else {
        setQuotes((qs) => qs.filter((q) => q.id !== id));
        setTotal((t) => t - 1);
      }
    } catch {
      setError("Nie udało się usunąć wyceny. Spróbuj ponownie.");
    }
  }

  function handlePageChange(page: number) {
    const filters: FilterState = { statusFilter, searchFilter, sortOrder };
    history.replaceState(null, "", buildPageURL(page, filters));
    void fetchQuotes(page, filters);
  }

  function handleStatusFilterToggle(status: QuoteStatus) {
    const newStatusFilter = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    const filters: FilterState = { statusFilter: newStatusFilter, searchFilter, sortOrder };
    setStatusFilter(newStatusFilter);
    history.replaceState(null, "", buildPageURL(1, filters));
    void fetchQuotes(1, filters);
  }

  function handleSearchChange(value: string) {
    setSearchFilter(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      // `value` is captured at schedule time — not read from state — per plan contract
      const filters: FilterState = { statusFilter, searchFilter: value, sortOrder };
      history.replaceState(null, "", buildPageURL(1, filters));
      void fetchQuotes(1, filters);
    }, 300);
  }

  function handleSortChange() {
    const newSort: "asc" | "desc" = sortOrder === "desc" ? "asc" : "desc";
    const filters: FilterState = { statusFilter, searchFilter, sortOrder: newSort };
    setSortOrder(newSort);
    history.replaceState(null, "", buildPageURL(1, filters));
    void fetchQuotes(1, filters);
  }

  function handleClearFilters() {
    const filters: FilterState = { statusFilter: [], searchFilter: "", sortOrder: "desc" };
    setStatusFilter([]);
    setSearchFilter("");
    setSortOrder("desc");
    history.replaceState(null, "", buildPageURL(1, filters));
    void fetchQuotes(1, filters);
  }

  return {
    quotes,
    total,
    currentPage,
    totalPages,
    loading,
    error,
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
  };
}
