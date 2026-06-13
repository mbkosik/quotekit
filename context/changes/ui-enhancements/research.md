---
date: 2026-06-13T00:00:00+02:00
researcher: Mateusz Kosik
git_commit: 7ae532db296a3844dc606413c4caaadcab821719
branch: main
repository: mbkosik/quotekit
topic: "Pełny audyt UI — pozostałości startera, spójność wizualna, UX/dostępność, jakość kodu"
tags: [research, ui, accessibility, visual-consistency, code-quality, starter-remnants]
status: complete
last_updated: 2026-06-13
last_updated_by: Mateusz Kosik
---

# Research: Pełny audyt UI

**Date**: 2026-06-13
**Researcher**: Mateusz Kosik
**Git Commit**: `7ae532db296a3844dc606413c4caaadcab821719`
**Branch**: main
**Repository**: mbkosik/quotekit

## Research Question

Pełny audyt UI obejmujący: (1) pozostałości po 10x-astro-starter, (2) spójność wizualną, (3) UX i dostępność, (4) jakość kodu UI.

## Summary

Audyt objął wszystkie strony Astro, komponenty React, hooki i pliki stylów. Łącznie zidentyfikowano **65 problemów** w czterech kategoriach:

- **Starter remnants**: 6 znalezisk (2 HIGH widoczne dla użytkownika)
- **Spójność wizualna**: 15 znalezisk (3 HIGH — dwa osobne motywy wizualne, niespójne przyciski)
- **UX / dostępność**: 34 znaleziska (15 HIGH — brakujące `role="alert"`, brak etykiet ARIA, ślepe strony błędów, kontrast kolorów)
- **Jakość kodu UI**: 12 znalezisk (2 HIGH — komponenty auth bez dedykowanych hooków)

---

## A. Pozostałości 10x-astro-starter

### A1. [HIGH] Welcome.astro — hero text startera widoczny dla niezalogowanych użytkowników
- `src/components/Welcome.astro:35` — nagłówek `h1`: "10x Astro Starter"
- `src/components/Welcome.astro:38` — opis: "A production-ready starter with authentication, modern tooling, and a cosmic developer experience."
- Każdy niezalogowany użytkownik widzi branding szablonu zamiast QuoteKit.

### A2. [HIGH] Layout.astro — domyślny tytuł strony to "10x Astro Starter"
- `src/layouts/Layout.astro:10` — `const { title = "10x Astro Starter" } = Astro.props`
- Strony bez własnego `title` prop wyświetlają nazwę szablonu w karcie przeglądarki.

### A3. [MEDIUM] config-status.ts — link do repo szablonu w bannerze błędu
- `src/lib/config-status.ts:16` — `docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration"`
- Banner konfiguracyjny (widoczny przy błędnie skonfigurowanym Supabase) odsyła użytkownika do repo szablonu.

### A4. [MEDIUM] package.json — name: "10x-astro-starter"
- `package.json:2` — `"name": "10x-astro-starter"`
- Identyfikator pakietu npm nadal wskazuje na szablon.

### A5. [LOW] README.md — cały plik to README szablonu
- `README.md:1` — tytuł "# 10x Astro Starter"
- Zawiera instrukcje klonowania repo `przeprogramowani/10x-astro-starter`, `template.png` i opis szablonu. Nic o QuoteKit.

### A6. [LOW] public/template.png — screenshot szablonu (1.2 MB)
- `public/template.png` — plik publiczny, referencjonowany w README. Niepotrzebny.

---

## B. Spójność wizualna

