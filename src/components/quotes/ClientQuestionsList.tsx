import { useState } from "react";

interface Props {
  questions: string[];
  onBack: () => void;
}

export function ClientQuestionsList({ questions, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-white">Pytania do klienta</h2>
        <p className="text-sm text-white/50">Skopiuj i wyślij klientowi przed wyceną</p>
      </div>
      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="shrink-0 text-sm font-medium text-purple-400">{i + 1}.</span>
            <span className="text-sm text-white/80">{q}</span>
          </li>
        ))}
      </ol>
      <div className="flex gap-3">
        <button
          onClick={handleCopy}
          className="flex-1 rounded-xl bg-purple-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          {copied ? "Skopiowano!" : "Kopiuj wszystkie"}
        </button>
        <button
          onClick={onBack}
          className="rounded-xl border border-white/10 px-6 py-3 text-sm text-white/70 transition-colors hover:bg-white/5"
        >
          Wróć do wyceny
        </button>
      </div>
    </div>
  );
}
