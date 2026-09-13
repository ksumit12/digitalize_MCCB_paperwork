"use client";

import { useState } from "react";

export default function LoginPage() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "That passcode is not right." : "Could not check the passcode.");
        setPasscode("");
        return;
      }
      // Full load rather than a router push, so the sync loop starts fresh
      // with the cookie in place.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch {
      setError("No connection. Try again once you have signal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">MCCB Frame QA</h1>
        <p className="mt-1 text-sm text-neutral-600">Enter the crew passcode to open the job board.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoFocus
          autoComplete="current-password"
          inputMode="text"
          placeholder="Passcode"
          className="w-full rounded-2xl border border-rule px-4 py-3 text-base"
          aria-label="Crew passcode"
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !passcode.trim()}
          className="w-full rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "Open"}
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Stays signed in on this device for 90 days. Work you have already scanned is kept on the
        device and will sync once you are back in range.
      </p>
    </main>
  );
}
