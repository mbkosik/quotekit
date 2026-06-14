import { useState } from "react";
import type { QuoteItem } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  items: QuoteItem[];
  title: string;
  onItemsChange: (items: QuoteItem[]) => void;
  onSave: (items: QuoteItem[]) => void;
  saving: boolean;
  onTitleChange?: (title: string) => void;
  saveDisabled?: boolean;
}

type EditingCell = { rowIndex: number; field: "task" | "hours" | "rate" } | null;

export function LineItemsEditor({ items, title, onItemsChange, onSave, saving, onTitleChange, saveDisabled }: Props) {
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [draft, setDraft] = useState("");

  const totalHours = items.reduce((sum, it) => sum + it.hours, 0);
  const totalAmount = items.reduce((sum, it) => sum + it.hours * it.rate, 0);

  function startEdit(rowIndex: number, field: "task" | "hours" | "rate") {
    setDraft(String(items[rowIndex][field]));
    setEditingCell({ rowIndex, field });
  }

  function commitEdit() {
    if (!editingCell) return;
    const { rowIndex, field } = editingCell;
    const updated = items.map((item, i) => {
      if (i !== rowIndex) return item;
      if (field === "task") return { ...item, task: draft };
      const num = parseFloat(draft);
      if (isNaN(num) || num < 0) return item;
      return { ...item, [field]: num };
    });
    onItemsChange(updated);
    setEditingCell(null);
  }

  function removeRow(rowIndex: number) {
    setEditingCell(null);
    onItemsChange(items.filter((_, i) => i !== rowIndex));
  }

  function addRow() {
    const newIdx = items.length;
    onItemsChange([...items, { id: crypto.randomUUID(), task: "", hours: 0, rate: 0 }]);
    setDraft("");
    setEditingCell({ rowIndex: newIdx, field: "task" });
  }

  const cellBase = "cursor-pointer rounded px-2 py-1 text-sm transition-colors";

  // Reflect the pending draft in the disabled check and save payload so clicking
  // save while an input is focused commits + saves in one action.
  const effectiveItems = editingCell
    ? items.map((item, i) => {
        if (i !== editingCell.rowIndex) return item;
        if (editingCell.field === "task") return { ...item, task: draft };
        const num = parseFloat(draft);
        if (isNaN(num) || num < 0) return item;
        return { ...item, [editingCell.field]: num };
      })
    : items;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {onTitleChange ? (
        <input
          value={title}
          onChange={(e) => {
            onTitleChange(e.target.value);
          }}
          className="border-b border-white/20 bg-transparent pb-1 text-xl font-semibold text-white outline-none focus:border-white/60"
        />
      ) : (
        <h2 className="text-xl font-semibold text-white">{title}</h2>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40">
              <th className="px-4 py-3 font-medium">Zadanie</th>
              <th className="px-4 py-3 font-medium">Godziny</th>
              <th className="px-4 py-3 font-medium">Stawka (PLN/h)</th>
              <th className="px-4 py-3 font-medium">Subtotal</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-white/40">
                  Dodaj pierwszą pozycję wyceny za pomocą przycisku poniżej.
                </td>
              </tr>
            )}
            {items.map((item, i) => (
              <tr key={item.id} className="border-b border-white/5 text-white/60 last:border-0">
                <td className="px-4 py-2">
                  {editingCell?.rowIndex === i && editingCell.field === "task" ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                      }}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                      }}
                      className="w-full rounded bg-white/10 px-2 py-1 text-sm text-white outline-none"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className={cn(cellBase, editingCell?.rowIndex === i ? "bg-white/10" : "hover:bg-white/5")}
                      onClick={() => {
                        startEdit(i, "task");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          startEdit(i, "task");
                        }
                      }}
                    >
                      {item.task}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editingCell?.rowIndex === i && editingCell.field === "hours" ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.5"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                      }}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                      }}
                      className="w-20 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className={cn(cellBase, editingCell?.rowIndex === i ? "bg-white/10" : "hover:bg-white/5")}
                      onClick={() => {
                        startEdit(i, "hours");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          startEdit(i, "hours");
                        }
                      }}
                    >
                      {item.hours}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {editingCell?.rowIndex === i && editingCell.field === "rate" ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                      }}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                      }}
                      className="w-24 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className={cn(cellBase, editingCell?.rowIndex === i ? "bg-white/10" : "hover:bg-white/5")}
                      onClick={() => {
                        startEdit(i, "rate");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          startEdit(i, "rate");
                        }
                      }}
                    >
                      {item.rate}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-white/60">{(item.hours * item.rate).toLocaleString("pl-PL")} zł</td>
                <td className="px-4 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      removeRow(i);
                    }}
                    className="text-white/40 hover:text-red-400"
                    aria-label="Usuń pozycję"
                  >
                    <X size={12} aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 text-white/60">
              <td className="px-4 py-3 text-xs font-medium">SUMA</td>
              <td className="px-4 py-3 text-xs">{totalHours} h</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-xs font-medium">{totalAmount.toLocaleString("pl-PL")} zł</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="border-dashed border-white/20 text-white/40 hover:border-white/40 hover:text-white/60"
        >
          + Dodaj pozycję
        </Button>
        <Button
          type="button"
          onMouseDown={(e) => {
            if (editingCell) e.preventDefault();
          }}
          onClick={() => {
            if (editingCell) {
              onItemsChange(effectiveItems);
              setEditingCell(null);
              onSave(effectiveItems);
            } else {
              onSave(items);
            }
          }}
          disabled={
            saving || items.length === 0 || !!saveDisabled || effectiveItems.some((item) => item.task.trim() === "")
          }
        >
          {saving ? "Zapisuję..." : "Zapisz wycenę"}
        </Button>
      </div>
    </div>
  );
}
