# Client Questions Flow — Implementation Plan

## Overview

Dodajemy ścieżkę pre-quote, w której przy lakonicznym briefie AI generuje listę 5–7 pytań do klienta. Freelancer kopiuje pytania i wysyła klientowi przed właściwą sesją wyceny. Istniejący interactive Q&A flow (faza `conversation`) pozostaje bez zmian — to dwie uzupełniające się ścieżki.

## Current State Analysis

Flow tworzenia wyceny to state machine z fazami:

```
inquiry → loading → conversation (pytania one-by-one) → items → saving → done
```

Gdy `/api/ai/chat` zwraca `type: "sparse"`, hook pokazuje błąd "Zapytanie jest zbyt ogólne" i zostaje w fazie `inquiry`. Nie ma osobnej ścieżki dla lakonicznych briefów.

**Kluczowe pliki:**
- `src/components/hooks/useQuoteCreator.ts:4` — definicja Phase type; plik zarządza całym stanem
- `src/components/quotes/InquiryForm.tsx:43-56` — jeden przycisk "Analizuj zapytanie"; min 20 znaków walidacji
- `src/components/quotes/QuoteCreator.tsx:60` — router: fallback renderuje InquiryForm
- `src/pages/api/ai/scope.ts` — czysty wzorzec do skopiowania dla nowego endpointu

## Desired End State

Użytkownik wpisuje brief (krótki lub długi) i może wybrać dwie ścieżki:
1. **Analizuj zapytanie** — dotychczasowy flow (bez zmian)
2. **Generuj pytania do klienta** — nowa ścieżka: AI generuje 5–7 pytań → lista z przyciskiem "Kopiuj wszystkie" + "Wróć do wyceny"

Dodatkowo: gdy **istniejący flow** wykryje `type: "sparse"` (brief za ogólny), automatycznie przechodzi do listy pytań zamiast pokazywać błąd.

**Weryfikacja końcowa:**
- Wpisanie krótkiego briefu i kliknięcie "Generuj pytania" → wyświetla listę 5–7 pytań
- Kliknięcie "Kopiuj wszystkie" → schowek zawiera pytania jako plain text, przycisk zmienia się na "Skopiowano!" przez 2s
- Kliknięcie "Wróć do wyceny" → formularz z zachowanym briefem w textarea
- Wpisanie bardzo krótkiego briefu i kliknięcie "Analizuj zapytanie" → sparse → automatyczne pytania (brak błędu)
- Istniejący flow (dłuższy brief) → bez zmian

### Key Discoveries:

- `scope.ts` to wzorzec do skopiowania 1:1 — auth guard, client factory, Zod schema, `zodOutputFormat()`, identyczny error handling
- `useQuoteCreator.ts` zwraca `{ state, actions }` — Phase type i stan dodajemy w jednym miejscu
- `InquiryForm.tsx` ma lokalny stan `text` — przy powrocie z fazy `questions` brief musi wróci do textarea przez nowy prop `defaultValue`
- `sparseMessage` stan pozostaje w hook — używany jako fallback gdy questions endpoint zawiedzie
- Brak rate-limitingu na poziomie endpointów (middleware-level) — nowy endpoint nie musi go dodawać

## What We're NOT Doing

- Nie modyfikujemy istniejącego `/api/ai/chat` ani interactive conversation flow
- Brak "wklej odpowiedzi klienta" kroku — użytkownik wraca ręcznie z odpowiedziami
- Brak historii / zapisu wygenerowanych pytań do bazy
- Brak konfigurowalnej liczby pytań przez użytkownika
- Nie zmieniamy `/api/ai/scope` ani żadnych innych endpointów

## Implementation Approach

Faza 1 buduje niezależny backend i rozszerza hook (bez zmian UI). Faza 2 podpina UI — wszystkie zmiany widoczne dla użytkownika dopiero po obu fazach.

Wzorzec endpointu: kopia `scope.ts` ze zmienioną Zod schema i system promptem.

## Critical Implementation Details

**`defaultValue` w InquiryForm**: komponent unmountuje i remountuje przy zmianie fazy — `useState(defaultValue ?? "")` zadziała tylko jeśli `defaultValue` jest przekazany przy pierwszym renderze. QuoteCreator musi przekazać `inquiryText` ze stanu hooka zawsze (nie tylko po powrocie z questions).

**Sparse → auto-questions**: `handleInquirySubmit` na `type === "sparse"` woła `callQuestions(text)` sekwencyjnie — dwa fetch'e pod jednym `phase === "loading"`. Użytkownik widzi jeden spinner. Jeśli questions endpoint zawiedzie po sparse, wtedy (i tylko wtedy) pokazujemy `sparseMessage`.

---

## Phase 1: Endpoint + stan

### Overview

Nowy API endpoint zwracający listę pytań. Rozszerzenie hooka o nową fazę, stan i akcje. Modyfikacja `handleInquirySubmit` by sparse triggerował questions zamiast błędu.

### Changes Required:

#### 1. Nowy endpoint

