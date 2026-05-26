---
project: "QuoteKit"
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-25
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
---

# Roadmap: QuoteKit

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Freelancer na początku kariery dostaje zapytanie od klienta i nie wie, ile policzyć. Ręczne przekształcenie mglistej wiadomości w wycenę pozycję po pozycji zajmuje godziny i wymaga domeny, której jeszcze nie ma. QuoteKit zastępuje to krótką sesją: wklejony tekst, seria pytań AI, lista gotowych pozycji do zatwierdzenia. Rdzeń produktu to hipoteza: duże modele językowe potrafią dziś aproksymować ekspercką wycenę na podstawie samego tekstu zapytania — wystarczy zadać właściwe pytania i zebrać reakcje prawdziwych użytkowników.

## North star

**S-01: Użytkownik może stworzyć wycenę z zapytania klienta przez asystenta AI** — To jest gwiazda przewodnia: najważniejszy przepływ, który — wdrożony jako pierwszy — potwierdza centralną hipotezę produktu. Przepływ obejmuje: wklej zapytanie → AI zadaje pytania → AI generuje pozycje → freelancer edytuje → zapisuje jako draft → widzi na liście. Dopóki ten przepływ nie przeszedł przez ręce prawdziwych użytkowników, nie wiadomo, czy produkt dostarcza wartości.

> Gwiazda przewodnia to najmniejszy kompletny przepływ użytkownika, który dowodzi, że rdzeń pomysłu działa; sekwencjonowany tak wcześnie, jak pozwalają warunki wstępne, bo wszystkie pozostałe funkcje mają znaczenie tylko wtedy, gdy ten przepływ spełnia swoje zadanie.

## At a glance

| ID   | Change ID               | Outcome (user can …)                                                                    | Prerequisites | PRD refs                                                                              | Status   |
| ---- | ----------------------- | --------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------- | -------- |
| F-01 | quotes-schema-rls       | (foundation) tabela `quotes` + polityki RLS per-user wdrożone w Supabase                | —             | FR-010, FR-011, FR-013                                                                | ready    |
| F-02 | ai-integration-scaffold | (foundation) @anthropic-ai/sdk podłączony, /api/ai/scope zwraca sparsowane pozycje JSON | —             | FR-005, FR-006                                                                        | ready    |
| S-01 | ai-quote-creation-flow  | wkleić zapytanie → przejść rozmowę AI → edytować AI-pozycje → zapisać cytat jako draft  | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, FR-010, FR-011 | ready    |
| S-02 | quote-management        | zobaczyć pełną listę cytatów, zmienić status, usunąć cytat                              | F-01          | FR-011, FR-012, FR-013                                                                | proposed |

## Streams

Navigation aid — grupuje pozycje, które dzielą wspólny łańcuch warunków wstępnych. Kanoniczne porządkowanie tkwi w grafie zależności poniżej; ta tabela to proponowany porządek czytania ponad równoległymi torami.

| Stream | Temat                          | Łańcuch         | Nota                                                                                 |
| ------ | ------------------------------ | --------------- | ------------------------------------------------------------------------------------ |
| A      | Schemat i zarządzanie cytatami | `F-01` → `S-02` | F-01 jest też warunkiem wstępnym S-01 (Stream B) — uruchom ten tor jak najwcześniej. |
| B      | AI i tworzenie cytatów         | `F-02` → `S-01` | Gwiazda przewodnia; S-01 wymaga też F-01 z Stream A. Zablokowany przez OQ-1.         |

## Baseline

Stan kodu na dzień 2026-05-25 (auto-researched + potwierdzone przez użytkownika).
Foundations poniżej zakładają, że poniższe elementy są gotowe i NIE są ponownie tworzone.

- **Frontend:** present — Astro 6.3.1 + React 19 islands, Tailwind 4, shadcn/ui; strony: index, dashboard, auth/signin, auth/signup, auth/confirm-email; brak strony quotes
- **Backend / API:** partial — src/pages/api/auth/{signup,signin,signout}.ts; brak endpointów CRUD dla quotes; brak warstwy logiki biznesowej dla quotes
- **Data:** absent — Supabase skonfigurowany lokalnie, zero migracji, tabel ani polityk RLS
- **Auth:** present — @supabase/ssr, src/middleware.ts (getUser + redirect na /auth/signin), pełne strony UI auth
- **Deploy / infra:** present — .github/workflows/ci.yml, wrangler.jsonc (name: quotekit, Cloudflare Workers)
- **Observability:** partial — observability.enabled: true w wrangler.jsonc; brak bibliotek logowania ani error trackingu

