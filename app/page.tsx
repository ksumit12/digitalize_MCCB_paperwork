"use client";

import { useEffect, useState } from "react";
import { StringBoard } from "@/components/StringBoard";
import { StringDial } from "@/components/StringDial";
import { DesktopNav, HomeMenu } from "@/components/HomeMenu";
import { SyncBadge } from "@/components/SyncBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  addStringRun,
  archiveStringRun,
  deleteStringAndFrames,
  listFrames,
  listProjects,
  listStringRuns,
  onSharedSync,
  unarchiveStringRun,
  type StringRun,
} from "@/lib/db";
import { currentProjectId } from "@/lib/project";
import { FRAME_SLOTS, slotFromFrame, stringKeyFromFrame, workStatus } from "@/lib/stringLayout";
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
  const [error, setError] = useState("");
  const [dial, setDial] = useState(0);

  async function refresh() {
    try {
      setError("");
      const [list, stringRuns, projects] = await Promise.all([listFrames(), listStringRuns(), listProjects()]);
      const pid = currentProjectId();
      setProjectName(projects.find((p) => p.id === pid)?.name || "Current project");
      const keys = new Set([...stringRuns.map((r) => r.key), ...list.map((f) => stringKeyFromFrame(f))]);
      let archived = false;
      for (const key of keys) {
        const group = list.filter((f) => stringKeyFromFrame(f) === key);
        const complete = submittedSlotCount(group) >= FRAME_SLOTS.length;
        const run = stringRuns.find((r) => r.key === key);
        if (complete && !run?.archivedAt) {
          await archiveStringRun(key);
          archived = true;
        }
      }
      setFrames(list);
      setRuns(archived ? await listStringRuns() : stringRuns);
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this phone's data");
      setReady(true);
    }
  }

  useEffect(() => {
    setHello(greeting());
    void refresh();
    return onSharedSync(() => {
      void refresh();
    });
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
  const openFrames = frames.filter((f) => workStatus(f) !== "submitted").length;
  const handed = frames.filter((f) => f.submitted).length;
  const current = active[dial] ?? active[0];

  useEffect(() => {
    if (dial > active.length - 1) setDial(Math.max(0, active.length - 1));
  }, [active.length, dial]);

  return (
    <main className="mx-auto max-w-lg px-4 pb-28 pt-5 md:max-w-3xl md:pb-12 lg:max-w-5xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HomeMenu />
          <DesktopNav />
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tile-press shrink-0 rounded-full bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-ink"
          >
            + String
          </button>
        </div>
      </header>

      <section className="home-rise mb-5 rounded-3xl bg-surface px-5 py-5 ring-1 ring-rule md:flex md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted">{hello || " "}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{projectName || "Project"}</h1>
          <div className="mt-3">
            <SyncBadge />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 md:mt-0 md:w-[20rem]">
          <HeroStat label="Active" value={active.length} />
          <HeroStat label="Open" value={openFrames} />
          <HeroStat label="Handed" value={handed} />
        </div>
      </section>

      {error ? (
        <p className="mb-4 rounded-2xl bg-red-500/15 p-4 text-sm text-red-300">{error}</p>
      ) : null}

      {adding ? (
        <form
          className="home-rise mb-4 flex gap-2 rounded-3xl bg-surface p-2 ring-1 ring-rule"
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
            className="min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 text-ink outline-none"
          />
          <button type="button" onClick={() => setAdding(false)} className="rounded-2xl px-3 text-sm text-muted">
            Cancel
          </button>
          <button type="submit" className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-accent-ink">
            Save
          </button>
        </form>
      ) : null}

      {pendingDelete && pending ? (
        <div className="mb-4 rounded-3xl bg-red-500/15 p-4">
          <p className="text-sm font-semibold">Delete string {pendingDelete}?</p>
          <p className="mt-1 text-sm text-muted">
            This removes the string and all {pending.started} of its frames from this phone. It cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-surface px-4 py-2 text-sm font-medium"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
        <p className="text-sm text-muted">Loading…</p>
      ) : active.length === 0 && done.length === 0 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="home-rise w-full rounded-3xl border border-dashed border-rule bg-surface px-6 py-14 text-center"
        >
          <p className="text-lg font-semibold">No strings yet</p>
          <p className="mt-1 text-sm text-muted">Tap to add the first one.</p>
        </button>
      ) : current ? (
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-4">
          <nav className="mb-3 hidden lg:sticky lg:top-4 lg:mb-0 lg:flex lg:flex-col lg:gap-1" aria-label="Strings">
            {active.map((group, i) => {
              const on = i === Math.min(dial, active.length - 1);
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setDial(i)}
                  className={`rounded-2xl px-3 py-3 text-left ${
                    on ? "bg-accent text-accent-ink" : "bg-surface text-ink ring-1 ring-rule hover:bg-surface-2"
                  }`}
                >
                  <p className="font-semibold">String {group.key}</p>
                  <p className={`text-xs ${on ? "text-accent-ink/70" : "text-muted"}`}>
                    {group.started}/{FRAME_SLOTS.length} started
                  </p>
                </button>
              );
            })}
          </nav>
          <StringDial
            index={Math.min(dial, Math.max(0, active.length - 1))}
            onIndex={setDial}
            items={active.map((group) => (
              <StringBoard
                key={group.key}
                stringKey={group.key}
                frames={group.frames}
                onDelete={setPendingDelete}
              />
            ))}
          />
        </div>
      ) : null}

      {done.length ? (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-sm font-medium text-muted"
          >
            {showDone ? "Hide" : "Show"} past strings ({done.length})
          </button>
          {showDone
            ? done.map((group) => (
                <div key={group.key} className="mt-3 space-y-2">
                  <StringBoard stringKey={group.key} frames={group.frames} onDelete={setPendingDelete} />
                  <button
                    type="button"
                    className="text-xs font-medium text-accent"
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

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="tile-press fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-30 flex h-14 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-lift md:hidden"
      >
        <span className="text-lg leading-none">+</span>
        Add string
      </button>
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-3">
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
