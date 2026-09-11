"use client";

import { IR_ROWS } from "@/lib/ir";
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
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-600">
          Map
        </button>
        <p className="text-lg font-bold">Board {label} megger</p>
        <span className="w-8" />
      </header>
      <div className="flex-1 overflow-auto px-4 pb-8">
        <p className="mb-3 text-sm text-neutral-600">All MCCBs OFF, FCL fuses pulled. MΩ.</p>
        <div className="mb-4 rounded-2xl bg-white p-3 text-sm">
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
                visual === v ? "bg-ink text-white" : "bg-white"
              }`}
            >
              Visual {v}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {IR_ROWS.map((row) => (
            <label key={row.key} className="flex items-center gap-2 text-xs">
              <span className="flex-1">{row.label}</span>
              <input
                inputMode="decimal"
                value={readings[row.key]}
                onChange={(e) =>
                  onChange({ ...readings, [row.key]: e.target.value }, visual, sign)
                }
                className="w-20 rounded-xl border border-rule bg-white px-2 py-2"
              />
            </label>
          ))}
        </div>
        <input
          value={sign}
          onChange={(e) => onChange(readings, visual, e.target.value)}
          placeholder="Sign"
          className="mt-4 w-full rounded-2xl border border-rule bg-white px-4 py-3"
        />
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl bg-ink py-4 text-white">
          Done
        </button>
      </div>
    </div>
  );
}
