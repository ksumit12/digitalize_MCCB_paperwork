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
  onChange: (readings: IrReadings, visual: PassFail, sign: string, mechanical: PassFail[]) => void;
  onClose: () => void;
}) {
  const readings = frame.electricalTesting.perCbsdsIr[label].readings;
  const visual = frame.electricalTesting.visualInspection[label];
  const sign = frame.electricalTesting.frameIrSign;
  const mechanical = frame.electricalTesting.mechanical[label] ?? Array.from({ length: 8 }, () => "");

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-teal-50">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
        >
          ← Board
        </button>
        <p className="text-lg font-bold">Board {label} megger</p>
        <span className="w-8" />
      </header>
      <div className="flex-1 overflow-auto px-4 pb-8">
        <p className="mb-3 text-sm text-neutral-600">All MCCBs OFF, FCL fuses pulled.</p>
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
              onClick={() => onChange(readings, v, sign, mechanical)}
              className={`flex-1 rounded-2xl py-3 ${
                visual === v ? "bg-ink text-white" : "bg-white"
              }`}
            >
              Visual {v}
            </button>
          ))}
        </div>
        <div className="mb-4 rounded-2xl bg-white p-3">
          <p className="mb-2 text-sm font-medium">
            Mechanical operation of CBs — open, close, reset, push-to-test (tap to cycle)
          </p>
          <div className="grid grid-cols-8 gap-1.5">
            {mechanical.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const next = [...mechanical];
                  next[i] = v === "" ? "pass" : v === "pass" ? "fail" : "";
                  onChange(readings, visual, sign, next);
                }}
                className={`aspect-square rounded-lg text-[10px] font-bold ${
                  v === "pass"
                    ? "bg-emerald-600 text-white"
                    : v === "fail"
                      ? "bg-red-600 text-white"
                      : "bg-zinc-100 text-neutral-500"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
        <IrPassFail
          readings={readings}
          onChange={(next) => onChange(next, visual, sign, mechanical)}
        />
        <input
          value={sign}
          onChange={(e) => onChange(readings, visual, e.target.value, mechanical)}
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
