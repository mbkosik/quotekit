# UI Visual Quality — Plan Implementacji (Plan 2)

## Overview

Plan 2 adresuje spójność wizualną i jakość kodu UI pozostawione poza zakresem Plan 1 (`ui-enhancements`). Normalizujemy tekst/opacity do 3 semantycznych poziomów, migrujemy wszystkie przyciski akcji do shadcn `<Button>`, wprowadzamy współdzielone komponenty `<AppTextarea>` i `<InlineError>`, ujednolicamy ikony przez Lucide, porządkujemy jakość kodu (hooki, cn(), importy) i zamykamy MEDIUM a11y (empty states, loading UX, kontrast).

## Current State Analysis

Na podstawie `context/changes/ui-enhancements/research.md`:

- Tekst secondary używa 6 poziomów opacity (`/40`–`/90`) bez semantycznej reguły; design tokeny (`--muted-foreground` itd.) zdefiniowane w `global.css` ale nieużywane.
- Przyciski akcji to surowe `<button>` z ręcznymi klasami Tailwind w 3+ wariantach padding/radius; shadcn `<Button>` zainstalowany ale użyty tylko w systemie.
- 4 różne wzorce stylowania błędów inline; 3 osobne implementacje textarea z identycznym className.
- Ikony: Lucide w auth, raw SVG w Welcome.astro, Unicode (`✕`, `←→↑↓`) w quotes area.
- `SignInForm.tsx` (4 state vars) i `SignUpForm.tsx` (6 state vars) mają logikę stanu inline bez hooka.
- `QuoteFilterBar.tsx`, `QuotesList.tsx`, `UserContextForm.tsx` naruszają konwencję cn() przez template literals.
- Brak empty states, skeleton, i loading indicator podczas delete; `done` phase auto-resetuje po 3s bez zgody użytkownika.

## Desired End State

Po zakończeniu planu:
- Wszystkie kolory tekstu secondary/muted/placeholder używają jednego z 3 kanonicznych poziomów (`text-white/60`, `text-white/40`, `text-white/30`).
- Każdy przycisk akcji w obszarze app (quotes, settings) to shadcn `<Button>` z wbudowanym focus ringiem.
- `<AppTextarea>` i `<InlineError>` są jedynymi implementacjami tych UI patternów.
- Quotes area używa Lucide konsekwentnie — zero Unicode chars i inline SVG jako ikon.
- `SignInForm` i `SignUpForm` delegują stan do dedykowanych hooków.
- Wszystkie cn() violations naprawione; importy przez `@/` alias.
- Empty states, loading przy delete, done-phase z potwierdzeniem użytkownika.
- Kontrast text-white/40 poprawiony do canonical; auth gradient zweryfikowany.

### Key Discoveries

- `src/components/ui/button.tsx` używa `rounded-md` hardkodowanego w `cva` — przed migracją CTA zmień na `rounded-xl` by dopasować do obecnego designu app.
- `--primary` w `global.css` może nie odpowiadać purple-600 używanemu ręcznie w komponentach — zweryfikuj i dostosuj przed migracją przycisków.
- `LineItemsEditor` dodaje wiersze przez `addRow` bez nadawania stabilnego `id` — dodanie `_clientId` (UUID at creation, not persisted) to najmniej inwazyjna naprawka key prop bez zmiany schematu DB.
- Lucide jest już zainstalowane (`lucide-react` w package.json) — zero nowych zależności do dodania.
- `Banner.astro` używa `<style>` z hex-ami zamiast Tailwind — przepisanie na Tailwind klasy usuwa `<style>` block całkowicie i wyrównuje do reszty kodu.
- `React.SubmitEvent` (D10) nie istnieje w typach React — poprawna forma to `React.FormEvent<HTMLFormElement>` lub `FormEvent<HTMLFormElement>` z named import.

## What We're NOT Doing

- Pełna adopcja CSS custom properties shadcn (--primary, --foreground itd.) we wszystkich komponentach — tylko normalizacja 3 poziomów opacity
- Welcome.astro zmiany — przepisane w Plan 1
- Auth komponenty restyling — zrobione w Plan 1
- E2E testy
- Paginacja URL preservation w SSR (C34) — wymaga zmiany w Astro page i API, odkładamy osobno
- B12 (3 warianty spinnerów) — Button spinner jest built-in po migracji Phase 2; pozostałe spinnery normalizowane przy okazji
- Testowanie kontrastu C38 (auth gradient) — Plan 1 zmienił auth na flat theme; weryfikacja kontrastu jest w Phase 5 jako check, nie osobna faza

## Implementation Approach

5 faz w kolejności zależności: (1) tokeny i normalizacja wizualna tworzy bazę, (2) shadcn Button migration korzysta ze znormalizowanych klas, (3) AppTextarea i InlineError używają nowych wzorców, (4) code quality jest niezależna ale najłatwiejsza po ustabilizowaniu komponentów, (5) MEDIUM a11y zamyka otwarte UX gaps.

## Critical Implementation Details

**shadcn Button variant override**: `src/components/ui/button.tsx` definuje `rounded-md` w `cva()`. Zmień na `rounded-xl` zanim zaczniesz Phase 2 — inaczej każdy zmigrowany button będzie wyglądał inaczej niż reszta projektu.

**`--primary` alignment**: Shadcn Button's `variant="default"` używa `bg-primary`. Sprawdź `global.css` linię z `--primary:` — jeśli nie jest to odpowiednik `bg-purple-600`, zaktualizuj wartość. Dopiero potem migruj przyciski.

