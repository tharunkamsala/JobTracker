-- Add external job posting id (ATS id, LinkedIn id, etc.)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_id text NOT NULL DEFAULT '';

UPDATE public.jobs SET job_id = '' WHERE job_id IS NULL;
