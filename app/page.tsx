"use client";

import { useEffect, useState } from "react";
import { StringBoard } from "@/components/StringBoard";
import { addStringRun, listFrames, listStringKeys } from "@/lib/db";
import { stringKeyFromFrame } from "@/lib/stringLayout";
import type { Frame } from "@/lib/types";

export default function HomePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");

  async function refresh() {
    const [list, stringKeys] = await Promise.all([listFrames(), listStringKeys()]);
    setFrames(list);
    setKeys(stringKeys.length ? stringKeys : []);
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const grouped = keys.map((key) => ({
    key,
    frames: frames.filter((f) => stringKeyFromFrame(f) === key),
  }));

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Strings</h1>
          <p className="text-xs text-neutral-500">Same map for crew and office. Tap a tile.</p>
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
      ) : grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-neutral-600">
          Add a string, then tap 7R / 7L like the drawing. Empty tiles are not started yet.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <StringBoard key={group.key} stringKey={group.key} frames={group.frames} />
          ))}
        </div>
      )}
    </main>
  );
}
