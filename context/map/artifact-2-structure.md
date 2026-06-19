# Artifact 2 — Structure Map

> Analiza statyczna grafu zależności (`dependency-cruiser 17.4.3`).
> Dane z sesji 2026-06-15. Zakres: 47 modułów `.ts`/`.tsx`, 87 zależności wewnętrznych `src/`.
> Pliki `.astro` i routing-level coupling (HTML form action, Astro islands) są **niewidoczne** dla tego narzędzia.

---

## Konfiguracja skanowania

Alias `@/` wymagał ręcznego mapowania przez webpack config (`@` → `./src`). Bez tego dependency-cruiser zwraca 0 modułów — domyślna konfiguracja nie rozwiązuje aliasów TypeScript z `tsconfig.json` w v17. Konfiguracja zapisana w `/tmp/dc-webpack.cjs` (tymczasowa, nietrwała między sesjami).

---

## Wynik 1 — Cykle

**Graf importów jest acyklicznym grafem skierowanym (DAG). Brak cykli.**

Jedyna flaga: `useQuoteCreator.test.ts → useQuoteCreator.ts` — plik testowy importujący swój subject, nie rzeczywisty cykl.

### Dlaczego mimo braku cykli są ryzyka przy zmianach

Coupling widoczny w git (`components/quotes ↔ components/hooks`, 12× co-change) nie wynika z cykli importów — wynika z tego, że granica hook/komponent jest umowna, nie architektonicznie wymuszona. Żadne narzędzie nie blokuje hookaA przed importem komponentu B.

---

## Wynik 2 — Granice warstw

Wszystkie formalne granice są czyste — poza jednym wyjątkiem strukturalnym:

| Granica                           | Status           |
| --------------------------------- | ---------------- |
| `lib/` → `components/*`           | ✅ Czysta        |
| `ui/` → kod domenowy              | ✅ Czysta        |
| `hooks/` → `components/*`         | ✅ Czysta        |
| `api/` → `components/*`           | ✅ Czysta        |
| `types.ts` → cokolwiek            | ✅ Czysta (liść) |
| `quotes/` ↔ `settings/` (importy) | ✅ Czysta        |
| `quotes/` ↔ `auth/` (importy)     | ✅ Czysta        |

### Asymetria: podwójne źródło wiedzy domenowej

`QuoteEditor.tsx` i `QuotesList.tsx` importują **zarówno hook, jak i `lib/quotes.ts` bezpośrednio**. Hoooki nie importują `lib/quotes.ts`. Efekt: zmiana `QuoteStatus` wymaga synchronizacji trzech warstw jednocześnie: `types.ts` → `lib/quotes.ts` (STATUS_LABELS) → komponent.

### Niewidoczny coupling: auth i settings

