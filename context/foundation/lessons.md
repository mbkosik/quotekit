# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Rename supabase/config.toml project_id immediately after bootstrapping

**Context**: supabase/config.toml:5 — quotes-schema-rls review (2026-05-27)

**Problem**: project_id shipped as "10x-astro-starter" (the template placeholder). When running `supabase start` alongside other projects bootstrapped from the same template, Docker uses project_id as the container namespace — identical values cause container name collisions.

**Rule**: Always rename project_id in supabase/config.toml to match the actual project name before running supabase start for the first time.

**Applies to**: Any project bootstrapped from 10x-astro-starter or any Supabase CLI project

## Trigger functions must pin search_path

**Context**: supabase/migrations/20260526000000_create_quotes.sql — quotes-schema-rls, post-review Supabase linter (2026-05-27)

**Problem**: A trigger function without `SET search_path = ''` is vulnerable to search_path injection — a schema earlier in the path can shadow built-ins like `NOW()`. Supabase linter flags this as "Function Search Path Mutable".

**Rule**: Always add `SET search_path = ''` after the `$$ LANGUAGE plpgsql` line on every trigger function.

**Applies to**: Every `CREATE OR REPLACE FUNCTION` used as a trigger in Supabase migrations

## Wrap auth.uid() in (select ...) inside RLS policies

**Context**: supabase/migrations/20260526000000_create_quotes.sql — quotes-schema-rls, post-review Supabase linter (2026-05-27)

**Problem**: `auth.uid()` called directly in `USING`/`WITH CHECK` is re-evaluated per row, causing a full-table performance penalty at scale. Supabase linter flags this as "Auth RLS Initialization Plan".

**Rule**: Always write `(select auth.uid())` instead of `auth.uid()` in RLS policy predicates — for all four operations (SELECT, INSERT, UPDATE, DELETE).

**Applies to**: Every RLS policy on every table in this project

## Logika state machine komponentu trafia do hooka, nie do komponentu

**Context**: src/components/hooks/useQuoteCreator.ts — ai-quote-creation-flow (2026-05-29)

**Problem**: Plan specyfikował logikę state machine bezpośrednio w QuoteCreator.tsx. Implementacja wyciągnęła ją do useQuoteCreator.ts — prawidłowa decyzja, ale sprzeczna z planem na papierze. Plan i review traktowały to jako drift zamiast improvement.

**Rule**: Komponenty z non-trivial state (więcej niż 2–3 zmienne stanu lub złożona logika przejść) powinny delegować stan i logikę do dedykowanego hooka w src/components/hooks/. Plan powinien to wprost specyfikować zamiast umieszczać logikę w komponencie.

**Applies to**: Każdy plan komponentu React z non-trivial state machine; plany powinny od razu wskazywać src/components/hooks/ jako docelowe miejsce logiki
