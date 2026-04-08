import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeJobLink } from "@/lib/normalizeJob";

const SUPABASE_SETUP_MSG =
  "Supabase env missing on the server. In Vercel → Project → Settings → Environment Variables, add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (same as .env.local), then Redeploy.";

function supabaseNetworkError(err) {
  const msg = err?.message || String(err);
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|certificate/i.test(msg)) {
    return NextResponse.json(
      {
        error:
          "Could not reach Supabase. Confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel (Production), redeploy, and ensure the Supabase project is running.",
        detail: msg,
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}

const DEDUPE_ROW_LIMIT = 5000;

/** Duplicate = same normalized posting URL (ATS job id lives in the path for most boards). No company/title match. */
function findDuplicate(rows, payload) {
  const normLink = normalizeJobLink(payload.link || "");
  if (!normLink) return null;

  for (const r of rows || []) {
    if (normalizeJobLink(r.link || "") === normLink) {
      return { id: r.id, reason: "same_job_url", company: r.company, title: r.title };
    }
  }
  return null;
}

// GET all jobs
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SUPABASE_SETUP_MSG }, { status: 503 });
  }
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return supabaseNetworkError(err);
  }
}

// POST a new job
export async function POST(req) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SUPABASE_SETUP_MSG }, { status: 503 });
  }
  try {
    const body = await req.json();
    const force = body.force === true;

    if (!force) {
      const { data: rows, error: fetchErr } = await supabase
        .from("jobs")
        .select("id,link,company,title")
        .limit(DEDUPE_ROW_LIMIT);

      if (!fetchErr && rows) {
        const dup = findDuplicate(rows, body);
        if (dup) {
          return NextResponse.json(
            {
              duplicate: true,
              existingId: dup.id,
              reason: dup.reason,
              label: [dup.company, dup.title].filter(Boolean).join(" — ") || "Existing row",
            },
            { status: 409 }
          );
        }
      }
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert([
        {
          company: body.company || "",
          title: body.title || "",
          status: body.status || "Bookmarked",
          link: body.link || "",
          priority: body.priority || "Medium",
          date_applied: body.date_applied || new Date().toISOString().split("T")[0],
          salary: body.salary || "",
          location: body.location || "",
          work_type: body.work_type || "",
          source: body.source || "",
          contact: body.contact || "",
          contact_email: body.contact_email || "",
          interview_stage: body.interview_stage || "",
          interviewer: body.interviewer || "",
          next_step: body.next_step || "",
          follow_up: body.follow_up || "",
          notes: body.notes || "",
          bucket: body.bucket || "General",
          job_id: body.job_id || "",
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return supabaseNetworkError(err);
  }
}

// PUT — update a job
export async function PUT(req) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SUPABASE_SETUP_MSG }, { status: 503 });
  }
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    const { data, error } = await supabase
      .from("jobs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return supabaseNetworkError(err);
  }
}

// DELETE a job
export async function DELETE(req) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SUPABASE_SETUP_MSG }, { status: 503 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    const { error } = await supabase.from("jobs").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return supabaseNetworkError(err);
  }
}
