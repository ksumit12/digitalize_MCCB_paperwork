"use client";

import { useEffect, useState } from "react";
import { listFrames, listStringRuns, type StringRun } from "@/lib/db";
import { inventoryByString, inventoryForFrames } from "@/lib/inventory";
import { pullAndMerge } from "@/lib/serverSync";
import type { Frame } from "@/lib/types";

export default function InventoryPage() {
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

  const rows = inventoryByString(frames, runs);
  const all = inventoryForFrames(frames);
  const totalSlots = rows.reduce((s, r) => s + r.totalSlots, 0);

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    { label: "MCCBs used", value: String(all.mccbTotal), sub: `${all.mccb32}×32A · ${all.mccb63}×63A · ${all.mccb100}×100A` },
    { label: "Micrologic trip units", value: String(all.micrologics) },
    { label: "Shunt trips", value: String(all.shunts) },
    { label: "Whip positions in use", value: String(all.usedPositions), sub: `${all.serialsDone} serials complete` },
    { label: "Frames submitted", value: totalSlots ? `${all.framesSubmitted}/${totalSlots}` : "—" },
    { label: "Frames in testing", value: String(all.framesTesting) },
  ];

  return (
    <main>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="text-sm text-neutral-500">
          What has been used, counted from the work captured on each string.
        </p>
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

      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="text-sm font-semibold">Usage by string</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">No strings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2.5 font-medium">String</th>
                  <th className="px-4 py-2.5 font-medium">Trade</th>
                  <th className="px-4 py-2.5 text-right font-medium">Progress</th>
                  <th className="px-4 py-2.5 text-right font-medium">32A</th>
                  <th className="px-4 py-2.5 text-right font-medium">63A</th>
                  <th className="px-4 py-2.5 text-right font-medium">100A</th>
                  <th className="px-4 py-2.5 text-right font-medium">Micrologic</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shunts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.totalSlots ? Math.round((r.framesSubmitted / r.totalSlots) * 100) : 0;
                  return (
                    <tr key={r.key} className="border-b border-rule last:border-b-0">
                      <td className="px-4 py-3 font-medium">String {r.key}</td>
                      <td className="px-4 py-3 text-neutral-600">{r.tradeName || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full bg-sky-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-14 text-right tabular-nums text-xs text-neutral-500">
                            {r.framesSubmitted}/{r.totalSlots}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.mccb32 || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.mccb63 || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.mccb100 || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.micrologics || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.shunts || "—"}</td>
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
