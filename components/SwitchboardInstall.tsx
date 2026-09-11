"use client";

import type { CbsdsLabel, Frame, Manufacturer } from "@/lib/types";

const OPTIONS: Exclude<Manufacturer, "">[] = ["RN Baker", "SMBE"];

export function SwitchboardInstall({
  label,
  frame,
  onManufacturer,
  onSerial,
  onClose,
}: {
  label: CbsdsLabel;
  frame: Frame;
  onManufacturer: (value: Exclude<Manufacturer, "">) => void;
  onSerial: (value: string) => void;
  onClose: () => void;
}) {
  const locked = Boolean(frame.manufacturer);
  const cbsds = frame.cbsds.find((c) => c.label === label)!;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-600">
          Map
        </button>
        <p className="text-lg font-bold">Board {label}</p>
        <span className="w-8" />
      </header>
      <div className="flex-1 space-y-4 overflow-auto px-4 pb-8">
        <h2 className="text-2xl font-semibold">Manufacturer</h2>
        {locked ? (
          <div className="rounded-2xl bg-white px-4 py-5 text-center text-xl font-semibold">
            {frame.manufacturer}
          </div>
        ) : (
          <div className="space-y-3">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onManufacturer(opt)}
                className="flex h-20 w-full items-center justify-center rounded-2xl bg-ink text-2xl font-bold text-white"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
        <label className="block space-y-2">
          <span className="text-sm font-medium">Switchboard {label} serial</span>
          <input
            value={cbsds.cbsdsSerialNumber}
            onChange={(e) => onSerial(e.target.value)}
            className="w-full rounded-2xl border border-rule bg-white px-4 py-4 text-lg"
            placeholder="CBSDS serial"
          />
        </label>
        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-ink py-4 text-white">
          Done
        </button>
      </div>
    </div>
  );
}
