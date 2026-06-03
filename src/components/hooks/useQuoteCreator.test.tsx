import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuoteCreator } from "@/components/hooks/useQuoteCreator";

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
    // [{ role: "assistant", content: "What is the deadline?" }, { role: "user", content: "In 2 months" }]
    expect(result.current.state.messages.length).toBe(2);
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
    expect(result.current.state.messages.length).toBe(2); // optimistic append preserved
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
    expect(result.current.state.items).toEqual(items);

    // items → done
    fetchMock.mockReturnValueOnce(jsonResponse({ id: "q1" }));
    await act(() => result.current.actions.handleSave(items));

    expect(result.current.state.phase).not.toBe("loading"); // Behavior C
    expect(result.current.state.phase).toBe("done");
    expect(result.current.state.savedTitle).toBe("Dashboard App");

    // done → inquiry (3s auto-reset timer)
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.state.phase).toBe("inquiry");
    expect(result.current.state.items).toEqual([]);
    expect(result.current.state.messages).toEqual([]);

    vi.useRealTimers();
  });
});
