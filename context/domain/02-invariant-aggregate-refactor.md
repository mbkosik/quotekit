---
title: "QuoteKit — Invariant & Aggregate Refactor Plan"
created: 2026-06-15
type: refactor-plan
---

# QuoteKit — Plan Refaktoru: Strażnik Niezmiennika Pipelineu Statusów

## Krok 0 — Kontekst

**Stack i warstwy logiki biznesowej**

| Warstwa           | Technologia                           | Rola                                              |
| ----------------- | ------------------------------------- | ------------------------------------------------- |
| HTTP/Route        | Astro API routes (`src/pages/api/`)   | Parse wejścia, wywołanie logiki, mapowanie błędów |
| Stan klienta      | React hooks (`src/components/hooks/`) | State machine UI, wywołania fetch                 |
| Typy domenowe     | `src/types.ts`                        | Enumeracje i schematy Zod                         |
| Infrastruktura    | `src/lib/`                            | Klient Supabase, pomocnicze utils                 |
| Persystencja / DB | `supabase/migrations/` + polityki RLS | Izolacja danych per-user, walidacja wartości      |

**Brak dedykowanej warstwy domenowej.** Logika biznesowa żyje w hookach React (klient) i API routes (serwer). Typy domenowe (`src/types.ts`) to czyste struktury danych — bez enkapsulacji reguł.

---

## Krok 1 — Identyfikacja niezmienników biznesowych

| #   | Reguła (niezmiennik)                                                           | Źródło                                             | Status egzekucji                                                                                                             |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| I1  | Pipeline statusów jest unidirektionalny: `draft → sent → accepted \| rejected` | `prd.md:106` FR-012 + `shape-notes.md:22`          | ❌ BRAK — API PATCH akceptuje dowolną zmianę statusu bez sprawdzenia aktualnego stanu                                        |
| I2  | Rozmowa AI musi zakończyć się przed wyświetleniem/zapisem pozycji              | `prd.md:58` AC do US-01                            | ⚠️ Tylko klient — phase state machine w `useQuoteCreator.ts`; POST `/api/quotes` akceptuje `inquiry_text: z.string().min(1)` |
| I3  | Max 5 pytań doprecyzowujących w sesji                                          | `prd.md:OQ-1` (resolved) + `useQuoteCreator.ts:11` | ⚠️ Tylko klient — `MAX_QUESTIONS = 5`; brak limitu w API `/api/ai/chat`                                                      |
| I4  | Nowa wycena powstaje wyłącznie ze statusem `draft`                             | PRD (implied) + `prd.md:106` FR-012                | ✅ API `index.ts:52` hardkoduje `status: "draft"` w INSERT                                                                   |
| I5  | Status wyceny należy do zbioru `{draft, sent, accepted, rejected}`             | `prd.md:106` + `migrations/20260526...:15`         | ✅ DB CHECK constraint + Zod enum w `[id].ts:12`                                                                             |
| I6  | Wycena ma niepusty tytuł                                                       | PRD (implicit — tytuł generowany przez AI)         | ✅ Zod `min(1)` w `index.ts:9` i `[id].ts:11` + DB `NOT NULL`                                                                |
| I7  | Freelancer widzi i modyfikuje wyłącznie własne wyceny (izolacja danych)        | `prd.md:44` NFR (guardrail krytyczny)              | ✅ RLS 4 polityki + `.eq("user_id", user.id)` we wszystkich query                                                            |
| I8  | Kontekst użytkownika ma max 500 znaków                                         | `roadmap.md:129` decyzja S-04 (koszt tokenów)      | ✅ Zod `max(500)` w `settings.ts:9` + slice w `chat.ts:113`                                                                  |

---

## Krok 2 — Klasyfikacja i wybór #1

### Ocena na trzech osiach

| Niezmiennik                | (a) Rdzeniowość dla produktu                                                                                                                                    | (b) Rozsianie po warstwach                                                                                                           | (c) Siła egzekucji                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **I1 — Pipeline statusów** | ★★★ Wysoka — PRD FR-012 explicite modeluje unidirektionalny pipeline sprzedażowy; cofnięcie z `accepted` do `draft` dewaluuje integralność danych analitycznych | ★★★ Wysokie — enum w `types.ts`, CHECK w DB, Zod w API, `<select>` w UI, hook `setStatus()` — 5 miejsc, żadne nie sprawdza przejścia | ❌ Naruszalny — PATCH `/api/quotes/[id]` akceptuje `accepted → draft` jednym żądaniem HTTP |
| I2 — Sesja AI              | ★★★ Najwyższa — rdzeń produktu                                                                                                                                  | ★★ Średnie — klient + API                                                                                                            | ⚠️ Tylko klient; PRD: "no server-side session" — intencja                                  |
| I3 — Max pytań             | ★★ Średnia                                                                                                                                                      | ★ Niskie — tylko klient                                                                                                              | ⚠️ Tylko klient                                                                            |
| I7 — Izolacja              | ★★★ Krytyczna                                                                                                                                                   | ★★ Średnie                                                                                                                           | ✅ Silna (RLS + API)                                                                       |

