import { useState, useCallback, useRef, useEffect } from "react";
import type { QuoteItem, Message } from "@/types";

export type Phase = "inquiry" | "loading" | "conversation" | "items" | "saving" | "done";
export type QuoteItemUI = QuoteItem & { id: string };

const withId = (items: QuoteItem[]): QuoteItemUI[] => items.map((item) => ({ ...item, id: crypto.randomUUID() }));

type ChatResponse =
  | { type: "question"; content: string }
  | { type: "sparse" }
  | { type: "complete"; items: QuoteItem[]; title: string }
  | { error: string };

export const MAX_QUESTIONS = 5;

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
  const [items, setItems] = useState<QuoteItemUI[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [sparseMessage, setSparseMessage] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function handleInquirySubmit(text: string) {
    setInquiryText(text);
    setSparseMessage("");
    setPhase("loading");
    try {
      const data = await callChat(text, [], false);
      if ("error" in data) {
        setPhase("inquiry");
        setSparseMessage("Nie udało się przetworzyć zapytania. Spróbuj ponownie.");
        return;
      }
      if (data.type === "sparse") {
        setPhase("inquiry");
        setSparseMessage("Zapytanie jest zbyt ogólne. Dodaj więcej szczegółów o projekcie.");
        return;
      }
      if (data.type === "complete") {
        setItems(withId(data.items));
        setTitle(data.title);
        setPhase("items");
        return;
      }
      setCurrentQuestion(data.content);
      setQuestionCount(1);
      setPhase("conversation");
    } catch {
      setPhase("inquiry");
      setSparseMessage("Błąd połączenia z AI. Spróbuj ponownie.");
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
            setItems(withId(data.items));
            setTitle(data.title);
          }
          setPhase(data.type === "complete" ? "items" : "inquiry");
          return;
        }
        setQuestionCount(newCount);
        setCurrentQuestion(data.content);
        setPhase("conversation");
      } catch {
        setPhase("conversation");
        setError("Błąd połączenia. Spróbuj ponownie.");
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
      setItems(withId(data.items));
      setTitle(data.title);
      setPhase("items");
    } catch {
      setPhase("conversation");
      setError("Błąd połączenia. Spróbuj ponownie.");
    }
  }, [messages, currentQuestion, inquiryText]);

  async function handleSave(finalItems: QuoteItemUI[]) {
    if (phase === "saving") return;
    setPhase("saving");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          inquiry_text: inquiryText,
          content: { items: finalItems.map(({ id: _id, ...rest }) => rest) },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedTitle(title);
      setPhase("done");
      resetTimerRef.current = setTimeout(() => {
        setPhase("inquiry");
        setInquiryText("");
        setMessages([]);
        setQuestionCount(0);
        setCurrentQuestion("");
        setItems([]);
        setTitle("");
        setSavedTitle("");
        setSparseMessage("");
      }, 3000);
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
      items,
      title,
      error,
      sparseMessage,
      savedTitle,
    },
    actions: { handleInquirySubmit, handleAnswer, handleSkip, handleSave, setItems, setError },
  };
}