## Foundations

### F-01: Quotes schema + RLS

- **Outcome:** (foundation) Migracja Supabase wdrożona: tabela `quotes` z polami dla zawartości cytatu + polityki Row Level Security dla operacji SELECT/INSERT/UPDATE/DELETE ograniczone do właściciela rekordu (auth.uid() = user_id).
- **Change ID:** quotes-schema-rls
- **PRD refs:** FR-010 (save quote), FR-011 (list quotes), FR-013 (delete quote); PRD §Non-Functional Requirements (data isolation guardrail — freelancer nigdy nie widzi cudzych cytatów)
- **Unlocks:** S-01 (schema wymagany dla endpointów CRUD quotes i zapisywania wyników AI), S-02 (zarządzanie wycenami wymaga tabeli i poprawnego RLS)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Twardy guardrail produktu (per-user isolation) jest zaimplementowany wyłącznie przez polityki RLS tutaj — błąd w polityce to regresja krytyczna niezależnie od stanu pozostałych funkcji; wymagane własne testy polityk przed S-01.
- **Status:** ready

### F-02: AI integration scaffold

- **Outcome:** (foundation) @anthropic-ai/sdk zainstalowany i zweryfikowany pod wrangler dev (runtime workerd); endpoint /api/ai/scope przyjmuje tekst zapytania i zwraca sparsowaną listę pozycji w formacie JSON ({task, hours, rate}) na podstawie przykładowego promptu.
- **Change ID:** ai-integration-scaffold
- **PRD refs:** FR-005 (AI clarifying questions), FR-006 (AI-generated line items); PRD §Non-Functional Requirements (AI quality — "an AI that produces wrong items is worse than no AI")
- **Unlocks:** S-01 (przepływ rozmowy AI potrzebuje działającego endpointu ze strukturalnym wyjściem), OQ-1 (scaffold umożliwia eksperymentalne sprawdzenie, ile rund pytań AI potrzebuje przed generowaniem pozycji)
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** workerd runtime ≠ Node.js — @anthropic-ai/sdk musi być przetestowany pod `wrangler dev`, nie `npm run dev`; szczegóły w infrastructure.md §Pre-Mortem (risk: nodejs_compat gap). Scaffold weryfikuje to ryzyko wcześnie, zanim S-01 je odziedzicy.
- **Status:** ready

## Slices

### S-01: AI-assisted quote creation flow

- **Outcome:** użytkownik może wkleić zapytanie klienta, przejść rozmowę z AI (pytania doprecyzowujące), zobaczyć i edytować AI-generowane pozycje (nazwa, godziny, stawka, subtotal), usunąć pozycję, i zapisać wynik jako cytat ze statusem "draft" widoczny na liście.
- **Change ID:** ai-quote-creation-flow
- **PRD refs:** US-01, FR-001 (sign up — prerequisite for signed-in state), FR-002 (sign in), FR-003 (sign out), FR-004 (paste inquiry), FR-005 (AI clarifying questions), FR-006 (AI line items), FR-007 (edit line items), FR-009 (remove line item), FR-010 (save as draft), FR-011 (see saved quote in list — minimal view satisfying US-01 acceptance criteria)
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Ile pytań powinno zadawać AI i jaki jest warunek zatrzymania rundy pytań?~~ **RESOLVED 2026-05-26:** User-driven z górnym limitem — AI zadaje pytania jedno po jednym (max 5), użytkownik może pominąć w dowolnym momencie przyciskiem "pomiń / wystarczy".
  - ~~Co zrobić gdy wklejony tekst jest zbyt lakoniczny, by wygenerować wiarygodne pozycje?~~ **RESOLVED 2026-05-26 (Opcja B):** Dual-mode w S-01 — AI ocenia jakość treści zapytania i routuje: (a) treść wystarczająca → standardowy przepływ wyceny; (b) treść zbyt lakoniczna → AI generuje pytania DO KLIENTA zamiast pozycji wyceny, z potwierdzeniem usera przed przełączeniem trybu. Jeden prompt, dwie ścieżki wyjścia, minimalne UI. Typowy przypadek: ogłoszenia z portali dla freelancerów (Useme, No Fluff Jobs).