**File**: `src/pages/api/ai/questions.ts`

**Intent**: Przyjmuje `inquiry_text`, zwraca `{ questions: string[] }` z 5–7 pytaniami wyjaśniającymi w języku polskim. Wzorzec implementacji identyczny z `scope.ts`.

**Contract**: `POST /api/ai/questions`, body `{ inquiry_text: string (min 20) }`, response `200 { questions: string[] }` lub `400`/`401`/`502`/`503`. Zod output schema: `QuestionsOutputSchema = z.object({ questions: z.array(z.string()).min(5).max(7) })`. System prompt: generuj 5–7 konkretnych, jednoznacznych pytań po polsku, dotyczących zakresu, tech stacku, terminu, budżetu, istniejących zasobów i wymagań hostingowych — jedno pytanie, nie wieloczęściowe. Na błąd Anthropic zwróć `{ error: "AI service error" }` status 502 (identycznie jak w scope.ts).

#### 2. Rozszerzenie Phase type i stanu w hooku

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Dodanie fazy `"questions"` do union type oraz stanu `clientQuestions: string[]`. Nowe wewnętrzna funkcja `callQuestions(text)` wywołuje nowy endpoint i przełącza fazę.

**Contract**: 
- Phase type (linia 4): dodaj `"questions"` do union
- Nowy useState: `const [clientQuestions, setClientQuestions] = useState<string[]>([])`
- Prywatna funkcja `callQuestions(text: string): Promise<void>` — fetch do `/api/ai/questions`, na sukces: `setClientQuestions(data.questions); setPhase("questions")`, na błąd: throw
- W zwracanym obiekcie: `state` dostaje `clientQuestions`, `actions` dostaje `handleGenerateQuestions` i `handleBackFromQuestions` (zdefiniowane w punkcie 3)

#### 3. Nowe akcje publiczne w hooku

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: `handleGenerateQuestions` — explicite ścieżka z formularza. `handleBackFromQuestions` — powrót z listy pytań do formularza z zachowanym briefem.

**Contract**:
- `handleGenerateQuestions(text: string)`: `setInquiryText(text); setSparseMessage(""); setPhase("loading")` → `callQuestions(text)` w try/catch → on catch: `setPhase("inquiry"); setSparseMessage("Nie udało się wygenerować pytań. Spróbuj ponownie.")`
- `handleBackFromQuestions()`: `setPhase("inquiry"); setClientQuestions([])`

#### 4. Modyfikacja handleInquirySubmit — sparse branch

**File**: `src/components/hooks/useQuoteCreator.ts:54-58`

**Intent**: Zamiast ustawiać `sparseMessage` i wracać do `inquiry`, gdy `type === "sparse"` automatycznie generujemy pytania dla klienta.

**Contract**: Zastąp istniejący blok `if (data.type === "sparse")`: zachowaj `phase === "loading"`, wołaj `callQuestions(text)` w try/catch — on catch: `setPhase("inquiry"); setSparseMessage("Zapytanie jest za krótkie. Spróbuj dodać więcej szczegółów.")`. `sparseMessage` state i prop pozostają w interfejsie (fallback gdy questions endpoint zawiedzie).

### Success Criteria:

#### Automated Verification:

- TypeScript kompiluje bez błędów: `npm run build`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- `curl -X POST /api/ai/questions` z krótkim briefem (>20 znaków) → odpowiedź `{ questions: [...] }` z 5–7 elementami
- Wywołanie z briefem <20 znaków → 400
- Wywołanie bez autoryzacji → 401
- Stan hooka eksponuje `clientQuestions`, `handleGenerateQuestions`, `handleBackFromQuestions`

**Implementation Note**: Po zakończeniu fazy 1 poczekaj na potwierdzenie weryfikacji manualnej zanim przejdziesz do UI.

---

## Phase 2: UI — komponenty

### Overview

Nowy komponent listy pytań. Rozszerzenie InquiryForm o drugi przycisk i `defaultValue`. Rozszerzenie QuoteCreator o nową gałąź i przekazanie nowych akcji.

### Changes Required:

#### 1. Nowy komponent listy pytań

**File**: `src/components/quotes/ClientQuestionsList.tsx`

**Intent**: Wyświetla numerowaną listę pytań, przycisk kopiowania ze zmianą etykiety na 2 sekundy, przycisk powrotu do formularza.

**Contract**: Props `{ questions: string[]; onBack: () => void }`. Stan lokalny `copied: boolean`. "Kopiuj wszystkie": `navigator.clipboard.writeText(questions.map((q, i) => \`${i + 1}. ${q}\`).join("\n"))` → `setCopied(true)` → `setTimeout(() => setCopied(false), 2000)`. Styl spójny z istniejącymi komponentami: `rounded-2xl border border-white/10 bg-white/5`, tekst w `text-white/80`, akcent `text-purple-400`, przycisk główny `bg-purple-600`. "Wróć do wyceny" jako secondary button z `border border-white/10`.

