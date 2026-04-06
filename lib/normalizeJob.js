/**
 * Normalize URL for duplicate detection = same posting “id” as most ATS encode in the path
 * (e.g. Greenhouse …/jobs/12345). Strips query/hash so ?utm_* doesn’t create false uniques.
 */
export function normalizeJobLink(href) {
  if (!href || !String(href).trim()) return "";
  const raw = String(href).trim();
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    u.search = "";
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    u.pathname = path;
    return u.href.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}
