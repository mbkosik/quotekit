import { useQuoteEditor } from "@/components/hooks/useQuoteEditor";
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

interface Props {
  quote: Quote;
}

export function QuoteEditor({ quote }: Props) {
  const {
    title,
    status,
    items,
    saving,
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
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <a href="/quotes" className="text-sm text-white/40 transition-colors hover:text-white/70">
          ← Wróć do listy
        </a>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="rounded-lg px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-400/10">
              Usuń wycenę
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

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
      {success && <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</p>}

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