### Wybór: **I1 — unidirektionalny pipeline statusów wyceny**

**Uzasadnienie**: I1 jest jednocześnie najbardziej rdzeniowy (PRD FR-012 wprost opisuje `draft → sent → accepted / rejected` jako model procesu sprzedażowego) i najsłabiej egzekwowany (ZERO walidacji przejść po stronie serwera). Niezmiennik naruszalny dowolnym żądaniem PATCH — bez żadnego ataku na UI. I2/I3 są świadomie klienckie (PRD: efemeryczna sesja), I7 jest już zabezpieczone przez RLS.

---

## Krok 3 — Diagnoza wybranego niezmiennika (I1)

### Gdzie dziś żyje reguła (wszystkie warstwy)

**1. Enumeracja wartości — BEZ mapy przejść**

```
src/types.ts:3
  export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
```

Wylicza dopuszczalne wartości. Nie koduje dozwolonych przejść. Brak `ALLOWED_TRANSITIONS`, brak terminalnych stanów.

**2. CHECK w DB — waliduje wartość, nie przejście**

```
supabase/migrations/20260526000000_create_quotes.sql:15
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected'))
```

Baza odrzuca `status = 'foo'`, ale akceptuje `UPDATE SET status = 'draft' WHERE status = 'accepted'`. Brak triggera porównującego `OLD.status` vs `NEW.status`.

**3. API PATCH — Zod waliduje wartość, nie przejście; UPDATE bez SELECT**

```
src/pages/api/quotes/[id].ts:10-14
  const PatchSchema = z.object({
    title: z.string().min(1).optional(),
    status: z.enum(QUOTE_STATUSES).optional(),   ← waliduje wartość
    content: z.object({ items: z.array(QuoteItemSchema) }).optional(),
  });
```

```
src/pages/api/quotes/[id].ts:108-114
  const result = await supabase
    .from("quotes")
    .update(parsed.data)      ← UPDATE bez poprzedzającego SELECT current.status
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
```

Pojedyncze żądanie `PATCH { status: "accepted" }` na wycenę z `status = "draft"` przechodzi bez błędu.

**4. Hook kliencki — `setStatus()` bez filtrowania**

```
src/components/hooks/useQuoteEditor.ts:26-29
  function setStatus(s: QuoteStatus) {
    _setStatus(s);
    setIsDirty(true);
  }
```

Przyjmuje dowolny `QuoteStatus`. Nie sprawdza, czy przejście jest legalne z aktualnego stanu.

**5. UI — dropdown renderuje wszystkie 4 opcje**

```
src/components/quotes/QuoteEditor.tsx:90-95
  {QUOTE_STATUSES.map((s) => (
    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
  ))}
```

Dla wyceny `accepted` (terminal) dropdown pokazuje `draft`, `sent`, `accepted`, `rejected` — użytkownik może "cofnąć" wycenę.

### Gdzie reguła nie jest egzekwowana

| Warstwa       | Problem                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Serwer (API)  | Brak odczytu `current.status` przed UPDATE — niemożliwe jest sprawdzenie przejścia              |
| Serwer (DB)   | Brak triggera `CHECK (NEW.status IN allowed_transitions(OLD.status))`                           |
| Klient (hook) | `setStatus()` nie filtruje; klient jest jedynym "strażnikiem" przez `isDirty`, nie przez logikę |
| Klient (UI)   | Dropdown zawsze renderuje pełną listę — użytkownik widzi niedozwolone opcje                     |

### Gdzie błąd jest "połykany"

`[id].ts:116-121`: jeśli UPDATE się powiedzie (a powiedzie się, bo DB nie blokuje przejścia), API zwraca `200 OK { quote: updatedRow }`. Żaden log, żaden błąd — nielegalne przejście staje się persystentnym stanem.

---

## Krok 4 — Projekt agregatu-strażnika

### Granica agregatu

**Agregat**: `Quote`  
**Root**: `id: UUID`  
**Niezmiennik chroniony przez agregat**: pipeline przejść statusów

