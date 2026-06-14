import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuoteCreator, MAX_QUESTIONS } from "@/components/hooks/useQuoteCreator";

// Behavior C: every await act() below asserts phase !== "loading"
// (implicitly via the specific phase assertion that follows each act).
// A catch block that forgets to reset phase would leave "loading" — caught here.

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Behavior A: mid-conversation error stays in "conversation"
// Oracle: PRD FR-005 — the clarifying conversation is a session; an error must
// not destroy the context the user already built (messages + current question).
// ---------------------------------------------------------------------------

describe("Behavior A: mid-conversation error stays in conversation", () => {
  it("stays in conversation with messages preserved on network error", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    // Reach conversation state
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "What is the deadline?" }));
    await act(() => result.current.actions.handleInquirySubmit("Client wants a landing page redesign with modern UI"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("conversation");

    // handleAnswer appends messages optimistically before the fetch (line 76–81
    // of useQuoteCreator.ts). A thrown fetch leaves those messages in place.
    fetchMock.mockReturnValueOnce(Promise.reject(new Error("network")));
    await act(() => result.current.actions.handleAnswer("In 2 months"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("conversation");
    expect(result.current.state.messages).toEqual([
      { role: "assistant", content: "What is the deadline?" },
      { role: "user", content: "In 2 months" },
    ]);
    expect(result.current.state.error).toBeTruthy();
  });

  it("stays in conversation with messages preserved on API error response", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    // Reach conversation state
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "What is the deadline?" }));
    await act(() => result.current.actions.handleInquirySubmit("Client wants a landing page redesign with modern UI"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("conversation");

    // { error: "..." } response — handled by the "error" in data branch (line 89)
    fetchMock.mockReturnValueOnce(jsonResponse({ error: "AI service unavailable" }));
    await act(() => result.current.actions.handleAnswer("In 2 months"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("conversation");
    expect(result.current.state.messages).toEqual([
      { role: "assistant", content: "What is the deadline?" },
      { role: "user", content: "In 2 months" },
    ]);
    expect(result.current.state.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Behavior B: save failure preserves edited items
// Oracle: PRD FR-007 + FR-010 — editing and saving are separate steps; a save
// error must not destroy the editing session or force the user to re-edit.
// ---------------------------------------------------------------------------

describe("Behavior B: save failure preserves edited items", () => {
  it("stays in items phase with edited items intact on save HTTP error", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    const aiItems = [{ task: "Design", hours: 10, rate: 150 }];

    // Reach conversation state
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "What is the budget?" }));
    await act(() =>
      result.current.actions.handleInquirySubmit("Client wants a complete brand identity redesign project"),
    );

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C

    // Reach items state
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items: aiItems, title: "Brand Identity" }));
    await act(() => result.current.actions.handleAnswer("Around 5000 PLN"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("items");

    // User edits items via the exposed setItems action
    const editedItems = [{ task: "Design", hours: 8, rate: 200 }];
    act(() => {
      result.current.actions.setItems(editedItems);
    });

    // handleSave calls fetch("/api/quotes") directly — 500 triggers the catch
    fetchMock.mockReturnValueOnce(jsonResponse({}, 500));
    await act(() => result.current.actions.handleSave(editedItems));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("items");
    // items state is never touched by handleSave on failure — edited items survive
    expect(result.current.state.items).toEqual(editedItems);
    expect(result.current.state.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Golden path smoke
// Oracle: PRD US-01 — the full inquiry → clarification → line items → save
// flow must complete and leave the form ready for the next quote.
// ---------------------------------------------------------------------------

describe("Golden path", () => {
  it("transitions through inquiry → conversation → items → done → inquiry", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useQuoteCreator());

    // inquiry → conversation
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "What is the tech stack?" }));
    await act(() => result.current.actions.handleInquirySubmit("Client wants a dashboard web app with real-time data"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("conversation");
    expect(result.current.state.currentQuestion).toBe("What is the tech stack?");

    // conversation → items
    const items = [{ task: "Dev", hours: 5, rate: 100 }];
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items, title: "Dashboard App" }));
    await act(() => result.current.actions.handleAnswer("React and TypeScript"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("items");
    expect(result.current.state.title).toBe("Dashboard App");
    expect(result.current.state.items).toMatchObject(items);

    // items → done
    fetchMock.mockReturnValueOnce(jsonResponse({ id: "q1" }));
    await act(() => result.current.actions.handleSave(items));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("done");
    expect(result.current.state.savedTitle).toBe("Dashboard App");
  });
});

// ---------------------------------------------------------------------------
// handleInquirySubmit error paths (L5)
// Oracle: three non-happy branches in handleInquirySubmit — API error, sparse
// response, and immediate complete — each must set the correct phase/sparseMessage.
// ---------------------------------------------------------------------------

describe("handleInquirySubmit error and edge paths", () => {
  it("returns to inquiry with sparseMessage on API error response", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    fetchMock.mockReturnValueOnce(jsonResponse({ error: "AI service unavailable" }));
    await act(() => result.current.actions.handleInquirySubmit("Build me a website"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("inquiry");
    expect(result.current.state.sparseMessage).toBeTruthy();
  });

  it("returns to inquiry with sparseMessage on sparse response", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    fetchMock.mockReturnValueOnce(jsonResponse({ type: "sparse" }));
    await act(() => result.current.actions.handleInquirySubmit("Something"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("inquiry");
    expect(result.current.state.sparseMessage).toBeTruthy();
  });

  it("goes directly to items on complete response without entering conversation", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    const items = [{ task: "Dev", hours: 10, rate: 100 }];
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items, title: "Direct Quote" }));
    await act(() => result.current.actions.handleInquirySubmit("Very detailed project description with full spec"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("items");
    expect(result.current.state.items).toMatchObject(items);
    expect(result.current.state.title).toBe("Direct Quote");
  });
});

// ---------------------------------------------------------------------------
// Behavior D: MAX_QUESTIONS threshold triggers generation (L1)
// Oracle: after MAX_QUESTIONS answers, callChat is invoked with generate: true;
// a complete response must move the hook to "items". Without this test, mutations
// on the > operator and arithmetic around questionCount survive undetected.
// ---------------------------------------------------------------------------

describe("Behavior D: MAX_QUESTIONS answers trigger generation", () => {
  it("reaches items after MAX_QUESTIONS answers", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    // handleInquirySubmit sets questionCount = 1
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "Q1?" }));
    await act(() => result.current.actions.handleInquirySubmit("Build me an app"));
    expect(result.current.state.phase).toBe("conversation");

    // Answers 1 to MAX_QUESTIONS-1: newCount stays ≤ MAX_QUESTIONS → generate: false
    for (let i = 0; i < MAX_QUESTIONS - 1; i++) {
      fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: `Q${i + 2}?` }));
      await act(() => result.current.actions.handleAnswer(`Answer ${i + 1}`));
      expect(result.current.state.phase).not.toBe("loading"); // Behavior C
      expect(result.current.state.phase).toBe("conversation");
    }

    // MAX_QUESTIONS-th answer: newCount = MAX_QUESTIONS + 1 → generate: true → complete
    const items = [{ task: "Dev", hours: 10, rate: 100 }];
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items, title: "App" }));
    await act(() => result.current.actions.handleAnswer("Final answer"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("items");
    expect(result.current.state.items).toMatchObject(items);
  });
});

