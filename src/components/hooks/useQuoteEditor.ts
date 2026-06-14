import { useEffect, useRef, useState } from "react";
import type { Quote, QuoteItem, QuoteStatus } from "@/types";

export function useQuoteEditor(initial: Pick<Quote, "id" | "title" | "status" | "content">) {
  const [title, _setTitle] = useState(initial.title);
  const [status, _setStatus] = useState<QuoteStatus>(initial.status);
  const [items, _setItems] = useState<QuoteItem[]>(initial.content.items);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  function setTitle(t: string) {
    _setTitle(t);
    setIsDirty(true);
  }

  function setStatus(s: QuoteStatus) {
    _setStatus(s);
    setIsDirty(true);
  }

  function setItems(newItems: QuoteItem[]) {
    _setItems(newItems);
    setIsDirty(true);
  }

  async function handleSave(currentItems: QuoteItem[]) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/quotes/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status, content: { items: currentItems } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIsDirty(false);
      setSuccess("Wycena zapisana.");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch {
      setError("Nie udało się zapisać wyceny. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${initial.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.href = "/quotes";
    } catch {
      setError("Nie udało się usunąć wyceny. Spróbuj ponownie.");
    } finally {
      setDeleting(false);
    }
  }

  return {
    title,
    status,
    items,
    saving,
    deleting,
    isDirty,
    error,
    success,
    setTitle,
    setStatus,
    setItems,
    handleSave,
    handleDelete,
  };
}