- **Auth**: `SignInForm.tsx` / `SignUpForm.tsx` nie importują żadnego API. Wywołanie autoryzacji odbywa się przez HTML `<form action="/api/auth/signin">` w plikach Astro. Para `auth ↔ quotes` (4 co-changes w git) wynika z logiki montowania na stronach, nie z importów.
- **Settings**: `UserContextForm.tsx` ma 0 importerów w grafie TS — mimo że jest najsilniejszym cross-cutterem w git (4.8 dirs/commit, #1 w territory map). Cały coupling biegnie przez strony Astro niewidoczne dla depcruisera.

---

## Wynik 3 — Kluczowe węzły grafu

### Fan-in (ile modułów importuje dany plik)

| Plik                                 | Importerów | Charakter                                                    |
| ------------------------------------ | ---------- | ------------------------------------------------------------ |
| `src/types.ts`                       | 12         | Najwyższy blast radius przy zmianie kontraktu typów          |
| `src/lib/utils.ts`                   | 11         | Helper utility — bezpieczny do zmiany (brak importów w górę) |
| `src/components/ui/button.tsx`       | 11         | shadcn primitive — bezpieczny (warstwy czyste)               |
| `src/lib/supabase.ts`                | 10         | Infrastruktura — rzadko zmieniana, ale duży blast radius     |
| `src/components/ui/inline-error.tsx` | 5          | UI primitive, bezpieczny                                     |
| `src/lib/rate-limit.ts`              | 4          | Infra, ale z DI — testowalny jednostkowo                     |

### Fan-out (ile src/ importów ma dany plik)

| Plik               | Importów src/ | Charakter                                               |
| ------------------ | ------------- | ------------------------------------------------------- |
| `QuoteEditor.tsx`  | 8             | Komponent orkiestrator + hook + sub-komponent + 3× lib  |
| `QuotesList.tsx`   | 8             | j.w.                                                    |
| `QuoteCreator.tsx` | 7             | Komponent orkiestrator (4 dzieci quotes + hook + 2× ui) |
| `SignInForm.tsx`   | 5             | 4 auth sub-komponenty + hook                            |
| `SignUpForm.tsx`   | 5             | j.w.                                                    |

### Orphany (0 importerów, 0 importów src/)

- `src/lib/config-status.ts` — prawdopodobnie używany z Astro/Wrangler CLI, nie przez TS import graph
- `src/__mocks__/astro-env-server.ts` — mock platformy (oczekiwany)
- `src/env.d.ts` — type declarations (oczekiwany)

---

## Wynik 4 — Ryzyka testowalności

### Profile ryzyka

| Moduł                                   | Profil                                               | Trudność  | Rekomendowany test                             |
| --------------------------------------- | ---------------------------------------------------- | --------- | ---------------------------------------------- |
| `useQuoteCreator.ts`                    | 3× fetch, 13 useState, 3 hardcoded URL               | 🔴 Wysoki | Integracyjny hook (MSW × 3 handlers)           |
| `UserContextForm.tsx`                   | fetch + useEffect w komponencie (nie w hooku)        | 🔴 Wysoki | Komponentowy (RTL + MSW)                       |
| `useQuotesList.ts`                      | 4 timery useRef, 12 useState, debounce, paginacja    | 🔴 Wysoki | Integracyjny hook (MSW + fake timers)          |
| `pages/api/ai/chat.ts`                  | Anthropic + Supabase + rate-limit w jednym handlerze | 🔴 Wysoki | Integracyjny (local Supabase + mock Anthropic) |
| `useQuoteEditor.ts`                     | 2 useEffect, useRef timer, fetch PATCH + DELETE      | 🟡 Średni | Integracyjny hook (MSW + fake timers)          |
| `QuoteCreator.tsx`                      | 4 dzieci + hook, 11 handlerów, orchestrator UI       | 🟡 Średni | E2E lub komponentowy z MSW                     |
| `QuotesList.tsx`                        | 3 operacje stanu, 11 handlerów                       | 🟡 Średni | E2E lub komponentowy z MSW                     |
| `lib/rate-limit.ts`                     | Supabase query, ale SupabaseClient przez DI          | 🟢 Niski  | Unit test (mock SupabaseClient)                |
| `useSignInForm.ts` / `useSignUpForm.ts` | Tylko React useState, zero fetch, zero infra         | 🟢 Niski  | Unit test (renderHook)                         |
| `lib/quotes.ts`, `lib/utils.ts`         | Czyste funkcje / stałe                               | 🟢 Niski  | Unit test bez mocków                           |

### Kluczowe sygnały runtime (niedostępne z samego grafu importów)

- **Hoooki quote** (`useQuoteCreator`, `useQuoteEditor`, `useQuotesList`): używają `fetch()` z hardcoded URL-ami do własnych routes. Brak DI, brak stałych URL.
- **`UserContextForm.tsx`**: jedyny komponent domenowy z `fetch()` i `useEffect` bezpośrednio w sobie (nie w hooku).
- **`useQuotesList.ts`**: 4 timery (`searchTimerRef`, `statusSuccessTimerRef`, `statusErrorTimerRef`, `pageLoadingRef`) — wymaga `vi.useFakeTimers()`.
- **`lib/supabase.ts` i `lib/anthropic.ts`**: czytają `astro:env/server` przy imporcie. Projekt ma już `__mocks__/astro-env-server.ts`.
- **`lib/rate-limit.ts`**: jedyny moduł infrastrukturalny z dependency injection (`SupabaseClient` jako parametr).

### Brak typowanych kontraktów HTTP

Hoooki wołają `fetch('/api/quotes', { body: JSON.stringify({...}) })`. Routes parsują body przez Zod. Nie ma wspólnego TypeScript schema ani DTO importowanego z obu stron. Zmiana kształtu body w route kompiluje się bez błędów po stronie hooka.

---

## Relacja z artifact-1-territory.md

| Obserwacja git (Artifact 1)              | Wyjaśnienie z grafu (Artifact 2)                                  |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `quotes ↔ hooks` 12× co-change           | Każdy hook jest 1:1 z komponentem, granica umowna (nie wymuszona) |
| `quotes ↔ settings` 7× co-change         | Zero importów między tymi domenami — coupling przez strony Astro  |
| `UserContextForm` 4.8 avg dirs/commit    | 0 importerów w TS graph — coupling w całości przez Astro pages    |
| `lib/` izolowany w git                   | Potwierdzono: lib jest liściem grafu, zero importów w górę        |
| `src/types.ts` 6 commits, niski avg dirs | Potwierdzono: zmienia się wąsko, ale blast radius = 12 modułów    |
| `hooks ↔ pages/api/ai` 4× co-change      | Coupling HTTP-level (fetch → hardcoded URL), nie import-level     |
| `auth ↔ quotes` 4× co-change             | Zero importów między auth i quotes — coupling przez routing Astro |

---

## Otwarte pytania do następnej sesji

1. Czy MSW jest skonfigurowany? (`grep -r "msw\|setupServer" .`)
2. Czy `vi.useFakeTimers` jest w globalnym setupie Vitest?
3. Czy kontrakt body między hookami a routes jest nigdzie ztypowany? (`grep -n "z\.object" src/pages/api/quotes/*.ts`)
4. Co robi `lib/config-status.ts` — dead code czy entry point poza TS graph?
5. Czy `lib/anthropic.ts` ma flagę dla środowiska testowego (żeby nie generować kosztów AI w CI)?
