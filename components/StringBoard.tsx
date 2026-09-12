"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  FRAME_SLOTS,
  STRING_LEVELS,
  slotFromFrame,
  workStatus,
  workStatusClass,
  type FrameSlot,
} from "@/lib/stringLayout";
import { stagePercent, stageShortLabel } from "@/lib/shopStage";
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
  const hold = useRef<number | null>(null);
  const bySlot = new Map<string, Frame>();
  for (const frame of frames) {
    const slot = slotFromFrame(frame);
    if (slot) bySlot.set(slot, frame);
  }

  const total = FRAME_SLOTS.length;
  const counts = { installing: 0, testing: 0, submitted: 0 };
  for (const frame of frames) counts[workStatus(frame)] += 1;
  const percent = Math.round((counts.submitted / total) * 100);

  function clearHold() {
    if (hold.current != null) window.clearTimeout(hold.current);
    hold.current = null;
  }

  return (
    <section className="rounded-2xl border border-rule bg-white p-3">
      <div
        className="mb-3 select-none"
        style={{ WebkitTouchCallout: "none" }}
        onContextMenu={(e) => {
          if (onDelete) e.preventDefault();
        }}
        onPointerDown={() => {
          if (!onDelete) return;
          clearHold();
          hold.current = window.setTimeout(() => {
            hold.current = null;
            onDelete(stringKey);
          }, 550);
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{stringKey}</h2>
          <p className="text-[11px] tabular-nums text-neutral-400">{percent}%</p>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-zinc-100">
          <span className="block h-full bg-sky-600" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-2.5 text-[10px] text-neutral-500">
          <span>
            <span className="text-amber-600">{counts.installing}</span> installing
          </span>
          <span>
            <span className="text-emerald-700">{counts.testing}</span> testing
          </span>
          <span>
            <span className="text-sky-700">{counts.submitted}</span> submitted
          </span>
        </p>
      </div>
      <div className="grid grid-cols-[1fr_2.25rem_1fr] items-stretch gap-2">
        <p className="text-center text-[10px] font-medium uppercase text-neutral-400">L</p>
        <p className="text-center text-[9px] uppercase leading-tight text-neutral-400">Manifold</p>
        <p className="text-center text-[10px] font-medium uppercase text-neutral-400">R</p>
        {STRING_LEVELS.map((n) => (
          <div key={n} className="contents">
            <SlotTile
              stringKey={stringKey}
              slot={`${n}L` as FrameSlot}
              frame={bySlot.get(`${n}L`)}
            />
            <div className="flex items-center justify-center rounded bg-red-800 text-[9px] font-bold text-white">
              {n}
            </div>
            <SlotTile
              stringKey={stringKey}
              slot={`${n}R` as FrameSlot}
              frame={bySlot.get(`${n}R`)}
            />
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
        className="flex h-16 items-center justify-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-400"
      >
        {slot}
      </Link>
    );
  }
  const status = workStatus(frame);
  const pct = stagePercent(frame);
  const label = stageShortLabel(frame);
  return (
    <Link
      href={`/frames/${frame.id}/map`}
      className={`relative flex h-16 flex-col overflow-hidden rounded-xl ${workStatusClass(status)}`}
    >
      <span className="flex flex-1 flex-col items-center justify-center px-1 pt-1 text-sm font-bold">{slot}</span>
      <span className="pb-2.5 text-center text-[10px] font-normal leading-none opacity-90">{label}</span>
      <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-white/30">
        <span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