// ---------------------------------------------------------------------------
// Behavior E: sparse response in handleAnswer resets to inquiry (L2)
// Oracle: a sparse response mid-conversation means the AI cannot proceed;
// the hook must return to "inquiry" so the user can refine their input.
// ---------------------------------------------------------------------------

describe("Behavior E: sparse response in handleAnswer resets to inquiry", () => {
  it("returns to inquiry on sparse response during conversation", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "What is the budget?" }));
    await act(() => result.current.actions.handleInquirySubmit("Build me an app"));
    expect(result.current.state.phase).toBe("conversation");

    fetchMock.mockReturnValueOnce(jsonResponse({ type: "sparse" }));
    await act(() => result.current.actions.handleAnswer("I don't know"));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("inquiry");
  });
});

// ---------------------------------------------------------------------------
// handleSave re-entry guard (L3)
// Oracle: double-submit while a save is in flight must not issue a second
// fetch call — the guard (if phase === "saving") return; exists specifically
// for this scenario.
// ---------------------------------------------------------------------------

describe("handleSave re-entry guard", () => {
  it("second handleSave while saving is a no-op", async () => {
    const { result } = renderHook(() => useQuoteCreator());

    // Reach items state
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "question", content: "Q?" }));
    await act(() => result.current.actions.handleInquirySubmit("Build me an app"));
    const items = [{ task: "Dev", hours: 5, rate: 100 }];
    fetchMock.mockReturnValueOnce(jsonResponse({ type: "complete", items, title: "App" }));
    await act(() => result.current.actions.handleAnswer("Yes"));
    expect(result.current.state.phase).toBe("items");

    // Controlled promise keeps the save fetch in flight
    let resolveSave!: (v: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolveSave = r)));

    // Void pattern: act() sees a synchronous callback and flushes only the
    // synchronous setPhase("saving") — the awaited fetch() stays pending.
    act(() => {
      void result.current.actions.handleSave(items);
    });
    expect(result.current.state.phase).toBe("saving");

    // Second call while phase === "saving" — guard returns early, no new fetch
    await act(() => result.current.actions.handleSave(items));
    // fetchMock calls: 2 setup + 1 save attempt (not 4)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Resolve the pending save; await Promise.resolve() lets the handleSave
    // continuation run inside act so React flushes the resulting state updates.
    await act(async () => {
      resolveSave(
        new Response(JSON.stringify({ id: "q1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await Promise.resolve();
    });
  });
});
