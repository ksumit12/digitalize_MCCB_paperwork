"use client";

import { useEffect, useState } from "react";
import { listDefects, listFrames, newId, saveDefect } from "@/lib/db";
import { peopleForSlot } from "@/lib/inventory";
import { lastInstaller } from "@/lib/crew";
import { pullAndMerge } from "@/lib/serverSync";
import type { Defect, DefectStatus, Frame } from "@/lib/types";

const PARTS = ["MCCB", "Micrologic trip unit", "Shunt trip", "Whip lead", "Flexibar cap", "Other"];

const NEXT_STATUS: Record<DefectStatus, DefectStatus> = {
  open: "in progress",
  "in progress": "resolved",
  resolved: "open",
};

const STATUS_STYLE: Record<DefectStatus, string> = {
  open: "bg-red-600 text-white",
  "in progress": "bg-amber-500 text-white",
  resolved: "bg-emerald-600 text-white",
};

const STATUS_ACTION: Record<DefectStatus, string> = {
  open: "Start work",
  "in progress": "Mark resolved",
  resolved: "Reopen",
};

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function FaultsPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [ready, setReady] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const [stringKey, setStringKey] = useState("");
  const [frameSlot, setFrameSlot] = useState("");
  const [slot, setSlot] = useState("");
  const [part, setPart] = useState(PARTS[0]);
  const [serial, setSerial] = useState("");
  const [description, setDescription] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await pullAndMerge();
    const [d, f] = await Promise.all([listDefects(), listFrames()]);
    setDefects(d);
    setFrames(f);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
    setRaisedBy(lastInstaller()?.initials || "");
  }, []);

  async function create() {
    if (!stringKey.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const defect: Defect = {
        id: newId(),
        stringKey: stringKey.trim(),
        frameSlot: frameSlot.trim() || undefined,
        slot: slot.trim() || undefined,
        part,
        serial: serial.trim() || undefined,
        description: description.trim(),
        raisedBy: raisedBy.trim().toUpperCase() || "—",
        raisedAt: new Date().toISOString(),
        status: "open",
        updatedAt: new Date().toISOString(),
      };
      await saveDefect(defect);
      setStringKey("");
      setFrameSlot("");
      setSlot("");
      setSerial("");
      setDescription("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  const visible = defects.filter((d) => showResolved || d.status !== "resolved");
  const openCount = defects.filter((d) => d.status === "open").length;
  const inProgressCount = defects.filter((d) => d.status === "in progress").length;
  const resolvedCount = defects.filter((d) => d.status === "resolved").length;

  if (!ready) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <main>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Faults & breakages</h1>
        <p className="text-sm text-neutral-500">
          Anything broken gets logged with who touched the slot — so a fault can be traced back.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
        <Kpi label="Open" value={openCount} />
        <Kpi label="In progress" value={inProgressCount} />
        <Kpi label="Resolved" value={resolvedCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="overflow-hidden rounded-xl border border-rule bg-white">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 className="text-sm font-semibold">Logged faults</h2>
              {resolvedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowResolved((v) => !v)}
                  className="text-xs font-medium text-neutral-500 underline-offset-2 hover:underline"
                >
                  {showResolved ? "Hide" : "Show"} resolved ({resolvedCount})
                </button>
              ) : null}
            </div>
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">No faults logged.</p>
            ) : (
              <div className="divide-y divide-rule">
                {visible.map((d) => {
                  const people = peopleForSlot(frames, d.stringKey, d.slot || d.frameSlot || "");
                  return (
                    <div key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            String {d.stringKey}
                            {d.frameSlot ? ` · ${d.frameSlot}` : ""}
                            {d.slot ? ` · ${d.slot}` : ""}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[d.status]}`}
                          >
                            {d.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-neutral-700">
                          {d.part}
                          {d.serial ? <span className="text-neutral-500"> · {d.serial}</span> : null} —{" "}
                          {d.description}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Reported by {d.raisedBy} ·{" "}
                          {new Date(d.raisedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          {people.installer ? ` · Installer: ${people.installer}` : ""}
                          {people.tester ? ` · Tester: ${people.tester}` : ""}
                          {d.resolvedBy ? ` · Resolved by ${d.resolvedBy}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const next = NEXT_STATUS[d.status];
                          await saveDefect({
                            ...d,
                            status: next,
                            resolvedBy: next === "resolved" ? raisedBy || d.raisedBy : undefined,
                            resolvedAt: next === "resolved" ? new Date().toISOString() : undefined,
                          });
                          await refresh();
                        }}
                        className="shrink-0 rounded-lg border border-rule px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
                      >
                        {STATUS_ACTION[d.status]}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-rule bg-white">
            <div className="border-b border-rule px-4 py-3">
              <h2 className="text-sm font-semibold">Report a fault</h2>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  String no. *
                  <input
                    value={stringKey}
                    onChange={(e) => setStringKey(e.target.value)}
                    placeholder="e.g. 4"
                    className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5"
                  />
                </label>
                <label className="text-sm">
                  Frame slot
                  <input
                    value={frameSlot}
                    onChange={(e) => setFrameSlot(e.target.value.toUpperCase())}
                    placeholder="e.g. 3L"
                    className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5 uppercase"
                  />
                </label>
                <label className="text-sm">
                  Breaker slot
                  <input
                    value={slot}
                    onChange={(e) => setSlot(e.target.value.toUpperCase())}
                    placeholder="e.g. A3"
                    className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5 uppercase"
                  />
                </label>
                <label className="text-sm">
                  Serial (if known)
                  <input
                    value={serial}
                    onChange={(e) => setSerial(e.target.value.toUpperCase())}
                    placeholder="Serial"
                    className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5 uppercase"
                  />
                </label>
              </div>
              <label className="block text-sm">
                What broke
                <select
                  value={part}
                  onChange={(e) => setPart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2.5"
                >
                  {PARTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Who is reporting (initials)
                <input
                  value={raisedBy}
                  onChange={(e) => setRaisedBy(e.target.value.toUpperCase())}
                  placeholder="Initials"
                  className="mt-1 w-full rounded-lg border border-rule px-3 py-2.5 uppercase"
                />
              </label>
              <label className="block text-sm">
                What happened *
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Dropped the 100A MCCB while fitting — housing cracked"
                  className="mt-1 min-h-24 w-full rounded-lg border border-rule px-3 py-2.5"
                />
              </label>
              <button
                type="button"
                disabled={!stringKey.trim() || !description.trim() || saving}
                onClick={() => void create()}
                className="w-full rounded-lg bg-ink py-3 text-sm font-medium text-white disabled:opacity-30"
              >
                {saving ? "Logging…" : "Log fault"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
