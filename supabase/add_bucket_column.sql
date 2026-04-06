-- Add `bucket` for role/season tabs (run once on existing DBs)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'General';

UPDATE public.jobs SET bucket = 'General' WHERE bucket IS NULL OR bucket = '';
