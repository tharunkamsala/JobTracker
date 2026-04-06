/**
 * URL slug → DB `bucket` value. Each slug is its own page; pastes save to that bucket.
 */
export const TRACK_PAGES = [
  { slug: "spring-internships", bucket: "Spring", title: "Spring internships", navLabel: "Spring" },
  { slug: "summer-internships", bucket: "Summer", title: "Summer internships", navLabel: "Summer" },
  { slug: "fall-internships", bucket: "Fall", title: "Fall internships", navLabel: "Fall" },
  { slug: "new-grad", bucket: "New Grad", title: "New grad", navLabel: "New Grad" },
  { slug: "sde-1", bucket: "SDE I", title: "SDE I", navLabel: "SDE I" },
  { slug: "sde-2", bucket: "SDE II", title: "SDE II", navLabel: "SDE II" },
  { slug: "general", bucket: "General", title: "General", navLabel: "General" },
];

export function getTrackBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  return TRACK_PAGES.find((t) => t.slug === slug) || null;
}
