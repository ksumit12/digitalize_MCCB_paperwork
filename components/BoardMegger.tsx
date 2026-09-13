"use client";

import { IrPassFail } from "@/components/PassFailPaint";
import type { CbsdsLabel, Frame, IrReadings, PassFail } from "@/lib/types";

export function BoardMegger({
  label,
  frame,
  onChange,
  onClose,
}: {
  label: CbsdsLabel;
  frame: Frame;
  onChange: (readings: IrReadings, visual: PassFail, sign: string) => void;
  onClose: () => void;
}) {
  const readings = frame.electricalTesting.perCbsdsIr[label].readings;
  const visual = frame.electricalTesting.visualInspection[label];
  const sign = frame.electricalTesting.frameIrSign;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-testing px-3 py-2 text-sm font-semibold text-on-testing"
        >
          ← Board
        </button>
        <p className="text-lg font-bold">Board {label} megger</p>
        <span className="w-8" />
      </header>
      <div className="flex-1 overflow-auto px-4 pb-8">
        <p className="mb-3 text-sm text-muted">All MCCBs OFF, FCL fuses pulled.</p>
        <div className="mb-4 rounded-2xl bg-surface p-3 text-sm">
          <p>Manufacturer: {frame.manufacturer || "—"}</p>
          <p>
            Board {label} serial: {frame.cbsds.find((c) => c.label === label)?.cbsdsSerialNumber || "—"}
          </p>
        </div>
        <div className="mb-4 flex gap-2">
          {(["pass", "fail"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(readings, v, sign)}
              className={`flex-1 rounded-2xl py-3 ${
                visual === v ? "bg-accent text-accent-ink" : "bg-surface"
              }`}
            >
              Visual {v}
            </button>
          ))}
        </div>
        <IrPassFail
          readings={readings}
          onChange={(next) => onChange(next, visual, sign)}
        />
        <input
          value={sign}
          onChange={(e) => onChange(readings, visual, e.target.value)}
          placeholder="Sign"
          className="mt-4 w-full rounded-2xl border border-rule bg-surface px-4 py-3"
        />
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl bg-accent py-4 text-accent-ink">
          Done
        </button>
      </div>
    </div>
  );
}
