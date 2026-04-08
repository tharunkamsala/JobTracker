/**
 * External posting / requisition reference (portals label this "Job ID", "Requisition ID",
 * "Posting ID", or "ID"). Stored values are capped at MAX_JOB_ID_LEN.
 */
export const MAX_JOB_ID_LEN = 8;

/**
 * Normalize extracted or pasted ids to at most MAX_JOB_ID_LEN characters.
 * Strips legacy prefixed heuristics (gh:, wd:, …). Never stores synthetic long tokens.
 */
export function sanitizeJobId(input) {
  if (input == null || input === "") return "";
  let s = String(input).trim();
  if (!s) return "";

  s = s.replace(/^(gh|linkedin|wd|lever|ashby):\s*/i, "");
  if (!s) return "";

  const compact = s.replace(/\s/g, "");

  // Pure numeric (LinkedIn view id, Greenhouse job #, Workday _R12345, etc.)
  if (/^\d+$/.test(compact)) {
    return compact.length <= MAX_JOB_ID_LEN
      ? compact
      : compact.slice(-MAX_JOB_ID_LEN);
  }

  // UUID / dashed hex (Lever, Ashby, etc.)
  if (
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(compact) ||
    (compact.includes("-") && /^[a-f0-9-]+$/i.test(compact) && compact.replace(/-/g, "").length >= 8)
  ) {
    const h = compact.replace(/-/g, "");
    return h.length <= MAX_JOB_ID_LEN
      ? h.toUpperCase()
      : h.slice(-MAX_JOB_ID_LEN).toUpperCase();
  }

  // Long hex string without dashes
  if (/^[a-f0-9]+$/i.test(compact) && compact.length >= 8) {
    return compact.slice(-MAX_JOB_ID_LEN).toUpperCase();
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length > 0) {
    return digits.length <= MAX_JOB_ID_LEN
      ? digits
      : digits.slice(-MAX_JOB_ID_LEN);
  }

  const alnum = s.replace(/[^a-zA-Z0-9]/g, "");
  if (alnum.length > 0) {
    return alnum.length <= MAX_JOB_ID_LEN
      ? alnum
      : alnum.slice(-MAX_JOB_ID_LEN);
  }

  return "";
}

/**
 * Best-effort posting reference from URL path only (no synthetic wd:tenant:path strings).
 */
export function deriveHeuristicJobId(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const clean = url.split(/[#?]/)[0];
    const u = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    const h = u.hostname.replace(/^www\./, "");
    const p = u.pathname;

    let m = p.match(/\/jobs\/view\/(\d+)/i);
    if (m && h.includes("linkedin")) return sanitizeJobId(m[1]);

    m = p.match(/\/jobs\/(\d+)/i);
    if (m && /greenhouse\.io|job-boards\.greenhouse|boards\.greenhouse/i.test(h + u.href))
      return sanitizeJobId(m[1]);

    m = p.match(/\/jobs\/([a-f0-9-]{8,})/i);
    if (m && h.includes("lever.co")) return sanitizeJobId(m[1]);

    m = p.match(/ashbyhq\.com\/([^/]+)\/jobs\/([a-f0-9-]+)/i);
    if (m) return sanitizeJobId(m[2]);

    if (h.includes("myworkdayjobs.com") && p.includes("/job/")) {
      const parts = p.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "";
      const req = last.match(/_R(\d+)$/i);
      if (req) return sanitizeJobId(req[1]);
      if (last.length > 2) return sanitizeJobId(last.replace(/_R\d+$/i, ""));
    }

    return "";
  } catch {
    return "";
  }
}
