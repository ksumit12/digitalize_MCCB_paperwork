"use client";

import Link from "next/link";
import {
  STRING_LEVELS,
  slotFromFrame,
  stringKeyFromFrame,
  workStatus,
  workStatusClass,
  workStatusLabel,
  type FrameSlot,
} from "@/lib/stringLayout";
import type { Frame } from "@/lib/types";

export function StringBoard({
  stringKey,
  frames,
}: {
  stringKey: string;
  frames: Frame[];
}) {
  const bySlot = new Map<string, Frame>();
  for (const frame of frames) {
    const slot = slotFromFrame(frame);
    if (slot) bySlot.set(slot, frame);
  }

  const counts = { installing: 0, testing: 0, submitted: 0 };
  for (const frame of frames) counts[workStatus(frame)] += 1;

  return (
    <section className="rounded-2xl border border-rule bg-white p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{stringKey}</h2>
        <p className="text-xs text-neutral-500">
          {counts.submitted} submitted · {counts.testing} testing · {counts.installing} installing
        </p>
      </div>
      <div className="grid grid-cols-[1fr_2.25rem_1fr] items-stretch gap-2">
        <p className="text-center text-[10px] font-medium uppercase text-neutral-400">L</p>
        <p className="text-center text-[9px] uppercase leading-tight text-neutral-400">Manifold</p>
        <p className="text-center text-[10px] font-medium uppercase text-neutral-400">R</p>
        {STRING_LEVELS.map((n) => (
          <div key={n} className="contents">
            <SlotTile stringKey={stringKey} slot={`${n}L` as FrameSlot} frame={bySlot.get(`${n}L`)} />
            <div className="flex items-center justify-center rounded bg-red-800 text-[9px] font-bold text-white">
              {n}
            </div>
            <SlotTile stringKey={stringKey} slot={`${n}R` as FrameSlot} frame={bySlot.get(`${n}R`)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SlotTile({
  stringKey,
  slot,
  frame,
}: {
  stringKey: string;
  slot: FrameSlot;
  frame?: Frame;
}) {
  if (!frame) {
    return (
      <Link
        href={`/frames/new?string=${encodeURIComponent(stringKey)}&slot=${slot}`}
        className="flex h-12 items-center justify-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-400"
      >
        {slot}
      </Link>
    );
  }
  const status = workStatus(frame);
  return (
    <Link
      href={`/frames/${frame.id}/map`}
      className={`flex h-12 flex-col items-center justify-center rounded-xl text-sm font-bold ${workStatusClass(status)}`}
    >
      {slot}
      <span className="text-[9px] font-normal leading-none opacity-90">{workStatusLabel(status)}</span>
    </Link>
  );
}