### 4.1 Moduł domenowy — `src/lib/quote-status-machine.ts`

```typescript
import type { QuoteStatus } from "@/types";

// Dozwolone przejścia — stany terminalne mają pustą listę
export const ALLOWED_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected"],
  accepted: [],
  rejected: [],
};

export class InvalidStatusTransitionError extends Error {
  readonly from: QuoteStatus;
  readonly to: QuoteStatus;

  constructor(from: QuoteStatus, to: QuoteStatus) {
    super(`Niedozwolone przejście statusu: ${from} → ${to}`);
    this.name = "InvalidStatusTransitionError";
    this.from = from;
    this.to = to;
  }
}

// Precondition: rzuca InvalidStatusTransitionError zamiast cicho aktualizować
export function assertStatusTransition(from: QuoteStatus, to: QuoteStatus): void {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}

// Helper dla UI: jakie statusy są dostępne z danego stanu
export function availableTransitions(from: QuoteStatus): QuoteStatus[] {
  return ALLOWED_STATUS_TRANSITIONS[from];
}
```

**Zasady projektu**:

- `assertStatusTransition` **rzuca** — nie zwraca `boolean`, nie loguje-i-jedzie-dalej
- Stany terminalne (`accepted`, `rejected`) mają pustą listę — nie wymagają osobnego `if`
- `InvalidStatusTransitionError` niesie pola `from` i `to` — API mapuje je na czytelny komunikat

### 4.2 Cienkie API route — `src/pages/api/quotes/[id].ts` (PATCH, zmieniony fragment)

Sygnatura operacji domenowej (pseudokod):

```
PATCH /api/quotes/:id
  1. parse & auth    → parsed.data, user (już działa)
  2. if status patch → SELECT current.status FROM quotes WHERE id AND user_id
                       → if not found: 404
                       → assertStatusTransition(current.status, parsed.data.status)
                         catch InvalidStatusTransitionError → 422 + komunikat
  3. UPDATE quotes SET ... WHERE id AND user_id
  4. return 200 { quote }
```

Kluczowe zmiany w stosunku do stanu obecnego:

- Dodać SELECT `status` przed UPDATE (1 dodatkowe query tylko gdy `parsed.data.status !== undefined`)
- `try { assertStatusTransition(...) } catch (e) { return 422 }` zamiast cichego UPDATE
- HTTP 422 Unprocessable Entity (nie 400 — dane są poprawne składniowo, nielegalne semantycznie)

### 4.3 Filtrowanie UI — `src/components/quotes/QuoteEditor.tsx`

UI staje się cienką projekcją logiki domenowej. Dropdown renderuje tylko legalne następne stany:

```tsx
// import { availableTransitions } from "@/lib/quote-status-machine"
//
// Przed zapisem: status === initial.status (obecny stan z DB)
// Po wyborze:    status === wybrany następny stan

const nextOptions = availableTransitions(initial.status);

{
  nextOptions.length === 0 ? (
    <p className="text-sm text-white/40">{STATUS_LABELS[initial.status]} (finalny)</p>
  ) : (
    <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
      <option value={initial.status}>{STATUS_LABELS[initial.status]}</option>
      {nextOptions.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
```

Egzekucja przenosi się z "wszystkie opcje dostępne w UI" na "serwer blokuje nielegalne przejście, UI go nie proponuje".

### 4.4 Atomowość

Niezmiennik nie wymaga transakcji wielotabelowej — SELECT + UPDATE na tej samej tabeli. Supabase/PostgreSQL gwarantuje atomowość UPDATE per-row. W przypadku wyścigu (race condition — dwa PATCH jednocześnie) serwer z `assertStatusTransition` oparty na odczycie `current.status` może przepuścić jedno z dwóch żądań; jest to akceptowalne w kontekście MVP jednego freelancera bez równoległych sesji. Jeśli stanie się to problemem, można dodać `WHERE status = :expected_current_status` do UPDATE clause i sprawdzić `count`.

---

## Krok 5 — Before / After, plan faz, testy

### Before / After dla każdego miejsca reguły

#### `src/types.ts`

**Before**:

```typescript
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
// Brak mapy przejść, brak klas błędów domenowych
```

**After** (typy bez zmian; logika przeniesiona do nowego modułu):

```typescript
// src/types.ts — bez zmian
// Logika przejść żyje w src/lib/quote-status-machine.ts
```

---

#### `src/pages/api/quotes/[id].ts` — handler PATCH

**Before** (linie 108–121):