### B1. [HIGH] Dwa oddzielne motywy wizualne bez ciągłości
- **Auth pages** (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`): `bg-cosmic`, `backdrop-blur-xl`, karty glassmorphism `bg-white/10`, gradient headings `from-blue-200 to-purple-200`.
- **App pages** (`/new`, `/quotes`, `/quotes/[id]`, `/settings`): `bg-gray-950`, bez rozmycia, pełne krycie, plain white text.
- Użytkownik logując się przechodzi między wizualnie niekompatybilnymi interfejsami. `bg-cosmic` zdefiniowane w `src/styles/global.css:113–115` nie jest używane w żadnej stronie applikacji.

### B2. [HIGH] Niespójne h1 — margin i traktowanie koloru
- `settings.astro:30` — `mb-8 text-2xl font-bold` (biały)
- `quotes/index.astro:60` — `text-2xl font-bold` (bez marginu)
- `auth/signin.astro:12` — `mb-6 text-2xl font-bold` z gradientem `bg-clip-text text-transparent`
- `auth/confirm-email.astro:27` — gradient, ale `mb-3` zamiast `mb-6`

### B3. [HIGH] Przycisk CTA w trzech wariantach padding/radius, omija shadcn Button
Wszystkie główne przyciski akcji są zakodowane ręcznie jako `<button>` zamiast używać `<Button>` z shadcn/ui:

| Lokalizacja | Padding | Radius |
|---|---|---|
| `auth/SubmitButton.tsx:18` | `px-4 py-2` | `rounded-lg` |
| `InquiryForm.tsx:61` | `px-6 py-3` | `rounded-xl` |
| `ConversationCard.tsx:63` | `px-4 py-2.5` | `rounded-xl` |
| `LineItemsEditor.tsx:227` | `px-6 py-3` | `rounded-xl` |
| `UserContextForm.tsx:65` | `px-4 py-2` | `rounded-xl` |
| `ClientQuestionsList.tsx:52` | `px-6 py-3` | `rounded-xl` |
| `quotes/index.astro:63` | `px-4 py-2` | `rounded-xl` |

Auth używa `rounded-lg`; aplikacja używa `rounded-xl`; shadcn Button używa `rounded-md`. Żaden z głównych przycisków nie używa komponentu `<Button>`.

### B4. [MEDIUM] disabled:opacity-40 vs disabled:opacity-50 — brak reguły
- `opacity-40`: `ConversationCard.tsx:63`, `QuoteEditor.tsx:49`, `QuotesList.tsx:146,158`, `UserContextForm.tsx:65`
- `opacity-50`: `InquiryForm.tsx:61,84`, `LineItemsEditor.tsx:227`, `button.tsx:8` (shadcn domyślnie)

### B5. [MEDIUM] Trzy różne strategie ikon
1. **Lucide React** — wyłącznie w auth: `Mail`, `Lock`, `Eye`, `EyeOff`, `CircleAlert` (`src/components/auth/*.tsx`)
2. **Raw inline SVG** — `Welcome.astro:59,81,104`
3. **Unicode/text** — `✕` w `QuotesList.tsx:111`, `LineItemsEditor.tsx:186`; `←→↑↓` w nawigacji i sortowaniu

Obszar quotes/app w ogóle nie używa Lucide, mimo że biblioteka jest zainstalowana.

### B6. [MEDIUM] Cztery wzorce stylowania błędów
1. Sam tekst: `InquiryForm.tsx:55` — `text-red-400`
2. Kontener + tło + border: `ServerError.tsx:11` — `border border-red-500/30 bg-red-900/30 text-red-300`
3. Kontener + tło bez border: `QuoteEditor.tsx:93` — `bg-red-500/10 text-red-400`
4. Kontener + tło + border: `ConversationCard.tsx:79` — `border border-red-500/20 bg-red-500/10 text-red-400`
Auth używa `text-red-300`, app używa `text-red-400`.

### B7. [MEDIUM] Max-width skacze w ramach jednego flow
- `InquiryForm`, `ConversationCard`, `ClientQuestionsList`: `max-w-2xl` (640px)
- `LineItemsEditor.tsx:70`: `max-w-4xl` (896px) — skok o 256px przy przejściu do edycji pozycji
- `quotes/index.astro:58` (lista): `max-w-3xl`; `QuoteEditor.tsx:40` (szczegół): `max-w-4xl` — różna szerokość list vs detail

### B8. [MEDIUM] 6 poziomów opacity tekstu bez systemu semantycznego
`text-white/40`, `/50`, `/60`, `/70`, `/80`, `/90` używane bez przypisania do ról semantycznych (etykieta, opis, placeholder, wyłączone). CSS token `--muted-foreground` zdefiniowany w `global.css` nie jest używany w żadnym komponencie.

### B9. [MEDIUM] Design tokeny zdefiniowane, ale ignorowane
`global.css` definiuje `--background`, `--foreground`, `--primary`, `--destructive` itd. i mapuje je do Tailwind przez `@theme inline`. Komponenty używają surowych wartości: `bg-gray-950`, `bg-purple-600`, `text-purple-300`, `text-red-400`, itd. Jedyna implementacja tokenów to komponent `button.tsx` z shadcn — który i tak jest rzadko używany (patrz B3).

### B10. [MEDIUM] Banner.astro — 9 hardkodowanych hex-ów, poza systemem Tailwind
- `src/components/Banner.astro:28–40` — `#dbeafe`, `#1e3a8a`, `#3b82f6`, `#fef3c7`, `#78350f`, `#f59e0b`, `#fee2e2`, `#7f1d1d`, `#dc2626` w blokach `<style>`
- Jedyny komponent pisany w czystym CSS zamiast Tailwind. Pojawia się na każdej stronie przez `Layout.astro:23–36`.

### B11. [MEDIUM] Niespójne border-opacity w przyciskach ghost
- `border-white/10` — większość przycisków ghost w aplikacji
- `border-white/20` — `LineItemsEditor.tsx:207` (add row), `Welcome.astro:49` (Sign Up CTA)

### B12. [LOW] Trzy warianty spinnerów loading w jednym flow
- `ConversationCard.tsx:45`: `border-white/20 border-t-white/60`
- `InquiryForm.tsx:65`: `border-white/30 border-t-white`
- `auth/SubmitButton.tsx:22`: `border-white/30 border-t-white`

### B13. [LOW] Strony /new i /quotes/[id] nie mają h1
- `src/pages/new.astro` — brak h1; `LineItemsEditor.tsx:80` renderuje h2 bez nadrzędnego h1
- `src/pages/quotes/[id].astro` — brak h1; `QuoteEditor.tsx` zawiera h2 (tytuł wyceny)
- Hierarchia nagłówków przechodzi bezpośrednio do h2.

### B14. [LOW] Topbar email używa blue-tinted text na neutralnym tle
- `Topbar.astro:16` — `text-blue-100/70` zamiast `text-white/{opacity}` jak reszta aplikacji

---

## C. UX i dostępność

### C-EMPTY: Brakujące empty states

#### C1. [MEDIUM] QuotesList — brak loading skeleton przy hydratacji
- `src/components/quotes/QuotesList.tsx:27–53` — komponent ładowany przez `client:load`; podczas client-side fetch lista przechodzi w `opacity-50` bez spinnera lub szkieletu.

#### C2. [MEDIUM] LineItemsEditor — brak komunikatu przy pustej liście pozycji
- `src/components/quotes/LineItemsEditor.tsx:94–199` — `<tbody>` renderuje się pusty; przycisk "Zapisz wycenę" wyłączony bez wyjaśnienia.

#### C3. [LOW] ClientQuestionsList — brak fallbacku dla 0 pytań
- `src/components/quotes/ClientQuestionsList.tsx:41–48` — pusty `<ol>` przy 0 pytaniach; "Kopiuj wszystkie" pozostaje aktywne.

### C-LOADING: Brakujące loading states

#### C4. [MEDIUM] QuoteCreator — brak stanu loading przy pierwszym wywołaniu AI
- `src/components/quotes/QuoteCreator.tsx:33,61–79` — przy `phase === "loading"` i `questionCount === 0` oba przyciski InquiryForm są disabled bez widocznego wskazania co się dzieje.

#### C5. [HIGH] useQuotesList — cicha rollback przy błędzie zmiany statusu
- `src/components/hooks/useQuotesList.ts:80–93` — `handleStatusChange` robi optimistic update i cicho cofa przy błędzie. Brak errora w state, brak toastu. Użytkownik widzi cofnięcie bez wyjaśnienia.

#### C6. [MEDIUM] QuotesList — paginacja ładuje przez opacity bez indykatora
- `src/components/quotes/QuotesList.tsx:81` — `opacity-50` bez spinnera; użytkownik może klikać "Następna" wielokrotnie.

### C-ERRORS: Brakujące/niedostępne komunikaty błędów

#### C7. [HIGH] QuoteCreator — error `<p>` bez `role="alert"`
- `src/components/quotes/QuoteCreator.tsx:49` — dynamicznie pojawiający się błąd nie jest anonsowany przez screen reader.

#### C8. [HIGH] QuoteEditor — error/success messages bez `role="alert"`
- `src/components/quotes/QuoteEditor.tsx:93–94` — `{error && <p>}` i `{success && <p>}` bez `role="alert"` ani `aria-live`.

#### C9. [HIGH] UserContextForm — error bez `role="alert"`
- `src/components/settings/UserContextForm.tsx:61` — `<span>` z błędem zapisu bez `role="alert"`.

#### C10. [HIGH] QuotesList — delete error bez `role="alert"`
- `src/components/quotes/QuotesList.tsx:68` — `{error && <p>}` bez `role="alert"`.

#### C11. [MEDIUM] Auth signin — surowy angielski error z Supabase w polskiej aplikacji
- `src/pages/api/auth/signin.ts:16` — `error.message` z Supabase ("Invalid login credentials") wyświetlany bez lokalizacji.

#### C12. [HIGH] Strony 503/400/404 zwracają null body — pusta biała strona
- `src/pages/quotes/[id].astro:13,16,23` — `return new Response(null, { status: 503/400/404 })` — przeglądarka renderuje białą stronę bez komunikatu, nawigacji ani sposobu powrotu.

#### C13. [HIGH] Rate limit (429) surfowany jako generyczny błąd połączenia
- `src/components/hooks/useQuoteCreator.ts:31` — `new Error("HTTP 429")` wpada do catch bloku ustawiającego "Błąd połączenia z AI". Użytkownik nie wie, że jest zablokowany i ponawiając próby uderza w limit ponownie.

#### C14. [MEDIUM] inquiry_unusable (422) — generyczny komunikat bez wskazówki
- `src/components/hooks/useQuoteCreator.ts:63–65` — "Nie udało się przetworzyć zapytania" bez wyjaśnienia, że treść jest zbyt lakoniczna.

### C-A11Y: Dostępność

#### C15. [MEDIUM] Topbar — brak elementu `<nav>` i `aria-label`
- `src/components/Topbar.astro` — linki nawigacyjne w `<div>`, nie w `<nav>`. Screen readery nie znajdą landmark nawigacji.

#### C16. [HIGH] QuoteFilterBar — przyciski filtrów bez `aria-pressed`
- `src/components/quotes/QuoteFilterBar.tsx:32–47` — przyciski z wizualnym "active" (fioletowe tło) bez `aria-pressed`. Screen reader nie wie, który filtr jest aktywny.

#### C17. [HIGH] QuoteFilterBar — pole wyszukiwania bez `<label>` ani `aria-label`
- `src/components/quotes/QuoteFilterBar.tsx:49–57` — tylko `placeholder="Szukaj po tytule…"`. Placeholder znika przy wpisywaniu i nie spełnia WCAG 2.1 SC 1.3.5.

#### C18. [MEDIUM] QuoteFilterBar — przycisk sortowania bez `aria-sort` ani `aria-pressed`
- `src/components/quotes/QuoteFilterBar.tsx:59–64` — tekst "Najnowsze ↓"/"Najstarsze ↑" zmienia się, ale brak atrybutu ARIA komunikującego kierunek sortowania.

#### C19. [HIGH] QuotesList — `<select>` statusu bez etykiety powiązanej z wyceniarką
- `src/components/quotes/QuotesList.tsx:94–106` — każdy `<select>` bez `<label>`, `aria-label` ani `aria-labelledby`. Screen reader anonsuje "combobox" bez kontekstu której wyceny dotyczy.

#### C20. [MEDIUM] QuotesList — przycisk delete ma generyczny `aria-label`
- `src/components/quotes/QuotesList.tsx:110` — `aria-label="Usuń wycenę"` bez tytułu wyceny. Wszystkie przyciski delete w liście brzmią identycznie.

#### C21. [HIGH] LineItemsEditor — komórki tabeli do edycji niedostępne z klawiatury
- `src/components/quotes/LineItemsEditor.tsx:112–120,140–148,166–174` — `<span onClick={...}>` bez `onKeyDown`, `role="button"`, ani `tabIndex`. Edycja pozycji wyceny w ogóle niedostępna z klawiatury — blokuje główne zadanie użytkownika.

#### C22. [HIGH] ConversationCard — textarea odpowiedzi bez `<label>` ani `aria-label`
- `src/components/quotes/ConversationCard.tsx:50–58` — tylko `placeholder="Twoja odpowiedź..."`. Pytanie nad polem to `<p>`, nie jest semantycznie powiązane z textarea.

#### C23. [HIGH] ConversationCard — error/retry bez `role="alert"` na kontenerze błędu
- `src/components/quotes/ConversationCard.tsx:82` — dynamicznie pojawiający się błąd nie jest anonsowany przez screen reader.

#### C24. [HIGH] UserContextForm — textarea bez `<label>` ani `aria-label`
- `src/components/settings/UserContextForm.tsx:45–54` — `<h2>Kontekst użytkownika</h2>` nie jest programowo powiązane z textarea.

#### C25. [HIGH] Layout.astro — `lang="en"` przy polskich treściach
- `src/layouts/Layout.astro:14` — `<html lang="en">` podczas gdy UI, komunikaty błędów, etykiety i prompty AI są po polsku. Narusza WCAG 2.1 SC 3.1.1. Screen readery będą wymawiać polskie teksty z angielską fonetykąco.

#### C26. [HIGH] FormField — error nie powiązany z inputem przez `aria-describedby`
- `src/components/auth/FormField.tsx:42–65` — błąd pod inputem nie ma `id`; input nie ma `aria-describedby` ani `aria-invalid="true"`.

#### C27. [MEDIUM] Welcome.astro — dekoracyjne SVG bez `aria-hidden`
- `src/components/Welcome.astro:59–72,81–96,103–119` — trzy SVG bez `aria-hidden="true"`. Screen readery próbują opisywać ścieżki SVG.

#### C28. [MEDIUM] index.astro — zalogowany użytkownik widzi stronę szablonu bez redirect
- `src/pages/index.astro` + `src/middleware.ts:5` — `/` nie jest w `PROTECTED_ROUTES`. Zalogowany użytkownik trafia na landing page "10x Astro Starter".

#### C29. [LOW] confirm-email.astro — emoji jako treść bez dostępnej alternatywy
- `src/pages/auth/confirm-email.astro:26` — `<div>✅</div>` bez `aria-label` ani `aria-hidden`.

### C-FLOW: Nawigacja i flow

#### C30. [MEDIUM] QuoteCreator "done" — auto-reset po 3s bez kontroli użytkownika
- `src/components/hooks/useQuoteCreator.ts:195–206` — `setTimeout 3000ms` resetuje cały stan do `phase === "inquiry"`. Użytkownicy screen readerów lub czytający wolno tracą kontekst sukcesu.

#### C31. [MEDIUM] Signout — redirect na "/" (stronę szablonu), nie na signin
- `src/pages/api/auth/signout.ts:9` — po wylogowaniu użytkownik ląduje na "10x Astro Starter" landing page.

#### C32. [MEDIUM] Signin — redirect na "/new", nie "/quotes"
- `src/pages/api/auth/signin.ts:19` — powracający użytkownicy z istniejącymi wycenami trafiają od razu do formularza nowej wyceny.

#### C33. [MEDIUM] QuotesList delete — brak stanu loading podczas usuwania
- `src/components/hooks/useQuotesList.ts:95–112` — po potwierdzeniu w AlertDialog brak wskaźnika ładowania; lista wygląda niezmiennie do zakończenia fetch.

#### C34. [MEDIUM] Paginacja — numer strony nie zapisywany w URL przy SSR
- `src/components/hooks/useQuotesList.ts:26` — param `page` istnieje w URL client-side ale SSR nie obsługuje go; zakładkowanie strony 2 serwuje dane strony 1.

### C-CONTRAST: Kontrast kolorów

#### C35. [HIGH] text-white/30 na elementach UI — 2.3:1 (poniżej WCAG 3:1)
- `QuotesList.tsx:110`, `LineItemsEditor.tsx:186` — przyciski "✕" z `text-white/30` na `bg-gray-950`. WCAG wymaga 3:1 dla komponentów UI.

#### C36. [HIGH] placeholder-white/30 we wszystkich polach tekstowych — poniżej WCAG 4.5:1
- `QuoteFilterBar.tsx:56`, `InquiryForm.tsx:50`, `ConversationCard.tsx:57`, `UserContextForm.tsx:52` — placeholder jest jedyną etykietą (brak `<label>`), a kontrast wyjątkowo niski.

#### C37. [MEDIUM] text-white/40 — 3.5:1, poniżej WCAG 4.5:1 dla normalnego tekstu
- Używany szeroko: `QuotesList.tsx:52,89,150`, `QuoteFilterBar.tsx:56`, `LineItemsEditor.tsx:87,194`, `Topbar.astro:11`. Secondary labels, empty states, table headers.

#### C38. [MEDIUM] Gradient headings auth — ryzyko niedostatecznego kontrastu
- `auth/signin.astro:12`, `auth/signup.astro:12` — `text-transparent bg-clip-text from-blue-200 to-purple-200` na rozmytym ciemnym tle. Jaśniejsze fragmenty gradientu mogą nie osiągać 4.5:1.

#### C39. [MEDIUM] text-blue-100/60 na auth pages — poniżej 4.5:1
- `auth/signin.astro:18`, `auth/signup.astro:18` — "Don't have an account?" w 60% niebieskim na ciemnym tle.

### C-KEYBOARD: Nawigacja klawiaturą

#### C40. [HIGH] Niestandardowe przyciski bez widocznego focus ring
- `QuotesList.tsx:110` (delete ✕), `QuoteFilterBar.tsx` (filtry, sortowanie), `ConversationCard.tsx` (pomiń, odpowiedz) — używają `outline-none` bez `focus-visible:ring-*`. Shadcn `<Button>` ma `focus-visible:ring-[3px]`, ale te przyciski omijają komponent.

#### C41. [MEDIUM] QuotesList select — brak potwierdzenia zmiany statusu
- `QuotesList.tsx:94–106`, `useQuotesList.ts:80–93` — po zmianie przez `<select>` brak toastu, `aria-live`, ani żadnej odpowiedzi zwrotnej. Połączone z cichą rollback (C5) — podwójny problem.

---

## D. Jakość kodu UI

### D1. [HIGH] SignInForm.tsx — 4 state variables bez dedykowanego hooka
- `src/components/quotes/SignInForm.tsx:13–16` — `email`, `password`, `showPassword`, `errors` + logika walidacji (`validate()`, `clearError()`, `handleSubmit()`) bezpośrednio w komponencie. Brak `useSignInForm` hooka.

### D2. [HIGH] SignUpForm.tsx — 6 state variables bez dedykowanego hooka
- `src/components/auth/SignUpForm.tsx:15–20` — `email`, `password`, `confirmPassword`, `showPassword`, `showConfirmPassword`, `errors` inline. Brak `useSignUpForm` hooka.

### D3. [MEDIUM] QuoteFilterBar.tsx:37–41 — cn() violation
```tsx
className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
  active ? "bg-purple-600 text-white" : "border border-white/10 ..."
}`}
```
Narusza konwencję: warunkowe klasy muszą używać `cn()`.

### D4. [MEDIUM] QuotesList.tsx:81 — cn() violation
```tsx
className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}
```

### D5. [MEDIUM] UserContextForm.tsx:56 — cn() violation
```tsx
<span className={`text-xs ${isOverLimit ? "text-red-400" : "text-white/40"}`}>
```

### D6. [MEDIUM] LineItemsEditor.tsx:96 — index jako key na mutowalnej liście
```tsx
{items.map((item, i) => <tr key={i}>)}
```
Komponent zawiera `removeRow` i `addRow`. Usunięcie wiersza z środka listy sprawi, że React błędnie powiąże stan `autoFocus` z innym wierszem.

### D7. [MEDIUM] InquiryForm.tsx:74–83 — złożona logika inline w onClick
```tsx
onClick={() => {
  const trimmed = text.trim();
  if (trimmed.length < 3) { setValidationError("..."); return; }
  setValidationError(""); onGenerateQuestions(trimmed);
}}
```
Duplikuje wzorzec walidacji z `handleSubmit`. Wymaga ekstrakcji do nazwanej funkcji.

### D8. [MEDIUM] QuoteCreator.tsx:2–5 — relative imports zamiast @/* alias
```tsx
import { InquiryForm } from "./InquiryForm";
// ...
```
Jedyny plik w obszarze quotes używający `./`. Reszta (`QuoteEditor.tsx`, `QuotesList.tsx`) używa `@/components/quotes/...`.

### D9. [MEDIUM] Trzykrotnie powielony identyczny className textarea
Dokładnie ten sam string w:
- `src/components/quotes/InquiryForm.tsx:50`
- `src/components/quotes/ConversationCard.tsx:57`
- `src/components/settings/UserContextForm.tsx:53`
Kandydat na współdzielony komponent `<AppTextarea>` lub stałą klasy.

### D10. [LOW] ConversationCard.tsx:26 / InquiryForm.tsx:23 — React namespace bez importu
```tsx
function handleAnswer(e: React.SubmitEvent<HTMLFormElement>) {}
```
Brak `import React from "react"`. Działa dzięki globalnej przestrzeni nazw TypeScript, ale jest kruche.

### D11. [LOW] UserContextForm.tsx:29 / useQuoteEditor.ts:42 — setTimeout bez ref + cleanup
```tsx
setTimeout(() => { setStatus("idle"); }, 2000);
```
Timer nie jest storowany ani kasowany. `useQuoteCreator.ts:48–55` robi to poprawnie przez ref — ten sam wzorzec powinien być tutaj.

### D12. [LOW] placeholder-white/* w 5 plikach — idiom Tailwind v3
- `auth/FormField.tsx:6`, `InquiryForm.tsx:50`, `ConversationCard.tsx:57`, `QuoteFilterBar.tsx:56`, `UserContextForm.tsx:53`
- `placeholder-white/30` to skrócona forma v3. W v4 działa, ale jest deprecated i może ulec zmianie.

---

## Code References

| Plik | Linie | Problem |
|---|---|---|
| `src/components/Welcome.astro` | 35, 38 | Starter hero text (A1) |
| `src/layouts/Layout.astro` | 10 | Default title starter (A2) |
| `src/lib/config-status.ts` | 16 | GitHub link to template (A3) |
| `package.json` | 2 | name "10x-astro-starter" (A4) |
| `src/pages/quotes/[id].astro` | 13, 16, 23 | null Response bodies (C12) |
| `src/layouts/Layout.astro` | 14 | lang="en" (C25) |
| `src/components/quotes/LineItemsEditor.tsx` | 112–174 | Brak keyboard access do edycji (C21) |
| `src/components/quotes/QuoteFilterBar.tsx` | 32–47, 49–57 | Brak aria-pressed, brak label (C16, C17) |
| `src/components/hooks/useQuotesList.ts` | 80–93 | Cicha rollback statusu (C5) |
| `src/components/auth/SignUpForm.tsx` | 15–20 | 6 state vars bez hooka (D2) |
| `src/components/auth/SignInForm.tsx` | 13–16 | 4 state vars bez hooka (D1) |
| `src/components/quotes/QuoteEditor.tsx` | 93–94 | Brak role="alert" (C8) |
| `src/components/quotes/ConversationCard.tsx` | 50–58 | Textarea bez label (C22) |
| `src/components/settings/UserContextForm.tsx` | 45–54 | Textarea bez label (C24) |
| `src/components/Banner.astro` | 28–40 | 9 hardkodowanych hex (B10) |

---

## Architecture Insights

1. **Shadcn Button jest zainstalowany ale nieużywany** w głównym flow aplikacji. Wszystkie CTA to surowe `<button>` z ręcznie kopiowanymi klasami Tailwind. Ujednolicenie przez `<Button variant="...">` wyeliminowałoby B3, B4 i częściowo B9.

2. **Brak systemu semantycznego dla secondary text**. Projekt ma `--muted-foreground` w CSS tokenach, ale żaden komponent go nie używa. 6 poziomów `text-white/{opacity}` jest arbitralnych. Ustalenie 3 wartości (label=`/70`, body=`/50`, placeholder=`/30`) i wdrożenie ich jako klasy utility byłoby prostą normalizacją.

3. **Dwa motywy wizualne (auth vs app)** sugerują, że auth pages były kopiowane ze startera bez adaptacji. Kluczowa decyzja: czy ujednolicić kierunku "cosmic" (dodać rozmycie do app), czy "flat" (uprościć auth).

4. **WCAG naruszenia są systemowe** — nie są to pojedyncze przeoczenia. Wzorzec "brak `role="alert"`" pojawia się w 6 różnych komponentach. `aria-label` brakuje wzorowo we wszystkich dynamicznych elementach. Sugeruje brak wcześniejszego przeglądu dostępności.

5. **Puste strony błędów (C12) to najwyższy priorytet UX** — użytkownik z błędnym URL wyceny widzi białą stronę bez żadnego wyjścia. Wymaga globalnej obsługi błędów w Layout lub dedykowanych stron 404/500.

---

## Historical Context

Brak powiązanych wcześniejszych zmian w `context/changes/` ani `context/archive/` dotyczących UI.

---

## Open Questions

1. **Kierunek motywu wizualnego**: ujednolicenie w stronę "cosmic" (glassmorphism w całej aplikacji) czy "flat" (uproszczenie auth)?
2. **Globalna obsługa błędów**: czy dodać middleware error boundary, czy obsługiwać na poziomie każdej strony Astro?
3. **Priorytet dostępności**: czy planujemy certyfikację WCAG AA? Jeśli tak, C25 (lang) i C21 (keyboard LineItemsEditor) są blokerami.
4. **Signout redirect**: czy `/` po wylogowaniu ma być rebrandowany jako QuoteKit landing page, czy od razu redirect na `/auth/signin`?
