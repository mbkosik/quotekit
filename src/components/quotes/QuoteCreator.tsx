import { useQuoteCreator, MAX_QUESTIONS } from "@/components/hooks/useQuoteCreator";
import { InquiryForm } from "./InquiryForm";
import { ClientQuestionsList } from "./ClientQuestionsList";
import { ConversationCard } from "./ConversationCard";
import { LineItemsEditor } from "./LineItemsEditor";

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
  } = actions;

  const isLoading = phase === "loading" || phase === "saving";

  if (phase === "done") {
    return (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-green-500/20 bg-green-500/10 px-8 py-12 text-center">
        <p className="text-lg font-medium text-green-300">Wycena &ldquo;{savedTitle}&rdquo; zapisana!</p>
        <a href="/quotes" className="text-sm text-purple-300 underline hover:text-purple-100">
          Zobacz swoje wyceny →
        </a>
      </div>
    );
  }

  if (phase === "items" || phase === "saving") {
    return (
      <>
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
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
