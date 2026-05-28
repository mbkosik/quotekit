---
project: "QuoteKit"
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-28
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
| F-01 | quotes-schema-rls       | (foundation) tabela `quotes` + polityki RLS per-user wdrożone w Supabase                | —             | FR-010, FR-011, FR-013                                                                | done     |
| F-02 | ai-integration-scaffold | (foundation) @anthropic-ai/sdk podłączony, /api/ai/scope zwraca sparsowane pozycje JSON | —             | FR-005, FR-006                                                                        | ready    |
| S-01 | ai-quote-creation-flow  | wkleić zapytanie → przejść rozmowę AI → edytować AI-pozycje → zapisać cytat jako draft  | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, FR-010, FR-011 | ready    |
| S-02 | quote-management        | zobaczyć pełną listę cytatów, zmienić status, usunąć cytat                              | F-01          | FR-011, FR-012, FR-013                                                                | proposed |
| S-03 | client-questions-flow   | gdy brief za lakoniczny — poprosić AI o pytania do klienta i skopiować je               | S-01          | FR-004                                                                                | proposed |

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
- **Schema decisions (2026-05-26, rev. 2026-05-26):** Jedna tabela, jeden typ rekordu. Kolumny: `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected'))`, `title TEXT NOT NULL` (generowany przez AI), `inquiry_text TEXT NOT NULL`, `content JSONB NOT NULL DEFAULT '{}'` — struktura: `{ "items": [{ "task": string, "hours": number, "rate": number }] }`. Brak kolumny `type` — pytania do klienta (S-03) będą osobnym slicem z własną decyzją schematową. RLS policies filtrują per `user_id`.
- **Risk:** Twardy guardrail produktu (per-user isolation) jest zaimplementowany wyłącznie przez polityki RLS tutaj — błąd w polityce to regresja krytyczna niezależnie od stanu pozostałych funkcji; wymagane własne testy polityk przed S-01.
- **Status:** done

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
  - ~~Co zrobić gdy wklejony tekst jest zbyt lakoniczny, by wygenerować wiarygodne pozycje?~~ **REVISED 2026-05-26:** Dual-mode (Opcja B) przeniesiony do S-03. S-01 obsługuje lakoniczny brief prostym guardem: AI zwraca komunikat "tekst za krótki, dodaj więcej kontekstu" — bez osobnej ścieżki UX ani nowego rekordu w bazie. Pełna funkcja pytań do klienta wchodzi do scope po walidacji core hypothesis (S-01).
- **Design decisions (2026-05-26):**
  - Sparse input guard w S-01: komunikat od AI gdy brief niewystarczający — bez dual-mode, bez zapisu do bazy
  - Edycja pozycji w LINE_ITEMS inline w tabeli (klik na pole aktywuje input)
  - Tytuł wyceny generowany przez AI z tekstu zapytania — bez ręcznego wpisywania
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

### S-03: Client questions for sparse briefs

- **Outcome:** gdy brief jest zbyt lakoniczny, użytkownik może poprosić AI o listę pytań do klienta, skopiować je i wrócić z kompletnym briefem do standardowego przepływu S-01.
- **Change ID:** client-questions-flow
- **PRD refs:** FR-004 (handle sparse input gracefully — Socratic note)
- **Prerequisites:** S-01 (entry point reuses paste flow; core hypothesis musi być zwalidowana przed tym slicem)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** Czy pytania do klienta są zapisywane w bazie (własna tabela / kolumna w quotes) czy tylko clipboard — do zdecydowania przy `/10x-plan client-questions-flow`.
- **Risk:** —
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                            | Ready for `/10x-plan` | Notes                                                  |
| ---------- | ----------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------------ |
| F-01       | quotes-schema-rls       | Create quotes table with per-user RLS            | done                  | Archived 2026-05-28                                    |
| F-02       | ai-integration-scaffold | Wire @anthropic-ai/sdk to /api/ai/scope endpoint | yes                   | Run `/10x-plan ai-integration-scaffold`                |
| S-01       | ai-quote-creation-flow  | AI-assisted quote creation end-to-end flow       | yes                   | OQ-1 resolved; OQ-2 → sparse guard only (dual-mode → S-03); run after F-01 + F-02 |
| S-02       | quote-management        | Quote list, status management, and delete        | yes                   | F-01 done; run `/10x-plan quote-management`            |
| S-03       | client-questions-flow   | Client questions for sparse briefs               | no                    | Awaiting S-01 completion; storage approach TBD         |

## Open Roadmap Questions

1. ~~**Ile pytań powinno zadawać AI i jaki jest warunek zatrzymania rundy pytań?**~~ **RESOLVED 2026-05-26** — User-driven z górnym limitem (max 5 pytań). Użytkownik może pominąć rundę w dowolnym momencie. Architektura: multi-turn z przyciskiem "pomiń / wystarczy" w UI.

2. ~~**Co zrobić gdy wklejony tekst jest zbyt lakoniczny lub nieinformatywny?**~~ **REVISED 2026-05-26** — Dual-mode (Opcja B) wydzielony jako S-03. W S-01 wchodzi tylko prosty guard: AI zwraca komunikat gdy input niewystarczający. Pełna funkcja pytań do klienta (zapis, UX) trafia do S-03 po walidacji core hypothesis.

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

| F-01 | quotes-schema-rls | Tabela `quotes` + polityki RLS per-user | 2026-05-28 |
