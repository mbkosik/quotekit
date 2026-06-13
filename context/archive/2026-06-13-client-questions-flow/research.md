---
date: 2026-06-13T00:00:00+02:00
researcher: Mateusz Kosik
git_commit: b1eae98eb5118125210836ca389e713fff2b8ba0
branch: main
repository: quotekit
topic: "Generowanie listy pytań do klienta z lakonicznego briefu"
tags: [research, quote-creation, ai, client-questions, useQuoteCreator]
status: complete
last_updated: 2026-06-13
last_updated_by: Mateusz Kosik
---

# Research: Generowanie listy pytań do klienta z lakonicznego briefu

**Date**: 2026-06-13  
**Researcher**: Mateusz Kosik  
**Git Commit**: b1eae98eb5118125210836ca389e713fff2b8ba0  
**Branch**: main  
**Repository**: quotekit

## Research Question

Przy lakonicznym briefie AI ma zwrócić listę pytań do klienta, które można skopiować i wysłać przed właściwą wyceną.

## Summary

Kluczowe odkrycie: **istniejący flow już pyta AI o pytania wyjaśniające — ale jedno po jednym, w trybie interaktywnym wewnątrz aplikacji**. Żądana zmiana to coś innego: jednorazowe wygenerowanie *całej listy* pytań z lakonicznego briefu, które freelancer kopiuje i wysyła klientowi **przed** sesją wyceny.

Potrzebna jest nowa ścieżka (nie modyfikacja istniejącej):
- nowy endpoint `POST /api/ai/questions`
- nowa faza w `useQuoteCreator` lub osobny mini-flow
- nowy komponent z listą pytań + przycisk "Kopiuj wszystkie"

Integracja w `InquiryForm.tsx` — naturalny punkt wejścia, gdzie brief już istnieje.

## Detailed Findings

### 1. Obecny flow tworzenia wyceny

**Fazy state machine** (`src/components/hooks/useQuoteCreator.ts:4`):

| Faza | Opis |
|------|------|
| `inquiry` | Użytkownik wpisuje brief w textarea |
| `loading` | API przetwarza |
| `conversation` | AI zadaje pytania ONE-BY-ONE w UI |
| `items` | Edytor pozycji wyceny |
| `saving` | Zapis do bazy |
| `done` | Sukces |

**Brief** wchodzi przez `InquiryForm.tsx:27-37` jako pole textarea, state `text`, label "Wklej zapytanie klienta", min 20 znaków.

**MAX_QUESTIONS = 5** (`useQuoteCreator.ts:11`) — AI zadaje max 5 pytań jeden po jednym podczas fazy `conversation`.

### 2. Istniejące AI endpoints

| Endpoint | Plik | Tryb |
|----------|------|------|
| `POST /api/ai/chat` | `src/pages/api/ai/chat.ts` | Multi-turn: jedno pytanie lub generuj items. Zwraca `{type: "question"/"complete"/"sparse"}` |
| `POST /api/ai/scope` | `src/pages/api/ai/scope.ts` | Single-shot: bezpośrednia generacja items bez pytań |

Endpoint `/chat` zwraca `type: "sparse"` gdy brief jest za krótki — co jest naturalnym triggerem dla nowego flow.

### 3. Stack AI

- **SDK**: `@anthropic-ai/sdk ^0.100.1` (`package.json:18`)
- **Model**: `claude-haiku-4-5-20251001` (hardcoded w `chat.ts:64` i `scope.ts:74`)
- **Walidacja output**: Zod + `zodOutputFormat()` z SDK helpers
- **Client factory**: `src/lib/anthropic.ts` — `createAnthropicClient()`
- **Rate limit**: `src/lib/rate-limit.ts` — 20 req/60s per user
- **Auth guard**: wszystkie AI endpointy wymagają `context.locals.user`

### 4. Punkt integracji — InquiryForm + hook

**`src/components/quotes/InquiryForm.tsx`** (59 linii):
- renderuje textarea na brief
- po submit wywołuje `handleInquirySubmit` z hooka
- naturalny punkt na dodanie przycisku "Generuj pytania do klienta"

**`src/components/quotes/useQuoteCreator.ts`** (182 linie):
- zarządza całym stanem — dodanie fazy `questions` jest tutaj

**`src/components/quotes/QuoteCreator.tsx`** (61 linii):
- router po fazach — tutaj podpinamy nowy komponent listy pytań

## Architecture Insights

### Proponowane podejście implementacji

**Nowa faza w state machine**: dodać `questions` między `inquiry` a `conversation`:

```
inquiry → loading → questions  ← NOWE (gdy brief jest krótki)
                 ↓
              conversation (gdy brief OK, odpowiedź na pytania)
```

**Nowy endpoint** `POST /api/ai/questions`:
- przyjmuje `{ inquiry_text: string }`
- zwraca `{ questions: string[] }` (5-7 pytań)
- osobny prompt nastawiony na generację listy, nie dialog
- rate limit przez `checkRateLimit()` — tak jak pozostałe endpointy

**Nowy komponent** `QuestionsList.tsx` (w `src/components/quotes/`):
- lista pytań z checkboxami lub numerowana
- przycisk "Kopiuj wszystkie" (`navigator.clipboard.writeText`)
- przycisk "Mam odpowiedzi — idź dalej" → wraca do `inquiry` z briefem

**Trigger**: Albo explicite przycisk w `InquiryForm`, albo auto-trigger gdy `type: "sparse"` z `/chat` — **rekomendacja: explicite przycisk** (użytkownik świadomie wybiera pre-quote flow).

**Hook** — zgodnie z lessons.md: logika nowej fazy idzie do `useQuoteCreator.ts`, nie do komponentu.

## Code References

- `src/components/quotes/InquiryForm.tsx:27-37` — textarea briefu, punkt wejścia dla nowego przycisku
- `src/components/hooks/useQuoteCreator.ts:4` — definicja faz state machine
- `src/components/hooks/useQuoteCreator.ts:11` — `MAX_QUESTIONS = 5`
- `src/components/quotes/QuoteCreator.tsx:1-61` — router po fazach, tu podpinamy nowy komponent
- `src/pages/api/ai/chat.ts:20-27` — system prompt (pytania wyjaśniające)
- `src/pages/api/ai/scope.ts` — pattern do skopiowania dla nowego endpointu
- `src/lib/anthropic.ts` — `createAnthropicClient()` — używać tutaj
- `src/lib/rate-limit.ts` — `checkRateLimit()` — dodać do nowego endpointu
- `src/types.ts:13-19` — `QuoteItemSchema` — pattern do skopiowania dla `QuestionsSchema`

## Historical Context

- `context/archive/ai-quote-creation-flow/` — zbudowany interaktywny flow pytań (one-by-one). Nowa zmiana to komplementarny pre-quote flow, nie zastąpienie.
- `context/archive/ai-integration-scaffold/` — podstawowy setup Anthropic SDK.

## Open Questions

1. **Trigger**: explicite przycisk vs auto-trigger gdy brief < N znaków — do decyzji w planie.
2. **Liczba pytań**: 5-7? Czy konfigurowalnie? Na start: stała 5-6.
3. **Format kopiowania**: plain text (jeden q per linia) vs Markdown — plain text bardziej universalny dla emaila.
4. **Powrót po pytaniach**: czy użytkownik wkleja odpowiedzi klienta do briefu i zaczyna od nowa, czy mamy drugi krok "wklej odpowiedzi" — do decyzji w planie.
