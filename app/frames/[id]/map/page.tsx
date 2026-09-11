"use client";

import { BreakerSheet } from "@/components/BreakerSheet";
import { BoardMegger } from "@/components/BoardMegger";
import { FrameMap } from "@/components/FrameMap";
import { SwitchboardInstall } from "@/components/SwitchboardInstall";
import {
  getBreaker,
  getTest,
  patchBreaker,
  serialsDoneCount,
  usedCount,
} from "@/lib/breaker";
import { frameLabel } from "@/lib/crew";
import { useFrame } from "@/lib/useFrame";
import type { BreakerTest, CbsdsLabel, FramePhase, IrReadings, Manufacturer, PassFail } from "@/lib/types";
import { use, useState } from "react";

export default function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);
  const [slot, setSlot] = useState<{ label: CbsdsLabel; position: number } | null>(null);
  const [board, setBoard] = useState<CbsdsLabel | null>(null);

  if (loading) return <p className="p-6 text-sm text-neutral-500">Loading…</p>;
  if (!frame) return <p className="p-6">Frame not found.</p>;

  const phase: FramePhase = frame.phase === "testing" ? "testing" : "installation";
  const testing = phase === "testing";
  const name = frameLabel(frame);

  return (
    <main className="mx-auto max-w-lg px-3 pb-8 pt-4">
      <div
        className={`mb-4 rounded-2xl px-4 py-3 ${
          frame.submitted ? "bg-sky-700 text-white" : testing ? "bg-emerald-700 text-white" : "bg-ink text-white"
        }`}
      >
        <p className="text-xs uppercase tracking-wide opacity-80">
          {frame.submitted ? "Submitted" : testing ? "Testing" : "Installing"}
        </p>
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="text-xs opacity-80">
          {frame.installerName ? `${frame.installerName} · ` : ""}
          {serialsDoneCount(frame)} / {usedCount(frame) || 0} serials
          {savedAt ? ` · saved ${savedAt}` : ""}
        </p>
      </div>

      {frame.submitted ? (
        <p className="mb-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Submitted
        </p>
      ) : testing ? (
        <div className="mb-3 space-y-2">
          <button
            type="button"
            onClick={() => update((f) => ({ ...f, submitted: true }))}
            className="w-full rounded-2xl bg-sky-600 py-3 text-sm font-medium text-white"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => update((f) => ({ ...f, phase: "installation" }))}
            className="w-full rounded-2xl border border-rule bg-white py-3 text-sm"
          >
            Back to installing
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => update((f) => ({ ...f, phase: "testing" }))}
          className="mb-3 w-full rounded-2xl bg-emerald-700 py-3 text-sm font-medium text-white"
        >
          Move to testing
        </button>
      )}

      <FrameMap
        frame={frame}
        phase={phase}
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
          mode={phase}
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

      {board && !testing ? (
        <SwitchboardInstall
          label={board}
          frame={frame}
          onManufacturer={(value: Exclude<Manufacturer, "">) =>
            update((f) => ({ ...f, manufacturer: value }))
          }
          onSerial={(value) =>
            update((f) => ({
              ...f,
              cbsds: f.cbsds.map((c) =>
                c.label === board ? { ...c, cbsdsSerialNumber: value } : c,
              ),
            }))
          }
          onClose={() => setBoard(null)}
        />
      ) : null}

      {board && testing ? (
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
