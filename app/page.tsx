"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { frameLabel } from "@/lib/crew";
import { serialsDoneCount, usedCount } from "@/lib/breaker";
import { deleteFrame, listFrames } from "@/lib/db";
import type { Frame } from "@/lib/types";

export default function HomePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [ready, setReady] = useState(false);

  async function refresh() {
    setFrames(await listFrames());
    setReady(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Frames</h1>
        <Link href="/frames/new" className="rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-white">
          New
        </Link>
      </div>
      {!ready ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : frames.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-neutral-600">
          Start a frame, then tap the squares that exist on the drawing.
        </p>
      ) : (
        <ul className="space-y-2">
          {frames.map((frame) => {
            const used = usedCount(frame);
            const done = serialsDoneCount(frame);
            return (
              <li key={frame.id}>
                <Link
                  href={`/frames/${frame.id}/map`}
                  className="block rounded-2xl border border-rule bg-white p-4"
                >
                  <p className="font-medium">{frameLabel(frame)}</p>
                  <p className="text-sm text-neutral-600">
                    {frame.installerName ? `${frame.installerName} · ` : ""}
                    {done}/{used || "—"} serials
                  </p>
                </Link>
                <button
                  type="button"
                  className="mt-1 px-1 text-xs text-neutral-400"
                  onClick={async () => {
                    if (confirm("Delete this frame from this browser?")) {
                      await deleteFrame(frame.id);
                      await refresh();
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