```typescript
const result = (await supabase
  .from("quotes")
  .update(parsed.data)
  .eq("id", id)
  .eq("user_id", user.id)
  .select()
  .single()) as { data: Quote; error: null } | { data: null; error: Error };

if (result.error) {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, ... });
}
return new Response(JSON.stringify({ quote: result.data }), { status: 200, ... });
```

**After**:

```typescript
// NOWE: walidacja przejścia statusu
if (parsed.data.status !== undefined) {
  const { data: current, error: fetchErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !current) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, ... });
  }

  try {
    assertStatusTransition(current.status as QuoteStatus, parsed.data.status);
  } catch (e) {
    if (e instanceof InvalidStatusTransitionError) {
      return new Response(
        JSON.stringify({ error: `Niedozwolone przejście: ${e.from} → ${e.to}` }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }
    throw e;
  }
}

const result = (await supabase
  .from("quotes")
  .update(parsed.data)
  .eq("id", id)
  .eq("user_id", user.id)
  .select()
  .single()) as { data: Quote; error: null } | { data: null; error: Error };

if (result.error) {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, ... });
}
return new Response(JSON.stringify({ quote: result.data }), { status: 200, ... });
```

---

#### `src/components/quotes/QuoteEditor.tsx` — dropdown statusów

**Before** (linie 83–95):

```tsx
<select
  value={status}
  onChange={(e) => { setStatus(e.target.value as (typeof QUOTE_STATUSES)[number]); }}
  ...
>
  {QUOTE_STATUSES.map((s) => (
    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
  ))}
</select>
```

**After**:

```tsx
const nextOptions = availableTransitions(initial.status);  // import z quote-status-machine

{nextOptions.length === 0 ? (
  <p className="text-sm text-white/40">
    Status: {STATUS_LABELS[initial.status]} (finalny — zmiana niedozwolona)
  </p>
) : (
  <select
    value={status}
    onChange={(e) => { setStatus(e.target.value as QuoteStatus); }}
    ...
  >
    <option value={initial.status}>{STATUS_LABELS[initial.status]}</option>
    {nextOptions.map((s) => (
      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
    ))}
  </select>
)}
```

---

#### `src/components/hooks/useQuoteEditor.ts`

Brak zmiany wymaganej w logice hooka — walidacja przejścia przeniesiona na serwer. Hook obsługuje już `res.ok` check — odpowiedź 422 wywoła `setError("Nie udało się zapisać wyceny.")`. Opcjonalnie: `useQuoteEditor` mógłby parsować body 422 i wyświetlać komunikat domenowy.

---

### Plan faz refaktoru

#### Faza 1 — Moduł domenowy (nowy plik, zero blast radius)

1. Utwórz `src/lib/quote-status-machine.ts` z `ALLOWED_STATUS_TRANSITIONS`, `InvalidStatusTransitionError`, `assertStatusTransition`, `availableTransitions`.
2. Eksportuj z indeksu `src/lib/` (opcjonalnie).
3. **Test-first** — napisz testy jednostkowe (patrz sekcja Testy).

#### Faza 2 — Serwerowa egzekucja (zmiana krytyczna)

1. Zaimportuj `assertStatusTransition` i `InvalidStatusTransitionError` do `src/pages/api/quotes/[id].ts`.
2. Dodaj blok `if (parsed.data.status !== undefined)` z SELECT + assert przed UPDATE.
3. Mapuj `InvalidStatusTransitionError` → HTTP 422.
4. **Test-first** (jeśli projekt ma runner Vitest) — test integracyjny przeciwko lokalnemu Supabase:
   - `draft → sent` → 200 ✅
   - `draft → accepted` → 422 ✅
   - `accepted → draft` → 422 ✅

#### Faza 3 — UI (opcjonalna, poprawia UX)

1. Zaimportuj `availableTransitions` do `QuoteEditor.tsx`.
2. Zastąp pełną listę `QUOTE_STATUSES` w dropdownie przez `[initial.status, ...availableTransitions(initial.status)]`.
3. Dla stanów terminalnych — zastąp `<select>` etykietą tekstową.
4. Przesuń prop `initial` do `QuoteEditor` (już dostępny przez `quote: Quote`).

Faza 3 nie blokuje Fazy 2 — serwer chroni niezmiennik niezależnie od UI.

---

### Przypadki testowe (test-first, Vitest)

#### Jednostkowe — `src/lib/quote-status-machine.test.ts`

