"use client";
import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import StatusBadge from "@/components/StatusBadge";
import PriorityBadge from "@/components/PriorityBadge";
import { STATUS_COLORS, JOB_BUCKETS } from "@/lib/constants";
import { sanitizeJobId } from "@/lib/jobId";
import TrackNav from "@/components/TrackNav";

/** `YYYY-MM-DD` for <input type="date" /> */
function toDateInputValue(v) {
  if (!v) return "";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

/**
 * Must be defined outside `Home` — inner components remount every parent render
 * and drop focus after a single keystroke.
 */
const EditRowInput = memo(function EditRowInput({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  className = "w-full min-w-[7.5rem] border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-navy bg-white",
}) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={className}
    />
  );
});

const KpiCard = memo(function KpiCard({ label, value, icon, color, sub }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {sub && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: color + "18", color }}>{sub}</span>}
      </div>
      <div className="text-3xl font-bold tracking-tight" style={{ color, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      <div className="text-[11px] text-gray-400 font-medium">{label}</div>
    </div>
  );
});

const ProgressBar = memo(function ProgressBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 text-right font-medium truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, minWidth: value > 0 ? 8 : 0 }} />
      </div>
      <span className="text-xs font-bold w-8" style={{ color }}>{value}</span>
    </div>
  );
});

const MetricRow = memo(function MetricRow({ label, value, color, hint }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-lg font-bold" style={{ color, fontFamily: "'Space Grotesk', sans-serif" }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{hint}</p>
    </div>
  );
});

const LS_TABLE_KEY = "job-tracker-table-v1";

/** Data + actions column metadata — order / visibility / widths are user-controlled (localStorage). */
const TABLE_COLUMNS = [
  { id: "company", label: "Company", hideable: true, minW: 96, defaultW: 168 },
  { id: "title", label: "Title", hideable: true, minW: 120, defaultW: 200 },
  {
    id: "job_id",
    label: "Post ID",
    headerTitle:
      "Job ID, Requisition ID, or posting # (as shown on Greenhouse, Workday, LinkedIn, etc.) — max 8 characters",
    hideable: true,
    minW: 72,
    defaultW: 104,
  },
  { id: "bucket", label: "Track", hideable: true, minW: 88, defaultW: 120 },
  { id: "status", label: "Status", hideable: true, minW: 100, defaultW: 128 },
  { id: "priority", label: "Priority", hideable: true, minW: 88, defaultW: 100 },
  { id: "date_applied", label: "Date", hideable: true, minW: 108, defaultW: 120 },
  { id: "salary", label: "Salary", hideable: true, minW: 72, defaultW: 100 },
  { id: "location", label: "Location", hideable: true, minW: 88, defaultW: 140 },
  { id: "work_type", label: "Type", hideable: true, minW: 64, defaultW: 80 },
  { id: "source", label: "Source", hideable: true, minW: 72, defaultW: 96 },
  { id: "link", label: "Link", hideable: true, minW: 56, defaultW: 72 },
  { id: "notes", label: "Notes", hideable: true, minW: 100, defaultW: 200 },
  { id: "actions", label: "", hideable: false, minW: 88, defaultW: 100 },
];

const DEFAULT_COLUMN_ORDER = TABLE_COLUMNS.map((c) => c.id);
const DEFAULT_COLUMN_VISIBLE = Object.fromEntries(
  TABLE_COLUMNS.filter((c) => c.hideable).map((c) => [c.id, true])
);
const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  TABLE_COLUMNS.map((c) => [c.id, c.defaultW])
);

