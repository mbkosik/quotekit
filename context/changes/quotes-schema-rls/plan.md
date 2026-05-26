# Quotes Schema + RLS — Implementation Plan

## Overview

Tworzymy pierwszą migrację Supabase: tabela `quotes` z triggerem `updated_at` i granularnymi politykami RLS (SELECT/INSERT/UPDATE/DELETE per `user_id`). Jeden typ rekordu — pytania do klienta trafiają do osobnego slice'a S-03. TypeScript types dla domeny quote lądują w `src/types.ts`.

## Current State Analysis

- `supabase/migrations/` nie istnieje — czysta karta
- `src/types.ts` nie istnieje
- Supabase klient: `createServerClient` z `@supabase/ssr` w `src/lib/supabase.ts`; user dostępny jako `context.locals.user` (typ `User | null`)
- Auth jest gotowy; zero tabel domenowych, zero endpointów CRUD

## Desired End State

Tabela `quotes` istnieje w lokalnym Supabase z włączonym RLS. Zalogowany użytkownik może INSERT/SELECT/UPDATE/DELETE własne rekordy i nie może sięgnąć po cudze. `src/types.ts` eksportuje typy Quote gotowe do importu przez F-02 i S-01.

### Key Discoveries

- `supabase/config.toml:55` — `[db.migrations] enabled = true`; migracje obsługiwane przez Supabase CLI
- `src/lib/supabase.ts:1-24` — klient zwraca `null` gdy brak credentials; API endpoints muszą to obsługiwać
- `src/middleware.ts:10-12` — `supabase.auth.getUser()` → `context.locals.user`; `user.id` to UUID do użycia w `user_id` kolumnie
- PostgreSQL 17 (config.toml:36) — `gen_random_uuid()` dostępne bez rozszerzenia

## What We're NOT Doing

- Automatyczna generacja typów przez `supabase gen types` — ręczne typy są wystarczające dla MVP
- Dodatkowe indeksy poza `user_id` — skala MVP (`data_volume: small`) nie wymaga
- Seed data
- Soft delete / historia wersji — PRD §Non-Goals
- Endpointy CRUD — to S-01 i S-02

## Implementation Approach

Jeden plik migracji SQL tworzy tabelę, trigger function, trigger i 4 polityki RLS w jednej transakcji. TypeScript types pisane ręcznie odzwierciedlają schemat — `status` jest `NOT NULL` z wartością domyślną `'draft'`, brak kolumny `type`.

## Phase 1: SQL Migration

### Overview

Tworzymy plik migracji i aplikujemy go lokalnie. Faza kończy się gdy tabela i polityki są widoczne w Supabase Studio i RLS jest zweryfikowane manualnie.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/20260526000000_create_quotes.sql`

**Intent**: Stworzyć tabelę `quotes` z triggerem `updated_at` i 4 politykami RLS ograniczającymi dostęp do własnych rekordów usera.

**Contract**: Pełna treść migracji — RLS policy syntax (`USING` vs `WITH CHECK`) i trigger plpgsql są niestandardowe, więc snippet jest tu load-bearing:

```sql
-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Quotes table
CREATE TABLE quotes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  title         TEXT        NOT NULL,
  inquiry_text  TEXT        NOT NULL,
  content       JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-user queries
CREATE INDEX quotes_user_id_idx ON quotes (user_id);

-- updated_at trigger
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only
CREATE POLICY "quotes_select_own" ON quotes
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: own rows only
CREATE POLICY "quotes_insert_own" ON quotes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: own rows only (both USING and WITH CHECK required)
CREATE POLICY "quotes_update_own" ON quotes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DELETE: own rows only
CREATE POLICY "quotes_delete_own" ON quotes
  FOR DELETE USING (auth.uid() = user_id);
