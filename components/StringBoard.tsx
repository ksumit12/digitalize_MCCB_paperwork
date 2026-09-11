"use client";

import Link from "next/link";
import {
  FRAME_SLOTS,
  STRING_LEVELS,
  slotFromFrame,
  workStatus,
  workStatusClass,
  workStatusLabel,
  type FrameSlot,
} from "@/lib/stringLayout";
import type { Frame } from "@/lib/types";

export function StringBoard({
  stringKey,
  frames,
  onDelete,
}: {
  stringKey: string;
  frames: Frame[];
  onDelete?: (key: string) => void;
}) {
  const bySlot = new Map<string, Frame>();
  for (const frame of frames) {
    const slot = slotFromFrame(frame);
    if (slot) bySlot.set(slot, frame);
  }

  const total = FRAME_SLOTS.length;
  const counts = { installing: 0, testing: 0, submitted: 0 };
  for (const frame of frames) counts[workStatus(frame)] += 1;
  const started = bySlot.size;
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <section className="rounded-2xl border border-rule bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{stringKey}</h2>
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(stringKey)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-red-700"
          >
            Delete
          </button>
        ) : null}
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="flex h-full w-full">
          <span className="block h-full bg-sky-600" style={{ width: pct(counts.submitted) }} />
          <span className="block h-full bg-emerald-500" style={{ width: pct(counts.testing) }} />
          <span className="block h-full bg-amber-400" style={{ width: pct(counts.installing) }} />
        </div>
      </div>
      <p className="mb-3 text-[11px] text-neutral-500">
        {started}/{total} started · {counts.submitted} submitted
      </p>
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
