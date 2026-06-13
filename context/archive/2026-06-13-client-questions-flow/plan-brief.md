# Client Questions Flow — Plan Brief

> Full plan: `context/changes/client-questions-flow/plan.md`
> Research: `context/changes/client-questions-flow/research.md`

## What & Why

Przy lakonicznym briefie freelancer nie wie co zapytać klienta przed wyceną. Dodajemy ścieżkę pre-quote: AI generuje listę 5–7 pytań wyjaśniających, którą freelancer kopiuje i wysyła klientowi mejlem/Slackiem — zanim zacznie właściwą sesję wyceny.

## Starting Point

Istniejący flow już zadaje pytania AI — ale jeden po jednym, w interaktywnym dialogu wewnątrz apki (faza `conversation`). Gdy brief jest za krótki (`type: "sparse"`), apka pokazuje błąd "Zapytanie jest zbyt ogólne". Brak ścieżki do wygenerowania całej listy pytań naraz.

## Desired End State

W formularzu wyceny pojawiają się dwa przyciski: dotychczasowy "Analizuj zapytanie" i nowy "Generuj pytania do klienta". Ten drugi (lub automatycznie przy sparse briefie) otwiera ekran z listą pytań, przyciskiem "Kopiuj wszystkie" (plain text, numerated) i "Wróć do wyceny" z zachowanym briefem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Trigger | Explicite przycisk + auto na sparse | Świadomy wybór użytkownika; sparse nie powinien pokazywać błędu | Plan |
| Return flow | Prosty powrót do formularza | Zero dodatkowej logiki; brief zachowany w textarea | Plan |
| Liczba pytań | 5–7 (AI decyduje) | Lepsze dopasowanie do złożoności briefu niż stała liczba | Plan |
| Copy feedback | Inline zmiana etykiety przycisku | Zero dodatkowych komponentów, wzorzec shadcn/ui | Plan |
| Endpoint pattern | Kopia scope.ts | Spójny z istniejącym stylem, wszystkie guardy gotowe | Research |

## Scope

**In scope:**
- Nowy endpoint `POST /api/ai/questions` → `{ questions: string[] }`
- Nowa faza `"questions"` w state machine hooka
- Nowy komponent `ClientQuestionsList.tsx`
- Rozszerzenie `InquiryForm.tsx` (drugi przycisk + `defaultValue`)
- Rozszerzenie `QuoteCreator.tsx` (nowy branch + przekazanie akcji)

**Out of scope:**
- Zapis pytań do bazy
- Krok "wklej odpowiedzi klienta"
- Modyfikacja istniejącego conversation flow
- Konfiguracja liczby pytań przez użytkownika

## Architecture / Approach

Nowy endpoint `/api/ai/questions` (wzorzec `scope.ts`) przyjmuje brief i zwraca listę pytań przez Zod-walidowany structured output. Hook `useQuoteCreator` dostaje nową fazę `"questions"` i dwie akcje: `handleGenerateQuestions` (z przycisku) + auto-trigger gdy `/api/ai/chat` zwróci `sparse`. `ClientQuestionsList` to stateless komponent z copy-to-clipboard i callbackiem powrotu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Endpoint + stan | Działający endpoint + hook z nową fazą | Prompt może generować za mało pytań dla prostych briefów |
| 2. UI — komponenty | Pełna ścieżka widoczna w przeglądarce | Clipboard API — brak w HTTP (wymaga HTTPS lub localhost) |

**Prerequisites:** Działające środowisko lokalne z Supabase i kluczem `ANTHROPIC_KEY` w `.dev.vars`  
**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- `navigator.clipboard.writeText` wymaga HTTPS lub localhost — w lokalnym devie działa, na deploymencie Cloudflare też (HTTPS)
- AI może generować pytania o zmiennej jakości dla bardzo lakonicznych briefów (np. "strona") — akceptowalne na MVP
- Faza `loading` jest współdzielona przez oba flow (questions i chat) — użytkownik widzi "Analizuję..." w obu przypadkach

## Success Criteria (Summary)

- Kliknięcie "Generuj pytania" → lista 5–7 pytań w UI, kopiowalna jednym kliknięciem
- Sparse brief + "Analizuj zapytanie" → automatyczna lista pytań zamiast błędu
- Istniejący conversation flow bez regresji