function mergeColumnOrder(saved) {
  const base = DEFAULT_COLUMN_ORDER;
  if (!Array.isArray(saved)) return [...base];
  const seen = new Set();
  const out = [];
  for (const id of saved) {
    if (base.includes(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of base) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export default function JobTrackerApp({
  lockedBucket = null,
  pageTitle = "Job Tracker",
  pageSub = "Paste a link • Auto-extract • Track everything",
}) {
  const isLocked = Boolean(lockedBucket);
  const resetBucket = lockedBucket || "General";

  const [jobs, setJobs] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [filter, setFilter] = useState("All");
  const [bucketTab, setBucketTab] = useState("All");
  const [defaultBucket, setDefaultBucket] = useState("General");
  const [pendingForceSave, setPendingForceSave] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [columnOrder, setColumnOrder] = useState(() => [...DEFAULT_COLUMN_ORDER]);
  const [columnVisible, setColumnVisible] = useState(() => ({ ...DEFAULT_COLUMN_VISIBLE }));
  const [columnWidths, setColumnWidths] = useState(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const columnPanelRef = useRef(null);
  const [tablePrefsReady, setTablePrefsReady] = useState(false);
  const [manualForm, setManualForm] = useState({
    company: "", title: "", job_id: "", link: "", salary: "", location: "",
    work_type: "", source: "", contact: "", contact_email: "", notes: "",
    date_applied: new Date().toISOString().split("T")[0],
    bucket: "General",
  });
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    const ms = type === "error" ? 4500 : 3000;
    setTimeout(() => setToast(null), ms);
  };

  const postJob = async (body, force = false) => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, force }),
    });
    const data = await res.json();
    return { res, data };
  };

  useEffect(() => { fetchJobs(); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TABLE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.order)) setColumnOrder(mergeColumnOrder(p.order));
        if (p.visible && typeof p.visible === "object") {
          setColumnVisible((prev) => ({ ...prev, ...p.visible }));
        }
        if (p.widths && typeof p.widths === "object") {
          setColumnWidths((prev) => ({ ...prev, ...p.widths }));
        }
      }
    } catch {
      /* ignore */
    }
    setTablePrefsReady(true);
  }, []);

  useEffect(() => {
    if (!tablePrefsReady) return;
    try {
      localStorage.setItem(
        LS_TABLE_KEY,
        JSON.stringify({
          order: columnOrder,
          visible: columnVisible,
          widths: columnWidths,
        })
      );
    } catch {
      /* ignore */
    }
  }, [tablePrefsReady, columnOrder, columnVisible, columnWidths]);

  useEffect(() => {
    if (!showColumnPanel) return;
    const fn = (e) => {
      if (columnPanelRef.current && !columnPanelRef.current.contains(e.target)) {
        setShowColumnPanel(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [showColumnPanel]);

  const activeColumnIds = useMemo(() => {
    return columnOrder.filter((id) => {
      const meta = TABLE_COLUMNS.find((c) => c.id === id);
      if (!meta) return false;
      if (!meta.hideable) return true;
      return columnVisible[id] !== false;
    });
  }, [columnOrder, columnVisible]);

  const startColumnResize = useCallback((colId, e) => {
    e.preventDefault();
    e.stopPropagation();
    const meta = TABLE_COLUMNS.find((c) => c.id === colId);
    const minW = meta?.minW ?? 48;
    const startX = e.clientX;
    const startW = columnWidths[colId] ?? meta?.defaultW ?? 120;
    const onMove = (ev) => {
      const w = Math.max(minW, startW + ev.clientX - startX);
      setColumnWidths((prev) => ({ ...prev, [colId]: w }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [columnWidths]);

  const moveColumnOrder = useCallback((fromId, toId) => {
    if (fromId === toId || fromId === "actions" || toId === "actions") return;
    setColumnOrder((prev) => {
      const rest = prev.filter((id) => id !== "actions");
      const from = rest.indexOf(fromId);
      const to = rest.indexOf(toId);
      if (from < 0 || to < 0) return prev;
      const next = [...rest];
      next.splice(from, 1);
      next.splice(to, 0, fromId);
      return [...next, "actions"];
    });
  }, []);

  const resetTableLayout = useCallback(() => {
    setColumnOrder([...DEFAULT_COLUMN_ORDER]);
    setColumnVisible({ ...DEFAULT_COLUMN_VISIBLE });
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    showToast("Table layout reset");
  }, []);

  useEffect(() => {
    if (!lockedBucket) return;
    setDefaultBucket(lockedBucket);
    setBucketTab(lockedBucket);
    setManualForm((p) => ({ ...p, bucket: lockedBucket }));
  }, [lockedBucket]);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/jobs");
      let data;
      try {
        data = await res.json();
      } catch {
        showToast("Could not read server response", "error");
        return;
      }
      if (!res.ok) {
        showToast(
          data?.error || (res.status === 401 ? "Unauthorized — check site login or SITE_ACCESS_TOKEN." : "Could not load jobs"),
          "error"
        );
        return;
      }
      if (Array.isArray(data)) setJobs(data);
      else if (data?.error) showToast(data.error, "error");
    } catch (err) {
      const msg = err?.message || String(err);
      showToast(
        /fetch failed/i.test(msg)
          ? "Network error loading jobs. Check Vercel env (Supabase URL/key) and redeploy."
          : msg,
        "error"
      );
      console.error("Failed to load jobs:", err);
    } finally {
      setInitialLoad(false);
    }
  };

  const extractFromLink = useCallback(async () => {
    if (!linkInput.trim()) return;
    setLoading(true);
    const msgs = ["Fetching job page...", "Reading details...", "Extracting info...", "Almost there..."];
    let msgIdx = 0;
    setLoadingMsg(msgs[0]);
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1);
      setLoadingMsg(msgs[msgIdx]);
    }, 2000);

    try {
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkInput.trim() }),
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        showToast(
          extractData.message || extractData.error || "Extract request failed",
          "error"
        );
        return;
      }
      const info = extractData.data || {};
      const extractHint = extractData.meta?.hint;
      const geminiErr = extractData.meta?.geminiError;
      const geminiMsg = extractData.meta?.geminiMessage;
      const aiFallback = extractData.meta?.aiFallback;

      if (!info.company?.trim() && !info.title?.trim()) {
        showToast(
          aiFallback === "quota"
            ? "Could not read company or title from this page (AI limit hit and page data was too thin). Try a Greenhouse/Workday link or add manually."
            : geminiMsg
              ? `Could not extract job details: ${geminiMsg}`
              : geminiErr
                ? `AI step failed (${geminiErr}). Check GEMINI_API_KEY / GEMINI_MODEL in .env.`
                : "Could not extract company or title from this page. Try a direct ATS link or add manually.",
          "error"
        );
        return;
      }

      const jobBody = {
        company: info.company || "",
        title: info.title || "",
        job_id: info.job_id || "",
        status: "Bookmarked",
        link: linkInput.trim(),
        priority: "Medium",
        date_applied: new Date().toISOString().split("T")[0],
        salary: info.salary || "",
        location: info.location || "",
        work_type: info.work_type || "",
        source: info.source || "",
        notes: info.notes || "",
        bucket: defaultBucket || "General",
      };
      const { res: saveRes, data: savedJob } = await postJob(jobBody, false);
      if (saveRes.status === 409 && savedJob.duplicate) {
        setPendingForceSave({ kind: "extract", body: jobBody, label: savedJob.label });
        showToast(`Duplicate — ${savedJob.label}`, "error");
        return;
      }
      if (!saveRes.ok) {
        showToast(savedJob.error || "Could not save job", "error");
        return;
      }
      if (savedJob.id) {
        setPendingForceSave(null);
        setJobs((prev) => [savedJob, ...prev]);
        showToast(
          extractHint
            ? `Saved. ${extractHint}`
            : aiFallback === "quota"
              ? "Saved using page & ATS data (AI rate limit reached — basic extraction only)."
            : aiFallback === "other"
              ? "Saved using page & ATS data (AI could not finish — basic extraction only)."
              : "Job extracted & saved!"
        );
        setLinkInput("");
      } else {
        showToast(savedJob.error || "Could not save job", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to extract — try adding manually", "error");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, [linkInput, defaultBucket]);

  const updateField = async (id, field, value) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, [field]: value } : j)));
    try {
      await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const startEdit = (job) => {
    setEditingId(job.id);
    setEditData({ ...job, job_id: sanitizeJobId(job.job_id) });
  };

  const saveEdit = async () => {
    try {
      const res = await fetch("/api/jobs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      const updated = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setEditingId(null);
      showToast("Updated!");
    } catch (err) {
      console.error(err);
    }
  };

  const deleteJob = async (id) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    try {
      await fetch(`/api/jobs?id=${id}`, { method: "DELETE" });
      showToast("Deleted");
    } catch (err) {
      console.error(err);
    }
  };

  const addManual = async () => {
    try {
      const body = {
        ...manualForm,
        status: "Bookmarked",
        priority: "Medium",
        date_applied: manualForm.date_applied || new Date().toISOString().split("T")[0],
        bucket: manualForm.bucket || "General",
      };
      const { res, data: saved } = await postJob(body, false);
      if (res.status === 409 && saved.duplicate) {
        setPendingForceSave({ kind: "manual", body, label: saved.label });
        showToast(`Duplicate — ${saved.label}`, "error");
        return;
      }
      if (!res.ok) {
        showToast(saved.error || "Could not add job", "error");
        return;
      }
      if (saved.id) {
        setPendingForceSave(null);
        setJobs((prev) => [saved, ...prev]);
        setManualForm({
          company: "", title: "", job_id: "", link: "", salary: "", location: "",
          work_type: "", source: "", contact: "", contact_email: "", notes: "",
          date_applied: new Date().toISOString().split("T")[0],
          bucket: resetBucket,
        });
        setShowManual(false);
        showToast("Added!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const confirmForceSave = async () => {
    if (!pendingForceSave?.body) return;
    const kind = pendingForceSave.kind;
    const body = pendingForceSave.body;
    try {
      const { res, data } = await postJob(body, true);
      if (!res.ok || !data?.id) return;
      setJobs((prev) => [data, ...prev]);
      setPendingForceSave(null);
      showToast("Saved (duplicate allowed)");
      if (kind === "extract") setLinkInput("");
      if (kind === "manual") {
        setManualForm({
          company: "", title: "", job_id: "", link: "", salary: "", location: "",
          work_type: "", source: "", contact: "", contact_email: "", notes: "",
          date_applied: new Date().toISOString().split("T")[0],
          bucket: resetBucket,
        });
        setShowManual(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const exportCSV = () => {
    const rowsSource = isLocked
      ? jobs.filter((j) => (j.bucket || "General") === lockedBucket)
      : jobs;
    const headers = ["Company","Title","Job ID","Bucket","Status","Link","Priority","Date Applied","Salary","Location","Work Type","Source","Contact","Email","Interview Stage","Interviewer","Next Step","Follow Up","Notes"];
    const rows = rowsSource.map((j) =>
      [j.company, j.title, j.job_id || "", j.bucket || "General", j.status, j.link, j.priority, j.date_applied, j.salary, j.location, j.work_type, j.source, j.contact, j.contact_email, j.interview_stage, j.interviewer, j.next_step, j.follow_up, j.notes]
        .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job_tracker_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const jobsForStats = isLocked
    ? jobs.filter((j) => (j.bucket || "General") === lockedBucket)
    : jobs;

  // ── Compute Stats ──
  const total = jobsForStats.length;
  const counts = {};
  jobsForStats.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });

  const applied = counts["Applied"] || 0;
  const rejected = counts["Rejected"] || 0;
  const ghosted = counts["Ghosted"] || 0;
  const dropped = counts["Dropped"] || 0;
  const withdrawn = counts["Withdrawn"] || 0;
  const noResponse = counts["No Response"] || 0;
  const bookmarked = counts["Bookmarked"] || 0;
  const interviews = (counts["Interview"] || 0) + (counts["1st Round"] || 0) + (counts["2nd Round"] || 0) + (counts["Final Round"] || 0) + (counts["Phone Screen"] || 0) + (counts["Recruiter Screen"] || 0);
  const assessments = counts["Online Assessment"] || 0;
  const offers = (counts["Offer"] || 0) + (counts["Offer Accepted"] || 0);
  const active = total - rejected - ghosted - dropped - withdrawn;

  const responseRate = total > 0 ? ((total - applied - bookmarked - noResponse) / total * 100) : 0;
  const interviewRate = total > 0 ? (interviews / total * 100) : 0;
  const offerRate = total > 0 ? (offers / total * 100) : 0;
  const rejectionRate = total > 0 ? ((rejected + ghosted) / total * 100) : 0;

  const sourceCounts = {};
  jobsForStats.forEach((j) => { if (j.source) sourceCounts[j.source] = (sourceCounts[j.source] || 0) + 1; });
  const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);

  const now = new Date();
  const weeklyData = [0, 0, 0, 0];
  jobsForStats.forEach((j) => {
    if (!j.date_applied) return;
    const d = new Date(j.date_applied);
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    const weekIdx = Math.floor(diffDays / 7);
    if (weekIdx >= 0 && weekIdx < 4) weeklyData[weekIdx]++;
  });
  const maxWeekly = Math.max(...weeklyData, 1);

  const bucketCounts = {};
  if (!isLocked) {
    jobs.forEach((j) => {
      const b = j.bucket || "General";
      bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    });
  }

  const filtered = jobs.filter((j) => {
    if (isLocked) {
      if ((j.bucket || "General") !== lockedBucket) return false;
    } else if (bucketTab !== "All" && (j.bucket || "General") !== bucketTab) return false;
    if (filter !== "All" && j.status !== filter) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return [j.company, j.title, j.job_id, j.location, j.notes].some((f) =>
        (f || "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  const thStyle = (colId) => {
    const meta = TABLE_COLUMNS.find((c) => c.id === colId);
    const w = columnWidths[colId] ?? meta?.defaultW ?? 100;
    return {
      width: w,
      minWidth: meta?.minW ?? 48,
    };
  };

  const renderTableCell = (colId, job) => {
    const meta = TABLE_COLUMNS.find((c) => c.id === colId);
    const w = columnWidths[colId] ?? meta?.defaultW ?? 100;
    const baseStyle = { width: w, minWidth: meta?.minW ?? 48 };

    switch (colId) {
      case "company":
        return (
          <td key={colId} className="px-3.5 py-3 font-semibold text-navy" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput value={editData.company} onChange={(v) => setEditData((p) => ({ ...p, company: v }))} placeholder="Company" />
            ) : (
              <span className="cursor-pointer" onClick={() => startEdit(job)}>{job.company || "—"}</span>
            )}
          </td>
        );
      case "title":
        return (
          <td key={colId} className="px-3.5 py-3 text-gray-600" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput value={editData.title} onChange={(v) => setEditData((p) => ({ ...p, title: v }))} placeholder="Job Title" />
            ) : (
              <span className="cursor-pointer" onClick={() => startEdit(job)}>{job.title || "—"}</span>
            )}
          </td>
        );
      case "job_id":
        return (
          <td key={colId} className="px-2 py-3 text-xs text-gray-600 font-mono" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput
                value={editData.job_id ?? ""}
                onChange={(v) => setEditData((p) => ({ ...p, job_id: v }))}
                placeholder="e.g. req #"
                maxLength={8}
              />
            ) : (
              <span
                className="cursor-pointer truncate block"
                onClick={() => startEdit(job)}
                title={sanitizeJobId(job.job_id) || ""}
              >
                {sanitizeJobId(job.job_id) || "—"}
              </span>
            )}
          </td>
        );
      case "bucket":
        return (
          <td key={colId} className="px-2 py-3" style={baseStyle}>
            <select
              value={editingId === job.id ? (editData.bucket || "General") : (job.bucket || "General")}
              onChange={(e) => {
                const v = e.target.value;
                if (editingId === job.id) setEditData((p) => ({ ...p, bucket: v }));
                else updateField(job.id, "bucket", v);
              }}
              className="w-full max-w-[9rem] text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-navy outline-none focus:border-blue-400 cursor-pointer"
            >
              {JOB_BUCKETS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </td>
        );
      case "status":
        return (
          <td key={colId} className="px-2.5 py-3" style={baseStyle}>
            <StatusBadge status={job.status} onChange={(v) => updateField(job.id, "status", v)} />
          </td>
        );
      case "priority":
        return (
          <td key={colId} className="px-2.5 py-3" style={baseStyle}>
            <PriorityBadge priority={job.priority} onChange={(v) => updateField(job.id, "priority", v)} />
          </td>
        );
      case "date_applied":
        return (
          <td key={colId} className="px-3.5 py-3 text-gray-600 whitespace-nowrap text-xs" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput
                type="date"
                value={toDateInputValue(editData.date_applied)}
                onChange={(v) => setEditData((p) => ({ ...p, date_applied: v }))}
                className="w-full min-w-[10rem] border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-navy bg-white [color-scheme:light]"
              />
            ) : (
              <span className="cursor-pointer text-gray-500" onClick={() => startEdit(job)}>
                {toDateInputValue(job.date_applied) || "—"}
              </span>
            )}
          </td>
        );
      case "salary":
        return (
          <td key={colId} className="px-3.5 py-3 text-gray-600 text-xs whitespace-nowrap" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput value={editData.salary} onChange={(v) => setEditData((p) => ({ ...p, salary: v }))} placeholder="Salary" />
            ) : (
              <span className="cursor-pointer" onClick={() => startEdit(job)}>{job.salary || "—"}</span>
            )}
          </td>
        );
      case "location":
        return (
          <td key={colId} className="px-3.5 py-3 text-gray-500 text-xs" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput value={editData.location} onChange={(v) => setEditData((p) => ({ ...p, location: v }))} placeholder="Location" />
            ) : (
              <span className="cursor-pointer" onClick={() => startEdit(job)}>{job.location || "—"}</span>
            )}
          </td>
        );
      case "work_type":
        return (
          <td key={colId} className="px-2.5 py-3 text-xs text-gray-500" style={baseStyle}>
            {job.work_type || "—"}
          </td>
        );
      case "source":
        return (
          <td key={colId} className="px-2.5 py-3 text-xs text-gray-400" style={baseStyle}>
            {job.source || "—"}
          </td>
        );
      case "link":
        return (
          <td key={colId} className="px-2.5 py-3" style={baseStyle}>
            {job.link ? (
              <a
                href={job.link.startsWith("http") ? job.link : `https://${job.link}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 text-xs font-medium no-underline hover:underline"
              >
                Open ↗
              </a>
            ) : (
              "—"
            )}
          </td>
        );
      case "notes":
        return (
          <td key={colId} className="px-3.5 py-3 text-gray-400 text-xs" style={baseStyle}>
            {editingId === job.id ? (
              <EditRowInput value={editData.notes} onChange={(v) => setEditData((p) => ({ ...p, notes: v }))} placeholder="Notes" />
            ) : (
              <span
                className="cursor-pointer"
                onClick={() => startEdit(job)}
                style={{ fontStyle: job.notes ? "normal" : "italic", opacity: job.notes ? 1 : 0.5 }}
              >
                {job.notes || "click to add"}
              </span>
            )}
          </td>
        );
      case "actions":
        return (
          <td key={colId} className="px-2 py-3" style={baseStyle}>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {editingId === job.id && (
                <button type="button" onClick={saveEdit} className="text-green-600 bg-green-50 border-none rounded-md px-2 py-1 text-[10px] font-bold cursor-pointer">
                  ✓ Save
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteJob(job.id)}
                className="text-gray-300 hover:text-red-500 bg-transparent border-none text-lg cursor-pointer transition-colors px-1"
              >
                ×
              </button>
            </div>
          </td>
        );
      default:
        return <td key={colId} style={baseStyle} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl text-sm font-semibold shadow-lg animate-fade-in max-w-md"
          style={{
            background: toast.type === "error" ? "#FFEBEE" : "#E8F5E9",
            color: toast.type === "error" ? "#C62828" : "#1B5E20",
          }}>
          {toast.type === "error" ? "✕" : "✓"} {toast.msg}
        </div>
      )}

      {pendingForceSave && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-wrap items-center justify-center gap-3 px-4 py-3 rounded-xl bg-[#1a1a2e] text-white text-sm shadow-lg max-w-[95vw]">
          <span>Duplicate blocked — still add a second entry?</span>
          <button type="button" onClick={confirmForceSave} className="bg-accent text-white border-none rounded-lg px-4 py-2 text-xs font-bold cursor-pointer">
            Add anyway
          </button>
          <button type="button" onClick={() => setPendingForceSave(null)} className="bg-white/10 text-white border border-white/20 rounded-lg px-4 py-2 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-gradient-to-br from-navy via-deep to-[#0f3460] px-6 md:px-10 pt-7 pb-6">
        <div className="flex items-center gap-3.5 mb-1">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-accent to-[#ff6b6b] text-xl shadow-lg">🎯</div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight m-0">{pageTitle}</h1>
            <p className="text-[11px] text-white/50 tracking-wide m-0">{pageSub}</p>
          </div>
          <div className="ml-auto flex gap-2">
            {(isLocked ? jobsForStats.length > 0 : jobs.length > 0) && (
              <>
                <button onClick={() => setShowStats(!showStats)}
                  className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-3 py-2 bg-white/5 cursor-pointer transition-colors">
                  {showStats ? "📊 Hide Stats" : "📊 Show Stats"}
                </button>
                <button onClick={exportCSV}
                  className="text-white/60 hover:text-white text-xs border border-white/20 rounded-lg px-3 py-2 bg-white/5 cursor-pointer transition-colors">
                  📥 Export CSV
                </button>
              </>
            )}
          </div>
        </div>

        <TrackNav />

        <div className="flex flex-col gap-2.5 mt-5">
          <div className="flex gap-2.5 flex-wrap items-stretch sm:items-center">
            <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && extractFromLink()}
              placeholder="Paste job posting URL here..." disabled={loading}
              className="flex-1 min-w-[12rem] px-4 py-3 rounded-xl border-2 border-white/15 bg-white/[0.08] text-white text-sm outline-none placeholder:text-white/30 focus:border-white/30 transition-colors disabled:opacity-50" />
            {isLocked ? (
              <span className="text-[11px] text-white/85 font-semibold px-2 py-2 rounded-lg bg-white/10 border border-white/15">
                Saving to: {lockedBucket}
              </span>
            ) : (
            <label className="flex items-center gap-2 text-[11px] text-white/70 whitespace-nowrap">
              <span className="hidden sm:inline">List</span>
              <select
                value={defaultBucket}
                onChange={(e) => setDefaultBucket(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-white text-xs outline-none cursor-pointer max-w-[9rem]"
              >
                {JOB_BUCKETS.map((b) => (
                  <option key={b} value={b} className="text-navy">{b}</option>
                ))}
              </select>
            </label>
            )}
            <button onClick={extractFromLink} disabled={loading || !linkInput.trim()}
              className="bg-gradient-to-r from-accent to-[#ff6b6b] text-white border-none rounded-xl px-6 text-sm font-bold cursor-pointer flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg transition-all">
              {loading ? (<><span className="inline-block" style={{ animation: "spin 1s linear infinite" }}>⟳</span> {loadingMsg}</>) : <>⚡ Extract</>}
            </button>
            <button onClick={() => setShowManual(!showManual)}
              className="text-white border border-white/20 rounded-xl px-4 text-sm font-semibold cursor-pointer bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap">
              + Manual
            </button>
          </div>
          <p className="text-[10px] text-white/40 m-0">
            {isLocked
              ? "Links you paste on this page are saved to this list. The same job URL twice is blocked unless you confirm."
              : "Pick a page above (or use the List menu) so new saves go to the right bucket. Same job link twice is blocked unless you confirm."}
          </p>
        </div>

        {loading && (
          <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent to-[#ff6b6b] rounded-full" style={{ animation: "shimmer 1.5s ease-in-out infinite", width: "60%" }} />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* STATS DASHBOARD                         */}
      {/* ════════════════════════════════════════ */}
      {showStats && jobsForStats.length > 0 && (
        <div className="px-4 md:px-8 pt-5 animate-fade-in">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <KpiCard label="Total Applications" value={total} icon="📋" color="#3F51B5" />
            <KpiCard label="Active Pipeline" value={active} icon="🔥" color="#EF6C00" sub={total > 0 ? `${Math.round(active/total*100)}%` : "0%"} />
            <KpiCard label="Applied" value={applied} icon="📨" color="#F9A825" />
            <KpiCard label="Interviews" value={interviews} icon="🎤" color="#2E7D32" sub={total > 0 ? `${Math.round(interviewRate)}%` : "0%"} />
            <KpiCard label="Offers" value={offers} icon="🎉" color="#1B5E20" sub={total > 0 ? `${Math.round(offerRate)}%` : "0%"} />
            <KpiCard label="Rejected / Ghosted" value={rejected + ghosted} icon="❌" color="#C62828" sub={total > 0 ? `${Math.round(rejectionRate)}%` : "0%"} />
          </div>

          {/* Detailed Panels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Pipeline Breakdown */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Application Pipeline
              </h3>
              <div className="space-y-2.5">
                <ProgressBar label="Bookmarked" value={bookmarked} max={total} color="#3F51B5" />
                <ProgressBar label="Applied" value={applied} max={total} color="#F9A825" />
                <ProgressBar label="Recruiter Screen" value={counts["Recruiter Screen"] || 0} max={total} color="#EF6C00" />
                <ProgressBar label="Phone Screen" value={counts["Phone Screen"] || 0} max={total} color="#EF6C00" />
                <ProgressBar label="Assessment" value={assessments} max={total} color="#E65100" />
                <ProgressBar label="Interview" value={(counts["Interview"] || 0) + (counts["1st Round"] || 0)} max={total} color="#388E3C" />
                <ProgressBar label="2nd Round" value={counts["2nd Round"] || 0} max={total} color="#00796B" />
                <ProgressBar label="Final Round" value={counts["Final Round"] || 0} max={total} color="#004D40" />
                <ProgressBar label="Offer" value={offers} max={total} color="#1B5E20" />
                <ProgressBar label="Rejected" value={rejected} max={total} color="#C62828" />
                <ProgressBar label="Ghosted" value={ghosted} max={total} color="#E53935" />
                <ProgressBar label="No Response" value={noResponse} max={total} color="#9E9E9E" />
              </div>
            </div>

            {/* Key Metrics */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Key Metrics
              </h3>
              <div className="space-y-4">
                <MetricRow label="Response Rate" value={responseRate}
                  color={responseRate > 30 ? "#4CAF50" : responseRate > 15 ? "#FF9800" : "#f44336"}
                  hint="Companies that responded vs total" />
                <MetricRow label="Interview Rate" value={interviewRate}
                  color={interviewRate > 20 ? "#4CAF50" : interviewRate > 10 ? "#FF9800" : "#f44336"}
                  hint="Applications → Interviews" />
                <MetricRow label="Offer Rate" value={offerRate}
                  color={offerRate > 5 ? "#4CAF50" : offerRate > 0 ? "#FF9800" : "#e0e0e0"}
                  hint="Applications → Offers" />
                <MetricRow label="Rejection Rate" value={rejectionRate}
                  color="#f44336" hint="Rejected + Ghosted" />
              </div>
            </div>

            {/* Sources + Weekly */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col gap-5">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Top Sources
                </h3>
                {topSources.length > 0 ? (
                  <div className="space-y-2">
                    {topSources.slice(0, 6).map(([source, count]) => (
                      <div key={source} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 flex-1 truncate">{source}</span>
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-purple-400 transition-all duration-700" style={{ width: `${(count / total) * 100}%`, minWidth: 6 }} />
                        </div>
                        <span className="text-xs font-bold text-purple-600 w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-300 italic">No source data yet</p>}
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Weekly Activity
                </h3>
                <div className="flex items-end gap-2 h-20">
                  {["This Wk", "Last Wk", "2 Wks", "3 Wks"].map((label, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-gray-600">{weeklyData[i]}</span>
                      <div className="w-full rounded-t-lg transition-all duration-700"
                        style={{ height: `${Math.max((weeklyData[i] / maxWeekly) * 56, 4)}px`,
                          background: i === 0 ? "linear-gradient(to top, #e94560, #ff6b6b)" : `rgba(233, 69, 96, ${0.6 - i * 0.15})` }} />
                      <span className="text-[8px] text-gray-400 text-center leading-tight">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mt-auto">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-navy" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{dropped + withdrawn}</div>
                    <div className="text-[9px] text-gray-400 uppercase font-semibold">Dropped</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-navy" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{noResponse}</div>
                    <div className="text-[9px] text-gray-400 uppercase font-semibold">No Response</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Form */}
      {showManual && (
        <div className="mx-4 md:mx-8 mt-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 animate-fade-in">
          <h3 className="text-sm font-bold text-navy m-0 mb-4">Add Job Manually</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[["company", "Company *"], ["title", "Job Title *"], ["job_id", "Post ID (max 8)"], ["link", "Application Link"],
              ["date_applied", "Date applied"], ["salary", "Salary Range"], ["location", "Location"], ["work_type", "Work Type"],
              ["source", "Source"], ["contact", "Contact Person"], ["contact_email", "Contact Email"],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                {key === "date_applied" ? (
                  <input
                    type="date"
                    value={toDateInputValue(manualForm.date_applied)}
                    onChange={(e) => setManualForm((p) => ({ ...p, date_applied: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-1 outline-none focus:border-blue-400 bg-white"
                  />
                ) : (
                  <input
                    value={manualForm[key]}
                    onChange={(e) => setManualForm((p) => ({ ...p, [key]: e.target.value }))}
                    maxLength={key === "job_id" ? 8 : undefined}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-1 outline-none focus:border-blue-400"
                  />
                )}
              </div>
            ))}
            <div>
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">List / track</label>
              <select
                value={manualForm.bucket || "General"}
                onChange={(e) => setManualForm((p) => ({ ...p, bucket: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-1 outline-none focus:border-blue-400 bg-white cursor-pointer"
              >
                {JOB_BUCKETS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</label>
            <input value={manualForm.notes} onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mt-1 outline-none focus:border-blue-400" />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={addManual} className="bg-navy text-white border-none rounded-lg px-5 py-2.5 text-sm font-bold cursor-pointer hover:opacity-90">Add Entry</button>
            <button onClick={() => setShowManual(false)} className="bg-gray-100 text-gray-500 border-none rounded-lg px-4 py-2.5 text-sm cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Bucket tabs (season / level) — hidden on dedicated track pages */}
      {jobs.length > 0 && !isLocked && (
        <div className="flex gap-2 px-4 md:px-8 pt-4 pb-1 overflow-x-auto flex-wrap items-center border-b border-gray-100/80">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1 w-full sm:w-auto">Track</span>
          <button
            type="button"
            onClick={() => setBucketTab("All")}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer border transition-colors"
            style={{
              background: bucketTab === "All" ? "#0f3460" : "#fff",
              color: bucketTab === "All" ? "#fff" : "#666",
              borderColor: bucketTab === "All" ? "#0f3460" : "#e0e0e0",
            }}
          >
            All ({jobs.length})
          </button>
          {JOB_BUCKETS.map((b) => {
            const c = bucketCounts[b] || 0;
            const isActive = bucketTab === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBucketTab(isActive ? "All" : b)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer border whitespace-nowrap transition-colors"
                style={{
                  background: isActive ? "#e94560" : "#fff",
                  color: isActive ? "#fff" : "#555",
                  borderColor: isActive ? "#e94560" : "#e0e0e0",
                }}
              >
                {b} ({c})
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Pills */}
      {(jobs.length > 0 || isLocked) && (
        <div className="flex gap-2 px-4 md:px-8 pt-3 pb-2 overflow-x-auto flex-wrap">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1 w-full sm:w-auto">Status</span>
          <button onClick={() => setFilter("All")}
            className="rounded-full px-4 py-1.5 text-xs font-semibold cursor-pointer border transition-colors"
            style={{ background: filter === "All" ? "#1a1a2e" : "#fff", color: filter === "All" ? "#fff" : "#666", borderColor: filter === "All" ? "#1a1a2e" : "#e0e0e0" }}>
            All ({isLocked ? jobsForStats.length : jobs.length})
          </button>
          {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, c]) => {
            const col = STATUS_COLORS[s] || STATUS_COLORS["Applied"];
            const isActive = filter === s;
            return (
              <button key={s} onClick={() => setFilter(isActive ? "All" : s)}
                className="rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer border flex items-center gap-1.5 whitespace-nowrap transition-colors"
                style={{ background: isActive ? col.text : col.bg, color: isActive ? "#fff" : col.text, borderColor: isActive ? col.text : "#e0e0e0" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? "#fff" : col.dot }} />
                {s} ({c})
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      {(jobs.length > 0 || isLocked) && (
        <div className="px-4 md:px-8 pb-3">
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="🔍  Search company, title, job id, location..."
            className="w-full max-w-md px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-blue-400" />
        </div>
      )}

      {/* TABLE */}
      <div className="px-4 md:px-8 pb-10">
        {initialLoad ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="shimmer h-6 w-48 rounded-lg mx-auto mb-3" />
            <div className="shimmer h-4 w-72 rounded-lg mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">🔗</div>
            <h3 className="text-lg font-bold text-navy m-0 mb-2">
              {jobs.length === 0
                ? "Paste a job link above to get started"
                : isLocked && filtered.length === 0
                  ? "No jobs in this list yet"
                  : "No matches found"}
            </h3>
            <p className="text-gray-400 text-sm m-0">
              {jobs.length === 0
                ? "AI will auto-extract company, title, salary, location & more"
                : isLocked && filtered.length === 0
                  ? "Paste a link above — it will be saved to this page."
                  : "Try adjusting your search or filter"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            <div
              className="relative border-b border-gray-100 bg-[#FAFBFC] px-3 py-3 sm:px-4"
              ref={columnPanelRef}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-xs text-gray-600 m-0 leading-snug order-2 sm:order-1">
                  <strong className="text-navy">Customize this table</strong>
                  <span className="text-gray-500"> — use the button to show or hide columns (pink = visible). Drag ⋮⋮ to reorder.</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowColumnPanel((v) => !v)}
                  className="order-1 sm:order-2 inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-accent bg-white px-4 py-3 text-sm font-bold text-navy shadow-md hover:bg-accent/10 sm:py-2.5"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    ⚙
                  </span>
                  {showColumnPanel ? "Close column options" : "Show / hide columns"}
                </button>
              </div>
              {showColumnPanel && (
                <div
                  className="absolute left-3 right-3 top-full z-[110] mt-2 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl sm:left-auto sm:right-4 sm:w-[min(20rem,calc(100vw-2rem))]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Show, order & resize
                  </div>
                  <p className="text-[10px] text-gray-500 m-0 mb-2 leading-snug">
                    Pink switch = column visible. Drag ⋮⋮ to reorder. Drag column edges in the header to resize. Saved in this browser.
                  </p>
                  <ul className="max-h-64 overflow-y-auto space-y-1 m-0 p-0 list-none">
                    {columnOrder
                      .filter((id) => id !== "actions")
                      .map((id) => {
                        const meta = TABLE_COLUMNS.find((c) => c.id === id);
                        if (!meta) return null;
                        return (
                          <li
                            key={id}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const from = e.dataTransfer.getData("text/plain");
                              moveColumnOrder(from, id);
                            }}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-navy bg-gray-50 hover:bg-gray-100"
                          >
                            <span
                              draggable
                              aria-hidden
                              title="Drag to reorder"
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              className="text-gray-400 select-none cursor-grab active:cursor-grabbing touch-none shrink-0 px-0.5"
                            >
                              ⋮⋮
                            </span>
                            <div className="flex flex-1 items-center gap-2 min-w-0">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={columnVisible[id] !== false}
                                title={columnVisible[id] !== false ? "Hide column" : "Show column"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setColumnVisible((prev) => {
                                    const cur = prev[id] !== false;
                                    return { ...prev, [id]: !cur };
                                  });
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`relative shrink-0 h-7 w-12 rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent ${
                                  columnVisible[id] !== false
                                    ? "border-accent bg-accent"
                                    : "border-gray-300 bg-gray-200"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                                    columnVisible[id] !== false ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                className="truncate flex-1 text-left font-medium text-navy cursor-pointer m-0 p-0 bg-transparent border-none"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setColumnVisible((prev) => {
                                    const cur = prev[id] !== false;
                                    return { ...prev, [id]: !cur };
                                  });
                                }}
                              >
                                {meta.label}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                  <p className="text-[10px] text-gray-400 mt-2 mb-0">
                    Actions column (save / delete) always stays on the right.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetTableLayout();
                      setShowColumnPanel(false);
                    }}
                    className="mt-3 w-full rounded-lg border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    Reset layout
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm table-fixed">
                <thead>
                  <tr className="bg-[#FAFBFC]">
                    {activeColumnIds.map((colId) => {
                      const meta = TABLE_COLUMNS.find((c) => c.id === colId);
                      const label = meta?.label ?? "";
                      const isActions = colId === "actions";
                      return (
                        <th
                          key={colId}
                          className="relative px-3.5 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b-2 border-gray-100 whitespace-nowrap group/th"
                          style={thStyle(colId)}
                          aria-label={isActions ? "Row actions" : label}
                          title={meta?.headerTitle}
                        >
                          {label || (isActions ? <span className="sr-only">Actions</span> : null)}
                          <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-hidden
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-[1] hover:bg-blue-400/40 group-hover/th:bg-gray-200/80"
                            onMouseDown={(e) => startColumnResize(colId, e)}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job) => (
                    <tr key={job.id} className="border-b border-gray-50 hover:bg-[#FAFBFC] transition-colors group">
                      {activeColumnIds.map((colId) => renderTableCell(colId, job))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