**`role="alert"` i `<InlineError>`**: Plan 1 dodał `role="alert"` jako inline atrybuty. `<InlineError>` w Phase 3 musi zachować tę semantykę — element zawsze w DOM z pustą treścią gdy brak błędu, nie warunkowo renderowany. Implementacja: `<p role="alert" aria-live="assertive">{message ?? ""}</p>`.

---

## Phase 1: Opacity Normalization + Visual Foundation

### Overview

Standaryzujemy kolory tekstu do 3 poziomów, normalizujemy max-widths w /new flow, dodajemy brakujące h1 na stronach, przepisujemy Banner.astro z hex na Tailwind i eliminujemy niespójności w Topbarze i secondary buttons.

### Changes Required

#### 1. global.css — komentarz definiujący 3 poziomy opacity

**File**: `src/styles/global.css`

**Intent**: Dodaj komentarz dokumentujący 3 kanoniczne poziomy koloru tekstu zaraz po sekcji @theme: `text-white/60` = secondary (body, labels), `text-white/40` = muted (empty states, hints, dezaktywowane), `text-white/30` = placeholder (placeholdery inputs). Brak nowych klas CSS — poziomy to istniejące Tailwind utilities.

**Contract**: Tylko komentarz. Zmiany klas są w poszczególnych komponentach poniżej.

#### 2. Normalizacja opacity w komponentach (masowe znajdź-i-zastąp)

**Files**: `src/components/**/*.tsx`, `src/pages/**/*.astro`, `src/components/**/*.astro`

**Intent**: Zastąp wszystkie niestandardowe wartości opacity koloru tekstu kanoniycznymi. Reguła mapowania:
- `text-white/50` → `text-white/40` (muted)
- `text-white/70` → `text-white/60` (secondary)
- `text-white/80` → `text-white/60` (secondary)
- `text-white/90` → `text-white/60` (secondary)
- `text-blue-100/60`, `text-blue-100/70` (Topbar, auth) → `text-white/60`
- `text-blue-100/50` jeśli istnieje → `text-white/40`

**Contract**: Grep przed i po dla każdej wartości. Uwaga: nie zmieniaj `text-white` (pełna biel) ani wartości w komentarzach. Sprawdź visual output po każdym pliku — muted (`/40`) jest ciemniejsze niż `/50`, więc zmiana może być subtelnie ciemniejsza.

#### 3. Normalize spinner variants (B12)

**Files**: `src/components/quotes/ConversationCard.tsx`, `src/components/quotes/InquiryForm.tsx`

**Intent**: Spinnery mają 3 różne pary border-opacity. Ujednolicamy do jednego wzorca: `border-white/20 border-t-white/80`.

**Contract**: Dotyczy spinnerów w ConversationCard.tsx:45 i InquiryForm.tsx:65,88. `auth/SubmitButton.tsx` zostawiamy bez zmian (należy do auth area).

#### 4. B10 Banner.astro — Tailwind zamiast hex

**File**: `src/components/Banner.astro`

**Intent**: Usuń `<style>` blok z 9 hardkodowanymi hex-ami. Przepisz klasy CSS na odpowiedniki Tailwind: info = `bg-blue-100 text-blue-900 border-blue-300`, warning = `bg-amber-50 text-amber-900 border-amber-300`, error = `bg-red-100 text-red-900 border-red-300`.

**Contract**: Sprawdź wszystkie 3 typy bannerów (info, warning, error) w przeglądarce po zmianie. Banner.astro jest importowany przez Layout.astro i pojawia się na każdej stronie.

#### 5. B7 max-width normalizacja

**Files**: `src/components/quotes/InquiryForm.tsx`, `src/components/quotes/ConversationCard.tsx`, `src/components/quotes/ClientQuestionsList.tsx`, `src/components/quotes/LineItemsEditor.tsx`, `src/pages/quotes/index.astro`, `src/components/quotes/QuoteEditor.tsx`

**Intent**: Ujednolicamy max-width w dwóch grupach:
- Flow `/new`: InquiryForm/ConversationCard/ClientQuestionsList `max-w-2xl` → `max-w-3xl`; LineItemsEditor `max-w-4xl` → `max-w-3xl`
- Flow `/quotes`: lista `max-w-3xl` zostaje; QuoteEditor `max-w-4xl` → `max-w-3xl`

**Contract**: Zmiana z `max-w-2xl` lub `max-w-4xl` na `max-w-3xl` w odpowiednich komponentach. Sprawdź czy tabela LineItemsEditor jest czytelna przy 768px.

#### 6. B13 Brakujące h1 na /new i /quotes/[id]

**Files**: `src/pages/new.astro`, `src/pages/quotes/[id].astro`

**Intent**: Dodaj wizualnie ukryte (screen-reader-visible) lub widoczne `<h1>` na obu stronach.

**Contract**: Na `/new`: `<h1 className="sr-only">Nowa wycena</h1>` lub widoczny nagłówek przed `<QuoteCreator>`. Na `/quotes/[id]`: jeśli QuoteEditor eksponuje tytuł wyceny, użyj go w h1 strony; w przeciwnym razie `<h1 className="sr-only">Edycja wyceny</h1>`.

#### 7. B11 border-white/20 normalizacja

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Przycisk "Dodaj pozycję" używa `border-white/20` (dashed). Sprawdź czy kontrast jest celowy (dashed = wizualnie odróżniony). Jeśli tak, zostaw. Jeśli nie, zmień na `border-white/10`.

