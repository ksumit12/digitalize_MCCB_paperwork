"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listFrames } from "@/lib/db";
import { searchSerials, type SerialHit } from "@/lib/search";
import { pullAndMerge } from "@/lib/serverSync";
import type { Frame } from "@/lib/types";

export default function SearchPage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SerialHit[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await pullAndMerge();
      setFrames(await listFrames());
      setReady(true);
    })();
  }, []);

  function run(q: string) {
    setQuery(q);
    setHits(searchSerials(frames, q));
  }

  return (
    <main>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Serial search</h1>
        <p className="text-sm text-neutral-500">
          Type or paste any MCCB, Micrologic (WX…), or shunt batch serial to find where it lives.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => run(e.target.value)}
        placeholder="Serial — e.g. 1ABC1234567 or WX2619…"
        autoCapitalize="characters"
        className="mb-4 w-full rounded-xl border border-rule bg-white px-4 py-3.5 text-lg uppercase"
      />

      {!ready ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : query.trim().length < 3 ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-neutral-500">
          Enter at least 3 characters.
        </p>
      ) : hits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-neutral-500">
          No serial matches “{query}”.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-white">
          <div className="border-b border-rule px-4 py-3">
            <h2 className="text-sm font-semibold">
              {hits.length} match{hits.length === 1 ? "" : "es"}
            </h2>
          </div>
          <div className="divide-y divide-rule">
            {hits.map((h, i) => (
              <Link
                key={`${h.frameId}-${h.slot}-${h.kind}-${i}`}
                href={`/frames/${h.frameId}/map`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-neutral-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {h.serial}
                    <span className="ml-2 text-xs text-neutral-500">{h.kind}</span>
                    {h.amps ? <span className="ml-2 text-xs text-neutral-500">{h.amps}</span> : null}
                  </p>
                  <p className="text-sm text-neutral-600">
                    String {h.stringKey} · {h.frameSlot} · slot {h.slot}
                  </p>
                  {h.state === "replaced" ? (
                    <p className="mt-0.5 text-xs text-amber-700">
                      Replaced with {h.newSerial || "—"} by {h.replacedBy || "—"} ·{" "}
                      {h.replacedAt ? new Date(h.replacedAt).toLocaleDateString() : ""}
                      {h.note ? ` — ${h.note}` : ""}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:self-center ${
                    h.state === "active" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"
                  }`}
                >
                  {h.state}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
