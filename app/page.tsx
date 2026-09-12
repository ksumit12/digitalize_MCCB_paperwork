"use client";

import { useEffect, useState } from "react";
import { StringBoard } from "@/components/StringBoard";
import { HomeMenu } from "@/components/HomeMenu";
import {
  addStringRun,
  archiveStringRun,
  deleteStringAndFrames,
  listFrames,
  listProjects,
  listStringRuns,
  unarchiveStringRun,
  type StringRun,
} from "@/lib/db";
import { currentProjectId } from "@/lib/project";
import { FRAME_SLOTS, slotFromFrame, stringKeyFromFrame } from "@/lib/stringLayout";
import type { Frame } from "@/lib/types";

function uniqueStarted(frames: Frame[]): number {
  const slots = new Set(frames.map(slotFromFrame).filter(Boolean));
  return slots.size;
}

function submittedSlotCount(frames: Frame[]): number {
  const slots = new Set(
    frames.filter((f) => f.submitted).map((f) => (f.frameSlot || f.stringId || "").toUpperCase()),
  );
  return [...slots].filter((s) => FRAME_SLOTS.includes(s as (typeof FRAME_SLOTS)[number])).length;
}

function lastTouched(frames: Frame[]): number {
  return frames.reduce((max, f) => {
    const t = Date.parse(f.updatedAt || f.createdAt || "") || 0;
    return t > max ? t : max;
  }, 0);
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [runs, setRuns] = useState<StringRun[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [hello, setHello] = useState("");

  async function refresh() {
    const [list, stringRuns, projects] = await Promise.all([listFrames(), listStringRuns(), listProjects()]);
    const pid = currentProjectId();
    setProjectName(projects.find((p) => p.id === pid)?.name || "Current project");
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
    setHello(greeting());
    void refresh();
  }, []);

  const keys = [...new Set([...runs.map((r) => r.key), ...frames.map((f) => stringKeyFromFrame(f))])];
  const grouped = keys.map((key) => {
    const groupFrames = frames.filter((f) => stringKeyFromFrame(f) === key);
    const run = runs.find((r) => r.key === key);
    const complete = submittedSlotCount(groupFrames) >= FRAME_SLOTS.length;
    const started = uniqueStarted(groupFrames);
    return {
      key,
      frames: groupFrames,
      archived: Boolean(run?.archivedAt) || complete,
      started,
      lastTouched: lastTouched(groupFrames) || Date.parse(run?.createdAt || "") || 0,
    };
  });

  const active = grouped
    .filter((g) => !g.archived)
    .sort(
      (a, b) => b.started - a.started || b.lastTouched - a.lastTouched || a.key.localeCompare(b.key, undefined, { numeric: true }),
    );
  const done = grouped
    .filter((g) => g.archived)
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

  const pending = grouped.find((g) => g.key === pendingDelete);

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-5">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <HomeMenu />
          <div className="home-rise min-w-0 pt-0.5">
            <p className="text-sm text-neutral-500">{hello || " "}</p>
            <h1 className="text-3xl font-semibold leading-tight">{projectName || "Project"}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 shrink-0 rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-white"
        >
          Add string
        </button>
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

      {pendingDelete && pending ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Delete string {pendingDelete}?</p>
          <p className="mt-1 text-sm text-red-800">
            This removes the string and all {pending.started} of its frames from this phone. It cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium ring-1 ring-rule"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                await deleteStringAndFrames(pendingDelete);
                setPendingDelete(null);
                setDeleting(false);
                await refresh();
              }}
            >
              {deleting ? "Deleting…" : "Delete string"}
            </button>
          </div>
        </div>
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
            <StringBoard
              key={group.key}
              stringKey={group.key}
              frames={group.frames}
              onDelete={setPendingDelete}
            />
          ))}
          {done.length ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="text-sm text-neutral-500"
              >
                {showDone ? "Hide" : "Show"} past strings ({done.length})
              </button>
              {showDone
                ? done.map((group) => (
                    <div key={group.key} className="mt-3 space-y-2">
                      <StringBoard
                        stringKey={group.key}
                        frames={group.frames}
                        onDelete={setPendingDelete}
                      />
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