| Przypadek                                | Input `from` | Input `to` | Oczekiwanie                                                      |
| ---------------------------------------- | ------------ | ---------- | ---------------------------------------------------------------- |
| Legalne: draft → sent                    | `draft`      | `sent`     | Brak wyjątku                                                     |
| Legalne: sent → accepted                 | `sent`       | `accepted` | Brak wyjątku                                                     |
| Legalne: sent → rejected                 | `sent`       | `rejected` | Brak wyjątku                                                     |
| Nielegalne: draft → accepted (skip sent) | `draft`      | `accepted` | `InvalidStatusTransitionError { from: "draft", to: "accepted" }` |
| Nielegalne: draft → rejected (skip sent) | `draft`      | `rejected` | `InvalidStatusTransitionError`                                   |
| Nielegalne: sent → draft (cofnięcie)     | `sent`       | `draft`    | `InvalidStatusTransitionError`                                   |
| Nielegalne: accepted → draft (terminal)  | `accepted`   | `draft`    | `InvalidStatusTransitionError`                                   |
| Nielegalne: accepted → sent (terminal)   | `accepted`   | `sent`     | `InvalidStatusTransitionError`                                   |
| Nielegalne: rejected → sent (terminal)   | `rejected`   | `sent`     | `InvalidStatusTransitionError`                                   |
| Brak zmiany statusu (idempotentne)       | `draft`      | `draft`    | `InvalidStatusTransitionError` (self-loop niedozwolony)          |
| `availableTransitions("accepted")`       | `accepted`   | —          | `[]`                                                             |
| `availableTransitions("draft")`          | `draft`      | —          | `["sent"]`                                                       |

#### Integracyjne — `src/pages/api/quotes/[id].test.ts` (przeciwko lokalnemu Supabase)

| Przypadek                         | Operacja                                                    | Oczekiwanie                                                  |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Poprawne przejście `draft → sent` | PATCH `{ status: "sent" }` na quote z `status: "draft"`     | 200, `{ quote.status: "sent" }`                              |
| Niedozwolone `draft → accepted`   | PATCH `{ status: "accepted" }` na quote z `status: "draft"` | 422, `{ error: "Niedozwolone przejście: draft → accepted" }` |
| Niedozwolone `accepted → draft`   | PATCH `{ status: "draft" }` na quote z `status: "accepted"` | 422                                                          |
| Stan terminalny `accepted → sent` | PATCH `{ status: "sent" }` na quote z `status: "accepted"`  | 422                                                          |
| Patch bez statusu (title only)    | PATCH `{ title: "Nowy tytuł" }` na dowolną wycenę           | 200 (brak walidacji przejścia gdy status nie w payload)      |
| Nieuprawniony użytkownik          | PATCH jako inny user                                        | 404 (RLS blokuje SELECT, nie widzi wiersza)                  |

---

### Nowe nazwy kontraktowe ("load-bearing names")

Jeśli projekt prowadzi rejestr kontraktów domenowych, zarejestruj:

| Nazwa                              | Typ                                    | Plik                              |
| ---------------------------------- | -------------------------------------- | --------------------------------- |
| `ALLOWED_STATUS_TRANSITIONS`       | `Record<QuoteStatus, QuoteStatus[]>`   | `src/lib/quote-status-machine.ts` |
| `InvalidStatusTransitionError`     | `class extends Error`                  | `src/lib/quote-status-machine.ts` |
| `assertStatusTransition(from, to)` | pure function, throws                  | `src/lib/quote-status-machine.ts` |
| `availableTransitions(from)`       | pure function, returns `QuoteStatus[]` | `src/lib/quote-status-machine.ts` |

---

## Ograniczenia planu

1. Faza 2 dodaje jeden SELECT przed każdym PATCH zawierającym zmianę statusu — marginalny koszt latencji (1 round-trip do Supabase).
2. Race condition między dwoma równoczesnymi PATCH na tej samej wycenie możliwy w teorii; w praktyce MVP (jeden freelancer, brak współdzielonego workspace) jest pomijalne. Remedium (jeśli wymagane): dodanie `WHERE status = :currentStatus` do UPDATE + sprawdzenie `count === 0`.
3. Brak triggera DB jako ostatniej linii obrony — zmiana statusu przez SQL bezpośrednio (np. admin Supabase) nadal obejdzie niezmiennik. Akceptowalne dla MVP; do rozważenia jako dekoracja w przyszłości.
4. Analiza opiera się na statycznym czytaniu kodu (commit `3c9a5af`). Brak logów produkcyjnych — nie wiadomo, czy nielegalne przejścia faktycznie zdarzały się w danych.
