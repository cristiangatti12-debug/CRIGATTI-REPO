-- MVP launch hardening: make sure RLS is enabled on every user-data table and
-- the canonical "users see their own rows" policies exist. The base tables
-- (holdings, profiles, community_analyses) were originally created in the
-- Supabase dashboard, so their RLS state was never version-controlled. If
-- someone ever toggled RLS off — or a future ALTER TABLE forgot to re-enable
-- it — every authenticated session would be able to read every other user's
-- portfolio. This migration is idempotent: it can be re-run safely.

-- ── holdings ──────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS holdings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "holdings_owner_select" ON holdings FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "holdings_owner_insert" ON holdings FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "holdings_owner_update" ON holdings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "holdings_owner_delete" ON holdings FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- profiles.id == auth.users.id (1-to-1, per VELA_PROJECT.md §10).
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "profiles_owner_select" ON profiles FOR SELECT
    USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_owner_insert" ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_owner_update" ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_owner_delete" ON profiles FOR DELETE
    USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── community_analyses ────────────────────────────────────────────────────────
-- Community posts are world-readable once moderated, but only the author can
-- insert/update/delete their own rows.
ALTER TABLE IF EXISTS community_analyses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "community_public_select" ON community_analyses FOR SELECT
    USING (moderation_passed IS TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "community_owner_insert" ON community_analyses FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "community_owner_update" ON community_analyses FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "community_owner_delete" ON community_analyses FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
