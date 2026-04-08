import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import {
  extractGreenhouse,
  extractWorkday,
  getWorkdayUrlFallback,
} from "@/lib/extractAts";
import { deriveHeuristicJobId } from "@/lib/jobId";

/** Walk JSON-LD and return first JobPosting node */
function findJobPostingNode(data) {
  if (!data || typeof data !== "object") return null;
  const stack = [data];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    const t = node["@type"];
    const isJob =
      t === "JobPosting" ||
      (Array.isArray(t) && t.includes("JobPosting"));
    if (isJob) return node;
    for (const k of Object.keys(node)) {
      if (k === "@context") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((x) => stack.push(x));
      else if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

function hiringOrgName(org) {
  if (!org) return "";
  if (typeof org === "string") return org.trim();
  if (typeof org === "object" && org.name) return String(org.name).trim();
  return "";
}

// Scrape the job page
async function scrapeUrl(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim();

    const ogTitle =
      $('meta[property="og:title"]').attr("content")?.trim() || "";
    const ogSiteName =
      $('meta[property="og:site_name"]').attr("content")?.trim() || "";
    const twitterTitle =
      $('meta[name="twitter:title"]').attr("content")?.trim() || "";

    const metaDesc =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

    // Parse JSON-LD — collect JobPosting from every script tag
    let jsonLdJob = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (jsonLdJob) return;
      try {
        const raw = $(el).html();
        if (!raw?.trim()) return;
        const data = JSON.parse(raw);
        const job = findJobPostingNode(data);
        if (job) jsonLdJob = job;
      } catch {
        /* skip invalid JSON */
      }
    });

    // Strip noisy nodes but keep main-readable text
    $("script, style, nav, footer, iframe, noscript, svg").remove();

    const bodyText = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    const thinContent = bodyText.length < 80;

    return {
      title,
      ogTitle,
      ogSiteName,
      twitterTitle,
      metaDesc,
      bodyText,
      jsonLd: jsonLdJob,
      ok: res.ok,
      thinContent,
      status: res.status,
    };
  } catch (err) {
    return {
      title: "",
      ogTitle: "",
      ogSiteName: "",
      twitterTitle: "",
      metaDesc: "",
      bodyText: "",
      jsonLd: null,
      ok: false,
      thinContent: true,
      error: err.message,
    };
  }
}

function pickBestTitle(pc) {
  return (
    pc.ogTitle ||
    pc.twitterTitle ||
    pc.title ||
    ""
  ).trim();
}

// Heuristic title → job title + company ("Engineer at Acme", "Role | Company", etc.)
function parseTitleLine(line) {
  const t = line.trim();
  if (!t) return { title: "", company: "" };

  const at = /\s+at\s+/i.exec(t);
  if (at) {
    return {
      title: t.slice(0, at.index).trim(),
      company: t.slice(at.index + at[0].length).trim().replace(/\s*[-|–—].*$/, "").trim(),
    };
  }

  const pipe = t.split(/\s*[|\-–—]\s*/).map((s) => s.trim()).filter(Boolean);
  if (pipe.length >= 2) {
    return { title: pipe[0], company: pipe[pipe.length - 1] };
  }

  return { title: t, company: "" };
}

/**
 * Unified Gemini pass: merges scraped HTML + optional Greenhouse/Workday API payloads.
 * Works across LinkedIn, Indeed, Lever, Ashby, company sites, ATS shells, etc.
 *
 * Stable default model; override with GEMINI_MODEL in env (avoids fragile `*-latest` aliases).
 */
function getGeminiModel() {
  return (
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash"
  ).trim();
}

