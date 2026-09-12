"use client";

import type { Cbsds, CbsdsLabel, Frame, Manufacturer } from "@/lib/types";

const OPTIONS: Exclude<Manufacturer, "">[] = ["RN Baker", "SMBE"];

const TASKS: { key: keyof Pick<Cbsds, "mountingBoltsTight" | "glandPlatesAndGlandsInstalled" | "mccbsSelectedPerShopDrawing">; label: string }[] = [
  { key: "mountingBoltsTight", label: "CBSDS mounting bolts tight" },
  { key: "glandPlatesAndGlandsInstalled", label: "Gland plates and glands per Shop Drawing" },
  { key: "mccbsSelectedPerShopDrawing", label: "MCCB's selected per Shop Drawing" },
];

export function SwitchboardInstall({
  label,
  frame,
  onManufacturer,
  onSerial,
  onCbsds,
  onClose,
}: {
  label: CbsdsLabel;
  frame: Frame;
  onManufacturer: (value: Exclude<Manufacturer, "">) => void;
  onSerial: (value: string) => void;
  onCbsds: (patch: Partial<Cbsds>) => void;
  onClose: () => void;
}) {
  const locked = Boolean(frame.manufacturer);
  const cbsds = frame.cbsds.find((c) => c.label === label)!;

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
        <h2 className="text-2xl font-semibold">Checks</h2>
        <div className="space-y-2">
          {TASKS.map((t) => {
            const done = !!cbsds[t.key];
            return (
              <div key={t.key} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
                <p className="flex-1 text-sm leading-snug">{t.label}</p>
                <button
                  type="button"
                  onClick={() => onCbsds({ [t.key]: !done } as Partial<Cbsds>)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                    done ? "bg-ink text-white" : "bg-zinc-100"
                  }`}
                >
                  {done ? "Done ✓" : "Tick"}
                </button>
              </div>
            );
          })}
        </div>
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
