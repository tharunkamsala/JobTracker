import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

/**
 * Greenhouse public board API — exact fields, no HTML scrape.
 * @see https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}
 */
export async function extractGreenhouse(url) {
  const clean = url.split(/[?#]/)[0];
  let token;
  let jobId;

  const mBoards = clean.match(
    /(?:job-boards|boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i
  );
  if (mBoards) {
    token = mBoards[1];
    jobId = mBoards[2];
  }
  if (!token) {
    const mSub = clean.match(
      /^https?:\/\/[a-z0-9-]+\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i
    );
    if (mSub) {
      token = mSub[1];
      jobId = mSub[2];
    }
  }

  if (!token || !jobId) return null;

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${jobId}`;
  const res = await fetch(apiUrl, {
    headers: { ...BROWSER_HEADERS, Referer: "https://boards.greenhouse.io/" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error || data.status === 404 || !data.title) return null;

  let notes = "";
  if (data.content) {
    const $ = cheerio.load(data.content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    notes = $.text().replace(/\s+/g, " ").trim().slice(0, 600);
  }

  return {
    company: (data.company_name || "").trim(),
    title: (data.title || "").trim(),
    salary: "",
    location: (data.location?.name || "").trim(),
    work_type: inferWorkTypeFromText(`${data.title} ${notes}`),
    source: "Greenhouse",
    notes,
  };
}

/**
 * Parse Workday job path into siteId + jobPath for CXS API.
 *
 * Two layouts:
 * - With locale: /{locale}/{siteId}/job/{rest}  (e.g. en-US/NVIDIAExternalCareerSite/job/...)
 * - Short:      /{siteId}/job/{rest}            (e.g. Careers/job/Allen-TX/... — Motorola, etc.)
 */
function parseWorkdayJobPath(pathname) {
  const path = pathname.replace(/\/$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const ji = parts.indexOf("job");
  if (ji < 1) return null;

  let siteId;
  let jobPath;
  if (ji === 1) {
    siteId = parts[0];
    jobPath = parts.slice(2).join("/");
  } else if (ji === 2) {
    siteId = parts[1];
    jobPath = parts.slice(3).join("/");
  } else {
    return null;
  }
  if (!siteId || !jobPath) return null;
  return { siteId, jobPath };
}

/**
 * Workday CXS JSON API — same JSON the careers SPA loads.
 */
export async function extractWorkday(url) {
  const clean = url.split(/[?#]/)[0];
  let tenant;
  let shard;
  let siteId;
  let jobPath;
  try {
    const u = new URL(clean);
    const hostMatch = u.hostname.match(/^([^.]+)\.wd(\d+)\.myworkdayjobs\.com$/i);
    if (!hostMatch) return null;
    const parsed = parseWorkdayJobPath(u.pathname);
    if (!parsed) return null;
    tenant = hostMatch[1];
    shard = hostMatch[2];
    siteId = parsed.siteId;
    jobPath = parsed.jobPath;
  } catch {
    return null;
  }

  const apiUrl = `https://${tenant}.wd${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${siteId}/job/${jobPath}`;
  const origin = `https://${tenant}.wd${shard}.myworkdayjobs.com`;

  const res = await fetch(apiUrl, {
    headers: {
      ...BROWSER_HEADERS,
      Referer: `${origin}/`,
      Origin: origin,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (json.errorCode || json.httpStatus >= 400) return null;

  const info = json.jobPostingInfo;
  if (!info?.title) return null;

  const loc =
    typeof info.location === "string"
      ? info.location
      : info.jobRequisitionLocation?.descriptor || "";

  let notes = "";
  if (info.jobDescription) {
    const $ = cheerio.load(info.jobDescription);
    notes = $.text().replace(/\s+/g, " ").trim().slice(0, 600);
  }

  const company = brandFromTenant(tenant);
  const hybrid =
    /#LI-Hybrid|hybrid/i.test(info.jobDescription || "") ||
    /\bhybrid\b/i.test(notes.slice(0, 200));
  const remote =
    /#LI-Remote|\bremote\b/i.test(info.jobDescription || "") ||
    /\bremote\b/i.test(info.title || "");

  let work_type = "";
  if (remote) work_type = "Remote";
  else if (hybrid) work_type = "Hybrid";
  else if (info.timeType) work_type = info.timeType;

  return {
    company,
    title: (info.title || "").trim(),
    salary: "",
    location: (loc || "").trim(),
    work_type,
    source: "Workday",
    notes,
  };
}

function inferWorkTypeFromText(t) {
  const s = (t || "").toLowerCase();
  if (/\bremote\b|#li-remote/.test(s)) return "Remote";
  if (/\bhybrid\b|#li-hybrid/.test(s)) return "Hybrid";
  if (/\bon-?site\b|#li-onsite/.test(s)) return "On-site";
  return "";
}

/** Exported for extract route fallbacks when CXS fetch is blocked server-side */
export function brandFromTenant(tenant) {
  const slug = (tenant || "").toLowerCase().replace(/-/g, " ");
  const map = {
    nvidia: "NVIDIA",
    amd: "AMD",
    ibm: "IBM",
    hp: "HP",
    ge: "GE",
    meta: "Meta",
    salesforce: "Salesforce",
    oracle: "Oracle",
    uber: "Uber",
    zoom: "Zoom",
    dropbox: "Dropbox",
    stripe: "Stripe",
  };
  if (map[slug]) return map[slug];
  const compound = { motorolasolutions: "Motorola Solutions" };
  if (compound[slug]) return compound[slug];
  return slug
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * When Workday CXS API fails (bot-blocking, SSR IP, etc.), derive company + rough title from URL.
 */
export function getWorkdayUrlFallback(url) {
  const clean = url.split(/[?#]/)[0];
  try {
    const u = new URL(clean);
    const hostMatch = u.hostname.match(/^([^.]+)\.wd(\d+)\.myworkdayjobs\.com$/i);
    if (!hostMatch) return null;
    const tenant = hostMatch[1];
    const shard = hostMatch[2];
    const parsed = parseWorkdayJobPath(u.pathname);
    if (!parsed) return null;

    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    let titleGuess = last
      .replace(/_R\d+$/i, "")
      .replace(/---/g, " – ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (titleGuess.length < 3) titleGuess = "";

    return {
      company: brandFromTenant(tenant),
      title: titleGuess,
      salary: "",
      location: "",
      work_type: "",
      source: "Workday",
      notes: "",
    };
  } catch {
    return null;
  }
}