async function extractWithGeminiUnified(pageContent, url, atsHint) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { data: null, error: "missing_key", model: null };

  const ldSnippet = pageContent.jsonLd
    ? JSON.stringify(pageContent.jsonLd).slice(0, 4000)
    : "";

  const officialBlock = atsHint
    ? `OFFICIAL_ATS_API (${atsHint.source || "ATS"} — treat as authoritative for facts when present):
${JSON.stringify(
  {
    company: atsHint.company,
    title: atsHint.title,
    location: atsHint.location,
    salary: atsHint.salary,
    work_type: atsHint.work_type,
    notes_excerpt: (atsHint.notes || "").slice(0, 1200),
  },
  null,
  2
)}`
    : `OFFICIAL_ATS_API: null (no Greenhouse/Workday JSON available — infer only from URL + page signals below).`;

  const prompt = `You help users save job applications. Produce the best possible structured fields for ANY job board (LinkedIn, Indeed, Glassdoor, Lever, Greenhouse, Workday, Ashby, ZipRecruiter, company career sites, etc.).

${officialBlock}

PAGE_URL: ${url}

SCRAPED_METADATA (HTML fetch — may be empty on JS-heavy pages):
- og:title: ${pageContent.ogTitle || "(none)"}
- og:site_name: ${pageContent.ogSiteName || "(none)"}
- twitter:title: ${pageContent.twitterTitle || "(none)"}
- document <title>: ${pageContent.title || "(none)"}
- meta description: ${pageContent.metaDesc || "(none)"}
- JSON-LD JobPosting (if any): ${ldSnippet || "(none)"}
- visible text (truncated):
${pageContent.bodyText || "(empty or login wall)"}

RULES:
1. When OFFICIAL_ATS_API has title/company/location, prefer those; you may normalize company display (spacing, Inc., legal suffix) but do not invent a different employer.
2. If official block is null or thin, infer from URL hostname, og: tags, and page text.
3. work_type: one of "Remote", "Hybrid", "On-site", or "" if unknown.
4. source: short label such as "LinkedIn", "Greenhouse", "Workday", "Indeed", or the careers product name.
5. notes: 1–3 sentences summarizing role/stack/location from official excerpt + page text; empty string if nothing useful.
6. job_id: numeric or alphanumeric posting/requisition id if visible in URL or page; else "".

Return ONLY valid JSON, no markdown:
{
  "company": "",
  "title": "",
  "salary": "",
  "location": "",
  "work_type": "",
  "source": "",
  "notes": "",
  "job_id": ""
}`;

  const model = getGeminiModel();
  const urlApi = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(urlApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1536 },
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const msg =
        data?.error?.message ||
        data?.error?.status ||
        `HTTP ${res.status}`;
      console.error("Gemini API error:", model, msg, data?.error);
      return {
        data: null,
        error: "api_error",
        message: msg,
        model,
        httpStatus: res.status,
      };
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      console.error("Gemini blocked:", blockReason);
      return { data: null, error: "blocked", message: String(blockReason), model };
    }
    if (!text.trim()) {
      const finish = data?.candidates?.[0]?.finishReason;
      console.error("Gemini empty response:", finish, JSON.stringify(data).slice(0, 600));
      return {
        data: null,
        error: "empty_response",
        message: finish ? `No text (finish: ${finish})` : "Empty model output",
        model,
      };
    }
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return { data: JSON.parse(match[0]), error: null, model };
      } catch {
        return { data: null, error: "bad_json", message: "Model returned invalid JSON", model };
      }
    }
  } catch (err) {
    console.error("Gemini error:", err);
    return { data: null, error: "exception", message: err.message, model };
  }
  return { data: null, error: "parse_failed", model };
}

/** AI failed → use heuristics; distinguish quota/rate-limit (quiet) vs other errors. */
function classifyAiFallback(res) {
  if (!res?.error) return null;
  const msg = String(res.message || "").toLowerCase();
  const status = res.httpStatus;
  if (
    status === 429 ||
    status === 503 ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests") ||
    msg.includes("exceeded your current quota")
  ) {
    return "quota";
  }
  return "other";
}

