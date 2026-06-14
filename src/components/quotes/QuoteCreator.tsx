import { useQuoteCreator, MAX_QUESTIONS } from "@/components/hooks/useQuoteCreator";
import { InquiryForm } from "@/components/quotes/InquiryForm";
import { ClientQuestionsList } from "@/components/quotes/ClientQuestionsList";
import { ConversationCard } from "@/components/quotes/ConversationCard";
import { LineItemsEditor } from "@/components/quotes/LineItemsEditor";
import { InlineError } from "@/components/ui/inline-error";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export function QuoteCreator() {
  const { state, actions } = useQuoteCreator();
  const {
    phase,
    currentQuestion,
    questionCount,
    clientQuestions,
    questionsLoading,
    items,
    title,
    error,
    sparseMessage,
    savedTitle,
    inquiryText,
  } = state;
  const {
    handleInquirySubmit,
    handleAnswer,
    handleSkip,
    handleSave,
    handleGenerateQuestions,
    handleBackFromQuestions,
    setItems,
    setError,
    resetForm,
  } = actions;

  const isLoading = phase === "loading" || phase === "saving";

  if (phase === "done") {
    return (
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 rounded-2xl border border-green-500/20 bg-green-500/10 px-8 py-12 text-center">
        <p className="text-lg font-medium text-green-300">Wycena &ldquo;{savedTitle}&rdquo; zapisana!</p>
        <a href="/quotes" className="flex items-center gap-1 text-sm text-purple-300 underline hover:text-purple-100">
          Zobacz swoje wyceny <ChevronRight size={16} aria-hidden />
        </a>
        <Button variant="outline" onClick={resetForm} className="mt-2">
          Utwórz nową wycenę
        </Button>
      </div>
    );
  }

  if (phase === "items" || phase === "saving") {
    return (
      <>
        <InlineError message={error || null} className="mb-4" />
        <LineItemsEditor
          items={items}
          title={title}
          onItemsChange={setItems}
          onSave={handleSave}
          saving={phase === "saving"}
        />
      </>
    );
  }

  if (phase === "conversation" || (phase === "loading" && questionCount > 0)) {
    return (
      <ConversationCard
        question={currentQuestion}
        questionNumber={questionCount}
        maxQuestions={MAX_QUESTIONS}
        onAnswer={handleAnswer}
        onSkip={handleSkip}
        loading={isLoading}
        error={error || undefined}
        onRetry={
          error
            ? () => {
                setError("");
              }
            : undefined
        }
      />
    );
  }

  if (phase === "questions") {
    return <ClientQuestionsList questions={clientQuestions} onBack={handleBackFromQuestions} />;
  }

  if (phase === "loading" && questionCount === 0) {
    return (
      <div className="flex w-full max-w-3xl flex-col items-center gap-3 py-12 text-white/60">
        <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <p className="text-sm">Analizuję zapytanie...</p>
      </div>
    );
  }

  return (
    <InquiryForm
      onSubmit={handleInquirySubmit}
      onGenerateQuestions={handleGenerateQuestions}
      loading={isLoading}
      questionsLoading={questionsLoading}
      sparseMessage={sparseMessage || undefined}
      defaultValue={inquiryText}
    />
  );
}
