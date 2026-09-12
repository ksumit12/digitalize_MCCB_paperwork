"use client";

import { useEffect, useState } from "react";
import { listFrames, listStringRuns, type StringRun } from "@/lib/db";
import { dailyProgress, inventoryByString, paceFor } from "@/lib/inventory";
import { pullAndMerge } from "@/lib/serverSync";
import type { Frame } from "@/lib/types";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProgressPage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [runs, setRuns] = useState<StringRun[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await pullAndMerge();
      const [f, r] = await Promise.all([listFrames(), listStringRuns()]);
      setFrames(f);
      setRuns(r);
      setReady(true);
    })();
  }, []);

  if (!ready) return <p className="text-sm text-neutral-500">Loading…</p>;

  const pace = paceFor(frames, runs);
  const days = dailyProgress(frames, 7);
  const maxDay = Math.max(1, ...days.map((d) => d.submitted));
  const strings = inventoryByString(frames, runs);
  const breakersTotal = days.reduce((s, d) => s + d.breakers, 0);

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    { label: "Frames submitted", value: String(pace.submittedTotal) },
    { label: "Slots remaining", value: String(pace.remainingSlots) },
    { label: "Frames / day", value: pace.avgPerDay.toFixed(1), sub: "last 7 days" },
    { label: "This week vs last", value: `${pace.last7} / ${pace.prev7}` },
    { label: "Breakers serialed (7d)", value: String(breakersTotal) },
    { label: "Days to finish at pace", value: pace.etaDays == null ? "—" : String(pace.etaDays) },
  ];

  return (
    <main>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="text-sm text-neutral-500">Daily and weekly pace across all strings.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
            {k.sub ? <p className="mt-0.5 text-xs text-neutral-500">{k.sub}</p> : null}
          </div>
        ))}
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="text-sm font-semibold">Frames submitted per day</h2>
        </div>
        <div className="px-4 py-4">
          <div className="space-y-2.5">
            {days.map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <p className="w-12 shrink-0 text-xs text-neutral-500">
                  {DAY_LABEL[new Date(`${d.date}T12:00:00`).getDay()]} {d.date.slice(8, 10)}
                </p>
                <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className="flex h-full items-center rounded bg-sky-600"
                    style={{ width: `${Math.round((d.submitted / maxDay) * 100)}%` }}
                  >
                    {d.submitted > 0 ? (
                      <span className="pl-2 text-[10px] font-semibold text-white">{d.submitted}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Breakers serialed in the last 7 days: <span className="font-semibold">{breakersTotal}</span>
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="text-sm font-semibold">Strings</h2>
        </div>
        {strings.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">No strings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2.5 font-medium">String</th>
                  <th className="px-4 py-2.5 font-medium">Trade</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Started</th>
                  <th className="px-4 py-2.5 text-right font-medium">Testing</th>
                  <th className="px-4 py-2.5 text-right font-medium">Submitted</th>
                  <th className="px-4 py-2.5 text-right font-medium">Serials</th>
                </tr>
              </thead>
              <tbody>
                {strings.map((s) => {
                  const pct = s.totalSlots ? Math.round((s.framesSubmitted / s.totalSlots) * 100) : 0;
                  return (
                    <tr key={s.key} className="border-b border-rule last:border-b-0">
                      <td className="px-4 py-3 font-medium">String {s.key}</td>
                      <td className="px-4 py-3 text-neutral-600">{s.tradeName || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full bg-sky-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-neutral-500">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.framesStarted}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.framesTesting}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.framesSubmitted}/{s.totalSlots}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.serialsDone}/{s.usedPositions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
