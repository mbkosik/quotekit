# UI Enhancements — Plan Implementacji (Plan 1)

## Overview

Usuwamy wszystkie pozostałości po 10x-astro-starter, wdrażamy płaski motyw na stronach auth (spójność z app), naprawiamy wszystkie HIGH-severity problemy dostępności (ARIA, kontrast, klawiatura) i krytyczne luki UX (puste strony błędów, cichy rollback statusu, rate limit). Plan 2 (`ui-visual-quality`) obsłuży shadcn Button migration, design tokens, cn() violations i MEDIUM a11y.

## Current State Analysis

Na podstawie `context/changes/ui-enhancements/research.md` (65 znalezisk):

- `src/components/Welcome.astro` i `src/layouts/Layout.astro` eksponują branding "10x Astro Starter" każdemu niezalogowanemu użytkownikowi i w tytule karty przeglądarki.
- Auth pages (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) używają `bg-cosmic` + `backdrop-blur-xl` podczas gdy cała aplikacja używa `bg-gray-950`. Logowanie przekierowuje na `/new` zamiast `/quotes`.
- `src/pages/quotes/[id].astro` zwraca `Response(null, { status: 404/400/503 })` — przeglądarka renderuje białą stronę bez żadnej nawigacji.
- 5 komponentów wyświetla błędy przez dynamicznie pojawiające się `<p>` i `<span>` bez `role="alert"` — screen readery ich nie anonsują.
- `useQuotesList.ts handleStatusChange` robi optimistic update i cicho cofa przy błędzie API bez żadnego sygnału dla użytkownika.
- `<html lang="en">` przy polskich treściach narusza WCAG 2.1 SC 3.1.1.
- Pola tekstowe w ConversationCard, UserContextForm mają tylko `placeholder` — brak `<label>` ani `aria-label`.
- Przyciski filtrów w QuoteFilterBar bez `aria-pressed`; search input bez `aria-label`.
- Komórki tabeli w LineItemsEditor edytowane przez `<span onClick>` bez `role`, `tabIndex`, `onKeyDown` — niedostępne z klawiatury.
- Przyciski delete używają `text-white/30` (2.3:1 kontrast) — poniżej WCAG minimum 3:1 dla komponentów UI.

## Desired End State

Po zakończeniu planu:
- Aplikacja nie zawiera żadnych śladów "10x Astro Starter" w UI, tytule ani konfiguracji.
- Strony auth używają tego samego płaskiego tła `bg-gray-950` co reszta aplikacji.
- Logowanie → `/quotes`, wylogowanie → `/auth/signin`; zalogowany użytkownik na `/` dostaje redirect na `/quotes`.
- Wszystkie dynamiczne komunikaty błędów są anonsowane przez screen reader (`role="alert"`).
- Każde interaktywne pole ma dostępną nazwę (`aria-label` lub `<label>`).
- Edycja pozycji w LineItemsEditor możliwa z klawiatury (Enter/Space).
- Strony 404/503 w `quotes/[id]` pokazują czytelny komunikat z linkiem powrotu — nie białą stronę.
- Zmiana statusu wyceny która zawiedzie jest komunikowana użytkownikowi.
- Rate limit AI (429) ma osobny, czytelny komunikat.
- `<html lang="pl">` w każdej stronie.

### Key Discoveries

- `src/pages/api/auth/signin.ts:19` — `redirect("/new")` do zmiany na `redirect("/quotes")`; `src/pages/api/auth/signout.ts:9` — `redirect("/")` do zmiany na `redirect("/auth/signin")`.
- `src/lib/config-status.ts:16` — `docsUrl` linkuje do repo startera; bez własnej dokumentacji zastępujemy pustym stringiem lub `#`.
- W Astro SSR `return new Response(null, { status: 404 })` NIE trafia do `src/pages/404.astro` — plik 404.astro obsługuje tylko brak pasującej trasy. Dlatego w `quotes/[id].astro` renderujemy błąd inline lub używamy `Astro.redirect`.
- `src/components/quotes/LineItemsEditor.tsx` — komórki `Opis`, `Ilość`, `Cena jedn.` używają `<span onClick={...}>`. Dodanie `role="button" tabIndex={0} onKeyDown` (Enter/Space) wystarczy bez zmiany układu.
- `useQuotesList.ts:handleStatusChange` — brak `setError` w catch bloku; interfejs `QuotesList.tsx` pobiera `error` ze stanu, który jest ustawiany tylko przy delete. Trzeba dodać dedykowany `statusError` lub przekazać rollback przez istniejący `error`.

## What We're NOT Doing

