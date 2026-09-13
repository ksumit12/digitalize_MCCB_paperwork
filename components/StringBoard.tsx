"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  FRAME_SLOTS,
  STRING_LEVELS,
  slotFromFrame,
  workStatus,
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
    <section className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-rule">
      <div
        className="mb-4 select-none"
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
        onPointerMove={(e) => {
          if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearHold();
        }}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">String {stringKey}</h2>
          <p className="text-xs font-medium tabular-nums text-muted">{percent}%</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">
          <span>
            <span className="font-semibold text-install">{counts.installing}</span> installing
          </span>
          <span>
            <span className="font-semibold text-testing">{counts.testing}</span> testing
          </span>
          <span>
            <span className="font-semibold text-done">{counts.submitted}</span> submitted
          </span>
        </p>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_2.25rem_1fr] gap-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted">L</p>
          <p className="text-center text-[9px] uppercase leading-tight tracking-wide text-muted">Manifold</p>
          <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted">R</p>
        </div>
        {STRING_LEVELS.map((n) => (
          <div key={n} className="grid grid-cols-[1fr_2.25rem_1fr] items-stretch gap-2">
            <SlotTile
              stringKey={stringKey}
              slot={`${n}L` as FrameSlot}
              frame={bySlot.get(`${n}L`)}
            />
            <div className="flex items-center justify-center rounded-xl bg-surface-2 text-[10px] font-bold text-muted">
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
        className="tile-press flex h-16 items-center justify-center rounded-2xl bg-surface-2 text-sm font-bold text-muted"
      >
        {slot}
      </Link>
    );
  }
  const status = workStatus(frame);
  const pct = stagePercent(frame);
  const label = stageShortLabel(frame);
  const tone =
    status === "submitted"
      ? "bg-done text-on-done"
      : status === "testing"
        ? "bg-testing text-on-testing"
        : "bg-install text-on-install";
  return (
    <Link
      href={`/frames/${frame.id}/map`}
      className={`tile-press flex h-16 flex-col overflow-hidden rounded-2xl ${tone}`}
    >
      <span className="flex flex-1 flex-col items-center justify-center px-1 pt-1 text-sm font-bold">{slot}</span>
      <span className="text-center text-[10px] font-medium leading-none opacity-90">{label}</span>
      <span className="mx-2 mb-1.5 mt-1 h-0.5 overflow-hidden rounded-full bg-black/20">
        <span className="block h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
