# QuoteKit

Narzędzie do tworzenia i zarządzania wycenami dla freelancerów. Generuj wyceny z pomocą AI, śledź statusy i wysyłaj klientom.

## Wymagania

- Node.js v22.14.0 (patrz `.nvmrc`)
- npm (dołączony do Node.js)
- Docker (wymagany przez lokalny Supabase)

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

4. Uzupełnij `.dev.vars` danymi z outputu powyższego polecenia:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key>
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

Ustaw `SUPABASE_URL` i `SUPABASE_KEY` jako sekrety w dashboardzie Cloudflare lub przez `npx wrangler secret put`.

## CI

GitHub Actions uruchamia lint + build przy każdym pushu i PR do `main`. Ustaw `SUPABASE_URL` i `SUPABASE_KEY` jako sekrety repozytorium w GitHub.