- **Risk:** Jakość AI-pozycji to jedyna metryka, która ma znaczenie dla hipotezy produktu (PRD NFR: ≥80% pozycji wymaga tylko drobnych edycji); prompt engineering jest tutaj produkcyjny, nie eksperymentalny — wymaga iteracji i oceny przykładów przed wdrożeniem do prawdziwych użytkowników.
- **Status:** ready

### S-02: Quote management

- **Outcome:** użytkownik może zobaczyć pełną listę swoich wycen z ich statusem, zmienić status wyceny (draft → sent → accepted / rejected), i usunąć wycenę.
- **Change ID:** quote-management
- **PRD refs:** FR-011 (full quote list with status display), FR-012 (status update), FR-013 (delete quote)
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-013 to hard delete bez undo — świadome trade-off z PRD (Socratic round FR-009); UI powinien potwierdzać akcję przed usunięciem.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                            | Ready for `/10x-plan` | Notes                                                  |
| ---------- | ----------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------------ |
| F-01       | quotes-schema-rls       | Create quotes table with per-user RLS            | yes                   | Run `/10x-plan quotes-schema-rls`                      |
| F-02       | ai-integration-scaffold | Wire @anthropic-ai/sdk to /api/ai/scope endpoint | yes                   | Run `/10x-plan ai-integration-scaffold`                |
| S-01       | ai-quote-creation-flow  | AI-assisted quote creation end-to-end flow       | yes                   | OQ-1 + OQ-2 resolved 2026-05-26; run after F-01 + F-02 |
| S-02       | quote-management        | Quote list, status management, and delete        | no                    | Awaiting F-01 completion                               |

## Open Roadmap Questions

1. ~~**Ile pytań powinno zadawać AI i jaki jest warunek zatrzymania rundy pytań?**~~ **RESOLVED 2026-05-26** — User-driven z górnym limitem (max 5 pytań). Użytkownik może pominąć rundę w dowolnym momencie. Architektura: multi-turn z przyciskiem "pomiń / wystarczy" w UI.

2. ~~**Co zrobić gdy wklejony tekst jest zbyt lakoniczny lub nieinformatywny?**~~ **RESOLVED 2026-05-26 (Opcja B)** — Dual-mode: AI routuje między (a) wycena lub (b) pytania do klienta, z potwierdzeniem usera przed przełączeniem. Wchodzi do scope S-01. Motywacja: freelancerzy wklejają ogłoszenia z portali (Useme itp.) gdzie brief jest celowo skrótowy.

## Parked

- **Wysyłanie wycen do klientów (PDF, link, e-mail)** — Why parked: PRD §Non-Goals — delivery wymaga zarządzania tożsamością klienta, świadomie poza zakresem v1.
- **Zarządzanie klientami (CRM)** — Why parked: PRD §Non-Goals — klient istnieje tylko implicite w tekście zapytania.
- **Fakturowanie i billing** — Why parked: PRD §Non-Goals — inna domena produktowa.
- **Integracje z zewnętrznymi narzędziami** — Why parked: PRD §Non-Goals — QuoteKit jest standalone w v1.
- **Multi-currency** — Why parked: PRD §Non-Goals — jeden symbol waluty, bez konwersji.
- **FR-008: Ręczne dodawanie pozycji** — Why parked: PRD demoted to nice-to-have; użytkownicy edytują AI-pozycje w v1; nowe pozycje od zera trafiają do v2.
- **Undo / historia edycji pozycji** — Why parked: PRD §Non-Goals — kompleksowość undo nieuzasadniona w MVP; usunięcie jest permanentne i świadome.
- **Tryb offline** — Why parked: PRD §Non-Goals — wymaga live network connection.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips the item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
