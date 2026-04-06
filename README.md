# 🎯 Job Tracker — Setup & Deploy Guide

A smart job tracker that auto-extracts job details when you paste a link.
**100% free** to run — uses Supabase (free DB) + Google Gemini (free AI).

---

## Architecture

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Next.js App │────▶│  Vercel Edge   │────▶│   Supabase   │
│  (Frontend)  │     │  (API Routes)  │     │ (PostgreSQL) │
└──────────────┘     └───────┬────────┘     └──────────────┘
                             │
                    ┌────────▼────────┐
                    │  Google Gemini  │
                    │  (Free AI API)  │
                    └─────────────────┘
```

---

## Step 1: Set Up Supabase (Free Database)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"** → name it `job-tracker`
3. Wait for it to initialize (~30 seconds)
4. Go to **SQL Editor** (left sidebar) and run this SQL:

```sql
-- Create the jobs table
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT DEFAULT '',
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'Bookmarked',
  link TEXT DEFAULT '',
  priority TEXT DEFAULT 'Medium',
  date_applied DATE DEFAULT CURRENT_DATE,
  salary TEXT DEFAULT '',
  location TEXT DEFAULT '',
  work_type TEXT DEFAULT '',
  source TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  interview_stage TEXT DEFAULT '',
  interviewer TEXT DEFAULT '',
  next_step TEXT DEFAULT '',
  follow_up TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security (optional, for public access)
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations (since this is a personal tracker)
CREATE POLICY "Allow all" ON jobs FOR ALL USING (true) WITH CHECK (true);
```

5. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

---

## Step 2: Get Gemini API Key (Free AI)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click **"Create API Key"**
3. Copy the key — that's it! No billing required.
   - Free tier: 15 requests/minute, 1 million tokens/month

---

## Step 3: Deploy to Vercel (Free)

### Option A: Deploy via GitHub (Recommended)

1. Push this project to a GitHub repo:
   ```bash
   cd job-tracker
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/job-tracker.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
3. Click **"Add New → Project"** → Import your repo
4. In **Environment Variables**, add:
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
   | `GEMINI_API_KEY` | Your Gemini API key |
5. Click **Deploy** — done!

### Option B: Deploy via Vercel CLI

```bash
npm i -g vercel
cd job-tracker
vercel
# Follow prompts, then add env vars:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add GEMINI_API_KEY
vercel --prod
```

---

## Step 4: Run Locally (Optional)

```bash
cd job-tracker
cp .env.example .env.local
# Edit .env.local with your actual keys
npm install
npm run dev
# Open http://localhost:3000
```

---

## How It Works

1. **Paste a job URL** → Click "Extract"
2. The app scrapes the page, sends text to Gemini AI
3. Gemini extracts: company, title, salary, location, work type, source
4. Everything saves to your Supabase database
5. Click any **status badge** to update (colorful dropdowns!)
6. Click any **priority badge** to cycle High/Medium/Low
7. **Click any cell** to edit inline
8. **Filter** by status pills, **search** by text
9. **Export CSV** anytime for Excel

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Supabase | Free tier | $0 (500MB DB, 50K rows) |
| Google Gemini | Free tier | $0 (15 req/min, 1M tokens/month) |
| Vercel | Hobby plan | $0 (100GB bandwidth) |
| **Total** | | **$0/month** |

---

## Troubleshooting

**"Failed to extract"** → Some sites block scraping (LinkedIn, etc.).
Use "Manual" add instead, or try the direct job posting URL.

**Status dropdown not showing** → Click the colored status badge,
not the cell. The badge IS the dropdown.

**Data not saving** → Check Supabase URL and key in env vars.
Make sure you ran the SQL to create the table.

**Gemini errors** → Check your API key. Free tier has rate limits
(15/min). Wait a moment and try again.
