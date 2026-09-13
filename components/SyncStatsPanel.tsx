"use client";

/**
 * TEMPORARY sync diagnostics. Delete this file, its two mount points
 * (components/ui.tsx and app/page.tsx), and the diagnostics block in lib/db.ts
 * when the timings stop being interesting.
 */

import { useEffect, useState } from "react";
import { getSyncStats, getSyncStatus, onSyncStatus, resetSyncStats, type SyncStats } from "@/lib/db";

const OPEN_KEY = "mccb-stats-open";

function ms(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`;
}

function ago(at: number | null): string {
  if (at == null) return "never";
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 1) return "now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

function offsetLabel(offset: number | null): string {
  if (offset == null) return "—";
  const abs = Math.abs(offset);
  const dir = offset > 0 ? "behind" : "ahead of";
  if (abs < 1000) return `${Math.round(abs)} ms`;
  return `${(abs / 1000).toFixed(1)}s ${dir} server`;
}

function Line({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "good" | "warn" | "bad";
}) {
  const valueTone =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-neutral-900";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="truncate text-[11px] text-neutral-600">{label}</p>
        {hint ? <p className="truncate text-[10px] text-neutral-400">{hint}</p> : null}
      </div>
      <p className={`shrink-0 text-[11px] font-semibold tabular-nums ${valueTone}`}>{value}</p>
    </div>
  );
}

function latencyTone(value: number | null): "normal" | "good" | "warn" | "bad" {
  if (value == null) return "normal";
  if (value < 1500) return "good";
  if (value < 5000) return "warn";
  return "bad";
}

export function SyncStatsPanel() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [pending, setPending] = useState(0);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    setOpen(localStorage.getItem(OPEN_KEY) === "1");
  }, []);

  useEffect(() => {
    const read = () => {
      setStats(getSyncStats());
      const status = getSyncStatus();
      setPending(status.pending);
      setReachable(status.reachable);
    };
    read();
    const stop = onSyncStatus(read);
    // The feed ticks every second; poll a little faster so the numbers move.
    const timer = window.setInterval(read, 500);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="fixed bottom-3 right-3 z-40 rounded-full bg-ink/90 px-3 py-2 text-[11px] font-semibold text-white"
      >
        Sync stats
      </button>
    );
  }

  const up = stats?.upstream;
  const down = stats?.downstream;

  return (
    <div className="fixed bottom-3 right-3 z-40 w-[17rem] rounded-2xl border border-rule bg-white/95 p-3 backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Sync stats</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => resetSyncStats()}
            className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-medium text-neutral-600"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-medium text-neutral-600"
          >
            Hide
          </button>
        </div>
      </div>

      <Line
        label="Shared database"
        value={stats?.hosted == null ? "…" : stats.hosted ? "Neon" : "Local SQLite"}
        hint={stats?.hosted === false ? "This device is NOT sharing data" : "Same store on every device"}
        tone={stats?.hosted === false ? "bad" : "good"}
      />
      <Line
        label="Access"
        value={stats?.gated == null ? "…" : stats.gated ? "Passcode" : "OPEN"}
        hint={stats?.gated === false ? "Anyone with the URL can edit" : undefined}
        tone={stats?.gated === false ? "bad" : "good"}
      />
      <Line
        label="Round trip to server"
        value={ms(stats?.roundTripMs)}
        tone={latencyTone(stats?.roundTripMs ?? null)}
      />
      <Line
        label="This device's clock"
        value={offsetLabel(stats?.clockOffsetMs ?? null)}
        hint="Large skew used to hide edits from the feed"
        tone={
          stats?.clockOffsetMs == null
            ? "normal"
            : Math.abs(stats.clockOffsetMs) < 2000
              ? "good"
              : "warn"
        }
      />

      <div className="my-2 border-t border-rule pt-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Upstream · this device to Neon
        </p>
      </div>
      <Line
        label="Scan to accepted by Neon"
        value={ms(up?.lastWriteLatencyMs)}
        hint="Queued locally until the server confirmed it"
        tone={latencyTone(up?.lastWriteLatencyMs ?? null)}
      />
      <Line label="Slowest so far" value={ms(up?.slowestWriteMs)} tone={latencyTone(up?.slowestWriteMs ?? null)} />
      <Line label="Last upload took" value={ms(up?.lastFlushMs)} />
      <Line
        label="Rows in last upload"
        value={`${up?.lastBatchRows ?? 0} in 1 request`}
        hint={`${up?.requests ?? 0} upload requests total`}
      />
      <Line label="Last upload" value={ago(up?.lastAt ?? null)} />
      <Line
        label="Waiting in queue"
        value={String(pending)}
        hint={reachable ? undefined : "Server unreachable"}
        tone={pending === 0 ? "good" : reachable ? "warn" : "bad"}
      />
      <Line
        label="Accepted / failed / conflicts"
        value={`${up?.accepted ?? 0} / ${up?.rejected ?? 0} / ${up?.conflicts ?? 0}`}
        tone={(up?.rejected ?? 0) > 0 ? "warn" : "normal"}
      />

      <div className="my-2 border-t border-rule pt-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
          Downstream · Neon to this device
        </p>
      </div>
      <Line
        label="Other device's edit to here"
        value={ms(down?.lastChangeLagMs)}
        hint="Server write time until applied locally"
        tone={latencyTone(down?.lastChangeLagMs ?? null)}
      />
      <Line label="Last change received" value={ago(down?.lastChangeAt ?? null)} />
      <Line label="Last poll took" value={ms(down?.lastPollMs)} tone={latencyTone(down?.lastPollMs ?? null)} />
      <Line label="Rows in last poll" value={String(down?.rowsLastPoll ?? 0)} />
      <Line
        label="Polls (empty)"
        value={`${down?.polls ?? 0} (${down?.emptyPolls ?? 0})`}
        hint="Empty polls are the idle case, not a problem"
      />
      <Line
        label="Full reconcile took"
        value={ms(down?.lastReconcileMs)}
        hint={`Every 30s · ${ago(down?.lastReconcileAt ?? null)}`}
      />
      <Line label="Feed cursor" value={down?.cursor == null ? "—" : String(down.cursor)} />
    </div>
  );
}
