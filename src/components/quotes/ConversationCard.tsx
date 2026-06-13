import { useState } from "react";

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
    <div className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white/40">
          Pytanie {questionNumber} / {maxQuestions}
        </span>
      </div>

      <p id={`question-${questionNumber}`} className="text-base text-white/90">
        {question}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
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
            <button
              type="submit"
              disabled={!answer.trim()}
              className="flex-1 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Odpowiedz
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              Pomiń / Wystarczy
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
          {onRetry && (
            <button onClick={onRetry} className="ml-4 text-sm text-red-300 underline hover:text-red-100">
              Spróbuj ponownie
            </button>
          )}
        </div>
      )}
    </div>
  );
}
