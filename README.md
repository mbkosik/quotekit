# QuoteKit

Narzędzie do tworzenia i zarządzania wycenami dla freelancerów. Generuj wyceny z pomocą AI i śledź ich statusy.

## Wymagania

- Node.js v22.14.0 (patrz `.nvmrc`)
- npm (dołączony do Node.js)
- Docker (wymagany przez lokalny Supabase)
- Supabase CLI (`npm install -g supabase` lub przez Homebrew)

## Uruchomienie lokalne

1. Zainstaluj zależności:

```bash
npm install
```

2. Skopiuj plik ze zmiennymi środowiskowymi:

```bash
cp .env.example .dev.vars
```

3. Uruchom lokalny Supabase:

```bash
npx supabase start
```

4. Uzupełnij `.dev.vars` danymi z outputu powyższego polecenia oraz kluczem Anthropic:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key>
ANTHROPIC_KEY=<klucz API Anthropic>
```

5. Uruchom serwer deweloperski:

```bash
npm run dev
```

## Dostępne polecenia

- `npm run dev` — serwer deweloperski (Cloudflare workerd runtime)
- `npm run build` — build produkcyjny
- `npm run preview` — podgląd builda produkcyjnego
- `npm run lint` — ESLint z regułami type-checked
- `npm run lint:fix` — automatyczne naprawianie błędów lint
- `npm run format` — Prettier
- `npm test` — uruchom testy (Vitest)
- `npm run test:watch` — testy w trybie watch
- `npm run test:mutation` — testy mutacyjne Stryker (wybrane moduły)
- `npm run review` — lokalny agent code-review (wymaga `ANTHROPIC_KEY`)

## Deployment

Projekt deployuje się na Cloudflare Workers.

1. Zbuduj projekt:

```bash
npm run build
```

2. Zdeployuj przez Wrangler:

```bash
npx wrangler deploy
```

Ustaw `SUPABASE_URL`, `SUPABASE_KEY` i `ANTHROPIC_KEY` jako sekrety w dashboardzie Cloudflare lub przez `npx wrangler secret put`.

## CI

GitHub Actions uruchamia lint, testy (Vitest), sprawdzenie typów (`astro check`) i build przy każdym pushu i PR do `main`. Na PRach do `develop` uruchamia się dodatkowo workflow AI code-review.

Wymagane sekrety repozytorium: `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_KEY`.
