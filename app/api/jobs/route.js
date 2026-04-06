import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizeJobLink, normalizeCompanyTitle } from "@/lib/normalizeJob";

const DEDUPE_ROW_LIMIT = 5000;

function findDuplicate(rows, payload) {
  const normLink = normalizeJobLink(payload.link || "");
  const company = normalizeCompanyTitle(payload.company || "");
  const title = normalizeCompanyTitle(payload.title || "");

  for (const r of rows || []) {
    if (normLink && normalizeJobLink(r.link || "") === normLink) {
      return { id: r.id, reason: "link", company: r.company, title: r.title };
    }
    if (
      company &&
      title &&
      normalizeCompanyTitle(r.company || "") === company &&
      normalizeCompanyTitle(r.title || "") === title
    ) {
      return { id: r.id, reason: "company_title", company: r.company, title: r.title };
    }
  }
  return null;
}

// GET all jobs
export async function GET() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST a new job
export async function POST(req) {
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
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// PUT — update a job
export async function PUT(req) {
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
}

// DELETE a job
export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  const { error } = await supabase.from("jobs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