// Fallback: structured data + meta + title heuristics (no AI)
function extractFromStructuredData(pageContent, url) {
  const result = {
    company: "",
    title: "",
    salary: "",
    location: "",
    work_type: "",
    source: "",
    notes: "",
    job_id: "",
  };

  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (domain.includes("myworkdayjobs.com")) {
      result.source = "Workday";
    } else {
      const domainMap = {
        "linkedin.com": "LinkedIn",
        "indeed.com": "Indeed",
        "glassdoor.com": "Glassdoor",
        "ziprecruiter.com": "ZipRecruiter",
        "lever.co": "Lever",
        "greenhouse.io": "Greenhouse",
        "workday.com": "Workday",
        "angel.co": "AngelList",
        "wellfound.com": "Wellfound",
        "jobs.ashbyhq.com": "Ashby",
      };
      const first = domain.split(".")[0];
      result.source =
        domainMap[domain] ||
        (first ? first.charAt(0).toUpperCase() + first.slice(1) : "");
    }
  } catch {
    /* ignore */
  }

  const job = pageContent.jsonLd;
  if (job) {
    result.title = (job.title || "").trim();
    result.company = hiringOrgName(job.hiringOrganization);
    const ident = job.identifier;
    if (ident != null) {
      if (typeof ident === "string" || typeof ident === "number") {
        result.job_id = String(ident).trim();
      } else if (typeof ident === "object" && ident.value != null) {
        result.job_id = String(ident.value).trim();
      }
    }
    const loc = job.jobLocation;
    if (loc) {
      if (typeof loc === "object") {
        result.location =
          loc.address?.addressLocality ||
          loc.address?.streetAddress ||
          [loc.address?.addressLocality, loc.address?.addressRegion]
            .filter(Boolean)
            .join(", ") ||
          loc.name ||
          "";
      }
    }
    if (job.baseSalary?.value) {
      const v = job.baseSalary.value;
      const cur = job.baseSalary.currency || "";
      result.salary = [v.minValue, v.maxValue].filter((x) => x != null).length
        ? `${cur} ${v.minValue ?? ""}${v.maxValue != null ? ` - ${v.maxValue}` : ""}`.trim()
        : "";
    }
    if (job.jobLocationType === "TELECOMMUTE") result.work_type = "Remote";
  }

  // Open Graph often has company in site_name
  if (!result.company && pageContent.ogSiteName) {
    result.company = pageContent.ogSiteName.replace(/\s+(Jobs|Careers|Hiring).*$/i, "").trim();
  }

  const lineForParse = pickBestTitle(pageContent);
  if (!result.title && lineForParse) {
    const parsed = parseTitleLine(lineForParse);
    result.title = parsed.title || lineForParse;
    if (!result.company && parsed.company) result.company = parsed.company;
  }

  if (!result.title && pageContent.title) {
    const parsed = parseTitleLine(pageContent.title);
    result.title = parsed.title || pageContent.title;
    if (!result.company && parsed.company) result.company = parsed.company;
  }

  const text = (pageContent.bodyText || "").toLowerCase();
  if (!result.work_type) {
    if (text.includes("remote")) result.work_type = "Remote";
    else if (text.includes("hybrid")) result.work_type = "Hybrid";
    else if (text.includes("on-site") || text.includes("onsite"))
      result.work_type = "On-site";
  }

  return result;
}