- Shadcn `<Button>` migration (Plan 2)
- Design token adoption — `--muted-foreground`, `--primary` itd. (Plan 2)
- `cn()` violations fix (Plan 2)
- Hook extraction dla `SignInForm` i `SignUpForm` (Plan 2)
- MEDIUM severity a11y (C1–C4, C6, C14–C15, C18, C20, C29–C30, C33–C34, C37–C39, C41) — Plan 2
- Dedykowane strony 404/500 jako osobne pliki — zamiast tego obsługa inline w `quotes/[id].astro`
- i18n ani pełna lokalizacja aplikacji
- E2E testy

## Implementation Approach

Sześć niezależnych faz, każda weryfikowalna osobno przed przejściem do następnej. Fazy 1–2 usuwają starter remnants i wyrównują auth. Fazy 3–4 naprawiają ARIA i feedback. Fazy 5–6 zamykają UX flows i dostęp z klawiatury.

## Critical Implementation Details

**Astro SSR i strony błędów**: `src/pages/404.astro` przechwytuje tylko żądania do nieistniejących tras. Błędy w dynamicznych stronach (np. brak wyceny) muszą być obsługiwane inline — przez warunkowe renderowanie zawartości błędu w tej samej stronie.

**`role="alert"` wymaga żywego kontenera**: Element z `role="alert"` musi istnieć w DOM zanim pojawi się jego treść. Jeśli cały element jest warunkowo renderowany (`{error && <p role="alert">}`), niektóre screen readery nie anonsują zmiany. Bezpieczniejszy wzorzec: `<p role="alert" aria-live="assertive">{error}</p>` zawsze w DOM, z pustą treścią gdy brak błędu.

**`aria-pressed` na przyciskach toggle**: Wartość musi być booleanem, nie stringiem: `aria-pressed={active}` (nie `aria-pressed="true"`).

---

## Phase 1: Starter Cleanup & Branding

### Overview

Usuwamy wszystkie wizualne i konfiguracyjne pozostałości po 10x-astro-starter. Niezalogowany użytkownik widzi minimalną stronę QuoteKit; zalogowany jest przekierowywany na `/quotes`. Tytuł karty przeglądarki, link w bannerze błędu i nazwa pakietu wskazują na QuoteKit.

### Changes Required

#### 1. Welcome.astro — przepisanie na minimalną stronę QuoteKit

**File**: `src/components/Welcome.astro`

**Intent**: Zastąp cały obecny content (hero "10x Astro Starter" + karty feature startera) minimalną stroną z nagłówkiem "QuoteKit", jednozdaniowym opisem i dwoma przyciskami: "Zaloguj się" (→ `/auth/signin`) i "Utwórz konto" (→ `/auth/signup`). Zachowaj ogólną strukturę pliku Astro.

**Contract**: Komponent nie przyjmuje propsów. Renderuje samodzielny blok centrowany na stronie. Przyciski używają istniejących klas Tailwind bez nowych zależności.

#### 2. index.astro — redirect zalogowanego użytkownika

**File**: `src/pages/index.astro`

**Intent**: Jeśli `Astro.locals.user` jest ustawiony (użytkownik zalogowany), zwróć `Astro.redirect("/quotes")` przed renderowaniem strony.

**Contract**: Redirect umieszczamy w frontmatter przed `return`, na wzór istniejących guard-ów w `src/pages/quotes/index.astro`.

#### 3. Layout.astro — domyślny tytuł

**File**: `src/layouts/Layout.astro`

**Intent**: Zmień wartość domyślną prop `title` z `"10x Astro Starter"` na `"QuoteKit"`.

**Contract**: Linia 10, jeden-do-jeden zamiana stringa.

#### 4. config-status.ts — link błędu

**File**: `src/lib/config-status.ts`

**Intent**: Zmień `docsUrl` z URL repo 10x-astro-starter na pusty string `""` lub `"#"`. Banner nadal się pojawia, ale link nie prowadzi do obcego repo.

**Contract**: Linia 16 — zamiana wartości stringa.

#### 5. package.json — nazwa pakietu

**File**: `package.json`

**Intent**: Zmień `"name"` z `"10x-astro-starter"` na `"quotekit"`.

**Contract**: Linia 2. Brak wpływu na runtime — to metadane pakietu npm.

#### 6. README.md — przepisanie

**File**: `README.md`

**Intent**: Zastąp całą treść README opisem QuoteKit: co to jest (narzędzie do wycen dla freelancerów), jak uruchomić lokalnie (`npm run dev`, zmienne środowiskowe), jak zdeployować. Usuń sekcje i referencje do `przeprogramowani/10x-astro-starter`.