**Contract**: Tylko LineItemsEditor linia ~207. Welcome.astro (border-white/20) jest przepisane w Plan 1.

### Success Criteria

#### Automated Verification

- `grep -rn "text-white/50\|text-white/70\|text-white/80\|text-white/90\|text-blue-100" src/` — brak wyników (za wyjątkiem ewentualnych komentarzy)
- Brak `<style>` w `src/components/Banner.astro`: `grep -n "<style>" src/components/Banner.astro` — brak wyników
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Przejrzyj `/quotes` i `/new` → secondary text czytelnie spójny, żadna etykieta nie wydaje się za jasna lub za ciemna względem sąsiednich
- Sprawdź Banner (info/warning/error) w przeglądarce → poprawne kolory bez regressji
- Tab przez `/new` flow → spójny max-width 3xl na wszystkich krokach
- QuotesList i QuoteEditor mają ten sam max-width
- Topbar email nie ma niebieskiego odcienia — jest neutral white
- Screen reader widzi h1 na /new i /quotes/[id]

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 2.

---

## Phase 2: shadcn Button Migration

### Overview

Migrujemy wszystkie ręczne `<button>` w obszarze app (quotes, settings) do `<Button>` z shadcn/ui. Przed migracją: (a) zmieniamy `rounded-md` → `rounded-xl` w `button.tsx`, (b) weryfikujemy `--primary` = purple-600 w global.css.

### Changes Required

#### 1. src/components/ui/button.tsx — rounded-xl override

**File**: `src/components/ui/button.tsx`

**Intent**: Zmień `rounded-md` na `rounded-xl` w definicji `cva` — żeby wszystkie przyciski automatycznie dostawały pożądany border-radius.

**Contract**: Jedna zamiana stringa w definicji `cva` — szukaj `"rounded-md"` i zamień na `"rounded-xl"`. Sprawdź czy ta zmiana nie łamie auth/SubmitButton (który był `rounded-lg` — może chcieć zostać przy swoim stylu via override `className`).

#### 2. global.css — weryfikacja --primary i --ring

**File**: `src/styles/global.css`

**Intent**: Upewnij się, że `--primary` w sekcji `.dark` lub `@layer base` odpowiada `bg-purple-600`. Jeśli zdefiniowany jest jako inny kolor, zaktualizuj do oklch/hsl purple-600.

**Contract**: Zmiana wartości `--primary:` na odpowiednik purple-600 (`oklch(0.558 0.288 282.5)` lub `59.7% 0.25 292.5` w oklch). Sprawdź też `--ring` — powinien pasować do purple dla focus ring.

#### 3. InquiryForm.tsx — migracja przycisków

**File**: `src/components/quotes/InquiryForm.tsx`

**Intent**: Primary button (linia ~61) → `<Button type="submit" disabled={loading}>`. Secondary button (linia ~84) → `<Button type="button" variant="outline" disabled={questionsLoading}>`. Usuń ręczne klasy padding/radius/opacity.

**Contract**: Import `{ Button }` z `@/components/ui/button`. Zachowaj `disabled` state i loading spinner (Button akceptuje children — spinner może być inside). Wariant `"outline"` dla secondary buttons.

#### 4. ConversationCard.tsx — migracja przycisków

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Submit button → `<Button type="submit">`. Skip button → `<Button type="button" variant="ghost">`. Retry button → `<Button type="button" variant="ghost">`.

**Contract**: Analogiczne do Phase 2 / Change 3. Zachowaj `disabled={!answer.trim()}` na submit.

#### 5. LineItemsEditor.tsx — migracja przycisków

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: "Zapisz wycenę" button → `<Button type="button">`. "Dodaj pozycję" button → `<Button type="button" variant="outline">` (zachowaj dashed border jeśli celowy przez `className`).

**Contract**: "Usuń pozycję" row delete (będzie ikona w Phase 3) tymczasowo zostaje jako-jest lub migruje do `<Button variant="ghost" size="icon">` już tutaj.

#### 6. UserContextForm.tsx — migracja przycisku

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: "Zapisz" button → `<Button type="submit" disabled={status === "saving"}>`.

**Contract**: Analogiczne do poprzednich.

#### 7. ClientQuestionsList.tsx — migracja przycisków

**File**: `src/components/quotes/ClientQuestionsList.tsx`

**Intent**: "Kopiuj wszystkie" → `<Button variant="outline">`. "Wróć do wyceny" → `<Button variant="ghost">`.

**Contract**: Analogiczne.

#### 8. QuoteFilterBar.tsx — migracja przycisków

**File**: `src/components/quotes/QuoteFilterBar.tsx`

**Intent**: Filter toggle buttons → `<Button variant="ghost">` z `data-active` lub `cn()` dla active state. Sort button → `<Button variant="ghost">`. Zachowaj `aria-pressed` dodany w Plan 1.

**Contract**: Active state filter buttons mogą używać `cn("...", active && "bg-purple-600 text-white")` jako `className` prop na `<Button>`.

#### 9. QuotesList.tsx — delete button

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Delete button → `<Button variant="ghost" size="icon">` (ikona X zostanie dodana w Phase 3). Tymczasowo zachowaj ✕ jako content.

**Contract**: `size="icon"` dostarcza `h-9 w-9` lub podobny padding dla przycisków ikon.

#### 10. QuoteEditor.tsx — migracja przycisków

**File**: `src/components/quotes/QuoteEditor.tsx`