```

`content` JSONB structure: `{ "items": [{ "task": string, "hours": number, "rate": number }] }`

### Success Criteria

#### Automated Verification

- Migracja aplikuje się bez błędów: `npx supabase db reset`
- Tabela istnieje: `npx supabase db diff` nie pokazuje pending changes po reset

#### Manual Verification

- Tabela `quotes` widoczna w Supabase Studio (localhost:54323) z poprawnymi kolumnami i typami
- Polityki RLS widoczne w Studio → Authentication → Policies → quotes
- Trigger `quotes_updated_at` widoczny w Studio → Database → Triggers
- **RLS smoke test** w Studio SQL Editor:
  - Ustaw role na `authenticated` z JWT user A → INSERT quote → SELECT — widać rekord
  - Zmień JWT na user B → SELECT quotes — pusto (izolacja działa)

**Zatrzymaj się po tej fazie i ręcznie zweryfikuj RLS przed przejściem do Phase 2 — to jest krytyczny guardrail produktu.**

---

## Phase 2: TypeScript Types

### Overview

Tworzymy `src/types.ts` z typami dla domeny quote. Typy odzwierciedlają schemat SQL i będą importowane przez F-02 (AI endpoint) i S-01 (wizard).

### Changes Required

#### 1. src/types.ts

**File**: `src/types.ts`

**Intent**: Zdefiniować typy Quote jako kontrakt współdzielony między endpointami, komponentami i hookami. Snippet jest load-bearing — te sygnatury to kontrakt dla F-02 i S-01.

**Contract**:

```typescript
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export interface QuoteItem {
  task: string;
  hours: number;
  rate: number;
}

export interface Quote {
  id: string;
  user_id: string;
  status: QuoteStatus;
  title: string;
  inquiry_text: string;
  content: { items: QuoteItem[] };
  created_at: string;
  updated_at: string;
}

export type QuoteInsert = Omit<Quote, 'id' | 'created_at' | 'updated_at'>;
export type QuoteUpdate = Partial<Pick<Quote, 'title' | 'status' | 'content'>>;
```

### Success Criteria

#### Automated Verification

- `npm run lint` przechodzi bez błędów
- `npm run build` kompiluje bez błędów TypeScript (brak test runnera — build jest gate'em type-check)

#### Manual Verification

- Import `import type { Quote } from '@/types'` w dowolnym pliku działa bez błędu w IDE

---

## Testing Strategy

### Manual Testing (RLS — Phase 1)

Supabase Studio SQL Editor (localhost:54323):

1. Zaloguj się jako user A (utwórz testowego usera w Authentication)
2. Skopiuj JWT tokena z Studio
3. W SQL Editor ustaw: `SET LOCAL role = authenticated; SET LOCAL "request.jwt.claims" = '{"sub": "<user_a_id>"}'`
4. INSERT quote z `user_id = '<user_a_id>'` → sprawdź SELECT — widać rekord ✓
5. Zmień sub na `<user_b_id>` → SELECT — zero wyników ✓
6. Próba DELETE/UPDATE cudzego rekordu → zero affected rows ✓

### Automated (Phase 2)

```bash
npm run lint
npm run build
```

## References

- Roadmap F-01: `context/foundation/roadmap.md` § F-01 (schema decisions)
- Supabase client: `src/lib/supabase.ts`
- Auth middleware: `src/middleware.ts`
- CLAUDE.md convention: shared types → `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: SQL Migration

#### Automated

- [x] 1.1 `npx supabase db reset` completes without errors
- [x] 1.2 `npx supabase db diff` shows no pending changes after reset

#### Manual

- [x] 1.3 Tabela `quotes` widoczna w Studio z poprawnymi kolumnami
- [x] 1.4 Polityki RLS (4) widoczne w Studio → Authentication → Policies
- [x] 1.5 Trigger `quotes_updated_at` widoczny w Studio → Database → Triggers
- [x] 1.6 RLS smoke test: user A nie widzi rekordów user B

### Phase 2: TypeScript Types

#### Automated

- [ ] 2.1 `npm run lint` przechodzi bez błędów
- [ ] 2.2 `npm run build` kompiluje bez błędów TypeScript

#### Manual

- [ ] 2.3 Import `Quote` z `@/types` działa bez błędu w IDE