**Contract**: Plik nie jest testowany ani lintowany — swobodna treść, bez ograniczeń formatowania.

#### 7. public/template.png — usunięcie

**File**: `public/template.png`

**Intent**: Usuń plik z systemu plików (`rm public/template.png`). Zaktualizuj README by nie referencjonował już `./public/template.png`.

**Contract**: Sprawdź `grep -r "template.png" src/` przed usunięciem — upewnij się, że żaden komponent go nie używa.

### Success Criteria

#### Automated Verification

- `grep -r "10x Astro Starter\|10x-astro-starter\|przeprogramowani" src/` — brak wyników
- `grep "template.png" README.md` — brak wyników; `public/template.png` nie istnieje
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Odwiedź `/` jako niezalogowany użytkownik → widać nagłówek "QuoteKit", dwa przyciski CTA, zero śladów startera
- Odwiedź `/` jako zalogowany użytkownik → redirect na `/quotes`
- Otwórz dowolną stronę bez własnego `title` prop → karta przeglądarki pokazuje "QuoteKit"
- Sprawdź banner błędu konfiguracji (uruchom z błędnym Supabase URL) → link nie prowadzi do obcego repo

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 2.

---

## Phase 2: Auth Flat Theme + Auth Redirects + Error i18n

### Overview

Strony auth tracą `bg-cosmic` i `backdrop-blur-xl` — dostają to samo `bg-gray-950` co reszta aplikacji. Karta formularza zamiast `bg-white/10 backdrop-blur-xl` dostaje `bg-white/5`. Redirect po logowaniu zmieniony na `/quotes`, po wylogowaniu na `/auth/signin`. Komunikaty błędów Supabase tłumaczone na polski.

### Changes Required

#### 1. signin.astro — flat theme

**File**: `src/pages/auth/signin.astro`

**Intent**: Usuń `bg-cosmic` z zewnętrznego kontenera strony; zmień klasę tła na `bg-gray-950 min-h-screen`. Na karcie formularza usuń `backdrop-blur-xl` i zmień `bg-white/10` na `bg-white/5`.

**Contract**: Inne klasy (padding, max-width, rounded, border) pozostają bez zmian. Gradient na tytule (`bg-clip-text text-transparent from-blue-200 to-purple-200`) można zachować lub zamienić na `text-white` — decyzja estetyczna, oba są poprawne.

#### 2. signup.astro — flat theme

**File**: `src/pages/auth/signup.astro`

**Intent**: Te same zmiany co w signin.astro — `bg-gray-950`, karta `bg-white/5` bez `backdrop-blur-xl`.

**Contract**: Analogiczne do Phase 2 / Change 1.

#### 3. confirm-email.astro — flat theme

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Te same zmiany co w signin.astro i signup.astro.

**Contract**: Analogiczne.

#### 4. api/auth/signin.ts — redirect na /quotes

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Zmień docelowy URL redirect po pomyślnym logowaniu z `"/new"` na `"/quotes"`.

**Contract**: Linia 19 — zamiana stringa w `redirect()`.

#### 5. api/auth/signout.ts — redirect na /auth/signin

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Zmień docelowy URL redirect po wylogowaniu z `"/"` na `"/auth/signin"`.

**Contract**: Linia 9 — zamiana stringa w `redirect()`.

#### 6. api/auth/signin.ts — polska mapa błędów Supabase

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Przed zwróceniem błędu, sprawdź `error.message` przez lookup table i zamień na polski komunikat. Nieznane kody dostają generyczny fallback.

**Contract**: Mapa obejmuje co najmniej: `"Invalid login credentials"` → `"Nieprawidłowy adres e-mail lub hasło"`, `"Email not confirmed"` → `"Potwierdź adres e-mail, by się zalogować"`, `"Too many requests"` → `"Zbyt wiele prób logowania. Poczekaj chwilę."`. Fallback: `"Wystąpił błąd logowania. Spróbuj ponownie."`. Ta sama mapa może być wyciągnięta do `src/lib/supabase-errors.ts` jeśli `signup.ts` też jej potrzebuje.

### Success Criteria

#### Automated Verification

- `grep -r "bg-cosmic\|backdrop-blur-xl" src/pages/auth/` — brak wyników
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Odwiedź `/auth/signin`, `/auth/signup`, `/auth/confirm-email` → płaskie tło `bg-gray-950`, karta bez rozmycia, wizualna spójność z `/quotes`
- Zaloguj się z poprawnymi danymi → redirect na `/quotes` (nie `/new`)
- Wyloguj się → redirect na `/auth/signin` (nie `/`)
- Zaloguj się z błędnym hasłem → komunikat po polsku ("Nieprawidłowy adres e-mail lub hasło")
- Zaloguj się z niepotwierdzonvm e-mailem → inny komunikat po polsku

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 3.

