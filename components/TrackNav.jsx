"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRACK_PAGES } from "@/lib/trackPages";

export default function TrackNav() {
  const pathname = usePathname() || "/";

  const linkCls = (active) =>
    `rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap border transition-colors no-underline ${
      active
        ? "bg-white text-navy border-white shadow-sm"
        : "bg-white/10 text-white/90 border-white/20 hover:bg-white/20"
    }`;

  return (
    <nav className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-white/15" aria-label="Track pages">
      <span className="text-[10px] text-white/45 uppercase tracking-wider w-full sm:w-auto">Pages</span>
      <Link href="/" className={linkCls(pathname === "/")}>
        All lists
      </Link>
      {TRACK_PAGES.map(({ slug, navLabel }) => {
        const href = `/${slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={slug} href={href} className={linkCls(active)}>
            {navLabel}
          </Link>
        );
      })}
    </nav>
  );
}
