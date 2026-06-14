import { useQuoteEditor } from "@/components/hooks/useQuoteEditor";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { ChevronLeft } from "lucide-react";
import { LineItemsEditor } from "@/components/quotes/LineItemsEditor";
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
import type { Quote } from "@/types";
import { QUOTE_STATUSES } from "@/types";
import { STATUS_LABELS } from "@/lib/quotes";
import { cn } from "@/lib/utils";

interface Props {
  quote: Quote;
}

export function QuoteEditor({ quote }: Props) {
  const {
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
  } = useQuoteEditor(quote);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <a
          href="/quotes"
          className="flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/60"
        >
          <ChevronLeft size={16} aria-hidden />
          Wróć do listy
        </a>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={deleting}>
              {deleting ? "Usuwanie…" : "Usuń wycenę"}
            </Button>
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
                  void handleDelete();
                }}
                className="bg-red-600 hover:bg-red-500"
              >
                Usuń
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-white/40">Status:</label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as (typeof QUOTE_STATUSES)[number]);
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
        >
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <InlineError message={error} />
      <p
        role="status"
        aria-live="polite"
        className={cn("text-sm text-green-400", success && "rounded-lg bg-green-500/10 px-4 py-3")}
      >
        {success ?? ""}
      </p>

      <LineItemsEditor
        title={title}
        items={items}
        onTitleChange={setTitle}
        onItemsChange={setItems}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!isDirty}
      />
    </div>
  );
}