#### 2. Rozszerzenie InquiryForm

**File**: `src/components/quotes/InquiryForm.tsx`

**Intent**: Dodanie prop `onGenerateQuestions` (nowy przycisk) i `defaultValue` (zachowanie briefu po powrocie z questions). 

**Contract**: 
- Dodaj do Props interface: `onGenerateQuestions: (text: string) => void` + `defaultValue?: string`
- Zmień init stanu: `useState(defaultValue ?? "")`  
- Nowy przycisk `type="button"` (nie submit) z labelem "Generuj pytania do klienta" — ta sama walidacja min 20 znaków co submit; woła `onGenerateQuestions(text.trim())`. Styl: `border border-white/10 text-white/70 hover:bg-white/5` (secondary, mniej prominentny niż main CTA). Disabled gdy `loading`.

#### 3. Rozszerzenie QuoteCreator

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Podpięcie nowego komponentu do routera fazowego i przekazanie nowych akcji/stanu do InquiryForm.

**Contract**:
- Dodaj import `ClientQuestionsList`
- Destructure z `state`: `clientQuestions`; z `actions`: `handleGenerateQuestions`, `handleBackFromQuestions`
- Dodaj branch **przed** final `return <InquiryForm .../>`: `if (phase === "questions") return <ClientQuestionsList questions={clientQuestions} onBack={handleBackFromQuestions} />`
- Uzupełnij props InquiryForm: `onGenerateQuestions={handleGenerateQuestions}` i `defaultValue={inquiryText}`

### Success Criteria:

#### Automated Verification:

- TypeScript kompiluje bez błędów: `npm run build`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Wpisanie krótkiego briefu (>20 znaków) + kliknięcie "Generuj pytania do klienta" → lista 5–7 pytań
- Kliknięcie "Kopiuj wszystkie" → etykieta zmienia się na "Skopiowano!" i wraca po 2s; schowek zawiera pytania ponumerowane jako plain text
- Kliknięcie "Wróć do wyceny" → formularz z briefem zachowanym w textarea
- Wpisanie bardzo krótkiego/ogólnego briefu + "Analizuj zapytanie" → sparse → automatyczna lista pytań (brak czerwonego błędu)
- Istniejący flow z dłuższym briefem → bez regresji (conversation flow działa jak dotąd)
- Wyświetlanie na mobile (max-w-2xl, brak overflow)

---

## Testing Strategy

### Manual Testing Steps:

1. Brief = "Strona www" (>20 znaków) → "Generuj pytania" → lista 5–7 pytań w UI
2. Brief = "Aplikacja mobilna iOS do zarządzania zadaniami z powiadomieniami" → "Generuj pytania" → lista pytań
3. Klik "Kopiuj wszystkie" → sprawdź schowek (wklej w edytor) — numeracja, plain text
4. Klik "Wróć" → textarea zawiera oryginalny brief
5. Brief = "xd" (za krótki, <20 znaków) → "Generuj pytania" → walidacja blokuje, błąd inline
6. Brief ogólny, "Analizuj zapytanie" → sparse case → automatyczne pytania zamiast błędu
7. Długi szczegółowy brief → "Analizuj zapytanie" → normalny flow (conversation / items) bez zmian

## References

- Research: `context/changes/client-questions-flow/research.md`
- Wzorzec endpointu: `src/pages/api/ai/scope.ts`
- Hook: `src/components/hooks/useQuoteCreator.ts`
- Router: `src/components/quotes/QuoteCreator.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Endpoint + stan

#### Automated

- [x] 1.1 TypeScript kompiluje bez błędów: `npm run build` — 3ee4b8a
- [x] 1.2 Lint przechodzi: `npm run lint` — 3ee4b8a

#### Manual

- [ ] 1.3 `/api/ai/questions` z poprawnym briefem zwraca `{ questions: [...] }` z 5–7 elementami
- [ ] 1.4 Wywołanie z briefem <20 znaków → 400
- [ ] 1.5 Wywołanie bez autoryzacji → 401
- [ ] 1.6 Stan hooka eksponuje `clientQuestions`, `handleGenerateQuestions`, `handleBackFromQuestions`

### Phase 2: UI — komponenty

#### Automated

- [x] 2.1 TypeScript kompiluje bez błędów: `npm run build` — cd79f21
- [x] 2.2 Lint przechodzi: `npm run lint` — cd79f21

#### Manual

- [x] 2.3 Brief + "Generuj pytania" → lista 5–7 pytań w UI — cd79f21
- [x] 2.4 "Kopiuj wszystkie" → etykieta zmienia się na "Skopiowano!" i wraca po 2s; schowek zawiera pytania ponumerowane — cd79f21
- [x] 2.5 "Wróć do wyceny" → formularz z briefem zachowanym w textarea — cd79f21
- [x] 2.6 Sparse brief + "Analizuj zapytanie" → automatyczna lista pytań bez błędu — cd79f21
- [x] 2.7 Istniejący flow z dłuższym briefem bez regresji — cd79f21
