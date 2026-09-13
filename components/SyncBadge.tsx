"use client";

import { useEffect, useState } from "react";
import { getSyncStatus, onSyncStatus, type SyncStatus } from "@/lib/db";

function agoLabel(iso: string | null): string {
  if (!iso) return "";
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function SyncBadge() {
  const [status, setStatus] = useState<SyncStatus>({ pending: 0, reachable: true, lastSyncedAt: null });

  useEffect(() => {
    const read = () => setStatus(getSyncStatus());
    read();
    const stop = onSyncStatus(read);
    // Keeps the "3m ago" text honest while the queue sits idle.
    const timer = window.setInterval(read, 5000);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, []);

  const stuck = !status.reachable && status.pending > 0;
  const waiting = status.reachable && status.pending > 0;

  const tone = stuck
    ? "bg-red-50 text-red-800 ring-red-200"
    : waiting
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-zinc-100 text-neutral-500 ring-transparent";

  const label = stuck
    ? `Not saved · ${status.pending} waiting`
    : waiting
      ? `Saving ${status.pending}…`
      : status.lastSyncedAt
        ? `Saved ${agoLabel(status.lastSyncedAt)}`
        : "Saved";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tone}`}
      title={
        stuck
          ? "This device cannot reach the shared database. Your work is safe on this phone and will upload when the connection returns."
          : waiting
            ? "Uploading to the shared database."
            : "Everything on this device is in the shared database."
      }
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          stuck ? "bg-red-600" : waiting ? "bg-amber-500" : "bg-emerald-500"
        }`}
      />
      {label}
    </span>
  );
}
