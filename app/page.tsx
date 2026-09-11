"use client";

import { useEffect, useState } from "react";
import { StringBoard } from "@/components/StringBoard";
import {
  addStringRun,
  archiveStringRun,
  listFrames,
  listStringRuns,
  unarchiveStringRun,
  type StringRun,
} from "@/lib/db";
import { FRAME_SLOTS, stringKeyFromFrame } from "@/lib/stringLayout";
import type { Frame } from "@/lib/types";

function submittedSlotCount(frames: Frame[]): number {
  const slots = new Set(
    frames.filter((f) => f.submitted).map((f) => (f.frameSlot || f.stringId || "").toUpperCase()),
  );
  return [...slots].filter((s) => FRAME_SLOTS.includes(s as (typeof FRAME_SLOTS)[number])).length;
}

export default function HomePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [runs, setRuns] = useState<StringRun[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [showDone, setShowDone] = useState(false);

  async function refresh() {
    const [list, stringRuns] = await Promise.all([listFrames(), listStringRuns()]);
    const keys = new Set([...stringRuns.map((r) => r.key), ...list.map((f) => stringKeyFromFrame(f))]);
    for (const key of keys) {
      const group = list.filter((f) => stringKeyFromFrame(f) === key);
      const complete = submittedSlotCount(group) >= FRAME_SLOTS.length;
      const run = stringRuns.find((r) => r.key === key);
      if (complete && !run?.archivedAt) {
        await archiveStringRun(key);
      }
    }
    const [list2, runs2] = await Promise.all([listFrames(), listStringRuns()]);
    setFrames(list2);
    setRuns(runs2);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const keys = [...new Set([...runs.map((r) => r.key), ...frames.map((f) => stringKeyFromFrame(f))])];
  const grouped = keys.map((key) => {
    const groupFrames = frames.filter((f) => stringKeyFromFrame(f) === key);
    const run = runs.find((r) => r.key === key);
    const complete = submittedSlotCount(groupFrames) >= FRAME_SLOTS.length;
    return {
      key,
      frames: groupFrames,
      archived: Boolean(run?.archivedAt) || complete,
      started: groupFrames.length,
    };
  });

  const active = grouped
    .filter((g) => !g.archived)
    .sort((a, b) => b.started - a.started || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const done = grouped.filter((g) => g.archived);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Strings</h1>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-white"
        >
          Add string
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-zinc-200" /> empty
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-amber-500" /> installing
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-emerald-600" /> testing
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-sky-600" /> submitted
        </span>
      </div>

      {adding ? (
        <form
          className="mb-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const key = newKey.trim();
            if (!key) return;
            await addStringRun(key);
            setNewKey("");
            setAdding(false);
            await refresh();
          }}
        >
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="String no. e.g. 4"
            className="min-w-0 flex-1 rounded-2xl border border-rule px-4 py-3"
          />
          <button type="submit" className="rounded-2xl bg-ink px-4 py-3 text-white">
            Save
          </button>
        </form>
      ) : null}

      {!ready ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : active.length === 0 && done.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-neutral-600">
          Add a string.
        </p>
      ) : (
        <div className="space-y-4">
          {active.map((group) => (
            <StringBoard key={group.key} stringKey={group.key} frames={group.frames} />
          ))}
          {done.length ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-sm text-neutral-500"
              >
                {showDone ? "Hide" : "Show"} submitted strings ({done.length})
              </button>
              {showDone
                ? done.map((group) => (
                    <div key={group.key} className="mt-3 space-y-2">
                      <StringBoard stringKey={group.key} frames={group.frames} />
                      <button
                        type="button"
                        className="text-xs text-neutral-500 underline"
                        onClick={async () => {
                          await unarchiveStringRun(group.key);
                          await refresh();
                        }}
                      >
                        Restore {group.key}
                      </button>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
