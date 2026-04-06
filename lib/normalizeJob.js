/** Normalize URL for duplicate detection (trim, scheme, trailing slash). */
export function normalizeJobLink(href) {
  if (!href || !String(href).trim()) return "";
  const raw = String(href).trim();
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    u.pathname = path;
    return u.href.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeCompanyTitle(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
