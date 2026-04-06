"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Login failed");
        return;
      }
      const dest = searchParams.get("from") || "/";
      router.replace(dest);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-navy m-0 mb-1">Job Tracker</h1>
        <p className="text-sm text-gray-500 m-0 mb-6">Enter your site access token to continue.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Access token</label>
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-blue-400"
              placeholder="Paste token from Vercel env"
            />
          </div>
          {err && <p className="text-sm text-red-600 m-0">{err}</p>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full bg-navy text-white border-none rounded-xl py-3 text-sm font-bold cursor-pointer disabled:opacity-40"
          >
            {loading ? "…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F8FA]" />}>
      <LoginForm />
    </Suspense>
  );
}
