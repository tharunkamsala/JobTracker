"use client";
import { useState, useRef, useEffect } from "react";
import { STATUS_OPTIONS, STATUS_COLORS } from "@/lib/constants";

export default function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const colors = STATUS_COLORS[status] || STATUS_COLORS["Applied"];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap cursor-pointer border-none transition-all hover:shadow-md"
        style={{ background: colors.bg, color: colors.text }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: colors.dot }}
        />
        {status}
        <span className="text-[9px] opacity-50 ml-0.5">▼</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-1.5 min-w-[180px] max-h-[300px] overflow-y-auto animate-fade-in">
          {STATUS_OPTIONS.map((s) => {
            const c = STATUS_COLORS[s];
            return (
              <button
                key={s}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full border-none rounded-lg px-3 py-2 text-xs cursor-pointer text-left transition-colors hover:opacity-80"
                style={{
                  background: status === s ? c.bg : "transparent",
                  color: c.text,
                  fontWeight: status === s ? 700 : 500,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: c.dot }}
                />
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
