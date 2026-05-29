# AI-Assisted Quote Creation Flow — Plan Brief

> Full plan: `context/changes/ai-quote-creation-flow/plan.md`
> PRD: `context/foundation/prd.md`
> Roadmap: `context/foundation/roadmap.md`

## What & Why

S-01 to gwiazda przewodnia produktu: freelancer wkleja zapytanie klienta, przechodzi krótką rozmowę z AI (pytania wyjaśniające), edytuje wygenerowane pozycje i zapisuje wycenę jako draft. Bez tego flow nie ma produktu. Cel: zwalidować centralną hipotezę — LLM potrafi aproksymować ekspercką wycenę na podstawie samego tekstu zapytania.

## Starting Point

Aplikacja ma działające auth, Supabase z tabelą `quotes` (RLS gotowe), i scaffold endpoint `/api/ai/scope` (single-call, zweryfikowany pod wrangler dev). Dashboard to stub bez żadnych quotes. Brak stron tworzenia wycen i jakiegokolwiek CRUD.

## Desired End State

Zalogowany freelancer ląduje na `/new` — zawsze pustym formularzu agenta. Wkleja zapytanie, AI zadaje max 5 pytań (można pominąć w dowolnym momencie), generuje listę pozycji z tytułem. Freelancer edytuje inline, zapisuje. Toast potwierdza zapis, formularz resetuje się. `/quotes` pokazuje minimalną listę zapisanych wycen (stub dla S-02).

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Główny route po loginie | `/new` (zawsze pusty formularz) | Zero kliknięć do core flow; jasna intencja strony | Plan |
| Architektura AI multi-turn | Jeden stateless endpoint `/api/ai/chat`; client trzyma historię w React state | Workers są stateless; multi-turn SDK = przekazywanie `messages[]` przy każdym call | Plan + Research |
| UX konwersacji | Card-by-card (jedna karta naraz) | Skupiony flow; naturalny dla max 5 pytań; zero chaosu | Plan |
| Max pytań / skip | Max 5, przycisk "Pomiń / Wystarczy" | User-driven z górnym limitem | Roadmap |
| Sparse guard | AI sentinel `TOO_SHORT` → inline message; brak dual-mode | Dual-mode to S-03; S-01 obsługuje tylko prosty guard | Roadmap |
| Edycja pozycji | Inline (klik na komórkę aktywuje input) | Minimalna interakcja; brak modali | Roadmap |
| Tytuł wyceny | Generowany przez AI (w `ChatOutputSchema`) | Zero ręcznego wpisywania | Roadmap |
| Po zapisie | Reset agenta + inline toast z linkiem | Freelancer może od razu zacząć nową wycenę | Plan |
| `/dashboard` | Usunięty | Nowy hub = `/new`; klasyczny dashboard nie pasuje do product vision | Plan |
| CRUD scope S-01 | Tylko POST + GET `/api/quotes` | Pełny CRUD (delete, status) należy do S-02 | Plan |
| Topbar | Logo + email + sign out (bez nav linków) | Linki do `/quotes`/`/settings` wchodzą gdy strony istnieją | Plan |

## Scope

**In scope:**
- Strona `/new` jako główny chroniony route
- Stub `/quotes` (minimal read-only list)
- Multi-turn AI konwersacja (endpoint `/api/ai/chat`)
- React island: inquiry form → conversation card → line items editor
- `POST /api/quotes` + `GET /api/quotes`
- Inline toast po zapisie + reset agenta
- Usunięcie `/dashboard`

**Out of scope:**
- Zmiana statusu wycen, usuwanie wycen (S-02)
- Ręczne dodawanie pozycji (v2)
- Rate limiting (pre-launch gate, S-01 plan note)
- Nawigacja do `/settings` (S-04)
- Reużycie `/api/ai/scope` w tym flow (scaffold pozostaje)

## Architecture / Approach

```
/new (Astro SSR)
  └─ <QuoteCreator client:load />  (React island)
       ├─ InquiryForm      → POST /api/ai/chat {generate: false} → question
       ├─ ConversationCard → POST /api/ai/chat {generate: false|true} → question|complete
       ├─ LineItemsEditor  → inline editing w lokal state
       └─ Save             → POST /api/quotes → 201 → toast + reset

/api/ai/chat (stateless)
  ├─ generate: false → messages.create() → {type: "question"|"sparse"}
  └─ generate: true  → messages.parse() + zodOutputFormat → {type: "complete", items, title}

/api/quotes (Supabase CRUD)
  ├─ POST → insert quotes (RLS per user_id)
  └─ GET  → select own quotes
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Routing & Navigation | `/new`, `/quotes` stub, middleware, topbar, delete `/dashboard` | Brak ryzyka — czysty refactor |
| 2. AI Conversation Endpoint | `POST /api/ai/chat`: multi-turn, question + generate modes | Sentinel parsing (DONE/TOO_SHORT) musi być deterministyczny |
| 3. Quote Creation UI | Pełny React island wired do Phase 2 | Złożony state machine + inline editing — najwięcej kodu w projekcie |
| 4. Quotes API & Save Flow | POST/GET quotes, wire save, toast, minimal `/quotes` | Supabase insert + RLS w Workers runtime |

**Prerequisites:** F-01 (done — quotes table + RLS), F-02 (done — SDK verified under wrangler dev)
**Estimated effort:** ~3-4 sesje across 4 phases

## Open Risks & Assumptions

- Jakość pozycji AI (NFR: ≥80% wymaga tylko drobnych edycji) — nie weryfikowana przed wdrożeniem; wymaga iteracji prompt engineering
- `messages.parse()` z `zodOutputFormat` + długi kontekst Q&A — nie testowane; jeśli model nie zmieści się w `max_tokens: 2048`, pozycje będą puste (422); może wymagać podniesienia limitu
- Inline editing z React state — lokalny state `QuoteCreator` trzyma items; po refresh strony wycena niezapisana przepada (expected behavior w S-01)

## Success Criteria (Summary)

- Freelancer może przejść pełny flow inquiry → konwersacja → pozycje → zapis w < 10 minut (PRD primary success criterion)
- Zapisana wycena pojawia się na `/quotes` ze statusem "draft"
- Niezalogowany użytkownik nie może dostać się do `/new` ani `/quotes`
