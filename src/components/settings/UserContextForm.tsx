import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppTextarea } from "@/components/ui/app-textarea";
import { InlineError } from "@/components/ui/inline-error";

interface Props {
  context: string;
}

const MAX_CHARS = 500;

export function UserContextForm({ context }: Props) {
  const [value, setValue] = useState(context);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
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
        <p className="mt-1 text-sm text-white/40">
          Te informacje są dołączane do każdego promptu AI i pomagają dopasować wyceny do Twojej specjalizacji.
        </p>
      </div>
      <AppTextarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (status === "error" || status === "saved") setStatus("idle");
        }}
        rows={6}
        placeholder="Np. Specjalizuję się w aplikacjach webowych (Laravel, Vue). Pracuję z małymi firmami na rynku polskim. Moja stawka to 120–180 PLN/h. Zawsze wyceniam czas na dokumentację i komunikację."
        aria-label="Kontekst użytkownika dla generowania wycen"
      />
      <div className="flex items-center justify-between">
        <span className={cn("text-xs", isOverLimit ? "text-red-400" : "text-white/40")}>
          {value.length} / {MAX_CHARS}
        </span>
        <div className="flex items-center gap-3">
          {status === "saved" && <span className="text-sm text-green-400">Zapisano</span>}
          <InlineError message={status === "error" ? "Błąd zapisu — spróbuj ponownie" : null} />
          <Button type="button" onClick={handleSave} disabled={status === "saving" || isUnchanged || isOverLimit}>
            {status === "saving" ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </div>
      </div>
    </div>
  );
}
