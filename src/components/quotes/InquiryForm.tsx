import { useState } from "react";

interface Props {
  onSubmit: (text: string) => void;
  onGenerateQuestions: (text: string) => void;
  loading: boolean;
  sparseMessage?: string;
  defaultValue?: string;
}

export function InquiryForm({ onSubmit, onGenerateQuestions, loading, sparseMessage, defaultValue }: Props) {
  const [text, setText] = useState(defaultValue ?? "");
  const [validationError, setValidationError] = useState("");

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setValidationError("Opisz projekt klienta, żeby móc wygenerować pytania lub wycenę.");
      return;
    }
    setValidationError("");
    if (trimmed.length < 20) {
      onGenerateQuestions(trimmed);
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white/70">Wklej zapytanie klienta</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (validationError) setValidationError("");
          }}
          rows={6}
          placeholder="Opisz projekt klienta — im więcej szczegółów, tym lepsza wycena..."
          className="resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
          disabled={loading}
        />
      </label>

      {validationError && <p className="text-sm text-red-400">{validationError}</p>}
      {sparseMessage && <p className="text-sm text-amber-400">{sparseMessage}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Analizuję...
          </>
        ) : (
          "Analizuj zapytanie"
        )}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          const trimmed = text.trim();
          if (trimmed.length < 3) {
            setValidationError("Opisz projekt klienta, żeby móc wygenerować pytania.");
            return;
          }
          setValidationError("");
          onGenerateQuestions(trimmed);
        }}
        className="rounded-xl border border-white/10 px-6 py-3 text-sm text-white/70 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generuj pytania do klienta
      </button>
    </form>
  );
}
