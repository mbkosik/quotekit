import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  questions: string[];
  onBack: () => void;
}

export function ClientQuestionsList({ questions, onBack }: Props) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  function handleCopy() {
    const text = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        setCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        // clipboard unavailable (non-HTTPS or unfocused document) — silently skip
      });
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-white">Pytania do klienta</h2>
        <p className="text-sm text-white/40">Skopiuj i wyślij klientowi przed wyceną</p>
      </div>
      {questions.length === 0 ? (
        <p className="text-sm text-white/40">Brak wygenerowanych pytań.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={q} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="shrink-0 text-sm font-medium text-purple-400">{i + 1}.</span>
              <span className="text-sm text-white/60">{q}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-3">
        <Button onClick={handleCopy} disabled={questions.length === 0} className="flex-1">
          {copied ? "Skopiowano!" : "Kopiuj wszystkie"}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Wróć do wyceny
        </Button>
      </div>
    </div>
  );
}
