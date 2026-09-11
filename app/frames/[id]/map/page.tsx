"use client";

import { BreakerSheet } from "@/components/BreakerSheet";
import { BoardMegger } from "@/components/BoardMegger";
import { FrameMap } from "@/components/FrameMap";
import {
  getBreaker,
  getTest,
  patchBreaker,
  serialsDoneCount,
  usedCount,
} from "@/lib/breaker";
import { frameLabel } from "@/lib/crew";
import { useFrame } from "@/lib/useFrame";
import type { BreakerTest, CbsdsLabel, IrReadings, PassFail } from "@/lib/types";
import { use, useState } from "react";

export default function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);
  const [slot, setSlot] = useState<{ label: CbsdsLabel; position: number } | null>(null);
  const [board, setBoard] = useState<CbsdsLabel | null>(null);

  if (loading) return <p className="p-6 text-sm text-neutral-500">Loading…</p>;
  if (!frame) return <p className="p-6">Frame not found.</p>;

  const name = frameLabel(frame);

  return (
    <main className="mx-auto max-w-lg px-3 pb-8 pt-4">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{name}</h1>
          <p className="text-xs text-neutral-500">
            {frame.installerName ? `${frame.installerName} · ` : ""}
            {serialsDoneCount(frame)} / {usedCount(frame) || 0} serials
            {savedAt ? ` · saved ${savedAt}` : ""}
          </p>
        </div>
      </div>
      <p className="mb-3 text-sm text-neutral-600">
        Grey = empty (not on this drawing). Tap a square. Tap A/B/C/D for board megger.
      </p>
      <FrameMap
        frame={frame}
        onSlot={(label, position) => {
          setBoard(null);
          setSlot({ label, position });
        }}
        onBoard={(label) => {
          setSlot(null);
          setBoard(label);
        }}
      />

      {slot ? (
        <BreakerSheet
          slot={`${slot.label}${slot.position}`}
          breaker={getBreaker(frame, slot.label, slot.position)}
          test={getTest(frame, slot.label, slot.position)}
          onBreaker={(b) => update((f) => patchBreaker(f, slot.label, slot.position, b))}
          onTest={(t) =>
            update((f) => ({
              ...f,
              electricalTesting: {
                ...f.electricalTesting,
                perBreakerTest: {
                  ...f.electricalTesting.perBreakerTest,
                  [slot.label]: f.electricalTesting.perBreakerTest[slot.label].map((row, i) =>
                    i === slot.position - 1 ? t : row,
                  ) as BreakerTest[],
                },
              },
            }))
          }
          onClose={() => setSlot(null)}
        />
      ) : null}

      {board ? (
        <BoardMegger
          label={board}
          frame={frame}
          onChange={(readings: IrReadings, visual: PassFail, sign: string) =>
            update((f) => ({
              ...f,
              electricalTesting: {
                ...f.electricalTesting,
                visualInspection: { ...f.electricalTesting.visualInspection, [board]: visual },
                frameIrSign: sign,
                perCbsdsIr: {
                  ...f.electricalTesting.perCbsdsIr,
                  [board]: { readings },
                },
              },
            }))
          }
          onClose={() => setBoard(null)}
        />
      ) : null}
    </main>
  );
}
