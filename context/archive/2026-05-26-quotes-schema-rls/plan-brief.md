# Quotes Schema + RLS — Plan Brief

> Full plan: `context/changes/quotes-schema-rls/plan.md`

## What & Why

Tworzymy pierwszą migrację Supabase: tabelę `quotes` z Row Level Security ograniczającym każdego usera do własnych rekordów. Bez tej migracji żadna funkcja quote (S-01, S-02) nie może powstać — to fundament całej domeny.

## Starting Point

Supabase skonfigurowany lokalnie, ale `supabase/migrations/` jest pusty. Zero tabel domenowych, zero typów TypeScript. Auth działa — `context.locals.user.id` daje UUID zalogowanego usera.

## Desired End State

Tabela `quotes` istnieje w lokalnym Supabase. Zalogowany user może INSERT/SELECT/UPDATE/DELETE własne rekordy i nie może sięgnąć po cudze (zweryfikowane manualnie w Studio). `src/types.ts` eksportuje `Quote`, `QuoteItem`, `QuoteStatus` — importowane przez F-02 i S-01.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|------------------|--------|
| Jeden typ rekordu | brak kolumny `type` | Pytania do klienta (S-03) to osobny slice — F-01 obsługuje wyłącznie wyceny | Plan |
| Status NOT NULL | `DEFAULT 'draft'` | Jeden typ rekordu, status zawsze obecny; brak edge case'u nullable | Plan |
| Tytuł | Osobna kolumna `TEXT NOT NULL` | Potrzebny do list queries bez operatorów JSONB | Plan |
| Oryginalny brief | Kolumna `inquiry_text TEXT NOT NULL` | AI może do niego wrócić przy regeneracji; user widzi co wkleił | Plan |
| updated_at | SQL trigger | Trigger nie może być pominięty przez endpoint — guardrail automatyczny | Plan |
| TypeScript types | `src/types.ts` | Konwencja projektu per CLAUDE.md; jeden punkt importu dla F-02 i S-01 | Plan |

## Scope

**In scope:** tabela `quotes`, trigger `updated_at`, RLS 4 polityki, index na `user_id`, `src/types.ts`

**Out of scope:** kolumna `type` / pytania do klienta (→ S-03), endpointy CRUD, seed data, `supabase gen types`, soft delete

## Architecture / Approach

Jeden plik migracji SQL (`20260526000000_create_quotes.sql`) tworzy tabelę, trigger i polityki RLS atomowo. TypeScript types pisane ręcznie — bez generatora. `content` JSONB trzyma zmienną część danych (items lub questions) per type.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. SQL Migration | Tabela + RLS + trigger, migracja aplikuje się lokalnie | Błąd w policy → data isolation regression — krytyczny guardrail |
| 2. TypeScript Types | `src/types.ts`, lint + build przechodzi | Type mismatch z aktualnym schematem |

**Prerequisites:** `npx supabase start` (Docker wymagany)
**Estimated effort:** ~1 sesja

## Open Risks & Assumptions

- RLS musi być zweryfikowane **manualnie** w Studio przed S-01 — brak test runnera SQL
- S-03 (pytania do klienta) będzie wymagać osobnej decyzji schematowej — czy własna tabela czy rozszerzenie `quotes`

## Success Criteria (Summary)

- `npx supabase db reset` bez błędów; tabela i 4 polityki widoczne w Studio
- RLS smoke test: user A nie widzi rekordów user B
- `npm run lint` + `npm run build` przechodzą po dodaniu `src/types.ts`
