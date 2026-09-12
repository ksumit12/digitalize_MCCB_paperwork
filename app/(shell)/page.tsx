"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StringBoard } from "@/components/StringBoard";
import {
  archiveStringRun,
  deleteStringAndFrames,
  findTradeByName,
  listDefects,
  listFrames,
  listStringRuns,
  listTrades,
  newId,
  saveStringRun,
  saveTrade,
  unarchiveStringRun,
  type StringRun,
} from "@/lib/db";
import { FRAME_SLOTS, slotFromFrame, stringKeyFromFrame } from "@/lib/stringLayout";
import { pullAndMerge } from "@/lib/serverSync";
import type { Frame, Trade } from "@/lib/types";

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

export default function HomePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [runs, setRuns] = useState<StringRun[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [openDefects, setOpenDefects] = useState(0);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    await pullAndMerge();
    const [list, stringRuns, tradeRows, defects] = await Promise.all([
      listFrames(),
      listStringRuns(),
      listTrades(),
      listDefects(),
    ]);
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
    setTrades(tradeRows);
    setOpenDefects(defects.filter((d) => d.status === "open").length);
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
    const started = uniqueStarted(groupFrames);
    return {
      key,
      frames: groupFrames,
      tradeName: run?.tradeName || groupFrames.find((f) => f.tradeName)?.tradeName || "",
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

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const inProgress = frames.filter((f) => !f.submitted).length;
  const submitted = frames.filter((f) => f.submitted).length;

  return (
    <main>
      <div className="mb-6 overflow-hidden rounded-xl border border-rule bg-white">
        <div className="border-b border-rule bg-neutral-50 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{dateLabel}</p>
          <h1 className="mt-0.5 text-2xl font-semibold">{greeting} 👋</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {active.length} active string{active.length === 1 ? "" : "s"} · {inProgress} frame
            {inProgress === 1 ? "" : "s"} in progress · {openDefects} open fault{openDefects === 1 ? "" : "s"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/frames/new"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
            >
              New frame
            </Link>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium"
            >
              Add string
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
          <div className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Active strings</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{active.length}</p>
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Frames in progress</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{inProgress}</p>
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Frames submitted</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{submitted}</p>
          </div>
          <div className="bg-white px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Open faults</p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${openDefects ? "text-red-600" : ""}`}>
              {openDefects}
            </p>
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Strings</h2>

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
          className="mb-4 space-y-3 rounded-2xl border border-rule bg-white p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const key = newKey.trim();
            if (!key) return;
            let tradeId = "";
            let trade = await findTradeByName(tradeName);
            if (!trade) {
              trade = { id: newId(), name: tradeName.trim(), createdAt: new Date().toISOString() };
              await saveTrade(trade);
            }
            tradeId = trade.id;
            const run: StringRun = {
              key,
              createdAt: new Date().toISOString(),
              archivedAt: undefined,
              tradeId,
              tradeName: trade.name,
            };
            await saveStringRun(run);
            setNewKey("");
            setTradeName("");
            setAdding(false);
            await refresh();
          }}
        >
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="String no. e.g. 4"
            className="w-full rounded-2xl border border-rule px-4 py-3"
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-700">Which trade owns this string</p>
            {trades.length ? (
              <div className="flex flex-wrap gap-2">
                {trades.map((t) => {
                  const on = tradeName.toLowerCase() === t.name.toLowerCase();
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTradeName(t.name)}
                      className={`rounded-full px-3 py-2 text-sm ${
                        on ? "bg-ink text-white" : "bg-zinc-100"
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <input
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="Trade / team name e.g. Sparkies"
              className="w-full rounded-2xl border border-rule px-4 py-3"
            />
          </div>
          <button type="submit" className="w-full rounded-2xl bg-ink px-4 py-3 text-white">
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
        <div className="mx-auto max-w-2xl space-y-4">
          {active.map((group) => (
            <StringBoard
              key={group.key}
              stringKey={group.key}
              tradeName={group.tradeName}
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
                        tradeName={group.tradeName}
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