/** Non-empty string counts as filled */
function isFilled(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/** Prefer ATS API fields over HTML heuristics when both exist */
function mergeAtsIntoBaseline(baseline, ats) {
  const out = { ...baseline };
  for (const k of [
    "company",
    "title",
    "salary",
    "location",
    "work_type",
    "source",
    "notes",
    "job_id",
  ]) {
    if (ats && isFilled(ats[k])) out[k] = ats[k].trim();
  }
  return out;
}

function mergeExtraction(heuristic, ai) {
  if (!ai || typeof ai !== "object") return heuristic;
  const out = { ...heuristic };
  for (const key of [
    "company",
    "title",
    "salary",
    "location",
    "work_type",
    "source",
    "notes",
    "job_id",
  ]) {
    if (isFilled(ai[key])) out[key] = ai[key].trim();
  }
  return out;
}

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const [pageContent, gh, wd] = await Promise.all([
      scrapeUrl(url),
      extractGreenhouse(url).catch(() => null),
      extractWorkday(url).catch(() => null),
    ]);
    const atsHint = gh || wd || null;

    const baseline = extractFromStructuredData(pageContent, url);
    let mergedHints = baseline;
    if (atsHint) {
      mergedHints = mergeAtsIntoBaseline(baseline, atsHint);
    } else {
      const wdFallback = getWorkdayUrlFallback(url);
      if (wdFallback) mergedHints = mergeAtsIntoBaseline(baseline, wdFallback);
    }

    let extracted = mergedHints;
    let geminiMeta = null;
    /** No AI: omit GEMINI_API_KEY, or set DISABLE_GEMINI_AI=true (same pipeline: ATS APIs + scrape + JSON-LD/heuristics). */
    const aiDisabled =
      process.env.DISABLE_GEMINI_AI === "true" ||
      process.env.DISABLE_GEMINI_AI === "1";
    const hasGemini =
      !!process.env.GEMINI_API_KEY && !aiDisabled;
    /** Greenhouse/Workday already returned company+title — skip Gemini for speed (set FORCE_GEMINI_AI=true to always call AI). */
    const skipGeminiForSpeed =
      !!atsHint &&
      isFilled(atsHint.company) &&
      isFilled(atsHint.title) &&
      process.env.FORCE_GEMINI_AI !== "true";

    if (
      hasGemini &&
      !skipGeminiForSpeed &&
      (pageContent.ok || pageContent.bodyText || atsHint)
    ) {
      const geminiRes = await extractWithGeminiUnified(pageContent, url, atsHint);
      geminiMeta = geminiRes && typeof geminiRes === "object" ? geminiRes : null;
      if (geminiRes && typeof geminiRes === "object" && "data" in geminiRes) {
        extracted = mergeExtraction(mergedHints, geminiRes.data);
      } else {
        extracted = mergeExtraction(mergedHints, null);
      }
      if (atsHint) {
        for (const k of ["company", "title", "location", "salary", "work_type"]) {
          if (isFilled(atsHint[k])) extracted[k] = atsHint[k].trim();
        }
      }
    }

    const warnThin =
      pageContent.thinContent &&
      !isFilled(extracted.company) &&
      !isFilled(extracted.title);

    const atsProvider = gh
      ? "greenhouse"
      : wd
        ? "workday"
        : null;

    const aiFallback = geminiMeta ? classifyAiFallback(geminiMeta) : null;
    const aiOk = !!(geminiMeta && !geminiMeta.error && geminiMeta.data);
    const suppressGeminiDetail = aiFallback === "quota";

    let jobIdOut =
      (atsHint && isFilled(atsHint.job_id) && atsHint.job_id.trim()) ||
      (isFilled(extracted.job_id) && extracted.job_id.trim()) ||
      "";
    if (!jobIdOut) jobIdOut = deriveHeuristicJobId(url);

    return NextResponse.json({
      success: true,
      data: {
        company: extracted.company || "",
        title: extracted.title || "",
        salary: extracted.salary || "",
        location: extracted.location || "",
        work_type: extracted.work_type || "",
        source: extracted.source || "",
        notes: extracted.notes || "",
        job_id: jobIdOut,
        link: url,
      },
      meta: {
        method:
          !hasGemini || skipGeminiForSpeed
            ? skipGeminiForSpeed
              ? "ats-fast"
              : "heuristic+ats"
            : aiOk
              ? "unified-ai"
              : "heuristic+ats-fallback",
        skippedGeminiForAtsSpeed: skipGeminiForSpeed || undefined,
        aiDisabled: aiDisabled || undefined,
        aiFallback: aiFallback || undefined,
        atsProvider,
        scrapeOk: pageContent.ok,
        status: pageContent.status,
        thinContent: !!pageContent.thinContent,
        geminiModel: geminiMeta?.model,
        geminiError: suppressGeminiDetail ? undefined : geminiMeta?.error || undefined,
        geminiMessage: suppressGeminiDetail ? undefined : geminiMeta?.message || undefined,
        hint: warnThin
          ? "Page returned little text (often login/JS-only). Fill details manually or try the job’s direct ATS link."
          : undefined,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Extraction failed", message: err.message },
      { status: 500 }
    );
  }
}
