# Deploy Plan — QuoteKit na Cloudflare Workers

## Status

- [x] Poprawki w `wrangler.jsonc` (nazwa + flaga zgodności)
- [x] Szablon `.dev.vars.example`
- [x] Logowanie do Cloudflare CLI
- [x] Pierwsze ręczne wdrożenie
- [x] Sekrety produkcyjne ustawione
- [x] Cloudflare GitHub Integration skonfigurowana
- [x] Smoke test na żywym URL
- [x] Weryfikacja auto-deploy po pushu do main

---

## Etap 1 — Poprawki lokalne ✅

Wykonane automatycznie:

- `wrangler.jsonc`: `name` → `"quote-kit"`, `compatibility_flags` → `["nodejs_compat_v2"]`
- `.dev.vars.example` — szablon secretów dla lokalnego dev

---

## Etap 2 — Logowanie do Cloudflare (bramka manualna)

```bash
npx wrangler login
```

Otwiera przeglądarkę — autoryzuj w panelu Cloudflare.

---

## Etap 3 — Pierwsze ręczne wdrożenie (bramka manualna)

```bash
npm run build && npx wrangler deploy
```

Po deploy: Worker `quote-kit` pojawia się w dashboardzie Cloudflare → Workers & Pages.

### Ustawienie secretów produkcyjnych

> ⚠️ `SUPABASE_URL` musi być base URL: `https://[ref].supabase.co` — **bez** `/rest/v1/` na końcu.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

Sekrety aktywne natychmiast na następnym requeście — bez redeployu.

### Weryfikacja przez logi

```bash
npx wrangler tail --format=pretty
```

---

## Etap 4 — Cloudflare GitHub Integration (bramka manualna, dashboard)

Automatyczny deploy na każdy push do `main` bez GitHub Actions.

1. Dashboard → Workers & Pages → `quote-kit` → **Settings → Builds & Deployments**
2. **Connect GitHub** → wybrać repozytorium
3. Konfiguracja:
   - Branch: `main`
   - Build command: `npm run build`
   - Deploy command: _(puste — Cloudflare użyje `wrangler deploy` z `wrangler.jsonc`)_
4. **Environment Variables** (Encrypted):
   - `SUPABASE_URL` = `https://[ref].supabase.co`
   - `SUPABASE_KEY` = anon key z Supabase dashboard

> GitHub Actions (`ci.yml`) zostaje bez zmian — lint+build na każdym PR, niezależnie od deploy.

---

## Etap 5 — Smoke test (bramka manualna)

URL: `https://quote-kit.[account].workers.dev`

- [x] Strona główna ładuje się bez błędów 200
- [x] `GET /auth/signup` — formularz rejestracji
- [x] `POST /api/auth/signup` — rejestracja nowego konta
- [x] `POST /api/auth/signin` — logowanie
- [x] `GET /dashboard` — dostęp po zalogowaniu; bez sesji → redirect `/auth/signin`
- [x] `POST /api/auth/signout` — wylogowanie, redirect na `/`
- [x] `wrangler tail` — brak wyjątków Worker-level podczas testów

---

## Etap 6 — Weryfikacja auto-deploy

- [x] Push do `main` → deploy widoczny w Cloudflare dashboard (Builds & Deployments)
- [x] `npx wrangler deployments list` — nowa wersja Workera na liście
- [x] GitHub Actions `ci` job — zielony, niezależny od deploy

---

## Rollback (w razie potrzeby)

```bash
# Cofnięcie do poprzedniej wersji kodu
npx wrangler rollback

# Cofnięcie do konkretnej wersji
npx wrangler deployments list
npx wrangler rollback <version-id>
```

> ⚠️ Rollback cofa **tylko kod Worker**. Migracje Supabase nie są cofane.

---

## Risk Register

| Ryzyko                                    | Prawdopodobieństwo | Wpływ   | Mitygacja                                                       |
| ----------------------------------------- | ------------------ | ------- | --------------------------------------------------------------- |
| Free tier 10ms CPU limit — SSR przekroczy | Wysokie            | Wysokie | Upgrade Workers Paid ($5/mo) przed pierwszym publicznym userem  |
| `npm run dev` maskuje błędy workerd       | Wysokie            | Średnie | Używaj `wrangler dev` do testowania Cloudflare-specific ścieżek |
| SUPABASE_URL z `/rest/v1/` złamie auth    | Średnie            | Wysokie | Zweryfikuj format przed `wrangler secret put`                   |
| Rollback nie cofa migracji Supabase       | Niskie             | Wysokie | Migracje backward-compatible z poprzednią wersją kodu           |
| `.dev.vars` z realnymi danymi w git       | Niskie             | Wysokie | Potwierdź że `.dev.vars` jest w `.gitignore`                    |
