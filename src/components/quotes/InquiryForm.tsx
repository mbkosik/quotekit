import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppTextarea } from "@/components/ui/app-textarea";

interface Props {
  onSubmit: (text: string) => void;
  onGenerateQuestions: (text: string) => void;
  loading: boolean;
  questionsLoading?: boolean;
  sparseMessage?: string;
  defaultValue?: string;
}

export function InquiryForm({
  onSubmit,
  onGenerateQuestions,
  loading,
  questionsLoading,
  sparseMessage,
  defaultValue,
}: Props) {
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
    <form onSubmit={handleSubmit} className="flex w-full max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white/60">Wklej zapytanie klienta</span>
        <AppTextarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (validationError) setValidationError("");
          }}
          rows={6}
          placeholder="Opisz projekt klienta — im więcej szczegółów, tym lepsza wycena..."
          disabled={loading}
        />
      </label>

      {validationError && <p className="text-sm text-red-400">{validationError}</p>}
      <p role="alert" aria-live="assertive" className="text-sm text-amber-400">
        {sparseMessage ?? ""}
      </p>

      <Button type="submit" disabled={loading} className="w-full">
        {loading && !questionsLoading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Analizuję...
          </>
        ) : (
          "Analizuj zapytanie"
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
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
        className="w-full"
      >
        {questionsLoading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            Generuję pytania...
          </>
        ) : (
          "Generuj pytania do klienta"
        )}
      </Button>
    </form>
  );
}
