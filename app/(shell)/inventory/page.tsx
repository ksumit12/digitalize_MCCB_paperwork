"use client";

import { useEffect, useState } from "react";
import {
  listFrames,
  listStockEntries,
  listStringRuns,
  newId,
  saveStockEntry,
  type StringRun,
} from "@/lib/db";
import {
  STOCK_PARTS,
  inventoryByString,
  inventoryForFrames,
  stockSummary,
} from "@/lib/inventory";
import { lastInstaller } from "@/lib/crew";
import { pullAndMerge } from "@/lib/serverSync";
import type { Frame, StockEntry, StockPart } from "@/lib/types";

export default function InventoryPage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [runs, setRuns] = useState<StringRun[]>([]);
  const [stock, setStock] = useState<StockEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);

  const [part, setPart] = useState<StockPart>("mccb63");
  const [perBox, setPerBox] = useState("20");
  const [boxes, setBoxes] = useState("1");
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await pullAndMerge();
    const [f, r, s] = await Promise.all([listFrames(), listStringRuns(), listStockEntries()]);
    setFrames(f);
    setRuns(r);
    setStock(s);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
    setReceivedBy(lastInstaller()?.initials || "");
  }, []);

  async function addStock() {
    const boxesNum = parseInt(boxes, 10);
    const perBoxNum = parseInt(perBox, 10);
    if (!boxesNum || boxesNum < 1 || !perBoxNum || perBoxNum < 1) return;
    setSaving(true);
    try {
      await saveStockEntry({
        id: newId(),
        part,
        perBox: perBoxNum,
        boxes: boxesNum,
        receivedBy: receivedBy.trim().toUpperCase() || "—",
        receivedAt: new Date().toISOString(),
        note: note.trim() || undefined,
      });
      setBoxes("1");
      setPerBox("20");
      setNote("");
      setAdding(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return <p className="text-sm text-neutral-500">Loading…</p>;

  const rows = inventoryByString(frames, runs);
  const usage = inventoryForFrames(frames);
  const lines = stockSummary(stock, usage);
  const totalSlots = rows.reduce((s, r) => s + r.totalSlots, 0);

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    { label: "MCCBs used", value: String(usage.mccbTotal), sub: `${usage.mccb32}×32A · ${usage.mccb63}×63A · ${usage.mccb100}×100A` },
    { label: "Micrologic trip units", value: String(usage.micrologics) },
    { label: "Shunt trips", value: String(usage.shunts) },
    { label: "Whip positions in use", value: String(usage.usedPositions), sub: `${usage.serialsDone} serials complete` },
    { label: "Frames submitted", value: totalSlots ? `${usage.framesSubmitted}/${totalSlots}` : "—" },
    { label: "Frames in testing", value: String(usage.framesTesting) },
  ];

  return (
    <main>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-neutral-500">
            Stock received vs what the frames have consumed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white"
        >
          {adding ? "Close" : "+ Stock in"}
        </button>
      </div>

      {adding ? (
        <div className="mb-6 rounded-xl border border-rule bg-white p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-sm">
              Part
              <select
                value={part}
                onChange={(e) => setPart(e.target.value as StockPart)}
                className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2.5"
              >
                {STOCK_PARTS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Units per box
              <input
                type="number"
                min={1}
                value={perBox}
                onChange={(e) => setPerBox(e.target.value)}
                className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5"
              />
            </label>
            <label className="text-sm">
              Boxes
              <input
                type="number"
                min={1}
                value={boxes}
                onChange={(e) => setBoxes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5"
              />
            </label>
            <label className="text-sm">
              Received by (initials)
              <input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value.toUpperCase())}
                placeholder="Initials"
                className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5 uppercase"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. delivery 12 Sep"
              className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5"
            />
          </label>
          <p className="mt-2 text-sm text-neutral-600">
            Total added: <span className="font-semibold">{(parseInt(perBox, 10) || 0) * (parseInt(boxes, 10) || 0)}</span>{" "}
            {STOCK_PARTS.find((p) => p.key === part)?.label}
          </p>
          <button
            type="button"
            disabled={saving || !parseInt(boxes, 10) || !parseInt(perBox, 10)}
            onClick={() => void addStock()}
            className="mt-3 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-30"
          >
            {saving ? "Saving…" : "Add to stock"}
          </button>
        </div>
      ) : null}

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
          <h2 className="text-sm font-semibold">Stock vs used</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2.5 font-medium">Part</th>
                <th className="px-4 py-2.5 text-right font-medium">Received</th>
                <th className="px-4 py-2.5 text-right font-medium">Used on frames</th>
                <th className="px-4 py-2.5 text-right font-medium">Remaining</th>
                <th className="px-4 py-2.5 text-right font-medium">Missing</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.part} className="border-b border-rule last:border-b-0">
                  <td className="px-4 py-3 font-medium">{l.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.received}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.used}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.remaining}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${l.missing ? "text-red-600" : "text-neutral-400"}`}>
                    {l.missing || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-rule px-4 py-2.5 text-xs text-neutral-500">
          “Missing” means more were fitted than stock received — worth a count of the shelf.
        </p>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="text-sm font-semibold">Stock received log</h2>
        </div>
        {stock.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Nothing logged yet — use “+ Stock in”.</p>
        ) : (
          <div className="divide-y divide-rule">
            {stock.slice(0, 20).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {STOCK_PARTS.find((p) => p.key === s.part)?.label ?? s.part}
                    <span className="ml-2 text-xs text-neutral-500">
                      {s.boxes} box{es(s.boxes)} × {s.perBox} = {s.boxes * s.perBox}
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(s.receivedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · by{" "}
                    {s.receivedBy}
                    {s.note ? ` · ${s.note}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
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

function es(n: number): string {
  return n === 1 ? "" : "es";
}
