# Artifact 1 — Territory Map

> Analiza historii git (ostatnie 12 miesięcy). Dane z sesji 2026-06-15.
> Wszystkie 20 kluczowych plików zweryfikowano — są obecne w aktualnym drzewie repo.

---

## TOP 10 folderów wg liczby commitów

| #   | Katalog                                          | Touches |
| --- | ------------------------------------------------ | ------- |
| 1   | `src/components/quotes/`                         | 73      |
| 2   | `src/components/hooks/`                          | 24      |
| 3   | `src/lib/`                                       | 15      |
| 4   | `src/pages/api/ai/`                              | 14      |
| 5   | `src/components/auth/`                           | 13      |
| 6   | `src/pages/` _(root-level)_                      | 13      |
| 7   | `src/pages/auth/`                                | 10      |
| 8   | `supabase/migrations/`                           | 9       |
| 9   | `src/__tests__/access-control/`                  | 9       |
| 10  | `src/pages/quotes/` & `src/components/settings/` | 8       |

`src/lib/` breakdown: `supabase-test.ts` (3), `test-helpers.ts` / `supabase-errors.ts` / `rate-limit.ts` (po 2) — zmiany głównie testowe i infrastrukturalne, niezależne od feature-churnów.

---

## TOP 10 plików wg liczby commitów

_(pominięto: package-lock, .gitignore, CI yml, vitest config, wrangler, context/)_

| #   | Plik                                            | Commits |
| --- | ----------------------------------------------- | ------- |
| 1   | `src/components/quotes/QuotesList.tsx`          | 15      |
| 2   | `src/components/quotes/LineItemsEditor.tsx`     | 12      |
| 3   | `src/components/quotes/InquiryForm.tsx`         | 10      |
| 4   | `src/components/quotes/ConversationCard.tsx`    | 9       |
| 5   | `src/components/hooks/useQuoteCreator.ts`       | 9       |
| 6   | `src/components/settings/UserContextForm.tsx`   | 8       |
| 7   | `src/components/quotes/QuoteCreator.tsx`        | 8       |
| 8   | `src/components/quotes/QuoteEditor.tsx`         | 7       |
| 9   | `src/types.ts`                                  | 6       |
| 10  | `src/components/quotes/QuoteFilterBar.tsx`      | 6       |
| 10  | `src/components/quotes/ClientQuestionsList.tsx` | 6       |
| 10  | `src/components/hooks/useQuotesList.ts`         | 6       |
| 10  | `src/components/Topbar.astro`                   | 6       |

---

## Sprzężenia — pary katalogów współzmieniające się w tych samych commitach

| Para                                        | Wspólne commity |
| ------------------------------------------- | --------------- |
| `components/quotes` ↔ `components/hooks`    | **12**          |
| `components/quotes` ↔ `components/settings` | **7**           |
| `components/quotes` ↔ `pages/quotes`        | **5**           |
| `components/hooks` ↔ `pages/quotes`         | **4**           |
| `components/hooks` ↔ `pages/api/ai`         | **4**           |
| `components/auth` ↔ `components/quotes`     | **4**           |
| `components/quotes` ↔ `pages/api/ai`        | **3**           |
| `components/hooks` ↔ `pages/api/quotes`     | **3**           |
| `components/hooks` ↔ `components/settings`  | **3**           |

Trójki: żadna kombinacja 3 katalogów nie powtórzyła się więcej niż raz.

---

## Wnioski z analizy sprzężeń

**`components/quotes` ↔ `components/hooks` (12×)**
Najsilniejsza para w repo. Komponenty i hooki zmieniają się razem niemal przy każdej pracy na quotes. Granica UI/stan jest nadal płynna.

**`components/hooks` jako hub (4–12×)**
Hooki co-change'ują z trzema warstwami jednocześnie: `components/quotes`, `pages/api/ai`, `components/settings`. `useQuoteCreator` pośredniczy między UI, AI i ustawieniami — naturalny punkt przecięcia architektury.

**`components/quotes` ↔ `components/settings` (7×)**
Niespodziewana para. `UserContextForm` (kontekst AI dla wycen) jest semantycznie częścią flow tworzenia wyceny, nie "ustawieniami" w klasycznym sensie. Warto oznaczyć ten związek w mapie.

**`src/lib/` — izolowane**
Mimo 15 touches w rankingu, tylko jedna słaba para (`lib + pages/api/auth`, 2×). Zmienia się samodzielnie — utilities i klienty Supabase nie są wciągane w feature-churny.

---

## Cross-cutting hub — analiza avg dirs/commit

Miernik: ile różnych katalogów dotyka commit zawierający dany plik (średnia po wszystkich commitach, min. 2 commity).

| Plik                                          | Avg dirs/commit | Commits | Charakter                                            |
| --------------------------------------------- | --------------- | ------- | ---------------------------------------------------- |
| `src/components/settings/UserContextForm.tsx` | **4.8**         | 8       | Najsilniejszy prawdziwy cross-cutter                 |
| `src/layouts/Layout.astro`                    | 4.7             | 3       | Strukturalny (zmiany layoutu z definicji są szeroke) |
| `src/components/Topbar.astro`                 | 4.4             | 5       | Nawigacja globalna — podobnie strukturalny           |
| `src/styles/global.css`                       | 6.5             | 2       | Najwyższy avg, ale za mała próbka (2 commity)        |

**Brak klasycznego "wspólnego mianownika"** (i18n, generowane pliki, centralny config). `src/types.ts` mimo 6 commitów ma niski avg dirs/commit — zmienia się w skupionych, wąskich commitach, nie jest hubem.

`UserContextForm.tsx` to de facto cross-cutter: pojawia się w commitach obejmujących 4–5 różnych katalogów, konsekwentnie przez 8 commitów.
