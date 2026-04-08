/**
 * Best-effort external job id from URL (LinkedIn, Greenhouse path, Lever uuid, etc.).
 * Used when ATS APIs don’t supply an id.
 */
export function deriveHeuristicJobId(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const clean = url.split(/[#?]/)[0];
    const u = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    const h = u.hostname.replace(/^www\./, "");
    const p = u.pathname;

    let m = p.match(/\/jobs\/view\/(\d+)/i);
    if (m && h.includes("linkedin")) return `linkedin:${m[1]}`;

    m = p.match(/\/jobs\/(\d+)/i);
    if (m && /greenhouse\.io|job-boards\.greenhouse|boards\.greenhouse/i.test(h + u.href))
      return `gh:${m[1]}`;

    m = p.match(/\/jobs\/([a-f0-9-]{8,})/i);
    if (m && h.includes("lever.co")) return `lever:${m[1]}`;

    m = p.match(/ashbyhq\.com\/([^/]+)\/jobs\/([a-f0-9-]+)/i);
    if (m) return `ashby:${m[2]}`;

    if (h.includes("myworkdayjobs.com") && p.includes("/job/")) {
      const parts = p.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "";
      if (last.length > 3) return `wd:${last.slice(0, 120)}`;
    }

    return "";
  } catch {
    return "";
  }
}
