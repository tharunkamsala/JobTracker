"use client";
import { PRIORITY_COLORS } from "@/lib/constants";

export default function PriorityBadge({ priority, onChange }) {
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS["Medium"];
  const opts = ["High", "Medium", "Low"];
  const next = opts[(opts.indexOf(priority) + 1) % opts.length];
  const icon = priority === "High" ? "▲" : priority === "Low" ? "▼" : "●";

  return (
    <button
      onClick={() => onChange(next)}
      title={`Click to change → ${next}`}
      className="rounded-full px-3 py-1 text-[11px] font-bold cursor-pointer border-none transition-all hover:shadow-md"
      style={{ background: colors.bg, color: colors.text }}
    >
      {icon} {priority}
    </button>
  );
}