---

## Phase 3: Foundation Accessibility — ARIA Labels & lang

### Overview

Naprawiamy fundamenty dostępności: język strony, landmark nawigacyjny, powiązanie pól z etykietami i opisami błędów, `aria-pressed` na przyciskach toggle, `aria-label` z kontekstem na shared controls.

### Changes Required

#### 1. Layout.astro — lang="pl"

**File**: `src/layouts/Layout.astro`

**Intent**: Zmień atrybut `lang` na elemencie `<html>` z `"en"` na `"pl"`.

**Contract**: Linia 14. Jedna zmiana atrybutu — bez wpływu na funkcjonalność.

#### 2. Topbar.astro — nav landmark

**File**: `src/components/Topbar.astro`

**Intent**: Owiń linki nawigacyjne ("Wyceny", "Ustawienia") elementem `<nav aria-label="Nawigacja główna">`. Przycisk wylogowania nie musi być wewnątrz `<nav>`.

**Contract**: Nie zmieniaj istniejących klas ani struktury linków — tylko dodaj `<nav>` jako wrapper.

#### 3. FormField.tsx — aria-describedby + aria-invalid

**File**: `src/components/auth/FormField.tsx`

**Intent**: Gdy komponent renderuje komunikat błędu, powiąż go z inputem przez `aria-describedby`; ustaw `aria-invalid="true"` na inpucie w stanie błędu.

**Contract**: Nadaj komunikatowi błędu unikalny `id` (np. `${name}-error`). Na `<input>` dodaj `aria-describedby={error ? `${name}-error` : undefined}` i `aria-invalid={error ? "true" : undefined}`. Parametr `name` jest dostępny przez propsy komponentu.

#### 4. QuoteFilterBar.tsx — aria-pressed + aria-label

**File**: `src/components/quotes/QuoteFilterBar.tsx`

**Intent**: Na przyciskach filtrów statusu dodaj `aria-pressed={active}`; na search input dodaj `aria-label="Szukaj po tytule wyceny"`; na przycisk sortowania dodaj `aria-label` opisujący aktualny kierunek sortowania i zmianę po kliknięciu.

**Contract**: `aria-pressed` przyjmuje boolean. Dla sort button: `aria-label={sortOrder === "desc" ? "Sortuj: najnowsze. Kliknij, by sortować od najstarszych" : "Sortuj: najstarsze. Kliknij, by sortować od najnowszych"}`.

#### 5. QuotesList.tsx — aria-label na select i delete button

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Na każdym `<select>` statusu dodaj `aria-label` zawierający tytuł wyceny; zmień `aria-label` przycisku delete by zawierał tytuł wyceny.

**Contract**: `aria-label={`Status wyceny: ${q.title}`}` na select; `aria-label={`Usuń wycenę: ${q.title}`}` na przycisku delete (zastąp obecne `"Usuń wycenę"`).

#### 6. ConversationCard.tsx — aria-labelledby na textarea

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Powiąż textarea odpowiedzi z tekstem pytania przez `aria-labelledby`.

**Contract**: Nadaj paragrafowi z pytaniem unikalny `id` (np. `question-text`). Na textarea dodaj `aria-labelledby="question-text"`. Jeśli `questionIndex` jest dostępny w propsach, użyj go do unikalności: `id={`question-${questionIndex}`}`.

#### 7. UserContextForm.tsx — aria-label na textarea

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: Textarea kontekstu użytkownika nie ma `<label>`. Dodaj `aria-label="Kontekst użytkownika dla generowania wycen"`.

**Contract**: Nie dodawaj wizualnego `<label>` — obecny `<h2>` pełni rolę wizualnej etykiety; `aria-label` jest wystarczające dla dostępności.

### Success Criteria

#### Automated Verification

- `npm run build` — bez błędów
- `npm run lint` — bez błędów
- `grep -n 'lang="en"' src/layouts/Layout.astro` — brak wyników

#### Manual Verification

- Sprawdź source strony → `<html lang="pl">`
- Otwórz DevTools → Elements → Topbar → `<nav aria-label="Nawigacja główna">` obecny
- Otwórz formularz signin z błędem → input ma `aria-invalid="true"` i `aria-describedby` wskazujący na element z błędem
- QuoteFilterBar: inspect przyciski filtrów → `aria-pressed="true"/"false"` zgodnie ze stanem
- QuoteFilterBar: search input ma `aria-label`
- QuotesList: każdy `<select>` ma `aria-label` z tytułem wyceny
- ConversationCard: textarea ma `aria-labelledby` wskazujący na paragraf pytania
- UserContextForm: textarea ma `aria-label`

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 4.

