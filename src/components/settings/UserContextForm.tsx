import { useState } from "react";

interface Props {
  context: string;
}

const MAX_CHARS = 500;

export function UserContextForm({ context }: Props) {
  const [value, setValue] = useState(context);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const isUnchanged = value === context;
  const isOverLimit = value.length > MAX_CHARS;

  async function handleSave() {
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_context: value }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("saved");
      setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Kontekst użytkownika</h2>
        <p className="mt-1 text-sm text-white/50">
          Te informacje są dołączane do każdego promptu AI i pomagają dopasować wyceny do Twojej specjalizacji.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (status === "error" || status === "saved") setStatus("idle");
        }}
        rows={6}
        placeholder="Np. Specjalizuję się w aplikacjach webowych (Laravel, Vue). Pracuję z małymi firmami na rynku polskim. Moja stawka to 120–180 PLN/h. Zawsze wyceniam czas na dokumentację i komunikację."
        aria-label="Kontekst użytkownika dla generowania wycen"
        className="resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${isOverLimit ? "text-red-400" : "text-white/40"}`}>
          {value.length} / {MAX_CHARS}
        </span>
        <div className="flex items-center gap-3">
          {status === "saved" && <span className="text-sm text-green-400">Zapisano</span>}
          <p role="alert" aria-live="assertive" className="text-sm text-red-400">
            {status === "error" ? "Błąd zapisu — spróbuj ponownie" : ""}
          </p>
          <button
            onClick={handleSave}
            disabled={status === "saving" || isUnchanged || isOverLimit}
            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "saving" ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
