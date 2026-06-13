# UI Enhancements — Plan Brief (Plan 1)

> Full plan: `context/changes/ui-enhancements/plan.md`
> Research: `context/changes/ui-enhancements/research.md`

## What & Why

Usuwamy wszystkie pozostałości po szablonie 10x-astro-starter widoczne w UI, wyrównujemy motyw wizualny auth do reszty aplikacji, i naprawiamy wszystkie HIGH-severity problemy dostępności (WCAG). Bez tych zmian aplikacja eksponuje branding obcego projektu każdemu użytkownikowi, kieruje po logowaniu na złą stronę i zawiera wiele naruszeń WCAG 2.1 blokujących dostęp klawiaturą oraz screen readerom.

## Starting Point

65 znalezisk w 4 kategoriach (research.md). Aplikacja używa `bg-gray-950` w całym app area ale `bg-cosmic` z glassmorphism na stronach auth — dwa osobne motywy wizualne. `quotes/[id].astro` zwraca `Response(null)` dla błędów 404/503, dając białą pustą stronę. Signin kieruje na `/new` zamiast `/quotes`, signout na `/` (stronę startera).

## Desired End State

Użytkownik widzi "QuoteKit" na każdej stronie — żadnych śladów "10x Astro Starter" w UI, tytule ani konfiguracji. Auth pages mają to samo płaskie tło co reszta aplikacji. Logowanie → `/quotes`, wylogowanie → `/auth/signin`. Wszystkie dynamiczne komunikaty błędów są anonsowane przez screen reader. Edycja pozycji wyceny możliwa z klawiatury. Strony błędów 404/503 w quotes pokazują czytelny komunikat z linkiem powrotu.

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) | Source |
|---|---|---|---|
| Zakres planu | Plan 1: starter + HIGH a11y; Plan 2: visual+code quality | Minimalizuje ryzyko regresji; każdy plan samodzielnie testowalny | Plan |
| Motyw wizualny | Flat — auth dostaje bg-gray-950, bez backdrop-blur | Najmniejsze zmiany w komponentach app, spójność bez dużego refaktoru | Plan |
| Strategia przycisków | Shadcn `<Button>` migration | Jeden komponent, wbudowany focus ring, poprawia B3+B4+C40 jednocześnie | Plan → Plan 2 |
| A11y zakres | Wszystkie HIGH severity | Likwiduje blokery WCAG AA (lang, keyboard access, role="alert", kontrast) | Plan |
| Strony błędów | Inline rendering w quotes/[id].astro + nowy 404.astro | Astro SSR nie routuje Response(null) do 404.astro automatycznie | Plan |
| Auth redirects | signin → /quotes; signout → /auth/signin | Naturalny flow powracającego użytkownika; eliminuje lądowanie na stronie startera | Plan |
| Error i18n | Lookup table Supabase → PL w signin.ts | 1h zmiany; polscy użytkownicy nie widzą angielskich SDK strings | Plan |
| role="alert" | Element zawsze w DOM, treść warunkowa | Screen readery anonsują tylko zmiany istniejących elementów, nie nowe elementy | Research |

## Scope

**In scope:**
- A1–A6: wszystkie pozostałości startera (Welcome.astro, Layout title, config-status, package.json, README, template.png)
- B1: auth flat theme (remove bg-cosmic + backdrop-blur)
- C31–C32: auth redirects (signin → /quotes, signout → /auth/signin) + C28 (redirect zalogowanego z /)
- C7–C10, C23: role="alert" na 5 komponentach
- C11: Supabase error i18n (Polish map)
- C12: quotes/[id].astro inline error + 404.astro
- C13: rate limit 429 dedykowany komunikat
- C16–C17: QuoteFilterBar aria-pressed + aria-label
- C19–C20: QuotesList select + delete aria-label
- C21: LineItemsEditor keyboard access
- C22, C24: ConversationCard, UserContextForm textarea aria-label
- C25: lang="pl"
- C26: FormField aria-describedby + aria-invalid
- C35–C36: kontrast przycisków delete
- C40: focus ring na custom buttons
- C5: useQuotesList rollback komunikat

**Out of scope (Plan 2 — ui-visual-quality):**
- Shadcn `<Button>` migration (B3)
- Design token adoption — `--muted-foreground` itd. (B8/B9)
- `cn()` violations (D3–D5)
- Hook extraction SignInForm/SignUpForm (D1/D2)
- MEDIUM a11y (empty states, loading states, pagination URL, color tokens)

## Architecture / Approach

6 niezależnych faz: (1) starter cleanup, (2) auth flat + redirects + error i18n, (3) ARIA labels foundation, (4) role="alert" + rollback fix, (5) error pages + rate limit UX, (6) keyboard + contrast. Każda faza weryfikowalna osobno. Żadna zmiana nie wymaga nowych zależności npm.

Kluczowy wzorzec dla `role="alert"`: element zawsze w DOM, treść warunkowa — nie warunkowy render całego elementu. Wzorzec zapożyczony z `useQuoteCreator.ts:48–55`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Starter Cleanup | Zero "10x Astro Starter" w UI; QuoteKit landing page | Trzeba uważać by nie usunąć auth linków z Welcome.astro |
| 2. Auth Flat + Redirects | Spójny motyw auth+app; poprawne flow po logowaniu/wylogowaniu | Trzy pliki auth.astro do edycji — ryzyko pominięcia jednego |
| 3. ARIA Foundation | lang=pl, nav landmark, aria-pressed, aria-label na 6 komponentach | aria-labelledby w ConversationCard wymaga stabilnego id pytania |
| 4. Dynamic Feedback | role="alert" na 5 komunikatach; rollback statusu widoczny | role="alert" na warunkowych elementach może nie anonsować — wzorzec "zawsze w DOM" |
| 5. Error Pages | 404.astro; quotes/[id] nie zwraca pustej strony | Astro SSR nie routuje Response(null) do 404.astro — obsługa inline |
| 6. Keyboard + Contrast | LineItemsEditor klawiatura; focus rings; delete buttons ≥3:1 | span→role=button wymaga onKeyDown dla Enter I Space osobno |

**Prerequisites:** Brak — zmiany są niezależne od innych aktywnych PR.
**Estimated effort:** ~3–4 sesje implementacji + review.

## Open Risks & Assumptions

- `bg-cosmic` klasa jest zdefiniowana w `global.css` — usunięcie z auth pages jej nie usuwa; można zachować dla ewentualnego Plan 2 lub usunąć jeśli nigdzie indziej nie używana.
- Supabase może zwrócić nowe kody błędów nieujęte w lookup table — fallback jest wymagany.
- Focus ring `focus-visible:ring-purple-500/80 focus-visible:ring-offset-gray-950` zakłada, że tło kontenera jest zawsze `bg-gray-950` — weryfikuj przy każdym przycisku.
- Plan 2 (shadcn Button) zastąpi focus ring z Phase 6; focus ring dodany tutaj jest tymczasowy, ale poprawny.

## Success Criteria (Summary)

- Żaden plik w `src/` nie zawiera "10x Astro Starter" ani "10x-astro-starter" po Phase 1
- Axe DevTools na `/quotes`, `/quotes/new`, `/settings` → zero HIGH violations po Phase 6
- Zalogowany użytkownik pełny flow (login → quotes → new quote → keyboard edit → logout) działa bez myszy