---

## Phase 4: Dynamic Feedback — role="alert" + Silent Rollback Fix

### Overview

Wszystkie dynamicznie pojawiające się komunikaty błędów i sukcesu dostają `role="alert"` (lub `aria-live="assertive"`) — screen readery anonsują je automatycznie. Cichy rollback zmiany statusu wyceny jest zastępowany przez widoczny komunikat błędu.

### Changes Required

#### 1. QuoteCreator.tsx — role="alert" na błędzie zapisu

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Element `<p>` z błędem (linia ~49) powinien być zawsze w DOM, z `role="alert"` i pustą treścią gdy nie ma błędu — żeby screen readery atakowały zmianę jego treści.

**Contract**: Zmień wzorzec z `{error && <p className="...">{error}</p>}` na `<p role="alert" aria-live="assertive" className="...">{error ?? ""}</p>`. Gdy `error` jest `null`/`undefined`, element jest pusty ale obecny w DOM.

#### 2. QuoteEditor.tsx — role="alert" na błędzie i sukcesie

**File**: `src/components/quotes/QuoteEditor.tsx`

**Intent**: Elementy błędu (linia ~93) i sukcesu (linia ~94) — oba powinny być zawsze w DOM z `role="alert"`.

**Contract**: Ten sam wzorzec co w Change 1 powyżej. Dla sukcesu użyj `role="status"` (uprzejme ogłoszenie) zamiast `role="alert"` (natychmiastowe). `aria-live="polite"` dla sukcesu, `aria-live="assertive"` dla błędu.

#### 3. UserContextForm.tsx — role="alert" na błędzie

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: `<span>` z błędem zapisu (linia ~61) powinien być zawsze w DOM z `role="alert"`.

**Contract**: Ten sam wzorzec co w Change 1. Zmień `<span>` na `<p>` (semantycznie bardziej odpowiednie dla komunikatu) z `role="alert"`.

#### 4. QuotesList.tsx — role="alert" na błędzie usuwania

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Element `<p>` z błędem usuwania (linia ~68) — zawsze w DOM z `role="alert"`.

**Contract**: Ten sam wzorzec co w Change 1.

#### 5. ConversationCard.tsx — role="alert" na błędzie AI

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Kontener błędu (linia ~79–82) powinien być zawsze w DOM; `role="alert"` na kontenerze (nie na przycisku "Spróbuj ponownie").

**Contract**: Wzorzec jak w Change 1 dla kontenera błędu.

#### 6. useQuotesList.ts — surfowanie błędu rollback statusu

**File**: `src/components/hooks/useQuotesList.ts`

**Intent**: W `handleStatusChange` (linie ~80–93), gdy `fetch` zawiedzie i status wraca do pierwotnej wartości, ustaw stan błędu komunikujący niepowodzenie zmiany. Błąd powinien być automatycznie czyszczony po kilku sekundach.

**Contract**: Dodaj nowy stan `statusError: string | null` w hooku (oddzielny od `error` który dotyczy usuwania). Eksportuj go z hooka. W `QuotesList.tsx` wyświetl `statusError` z `role="alert"` — np. obok listy lub nad nią. Komunikat: `"Nie udało się zmienić statusu wyceny. Spróbuj ponownie."`. Auto-clear po 4 sekundach przez `setTimeout` ze storowanym ref-em (wzorzec z `useQuoteCreator.ts:48–55`).

### Success Criteria

#### Automated Verification

- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Otwórz QuoteEditor → zapisz z błędem (np. odłącz sieć) → komunikat pojawia się; przy inspect ma `role="alert"`
- Otwórz QuotesList → spróbuj usunąć wycenę z błędem sieciowym → `role="alert"` na komunikacie błędu
- Otwórz QuotesList → zmień status wyceny → odłącz sieć przed requestem (lub zamockuj błąd) → użytkownik widzi komunikat o niepowodzeniu (nie tylko cichy rollback)
- ConversationCard → wywołaj błąd AI → komunikat widoczny z `role="alert"` na kontenerze
- UserContextForm → zapisz z błędem → `role="alert"` na komunikacie

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 5.

---

## Phase 5: Error Pages + Rate Limit UX

### Overview

Zastępujemy puste `Response(null)` w `quotes/[id].astro` przez renderowanie inline błędu z linkiem powrotu. Tworzymy `src/pages/404.astro` dla tras które Astro nie rozpoznaje. Naprawiamy komunikat rate limit 429 w `useQuoteCreator.ts`.

