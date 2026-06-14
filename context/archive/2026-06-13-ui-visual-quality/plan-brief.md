# UI Visual Quality — Plan Brief (Plan 2)

> Full plan: `context/changes/ui-visual-quality/plan.md`
> Research: `context/changes/ui-enhancements/research.md`

## What & Why

Plan 2 domyka spójność wizualną i jakość kodu QuoteKit po tym, jak Plan 1 (`ui-enhancements`) usunął starter remnants i naprawił HIGH-severity a11y. Bez tego planu aplikacja ma 6 arbitralnych poziomów opacity tekstu, przyciski w 3 różnych rozmiarach/radii, 3 duplikaty textarea, 2 duże komponenty auth bez hooków i ~20 MEDIUM a11y gaps (empty states, loading UX, auto-reset).

## Starting Point

Plan 1 zakończony (założenie). Wszystkie komponenty korzystają z ręcznie zakodowanych `<button>` z inline Tailwind, nie z shadcn `<Button>`. Tekst secondary/muted/placeholder rotuje przez white/40–/90 bez systemu. `SignInForm` i `SignUpForm` mają logikę stanu inline. QuoteCreator resetuje się automatycznie po 3s. Delete i status change nie mają loading/confirmation UX.

## Desired End State

Każdy przycisk akcji w obszarze app to shadcn `<Button>` z wbudowanym focus ringiem. Tekst używa 3 kanonicznych poziomów (secondary=/60, muted=/40, placeholder=/30). `<AppTextarea>` i `<InlineError>` to jedyne implementacje tych wzorców. Quotes area używa Lucide ikon konsekwentnie. `SignInForm`/`SignUpForm` delegują do hooków. axe DevTools pokazuje 0 violations na /quotes, /new, /settings.

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) | Source |
|---|---|---|---|
| Design tokens | Normalize opacity: 3 poziomy (secondary/muted/placeholder) | Brak ryzyka regresji CSS variable; natychmiastowa poprawa spójności | Plan |
| Button strategy | shadcn `<Button>` dla wszystkich ręcznych button w app | Wbudowany focus ring, variant system, disabled:opacity-50 | Plan 1 → Plan 2 |
| button.tsx rounding | rounded-md → rounded-xl | App używa rounded-xl; override w source eliminuje konieczność per-button className | Plan |
| Icon strategy | Lucide w quotes area (Unicode/SVG → Lucide) | Lucide zainstalowane; spójne rozmiary i aria-hidden semantics | Plan |
| Hook extraction | useSignInForm + useSignUpForm + setTimeout fix w UserContextForm | lessons.md: >2–3 state vars → hook w src/components/hooks/ | Research/lessons.md |
| Shared components | AppTextarea + InlineError | Eliminuje 3× i 4× duplikaty; konsoliduje role="alert" z Plan 1 | Plan |
| MEDIUM a11y scope | Empty states, loading/UX flows, error UX, contrast | Wszystkie 4 kategorie — zamknięcie pełnego audytu | Plan |
| Done phase | Usuń auto-reset 3s → przycisk "Utwórz nową wycenę" | Użytkownik kontroluje kiedy resetuje; ekran sukcesu nie znika bez zgody | Plan |

## Scope

**In scope:**
- B3–B4: shadcn Button migration (wszystkie ręczne button w quotes/settings)
- B5: Lucide icons w quotes area
- B6: InlineError component (unifikacja 4 wzorców błędów)
- B7: max-width normalizacja (2xl/4xl → 3xl w /new flow i /quotes)
- B8–B9: opacity normalizacja (3 poziomy semantyczne)
- B10: Banner.astro → Tailwind (usuwa 9 hardkodowanych hex)
- B11–B13: secondary button border, spinner, h1 na /new i /quotes/[id]
- B15: Topbar email → neutral text
- C1–C4, C6, C14, C29–C30, C33, C37–C39, C41: MEDIUM a11y
- D1–D12: cn() violations, hook extraction, stable key, relative imports, setTimeout, React.FormEvent fix

**Out of scope:**
- Pełna adopcja CSS custom properties shadcn (--primary, --muted-foreground we wszystkich komponentach)
- C34: paginacja URL preservation w SSR (wymaga zmian w Astro page + API)
- E2E testy
- Nowe funkcje biznesowe
- AppButton wrapper (decyzja Plan 1 → shadcn Button bezpośrednio)

## Architecture / Approach

5 faz w kolejności zależności: tokeny jako pierwsza bo definiują wartości używane wszędzie → Button migration korzysta ze znormalizowanych klas → AppTextarea/InlineError konsolidują wzorce po Button migration → code quality jest niezależna ale bezpieczniejsza po stabilizacji komponentów → MEDIUM a11y zamyka audyt.

Dwa nowe komponenty UI (`app-textarea.tsx`, `inline-error.tsx`) i dwa nowe hooki (`useSignInForm.ts`, `useSignUpForm.ts`) — wszystkie w istniejących lokalizacjach (`src/components/ui/`, `src/components/hooks/`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Opacity + Visual Foundation | 3 kanoniczne poziomy tekstu; max-width normalizacja; Banner.astro w Tailwind | text-white/40→/40 może wyglądać ciemniej niż /50 — visual check konieczny |
| 2. shadcn Button Migration | Wszystkie przyciski app → Button; focus ring built-in | --primary i rounded-md muszą być zaktualizowane PRZED migracją |
| 3. AppTextarea + InlineError + Lucide | 3× textarea i 4× InlineError skonsolidowane; Lucide ikony | AppTextarea musi przekazywać aria-* z Plan 1; InlineError — zawsze w DOM |
| 4. Code Quality | 2 hooki auth; cn(); stable key; imports; setTimeout | useSignUpForm/useSignInForm muszą zachować identyczne zachowanie formularzy |
| 5. MEDIUM A11y + Polish | Empty states; loading UX; done phase; axe 0 violations | Kontrast auth gradient wymaga weryfikacji po Plan 1 flat theme |

**Prerequisites**: Plan 1 (`ui-enhancements`) zakończony i zmergowany.
**Estimated effort**: ~3–4 sesje implementacji.

## Open Risks & Assumptions

- `--primary` w global.css może wymagać dostosowania do purple-600 przed Phase 2 — nie sprawdzano w tym planie.
- `LineItemsEditor` line item type może być zdefiniowany w `src/types.ts` jako część Supabase Row — dodanie `_clientId` nie może naruszać API contract (pola `_clientId` nie wysyłamy do backendu).
- Auth gradient text contrast po flat theme może być fine (gradient na gray-950 ma dobry kontrast) lub nie — decyzja w Phase 5 zależna od wyniku pomiaru.
- shadcn Button `size="icon"` daje kwadratowy przycisk — upewnij się że delete buttons w QuotesList i LineItemsEditor wyglądają poprawnie przy tym rozmiarze.

## Success Criteria (Summary)

- `grep -rn "text-white/50\|text-white/70\|text-white/80" src/` — brak wyników po Phase 1
- axe DevTools: 0 violations na /quotes, /new, /settings po Phase 5
- Pełny /new flow (inquiry → pytania → pozycje → zapis) działa bez myszy, z focus ringiem na każdym kroku
