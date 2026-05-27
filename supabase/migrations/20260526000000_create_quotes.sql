-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Quotes table
CREATE TABLE quotes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  title         TEXT        NOT NULL,
  inquiry_text  TEXT        NOT NULL,
  content       JSONB       NOT NULL DEFAULT '{"items": []}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for per-user queries
CREATE INDEX quotes_user_id_idx ON quotes (user_id);

-- updated_at trigger
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only
CREATE POLICY "quotes_select_own" ON quotes
  FOR SELECT USING ((select auth.uid()) = user_id);

-- INSERT: own rows only
CREATE POLICY "quotes_insert_own" ON quotes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- UPDATE: own rows only (both USING and WITH CHECK required)
CREATE POLICY "quotes_update_own" ON quotes
  FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- DELETE: own rows only
CREATE POLICY "quotes_delete_own" ON quotes
  FOR DELETE USING ((select auth.uid()) = user_id);