### Changes Required

#### 1. src/pages/404.astro — nowa strona 404

**File**: `src/pages/404.astro`

**Intent**: Utwórz dedykowaną stronę 404 dla nieistniejących tras (np. `/quotes/abc-xyz` kiedy trasa w ogóle nie pasuje). Strona używa `<Layout title="Nie znaleziono strony">` z Topbarem, krótkim komunikatem i linkiem "← Wróć do listy wycen" (href="/quotes").

**Contract**: Plik musi eksportować `export const prerender = false` skoro aplikacja jest w trybie SSR. Użyj istniejącego `Layout.astro` jako wrappera — zachowaj spójność z resztą app.

#### 2. quotes/[id].astro — obsługa błędów inline

**File**: `src/pages/quotes/[id].astro`

**Intent**: Zastąp `return new Response(null, { status: 404/400/503 })` przez warunkowe renderowanie błędu inline w tym samym pliku, używając istniejącego `<Layout>`. Użytkownik widzi komunikat kontekstowy z linkiem powrotu — nie białą stronę.

**Contract**: Wzorzec w Astro SSR:
- Zdefiniuj zmienną `errorState: { title: string; message: string } | null = null`
- W miejscach gdzie był `return new Response(null, ...)` — ustaw `errorState` zamiast zwracać Response
- W template: jeśli `errorState !== null`, renderuj `<Layout>` z komunikatem błędu i linkiem `← Wróć do listy wycen` zamiast komponentu `<QuoteEditor>`
- Komunikaty: 404 → "Nie znaleziono wyceny"; 400 → "Nieprawidłowe żądanie"; 503 → "Błąd serwera — spróbuj ponownie za chwilę"

#### 3. useQuoteCreator.ts — komunikat dla 429

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: W catch bloku gdzie `error.message === "HTTP 429"` (lub sprawdzeniu kodu statusu), ustaw dedykowany komunikat informujący o wyczerpaniu limitu zapytań AI.

**Contract**: Sprawdź string `"HTTP 429"` w `error.message` przed generycznym fallback. Komunikat: `"Osiągnięto limit zapytań do AI. Odczekaj chwilę i spróbuj ponownie."`. Ten specyficzny przypadek już istnieje jako `new Error("HTTP 429")` w `callChat` i `callQuestions` (linia ~31) — wystarczy obsłużyć go w catch.

### Success Criteria

#### Automated Verification

- `src/pages/404.astro` istnieje: `test -f src/pages/404.astro`
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Odwiedź `/quotes/nonexistent-uuid-123` → widoczny komunikat "Nie znaleziono wyceny" z linkiem "← Wróć do listy wycen", z Topbarem — nie biała strona
- Odwiedź dowolny nieistniejący URL (np. `/foo/bar`) → widoczna strona 404.astro z Layout
- W QuoteCreator: wywołaj AI mając zablokowane API przez rate limit (lub zamockuj `callChat` by rzucał `Error("HTTP 429")`) → komunikat informuje o limicie zapytań, nie o "błędzie połączenia"

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 6.

---

## Phase 6: Keyboard Access + Color Contrast

### Overview

Edycja komórek w LineItemsEditor staje się dostępna z klawiatury. Niestandardowe przyciski (filtry, skip, retry) dostają widoczny focus ring. Przyciski delete poprawiają kontrast z 2.3:1 do ≥3:1.

### Changes Required

#### 1. LineItemsEditor.tsx — keyboard access na edit spans

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Każdy `<span onClick={...}>` który otwiera tryb edycji komórki musi być dostępny z klawiatury: osiągalny przez Tab, aktywowany przez Enter lub Spację.

**Contract**: Dodaj do każdego edytowalnego `<span>` (linie ~112–120, ~140–148, ~166–174):
- `role="button"`
- `tabIndex={0}`
- `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /* wywołaj ten sam handler co onClick */ }}}`
Nie zmieniaj struktury DOM ani klas Tailwind. Trzy spany (Opis, Ilość, Cena) wymagają tej zmiany. Ilość i cena mają różne `onClick` — upewnij się, że `onKeyDown` wywołuje właściwy handler dla każdej komórki.

#### 2. QuoteFilterBar.tsx — focus ring na przyciskach

**File**: `src/components/quotes/QuoteFilterBar.tsx`

**Intent**: Przyciski filtrów statusu i przycisk sortowania mają `outline-none` bez `focus-visible:ring-*`. Dodaj widoczny focus ring.

**Contract**: Do każdego `<button>` w filterze i sortowaniu dodaj: `focus-visible:ring-2 focus-visible:ring-purple-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950`. Nie usuwaj `outline-none` — `focus-visible` jest już wystarczające dla myszy/dotyku.

