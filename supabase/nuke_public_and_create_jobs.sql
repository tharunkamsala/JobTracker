-- ═══════════════════════════════════════════════════════════════════════════
-- DESTRUCTIVE: Drops EVERY table in schema `public` (your old chat/messaging
-- tables, etc.), then creates ONLY `jobs` + RLS for this Job Tracker app.
-- PostGIS catalog tables are left alone if present.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'spatial_ref_sys',
        'geometry_columns',
        'geography_columns',
        'raster_columns',
        'raster_overviews'
      )
  ) LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;

-- ── Job Tracker (single table) ─────────────────────────────────────────────

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Bookmarked',
  link text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'Medium',
  date_applied text NOT NULL DEFAULT '',
  salary text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  work_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  interview_stage text NOT NULL DEFAULT '',
  interviewer text NOT NULL DEFAULT '',
  next_step text NOT NULL DEFAULT '',
  follow_up text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  bucket text NOT NULL DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_anon" ON public.jobs FOR SELECT TO anon USING (true);
CREATE POLICY "jobs_insert_anon" ON public.jobs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "jobs_update_anon" ON public.jobs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "jobs_delete_anon" ON public.jobs FOR DELETE TO anon USING (true);

CREATE POLICY "jobs_select_authenticated" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "jobs_insert_authenticated" ON public.jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "jobs_update_authenticated" ON public.jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "jobs_delete_authenticated" ON public.jobs FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.jobs TO anon, authenticated, service_role;
