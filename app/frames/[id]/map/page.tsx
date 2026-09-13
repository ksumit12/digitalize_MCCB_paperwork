"use client";

import { BreakerSheet } from "@/components/BreakerSheet";
import { BoardMegger } from "@/components/BoardMegger";
import { FrameMap } from "@/components/FrameMap";
import { SwitchboardInstall } from "@/components/SwitchboardInstall";
import {
  getBreaker,
  getTest,
  nextMapSlot,
  parseSlot,
  patchBreaker,
  serialsDoneCount,
  usedCount,
} from "@/lib/breaker";
import { ShopStageChips } from "@/components/ShopStageChips";
import { SyncBadge } from "@/components/SyncBadge";
import Link from "next/link";
import { frameLabel } from "@/lib/crew";
import { stagePercent } from "@/lib/shopStage";
import { useFrame } from "@/lib/useFrame";
import type { BreakerTest, CbsdsLabel, FramePhase, IrReadings, Manufacturer, PassFail } from "@/lib/types";
import { use, useEffect, useState } from "react";

export default function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update } = useFrame(id);
  const [slot, setSlot] = useState<{ label: CbsdsLabel; position: number } | null>(null);
  const [board, setBoard] = useState<CbsdsLabel | null>(null);

  useEffect(() => {
    const fromUrl = parseSlot(new URLSearchParams(window.location.search).get("slot"));
    if (fromUrl) setSlot(fromUrl);
  }, []);

  if (loading) return <p className="p-6 text-sm text-muted">Loading…</p>;
  if (!frame) return <p className="p-6">Frame not found.</p>;

  const phase: FramePhase = frame.phase === "testing" ? "testing" : "installation";
  const testing = phase === "testing";
  const name = frameLabel(frame);
  const shopPct = stagePercent(frame);
  const breaker = slot ? getBreaker(frame, slot.label, slot.position) : undefined;
  const test = slot ? getTest(frame, slot.label, slot.position) : undefined;

  return (
    <main className="mx-auto max-w-lg px-3 pb-28 pt-4 md:max-w-2xl">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back to strings"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink ring-1 ring-rule"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <p className="text-sm font-medium text-muted">Strings</p>
      </div>
      <div
        className={`mb-4 rounded-2xl px-4 py-3 ${
          frame.submitted
            ? "bg-sky-700 text-white"
            : testing
              ? "bg-testing text-on-testing"
              : "bg-surface text-ink ring-1 ring-rule"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide opacity-80">
            {frame.submitted ? "Submitted" : testing ? "Testing" : "Installing"}
          </p>
          <div className="flex items-center gap-2">
            <SyncBadge />
            <Link
              href={`/frames/${id}/more`}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                frame.submitted || testing
                  ? "bg-white/15 text-white ring-1 ring-white/25"
                  : "bg-done text-on-done"
              }`}
            >
              Office
            </Link>
          </div>
        </div>
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="text-xs opacity-80">
          {frame.installerName ? `${frame.installerName} · ` : ""}
          {serialsDoneCount(frame)} / {usedCount(frame) || 0} serials
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
          <span className="block h-full rounded-full bg-surface" style={{ width: `${shopPct}%` }} />
        </div>
        <p className="mt-1 text-[11px] tabular-nums opacity-80">{shopPct}%</p>
      </div>

      {!frame.submitted ? (
        <div className="mb-3">
          <ShopStageChips
            frame={frame}
            onPick={(stage) => update((f) => ({ ...f, shopStage: stage }))}
          />
        </div>
      ) : null}

      {frame.submitted ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <p className="rounded-2xl bg-sky-700/20 px-4 py-3 text-sm text-ink">Submitted</p>
          <Link
            href={`/frames/${id}/more`}
            className="rounded-2xl bg-done py-3 text-center text-sm font-medium text-on-done"
          >
            Office
          </Link>
        </div>
      ) : testing ? (
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => update((f) => ({ ...f, submitted: true }))}
              className="rounded-2xl bg-sky-600 py-3 text-sm font-medium text-white"
            >
              Submit
            </button>
            <Link
              href={`/frames/${id}/more`}
              className="rounded-2xl bg-done py-3 text-center text-sm font-medium text-on-done"
            >
              Office
            </Link>
          </div>
          <button
            type="button"
            onClick={() => update((f) => ({ ...f, phase: "installation" }))}
            className="w-full rounded-2xl border border-rule bg-surface py-3 text-sm"
          >
            Back to installing
          </button>
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update((f) => ({ ...f, phase: "testing" }))}
            className="rounded-2xl bg-emerald-700 py-3 text-sm font-medium text-white"
          >
            Move to testing
          </button>
          <Link
            href={`/frames/${id}/more`}
            className="rounded-2xl bg-done py-3 text-center text-sm font-medium text-on-done"
          >
            Office
          </Link>
        </div>
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

      {slot && breaker && test ? (
        <BreakerSheet
          key={`${slot.label}${slot.position}`}
          slot={`${slot.label}${slot.position}`}
          frameId={frame.id}
          stringKey={frame.stringKey || "1"}
          frameSlot={frame.frameSlot || frame.stringId || ""}
          breaker={breaker}
          test={test}
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
          onNext={() => {
            const n = nextMapSlot(slot.label, slot.position);
            setSlot(n);
          }}
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
