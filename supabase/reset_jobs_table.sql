-- Job Tracker — reset `jobs` table for Supabase (run in SQL Editor or: psql $DATABASE_URL -f this file)
-- Destroys all rows in `jobs` and recreates the schema + RLS for the Next.js app.

DROP TABLE IF EXISTS public.jobs CASCADE;

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

-- Allow the browser client (anon / publishable key) full CRUD on this table
CREATE POLICY "jobs_select_anon" ON public.jobs FOR SELECT TO anon USING (true);
CREATE POLICY "jobs_insert_anon" ON public.jobs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "jobs_update_anon" ON public.jobs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "jobs_delete_anon" ON public.jobs FOR DELETE TO anon USING (true);

-- Authenticated users (if you add Supabase Auth later)
CREATE POLICY "jobs_select_authenticated" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "jobs_insert_authenticated" ON public.jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "jobs_update_authenticated" ON public.jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "jobs_delete_authenticated" ON public.jobs FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.jobs TO anon, authenticated, service_role;