**Intent**: Save button → `<Button>`. Delete button → `<Button variant="destructive">`.

**Contract**: Analogiczne. Sprawdź czy `variant="destructive"` ma poprawny kolor (--destructive w global.css = red).

### Success Criteria

#### Automated Verification

- `grep -rn "className=.*px-[0-9].*py-[0-9].*rounded" src/components/quotes/ src/components/settings/` — brak wyników wskazujących na ręczne przyciski (poza ewentualnymi edge cases)
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Przejdź przez `/new` flow → wszystkie przyciski mają spójny wygląd (rounded-xl, poprawne warianty)
- Tab przez formularz → każdy przycisk ma focus ring (fioletowy, z Button built-in)
- Disabled state → opacity jednolita (shadcn domyślne opacity-50)
- `/quotes` delete button → ikona (placeholder ✕) widoczna
- QuoteEditor save/delete → poprawne kolory wariantów
- Auth SubmitButton NIE ma regressions (nadal rounded-lg jeśli override)

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 3.

---

## Phase 3: Shared UI Components + Lucide Icons

### Overview

Tworzymy `<AppTextarea>` i `<InlineError>` jako współdzielone komponenty UI. Zastępujemy 3× zduplikowane textarea i 5× wzorce błędów. Migrujemy Unicode chars i inline SVG na Lucide w obszarze quotes.

### Changes Required

#### 1. src/components/ui/app-textarea.tsx — nowy komponent

**File**: `src/components/ui/app-textarea.tsx` (nowy plik)

**Intent**: Enkapsuluje standardowy textarea QuoteKit z pełnym zestawem propsów: `value`, `onChange`, `placeholder`, `rows?`, `disabled?`, `className?`, plus przekazywane `aria-label`, `aria-labelledby`, `aria-describedby`. Forwards ref.

**Contract**: Eksportowany jako `AppTextarea`. Używa `React.forwardRef<HTMLTextAreaElement, AppTextareaProps>`. Domyślny className: `"resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/40"`. Dodatkowy `className` mergowany przez `cn()`.

#### 2. InquiryForm.tsx — użycie AppTextarea

**File**: `src/components/quotes/InquiryForm.tsx`

**Intent**: Zastąp `<textarea>` w linia ~50 przez `<AppTextarea>`. Przekaż `aria-label` dodany w Plan 1 (jeśli był jako atrybut) lub `aria-labelledby`.

**Contract**: Import `{ AppTextarea }` z `@/components/ui/app-textarea`. Sprawdź że ref (jeśli używany przez autoFocus lub focus management) jest nadal przekazywany.

#### 3. ConversationCard.tsx — użycie AppTextarea

**File**: `src/components/quotes/ConversationCard.tsx`

**Intent**: Zastąp `<textarea>` w linia ~57 przez `<AppTextarea>`. Przekaż `aria-labelledby` z Plan 1.

**Contract**: Analogiczne do Change 2.

#### 4. UserContextForm.tsx — użycie AppTextarea

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: Zastąp `<textarea>` w linia ~53 przez `<AppTextarea>`. Przekaż `aria-label` z Plan 1.

**Contract**: Analogiczne.

#### 5. src/components/ui/inline-error.tsx — nowy komponent

**File**: `src/components/ui/inline-error.tsx` (nowy plik)

**Intent**: Komponent do wyświetlania błędów inline w obszarze app. Zawsze w DOM (pusta treść gdy brak błędu) dla poprawnego screen reader announcement. Nie dotyczy `ServerError.tsx` w auth — to inny kontekst wizualny.

**Contract**: Props: `message: string | null | undefined`. Renderuje: `<p role="alert" aria-live="assertive" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{message ?? ""}</p>`. Gdy `message` jest falsy, element jest pusty ale w DOM. Eksportowany jako `InlineError`.

#### 6. QuoteCreator.tsx — użycie InlineError

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Zastąp inline błąd (linia ~49) przez `<InlineError message={error} />`. Usuń ręczny `role="alert"` dodany w Plan 1 (przejmuje go komponent).

**Contract**: Import `{ InlineError }` z `@/components/ui/inline-error`. Usuń warunkowe `{error && ...}` — `InlineError` obsługuje null.

#### 7. QuoteEditor.tsx, QuotesList.tsx, ConversationCard.tsx — użycie InlineError

**Files**: `src/components/quotes/QuoteEditor.tsx`, `src/components/quotes/QuotesList.tsx`, `src/components/quotes/ConversationCard.tsx`

**Intent**: Zastąp inline błędy przez `<InlineError>` w każdym z tych plików.

**Contract**: Analogiczne do Change 6. QuoteEditor ma osobny success message (role="status") — ten zostawia jako-jest lub tworzy `<InlineSuccess>` — na razie wystarczy InlineError tylko dla błędów.

#### 8. UserContextForm.tsx — InlineError dla błędu

**File**: `src/components/settings/UserContextForm.tsx`

**Intent**: Zastąp `<span>` z błędem przez `<InlineError message={status === "error" ? "Błąd zapisu — spróbuj ponownie" : null} />`.

**Contract**: Analogiczne. Success message (`status === "success"`) zostaje jako osobny element z `role="status"`.

#### 9. Lucide icons — migracja Unicode i inline SVG

