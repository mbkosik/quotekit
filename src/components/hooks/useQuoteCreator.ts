import { useState, useCallback } from "react";
import type { QuoteItem, Message, ChatResponse } from "@/types";

export type Phase = "inquiry" | "loading" | "questions" | "conversation" | "items" | "saving" | "done";

export const MAX_QUESTIONS = 5;

const RATE_LIMIT_MSG = "Osiągnięto limit zapytań do AI. Odczekaj chwilę i spróbuj ponownie.";

function is429(err: unknown): boolean {
  return err instanceof Error && err.message === "HTTP 429";
}

async function callQuestions(inquiry: string): Promise<string[]> {
  const res = await fetch("/api/ai/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inquiry_text: inquiry }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { questions: unknown };
  if (!Array.isArray(data.questions)) throw new Error("Malformed response");
  return data.questions as string[];
}

async function callChat(inquiry: string, msgs: Message[], generate: boolean): Promise<ChatResponse> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inquiry_text: inquiry, messages: msgs, generate }),
  });
  if (!res.ok && res.status !== 422) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

export function useQuoteCreator() {
  const [phase, setPhase] = useState<Phase>("inquiry");
  const [inquiryText, setInquiryText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [title, setTitle] = useState("");
  const [clientQuestions, setClientQuestions] = useState<string[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sparseMessage, setSparseMessage] = useState("");
  const [savedTitle, setSavedTitle] = useState("");

  function resetForm() {
    setPhase("inquiry");
    setInquiryText("");
    setMessages([]);
    setQuestionCount(0);
    setCurrentQuestion("");
    setItems([]);
    setTitle("");
    setSavedTitle("");
    setSparseMessage("");
    setError("");
  }

  async function handleInquirySubmit(text: string) {
    setInquiryText(text);
    setSparseMessage("");
    setPhase("loading");
    try {
      const data = await callChat(text, [], false);
      if ("error" in data) {
        setPhase("inquiry");
        if (data.error === "inquiry_unusable") {
          setSparseMessage("Opis jest zbyt ogólny. Podaj zakres prac, technologię i oczekiwania — min. 3-4 zdania.");
        } else {
          setSparseMessage("Nie udało się przetworzyć zapytania. Spróbuj ponownie.");
        }
        return;
      }
      if (data.type === "sparse") {
        setQuestionsLoading(true);
        try {
          const questions = await callQuestions(text);
          setClientQuestions(questions);
          setPhase("questions");
        } catch (err) {
          setPhase("inquiry");
          setSparseMessage(is429(err) ? RATE_LIMIT_MSG : "Nie udało się wygenerować pytań. Spróbuj ponownie.");
        } finally {
          setQuestionsLoading(false);
        }
        return;
      }
      if (data.type === "complete") {
        setItems(data.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })));
        setTitle(data.title);
        setPhase("items");
        return;
      }
      setCurrentQuestion(data.content);
      setQuestionCount(1);
      setPhase("conversation");
    } catch (err) {
      setPhase("inquiry");
      setSparseMessage(is429(err) ? RATE_LIMIT_MSG : "Błąd połączenia z AI. Spróbuj ponownie.");
    }
  }

  const handleAnswer = useCallback(
    async (answer: string) => {
      const newMessages: Message[] = [
        ...messages,
        { role: "assistant", content: currentQuestion },
        { role: "user", content: answer },
      ];
      setMessages(newMessages);
      const newCount = questionCount + 1;

      const shouldGenerate = newCount > MAX_QUESTIONS;
      setPhase("loading");
      setError("");
      try {
        const data = await callChat(inquiryText, newMessages, shouldGenerate);
        if ("error" in data) {
          setPhase("conversation");
          setError("Błąd AI. Spróbuj odpowiedzieć ponownie.");
          return;
        }
        if (data.type === "sparse" || data.type === "complete") {
          if (data.type === "complete") {
            setItems(data.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })));
            setTitle(data.title);
          }
          setPhase(data.type === "complete" ? "items" : "inquiry");
          return;
        }
        setQuestionCount(newCount);
        setCurrentQuestion(data.content);
        setPhase("conversation");
      } catch (err) {
        setPhase("conversation");
        setError(is429(err) ? RATE_LIMIT_MSG : "Błąd połączenia. Spróbuj ponownie.");
      }
    },
    [messages, currentQuestion, questionCount, inquiryText],
  );

  const handleSkip = useCallback(async () => {
    const newMessages: Message[] = [
      ...messages,
      { role: "assistant", content: currentQuestion },
      { role: "user", content: "[pominięto]" },
    ];
    setMessages(newMessages);
    setPhase("loading");
    setError("");
    try {
      const data = await callChat(inquiryText, newMessages, true);
      if ("error" in data || data.type !== "complete") {
        setPhase("conversation");
        setError("Nie udało się wygenerować pozycji. Spróbuj ponownie.");
        return;
      }
      setItems(data.items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })));
      setTitle(data.title);
      setPhase("items");
    } catch (err) {
      setPhase("conversation");
      setError(is429(err) ? RATE_LIMIT_MSG : "Błąd połączenia. Spróbuj ponownie.");
    }
  }, [messages, currentQuestion, inquiryText]);

  async function handleGenerateQuestions(text: string) {
    setInquiryText(text);
    setSparseMessage("");
    setPhase("loading");
    setQuestionsLoading(true);
    try {
      const questions = await callQuestions(text);
      setClientQuestions(questions);
      setPhase("questions");
    } catch (err) {
      setPhase("inquiry");
      setSparseMessage(is429(err) ? RATE_LIMIT_MSG : "Nie udało się wygenerować pytań. Spróbuj ponownie.");
    } finally {
      setQuestionsLoading(false);
    }
  }

  function handleBackFromQuestions() {
    setPhase("inquiry");
    setClientQuestions([]);
  }

  async function handleSave(finalItems: QuoteItem[]) {
    if (phase === "saving") return;
    setPhase("saving");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, inquiry_text: inquiryText, content: { items: finalItems } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedTitle(title);
      setPhase("done");
    } catch {
      setPhase("items");
      setError("Błąd zapisu. Spróbuj ponownie.");
    }
  }

  return {
    state: {
      phase,
      inquiryText,
      messages,
      questionCount,
      currentQuestion,
      clientQuestions,
      questionsLoading,
      items,
      title,
      error,
      sparseMessage,
      savedTitle,
    },
    actions: {
      handleInquirySubmit,
      handleAnswer,
      handleSkip,
      handleSave,
      handleGenerateQuestions,
      handleBackFromQuestions,
      setItems,
      setError,
      resetForm,
      handleResetToInquiry: resetForm,
    },
  };
}