#### 3. ConversationCard.tsx / InquiryForm.tsx — focus ring na custom buttons

**File**: `src/components/quotes/ConversationCard.tsx` i `src/components/quotes/InquiryForm.tsx`

**Intent**: Przycisk "Pomiń / Wystarczy" w ConversationCard i przycisk "Generuj pytania" w InquiryForm (secondary) mają niestandardowe style bez focus ring. Dodaj `focus-visible:ring-*`.

**Contract**: Te same klasy co w Change 2 powyżej: `focus-visible:ring-2 focus-visible:ring-purple-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950`.

#### 4. QuotesList.tsx i LineItemsEditor.tsx — kontrast przycisków delete

**File**: `src/components/quotes/QuotesList.tsx` (linia ~111) i `src/components/quotes/LineItemsEditor.tsx` (linia ~186)

**Intent**: Przyciski delete "✕" i "Usuń pozycję" mają `text-white/30` (2.3:1 kontrast) — poniżej WCAG 3:1 dla komponentów UI. Podnieś do `text-white/50` (≈3.6:1).

**Contract**: Zamiana `text-white/30` na `text-white/50` w klasach resting state. Hover state (`hover:text-red-400`) pozostaje bez zmian.

### Success Criteria

#### Automated Verification

- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Otwórz `/quotes/new` → użyj Tab by dojść do wiersza w LineItemsEditor → naciśnij Enter → komórka wchodzi w tryb edycji
- Spacja na komórce → to samo
- Użyj Tab w QuoteFilterBar → każdy przycisk filtra i sortowania ma widoczny fioletowy focus ring
- Użyj Tab w ConversationCard → przycisk "Pomiń" ma focus ring
- Sprawdź przyciski "✕" delete w QuotesList i LineItemsEditor → widocznie jaśniejsze w resting state (nie prawie niewidoczne jak wcześniej); hover daje czerwony kolor

**Implementation Note**: Pauza po tej fazie. Plan 1 zakończony.

---

## Testing Strategy

### Automated Verification

- `npm run lint` po każdej fazie
- `npm run build` po każdej fazie
- Grep checks na starter remnants po Phase 1

### Manual Testing Steps

1. Przejdź pełny flow niezalogowanego użytkownika: `/` → "Zaloguj się" → `/auth/signin` → logowanie → `/quotes`
2. Wyloguj → `/auth/signin` (nie `/`)
3. Zaloguj się ze złym hasłem → polski komunikat
4. Tab przez cały QuoteFilterBar → wszystkie kontrolki osiągalne z focus ring
5. Otwórz `/quotes/new` → stwórz wycenę → edytuj pozycje tylko klawiaturą (Tab + Enter)
6. Otwórz `/quotes/nonexistent-id` → komunikat o brakującej wycenie z linkiem powrotu
7. Zablokuj sieć → wywołaj akcje w QuoteEditor, UserContextForm → komunikaty błędów z role="alert"
8. Sprawdź `<html lang="pl">` i `<nav aria-label>` w page source
9. Browser accessibility inspector (np. axe DevTools) → brak HIGH violations

## Migration Notes

Brak migracji danych. Zmiany `package.json` nie wymagają `npm install`.

## References

- Research: `context/changes/ui-enhancements/research.md`
- WCAG 2.1 SC 3.1.1 (Language of Page): lang attribute requirement
- WCAG 2.1 SC 1.3.1 (Info and Relationships): ARIA labels and roles
- WCAG 2.1 SC 1.4.3 (Contrast — Minimum): 4.5:1 for text, 3:1 for UI components
- Wzorzec role="alert": `src/components/hooks/useQuoteCreator.ts:48–55` — referencyjna implementacja setTimeout z ref cleanup

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Starter Cleanup & Branding

#### Automated

- [x] 1.1 Brak "10x Astro Starter" / "10x-astro-starter" w src/ (grep) — 5d88cd7
- [x] 1.2 `public/template.png` nie istnieje; README go nie referencjonuje — 5d88cd7
- [x] 1.3 `npm run build` — bez błędów — 5d88cd7
- [x] 1.4 `npm run lint` — bez błędów — 5d88cd7

#### Manual

- [x] 1.5 Odwiedź `/` jako gość → QuoteKit branding, zero śladów startera — 5d88cd7
- [x] 1.6 Odwiedź `/` jako zalogowany → redirect na `/quotes` — 5d88cd7
- [x] 1.7 Karta przeglądarki na stronie bez własnego title → "QuoteKit" — 5d88cd7
- [x] 1.8 Banner błędu konfiguracji → link nie prowadzi do obcego repo — 5d88cd7

