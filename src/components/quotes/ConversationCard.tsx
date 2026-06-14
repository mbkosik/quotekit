import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  question: string;
  questionNumber: number;
  maxQuestions: number;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
}

export function ConversationCard({
  question,
  questionNumber,
  maxQuestions,
  onAnswer,
  onSkip,
  loading,
  error,
  onRetry,
}: Props) {
  const [answer, setAnswer] = useState("");

  function handleAnswer(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!answer.trim()) return;
    onAnswer(answer.trim());
    setAnswer("");
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/40">
          Pytanie {questionNumber} / {maxQuestions}
        </span>
      </div>

      <p id={`question-${questionNumber}`} className="text-base text-white/60">
        {question}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          Analizuję...
        </div>
      ) : (
        <form onSubmit={handleAnswer} className="flex flex-col gap-3">
          <textarea
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
            }}
            rows={3}
            placeholder="Twoja odpowiedź..."
            aria-labelledby={`question-${questionNumber}`}
            className="resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"
          />
          <div className="flex gap-3">
            <Button type="submit" disabled={!answer.trim()} className="flex-1">
              Odpowiedz
            </Button>
            <Button type="button" variant="ghost" onClick={onSkip}>
              Pomiń / Wystarczy
            </Button>
          </div>
        </form>
      )}

      <div
        role="alert"
        aria-live="assertive"
        className={
          error ? "flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3" : ""
        }
      >
        {error && (
          <>
            <p className="text-sm text-red-400">{error}</p>
            {onRetry && (
              <Button type="button" variant="ghost" onClick={onRetry} className="ml-4 text-red-300 hover:text-red-100">
                Spróbuj ponownie
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