**Files**: `src/components/quotes/QuotesList.tsx`, `src/components/quotes/QuoteEditor.tsx`, `src/components/quotes/QuoteFilterBar.tsx`, `src/components/quotes/QuoteCreator.tsx`, `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Zastąp Unicode characters i inline SVG ikonami Lucide. Wszystkie ikony dekoracyjne (obok tekstu lub z aria-label na rodzicu) dostają `aria-hidden={true}`.

**Contract**: Mapowanie:
- `✕` w QuotesList delete button (Phase 2 już konwertuje na Button size="icon") → `<X size={14} aria-hidden />`
- `✕` w LineItemsEditor row delete → `<X size={12} aria-hidden />`
- `←` w QuoteEditor:43 → `<ChevronLeft size={16} aria-hidden />`
- `→` w QuoteCreator:40 → `<ChevronRight size={16} aria-hidden />`
- `↑`/`↓` w QuoteFilterBar:63 → `<ArrowUp size={14} aria-hidden />` / `<ArrowDown size={14} aria-hidden />`
- `←`/`→` pagination buttons w QuotesList:148,160 → `<ChevronLeft size={14} aria-hidden />` / `<ChevronRight size={14} aria-hidden />`
Lucide jest już zainstalowane — tylko dodaj import z `"lucide-react"`.

### Success Criteria

#### Automated Verification

- `test -f src/components/ui/app-textarea.tsx` — plik istnieje
- `test -f src/components/ui/inline-error.tsx` — plik istnieje
- `grep -rn "resize-none rounded-xl border border-white/10 bg-white/5" src/components/` — brak duplikatów (tylko w app-textarea.tsx)
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Otwórz /new → textarea InquiryForm wygląda identycznie jak przed (AppTextarea nie zmienia wizualizacji)
- Otwórz ConversationCard → textarea identyczna
- Wywołaj błąd w QuoteCreator/QuoteEditor/QuotesList/ConversationCard → InlineError wyświetla z spójnym stylem (bg-red-500/10 border-red-500/20)
- Ikony nawigacji i delete w quotes area to Lucide, nie Unicode
- Sort button w QuoteFilterBar używa ikony strzałki Lucide
- Focus ring (z Plan 1 i Phase 2) nadal widoczny na wszystkich przyciskach

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 4.

---

## Phase 4: Code Quality

### Overview

Ekstrakujemy logikę stanu auth form do hooków, naprawiamy cn() violations, stable keys, relative imports i setTimeout cleanup.

### Changes Required

#### 1. src/components/hooks/useSignUpForm.ts — nowy hook

**File**: `src/components/hooks/useSignUpForm.ts` (nowy plik)

**Intent**: Ekstrakujemy z `SignUpForm.tsx` cały stan (6 zmiennych) i logikę (validate, handleSubmit, clearError) do dedykowanego hooka. Przestrzega lessons.md: komponenty z >2–3 state vars delegują do `src/components/hooks/`.

**Contract**: Eksportuje hook `useSignUpForm()` zwracający `{ email, setEmail, password, setPassword, confirmPassword, setConfirmPassword, showPassword, toggleShowPassword, showConfirmPassword, toggleShowConfirmPassword, errors, handleSubmit, clearError }`. Wywołanie `handleSubmit` robi POST do `/api/auth/signup`.

#### 2. src/components/auth/SignUpForm.tsx — użycie useSignUpForm

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Zastąp inline state przez `const { ... } = useSignUpForm()`. Komponent staje się czystym render-only.

**Contract**: Usuń wszystkie `useState` deklaracje i logikę z komponentu. Zachowaj identyczne renderowanie.

#### 3. src/components/hooks/useSignInForm.ts — nowy hook

**File**: `src/components/hooks/useSignInForm.ts` (nowy plik)

**Intent**: Analogicznie do useSignUpForm dla `SignInForm.tsx` (4 state vars + validate/clearError/handleSubmit).

**Contract**: Eksportuje `useSignInForm()` z `{ email, setEmail, password, setPassword, showPassword, toggleShowPassword, errors, handleSubmit, clearError }`.

#### 4. src/components/auth/SignInForm.tsx — użycie useSignInForm

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Zastąp inline state przez `const { ... } = useSignInForm()`.

**Contract**: Analogiczne do Change 2.

#### 5. cn() violations — 3 pliki

**Files**: `src/components/quotes/QuoteFilterBar.tsx:37–41`, `src/components/quotes/QuotesList.tsx:81`, `src/components/settings/UserContextForm.tsx:56`

**Intent**: Zastąp template literals conditional className przez `cn()`.

**Contract**: Import `{ cn }` z `@/lib/utils` jest już prawdopodobnie w tych plikach (jeśli nie — dodaj). Wzorzec: `className={cn("base-classes", condition && "conditional-class")}`.

#### 6. LineItemsEditor.tsx — stable key dla row items

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Zastąp `key={i}` (index) przez `key={item._clientId}` gdzie `_clientId` to UUID generowany przy dodawaniu wiersza przez `addRow`.

**Contract**: Dodaj pole `_clientId: string` do interfejsu/type pozycji wyceny (tylko w tym komponencie — nie w typach Supabase/API). W `addRow`, ustaw `_clientId: crypto.randomUUID()`. `_clientId` nie jest wysyłany do API — to wewnętrzne pole klienta.

#### 7. InquiryForm.tsx — extract inline handler

**File**: `src/components/quotes/InquiryForm.tsx`

**Intent**: Wyodrębnij inline logikę onClick przycisku "Generuj pytania" (linia ~74–83) do nazwanej funkcji `handleGenerateQuestionsClick` zdefiniowanej przed `return`.

**Contract**: Funkcja wywołuje `onGenerateQuestions(text.trim())` po walidacji długości ≥3 znaków. Usuwa `setValidationError`/`setValidationError("")` z inline handlera.

#### 8. QuoteCreator.tsx — relative imports → @/ alias

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Zmień 4 relative imports (`"./InquiryForm"` etc.) na `@/components/quotes/...`.

**Contract**: Linie 2–5. Jeden-do-jeden zamiana ścieżek.

#### 9. React.SubmitEvent fix

**Files**: `src/components/quotes/ConversationCard.tsx:26`, `src/components/quotes/InquiryForm.tsx:23`

**Intent**: `React.SubmitEvent` nie istnieje w typach React — zamień na `React.FormEvent<HTMLFormElement>` lub importuj `FormEvent` z `"react"` i użyj `FormEvent<HTMLFormElement>`.

**Contract**: Sprawdź czy zmiana type annotation nie łamie logiki funkcji (event ma identyczny kształt).

#### 10. setTimeout z ref + cleanup

**Files**: `src/components/settings/UserContextForm.tsx:29`, `src/components/quotes/useQuoteEditor.ts:42`

**Intent**: Storeuj timer ID w `useRef<ReturnType<typeof setTimeout>>`. Czyść w `useEffect` cleanup. Wzorzec referencyjny: `useQuoteCreator.ts:48–55`.

**Contract**: Dodaj `const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`. Przypisz `timerRef.current = setTimeout(...)`. W `useEffect` return: `() => { if (timerRef.current) clearTimeout(timerRef.current); }`.

### Success Criteria

#### Automated Verification

- `test -f src/components/hooks/useSignUpForm.ts` — plik istnieje
- `test -f src/components/hooks/useSignInForm.ts` — plik istnieje
- `grep -rn 'key={i}' src/components/quotes/LineItemsEditor.tsx` — brak wyników
- `grep -rn 'className={`' src/components/quotes/QuoteFilterBar.tsx src/components/quotes/QuotesList.tsx src/components/settings/UserContextForm.tsx` — brak wyników
- `grep -n '"\./' src/components/quotes/QuoteCreator.tsx` — brak wyników
- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- Otwórz `/auth/signup` → formularz działa identycznie (register, validate, error messages)
- Otwórz `/auth/signin` → formularz działa identycznie
- Dodaj pozycję do wyceny, usuń środkową, dodaj nową → focus nie skacze do złego pola
- Przeładuj stronę z UserContextForm → brak memory leak warnings w konsoli
- TypeScript: brak błędów typów na React.FormEvent po zmianie

**Implementation Note**: Pauza po tej fazie przed przejściem do Phase 5.

---

## Phase 5: MEDIUM A11y + Polish

### Overview

Dodajemy empty states i loading indicators, naprawiamy auto-reset i delete UX, ulepszamy komunikat inquiry_unusable, weryfikujemy kontrast po Plan 1 flat theme i dodajemy drobne poprawki dostępności.

### Changes Required

#### 1. QuotesList — loading skeleton dla initial hydration (C1)

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Podczas gdy `loading === true` i lista jest pusta (initial fetch), pokaż 3 animowane placeholder boxy zamiast opacity-50 na pustej liście.

**Contract**: Skeleton = 3× `<div className="h-16 rounded-xl bg-white/5 animate-pulse" />` wewnątrz `<div className="flex flex-col gap-3">`. Warunek: `if (loading && quotes.length === 0) return <skeleton>`. Istniejące `opacity-50` podczas pagination loading zostaje.

#### 2. LineItemsEditor — empty state (C2)

**File**: `src/components/quotes/LineItemsEditor.tsx`

**Intent**: Gdy `items.length === 0`, zamiast pustego `<tbody>`, pokaż wiersz informacyjny zachęcający do dodania pierwszej pozycji.

**Contract**: Wewnątrz `<tbody>`: `{items.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-white/40 text-sm">Dodaj pierwszą pozycję wyceny za pomocą przycisku poniżej.</td></tr>}`.

#### 3. ClientQuestionsList — empty state fallback (C3)

**File**: `src/components/quotes/ClientQuestionsList.tsx`

**Intent**: Gdy `questions.length === 0`, pokaż komunikat zamiast pustego `<ol>`.

**Contract**: `{questions.length === 0 ? <p className="text-white/40 text-sm">Brak wygenerowanych pytań.</p> : <ol>...</ol>}`. Przycisk "Kopiuj wszystkie" wyłączony gdy `questions.length === 0`.

#### 4. QuoteCreator — loading phase UX (C4)

**File**: `src/components/quotes/QuoteCreator.tsx`

**Intent**: Gdy `phase === "loading"` i `questionCount === 0` (pierwszy call AI), zamiast dwóch disabled przycisków pokaż loading spinner z tekstem "Analizuję zapytanie...".

**Contract**: Dodaj case w renderowaniu: `if (phase === "loading" && questionCount === 0)` → renderuj kontener z spinner + "Analizuję zapytanie..." zamiast `<InquiryForm>`. Spinner może być tym samym wzorcem co w SubmitButton.

#### 5. QuotesList — pagination loading indicator (C6)

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Gdy `loading === true` podczas paginacji (lista niepusta), dodaj tekst "Ładowanie..." obok przycisków paginacji zamiast tylko opacity-50 na liście.

**Contract**: W sekcji paginacji: `{loading && <span className="text-white/40 text-sm">Ładowanie...</span>}`.

#### 6. QuoteCreator — done phase bez auto-reset (C30)

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Usuń `setTimeout` 3000ms który automatycznie resetuje formularz po zapisaniu. Zastąp przez przycisk "Utwórz nową wycenę" który użytkownik klika świadomie.

**Contract**: Usuń timer z linii ~195–206. Ekspozuj funkcję `resetForm()` z hooka. W `QuoteCreator.tsx`, na ekranie `phase === "done"` zamień obecny link na `<button onClick={resetForm}>Utwórz nową wycenę</button>` (jako `<Button variant="outline">`).

#### 7. QuotesList — delete loading state (C33)

**File**: `src/components/hooks/useQuotesList.ts`, `src/components/quotes/QuotesList.tsx`

**Intent**: Podczas gdy `handleDelete` jest w toku, pokaż loading state na przycisku delete (np. disabled + spinner) zamiast natychmiastowego zamknięcia dialogu.

**Contract**: Dodaj `isDeleting: boolean` stan w hooku. Eksportuj go. W `QuotesList.tsx`, delete button w AlertDialog footer: `disabled={isDeleting}`. AlertDialog nie zamyka się automatycznie — zamykamy dopiero po pomyślnym delete.

#### 8. QuotesList — select status change visual confirmation (C41)

**File**: `src/components/quotes/QuotesList.tsx`

**Intent**: Po pomyślnej zmianie statusu przez `<select>`, daj brief visual feedback (np. border select na chwilę zmienia kolor lub pojawia się check icon przez 2s).

**Contract**: Najprostsze: `statusError` z useQuotesList (dodany w Plan 1) już działa dla błędów. Dla sukcesu: dodaj `statusSuccess: string | null` stan w hooku; ustaw go po pomyślnym fetch; wyczyść po 2s przez timer ref. W QuotesList: `<InlineError message={statusError} />` już istnieje; dodaj `{statusSuccess && <p role="status" className="text-sm text-green-400">{statusSuccess}</p>}`.

#### 9. useQuoteCreator — inquiry_unusable lepszy komunikat (C14)

**File**: `src/components/hooks/useQuoteCreator.ts`

**Intent**: Gdy API zwraca `{ error: "inquiry_unusable" }`, pokaż konkretny komunikat zamiast generycznego.

**Contract**: W sprawdzeniu `if ("error" in data)` (linia ~63–65), dodaj: `if (data.error === "inquiry_unusable") { setSparseMessage("Opis jest zbyt ogólny. Podaj zakres prac, technologię i oczekiwania — min. 3-4 zdania."); return; }`. Generyczny fallback zostaje dla innych błędów.

#### 10. confirm-email.astro — emoji accessibility (C29)

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Div z emoji (✅ lub 📧) jest renderowany bez `aria-hidden`. Dodaj `aria-hidden="true"` i `<span class="sr-only">` z opisem słownym.

**Contract**: `<div aria-hidden="true" class="mb-4 text-5xl">{content.emoji}</div>` + `<span class="sr-only">{content.emoji === "✅" ? "Sukces" : "E-mail"}</span>`.

#### 11. Kontrast weryfikacja po flat theme (C37–C39)

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/components/Topbar.astro`

**Intent**: Po Plan 1 zmianie auth na flat bg-gray-950, sprawdź kontrast gradient headings (from-blue-200 to-purple-200) i text-white/40. Jeśli gradient text na bg-gray-950 nadal nie osiąga 4.5:1, zmień na plain `text-white`.

**Contract**: Użyj narzędzia kontrastu (np. Chrome DevTools color picker) na każdym elemencie. Jeśli gradient portions < 4.5:1 → zmień heading na `text-white font-bold` bez gradientu. `text-white/40` po Phase 1 normalizacji jest teraz `text-white/40` = 3.5:1 — poniżej 4.5:1 dla normalnego tekstu. Jeśli nie da się uniknąć (empty state labels), upewnij się że font-size ≥ 18px (large text threshold = 3:1) lub zwiększ do `/60`.

### Success Criteria

#### Automated Verification

- `npm run build` — bez błędów
- `npm run lint` — bez błędów

#### Manual Verification

- `/quotes` przy wolnej sieci → 3 animowane placeholder boxy podczas ładowania listy
- `/new` → LineItemsEditor bez pozycji → komunikat "Dodaj pierwszą pozycję..."
- `/new` → ClientQuestionsList z 0 pytaniami → komunikat zamiast pustego `<ol>`; "Kopiuj wszystkie" wyłączone
- `/new` → pierwsza analiza AI → loading spinner z tekstem, nie dwa disabled przyciski
- `/quotes` → zmień stronę → "Ładowanie..." obok przycisków paginacji
- `/new` → zapisz wycenę → ekran sukcesu pozostaje do kliknięcia "Utwórz nową wycenę"
- `/quotes` → usuń wycenę → button disabled podczas usuwania; AlertDialog zamknięty po sukcesie
- `/quotes` → zmień status → brief visual confirmation że zmiana się udała
- Wpisz zbyt krótkie zlecenie → komunikat informuje o wymaganiu szczegółów
- `/auth/confirm-email` → screen reader anonsuje "Sukces" lub "E-mail" zamiast ścieżki emoji
- Gradient headings auth → widoczne i z dobrym kontrastem; jeśli nie — plain white

**Implementation Note**: Plan 2 zakończony.

---

## Testing Strategy

### Automated Verification

- `npm run lint` po każdej fazie — ESLint z type-checked rules
- `npm run build` po każdej fazie — SSR build kompiluje
- Grep checks dla eliminowanych wzorców (template literals, hex colors, Unicode chars)

### Manual Testing Steps

1. Przejdź pełny flow `/new` (inquiry → pytania → pozycje → zapis → done) — tylko klawiatura
2. Przejdź `/quotes` → paginacja, zmiana statusu, delete
3. Sprawdź all states: empty (0 wycen), loading, error, success
4. Tab przez wszystkie interaktywne elementy na każdej stronie — focus ring widoczny
5. Browser a11y inspector (axe DevTools) na `/quotes`, `/new`, `/settings` — 0 violations po Phase 5
6. Verify ikony Lucide zamiast Unicode w quotes area
7. Verify AppTextarea i InlineError zachowują poprzednie aria-* atrybuty z Plan 1

## Migration Notes

Brak migracji danych. `_clientId` w LineItemsEditor jest czystym stanem klienta — nie trafia do API.

## References

- Research: `context/changes/ui-enhancements/research.md`
- Plan 1 (prerequisite): `context/changes/ui-enhancements/plan.md`
- Wzorzec hooka z non-trivial state: `context/foundation/lessons.md` — "Logika state machine komponentu trafia do hooka"
- Wzorzec setTimeout + ref cleanup: `src/components/hooks/useQuoteCreator.ts:48–55`
- shadcn Button component: `src/components/ui/button.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Opacity Normalization + Visual Foundation

#### Automated

- [x] 1.1 Brak text-white/50, /70, /80, /90, text-blue-100/* w src/ (grep) — a5ba7f6
- [x] 1.2 Brak `<style>` w Banner.astro (grep) — a5ba7f6
- [x] 1.3 `npm run build` — bez błędów — a5ba7f6
- [x] 1.4 `npm run lint` — bez błędów — a5ba7f6

#### Manual

- [x] 1.5 Secondary text spójny na /quotes i /new — a5ba7f6
- [x] 1.6 Banner (info/warning/error) wizualnie poprawny — a5ba7f6
- [x] 1.7 max-w-3xl na całym /new flow i /quotes — a5ba7f6
- [x] 1.8 Topbar email bez niebieskiego odcienia — a5ba7f6
- [x] 1.9 Screen reader widzi h1 na /new i /quotes/[id] — a5ba7f6

### Phase 2: shadcn Button Migration

#### Automated

- [x] 2.1 Brak ręcznych px-*/py-*/rounded klas na button elementach w quotes/settings (grep)
- [x] 2.2 `npm run build` — bez błędów
- [x] 2.3 `npm run lint` — bez błędów

#### Manual

- [ ] 2.4 /new flow — przyciski spójne (rounded-xl, warianty)
- [ ] 2.5 Tab przez formularz — focus ring na każdym przycisku
- [ ] 2.6 Disabled state — opacity jednolita
- [ ] 2.7 Auth SubmitButton bez regressions

### Phase 3: Shared UI Components + Lucide Icons

#### Automated

- [ ] 3.1 `test -f src/components/ui/app-textarea.tsx`
- [ ] 3.2 `test -f src/components/ui/inline-error.tsx`
- [ ] 3.3 Brak zduplikowanego textarea className w src/components/ (grep)
- [ ] 3.4 `npm run build` — bez błędów
- [ ] 3.5 `npm run lint` — bez błędów

#### Manual

- [ ] 3.6 Textarea wizualnie identyczne jak przed
- [ ] 3.7 InlineError spójny styl na wszystkich komponentach
- [ ] 3.8 Ikony Lucide zamiast Unicode w quotes area
- [ ] 3.9 Focus ring nadal widoczny na przyciskach

### Phase 4: Code Quality

#### Automated

- [ ] 4.1 `test -f src/components/hooks/useSignUpForm.ts`
- [ ] 4.2 `test -f src/components/hooks/useSignInForm.ts`
- [ ] 4.3 Brak `key={i}` w LineItemsEditor (grep)
- [ ] 4.4 Brak template literal className w 3 plikach (grep)
- [ ] 4.5 Brak relative imports w QuoteCreator (grep)
- [ ] 4.6 `npm run build` — bez błędów
- [ ] 4.7 `npm run lint` — bez błędów

#### Manual

- [ ] 4.8 SignUpForm działa identycznie po hook extraction
- [ ] 4.9 SignInForm działa identycznie
- [ ] 4.10 LineItemsEditor: usunięcie środkowego wiersza nie powoduje skoku focus

### Phase 5: MEDIUM A11y + Polish

#### Automated

- [ ] 5.1 `npm run build` — bez błędów
- [ ] 5.2 `npm run lint` — bez błędów

#### Manual

- [ ] 5.3 QuotesList loading skeleton przy initial fetch
- [ ] 5.4 LineItemsEditor pusta lista → komunikat
- [ ] 5.5 ClientQuestionsList 0 pytań → komunikat; "Kopiuj" disabled
- [ ] 5.6 QuoteCreator first AI call → loading indicator
- [ ] 5.7 Paginacja → "Ładowanie..." text
- [ ] 5.8 Done phase → brak auto-reset; przycisk do nowej wyceny
- [ ] 5.9 Delete → loading state na przycisku
- [ ] 5.10 Status change → brief visual confirmation
- [ ] 5.11 inquiry_unusable → konkretny komunikat
- [ ] 5.12 confirm-email emoji → aria-hidden
- [ ] 5.13 axe DevTools: 0 violations na /quotes, /new, /settings