### Phase 2: Auth Flat Theme + Auth Redirects + Error i18n

#### Automated

- [x] 2.1 Brak `bg-cosmic` / `backdrop-blur-xl` w `src/pages/auth/` (grep) — 997b795
- [x] 2.2 `npm run build` — bez błędów — 997b795
- [x] 2.3 `npm run lint` — bez błędów — 997b795

#### Manual

- [x] 2.4 Auth pages mają płaskie tło `bg-gray-950`, karta bez rozmycia — 997b795
- [x] 2.5 Logowanie przekierowuje na `/quotes` — 997b795
- [x] 2.6 Wylogowanie przekierowuje na `/auth/signin` — 997b795
- [x] 2.7 Błędne hasło → komunikat po polsku — 997b795
- [x] 2.8 Niepotwierdony e-mail → inny komunikat po polsku — 997b795

### Phase 3: Foundation Accessibility — ARIA Labels & lang

#### Automated

- [x] 3.1 `grep -n 'lang="en"' src/layouts/Layout.astro` — brak wyników — 74ee0a0
- [x] 3.2 `npm run build` — bez błędów — 74ee0a0
- [x] 3.3 `npm run lint` — bez błędów — 74ee0a0

#### Manual

- [x] 3.4 `<html lang="pl">` w page source — 4e799d9
- [x] 3.5 `<nav aria-label="Nawigacja główna">` widoczny w DevTools — 4e799d9
- [x] 3.6 FormField w błędzie: input ma `aria-invalid="true"` i `aria-describedby` — 4e799d9
- [x] 3.7 Przyciski filtrów QuoteFilterBar mają `aria-pressed` — 4e799d9
- [x] 3.8 Search input ma `aria-label` — 4e799d9
- [x] 3.9 Status selects w QuotesList mają `aria-label` z tytułem wyceny — 4e799d9
- [x] 3.10 Delete buttons mają `aria-label` z tytułem wyceny — 4e799d9
- [x] 3.11 ConversationCard textarea ma `aria-labelledby` wskazujące na pytanie — 4e799d9
- [x] 3.12 UserContextForm textarea ma `aria-label` — 4e799d9

### Phase 4: Dynamic Feedback — role="alert" + Silent Rollback Fix

#### Automated

- [x] 4.1 `npm run build` — bez błędów — 77d4dc7
- [x] 4.2 `npm run lint` — bez błędów — 77d4dc7

#### Manual

- [x] 4.3 QuoteCreator error ma `role="alert"` (inspect) — 4e799d9
- [x] 4.4 QuoteEditor error/success mają `role="alert"` / `role="status"` (inspect) — 4e799d9
- [x] 4.5 UserContextForm error ma `role="alert"` (inspect) — 4e799d9
- [x] 4.6 QuotesList delete error ma `role="alert"` (inspect) — 4e799d9
- [x] 4.7 ConversationCard error ma `role="alert"` (inspect) — 4e799d9
- [x] 4.8 Rollback statusu wyceny → użytkownik widzi komunikat błędu (nie cichy rollback) — 4e799d9

### Phase 5: Error Pages + Rate Limit UX

#### Automated

- [x] 5.1 `test -f src/pages/404.astro` — plik istnieje — 3cb2b70
- [x] 5.2 `npm run build` — bez błędów — 3cb2b70
- [x] 5.3 `npm run lint` — bez błędów — 3cb2b70

#### Manual

- [x] 5.4 `/quotes/nonexistent-id` → komunikat z linkiem powrotu, Topbar widoczny — 4e799d9
- [x] 5.5 Nieistniejący URL → 404.astro z Layout — 4e799d9
- [x] 5.6 Rate limit 429 → komunikat o limicie, nie "błąd połączenia" — 4e799d9

### Phase 6: Keyboard Access + Color Contrast

#### Automated

- [x] 6.1 `npm run build` — bez błędów — 4e799d9
- [x] 6.2 `npm run lint` — bez błędów — 4e799d9

#### Manual

- [x] 6.3 Tab do LineItemsEditor → Enter otwiera edycję komórki — 4e799d9
- [x] 6.4 Spacja na komórce LineItemsEditor → to samo — 4e799d9
- [x] 6.5 Tab przez QuoteFilterBar → focus ring widoczny na każdym przycisku — 4e799d9
- [x] 6.6 Tab przez ConversationCard → focus ring na przycisku "Pomiń" — 4e799d9
- [x] 6.7 Delete buttons mają widoczny kolor w resting state (nie prawie niewidoczny) — 4e799d9
