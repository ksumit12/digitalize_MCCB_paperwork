"use client";

import {
  AMP_COLORS,
  isUsed,
  meggerComplete,
  serialsComplete,
  slotId,
} from "@/lib/breaker";
import type { CbsdsLabel, Frame } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

export function FrameMap({
  frame,
  onSlot,
  onBoard,
}: {
  frame: Frame;
  onSlot: (label: CbsdsLabel, position: number) => void;
  onBoard: (label: CbsdsLabel) => void;
}) {
  return (
    <div className="space-y-3">
      {LABELS.map((label) => {
        const cbsds = frame.cbsds.find((c) => c.label === label)!;
        const boardDone = meggerComplete({
          irTest: frame.electricalTesting.perCbsdsIr[label].readings,
          polarityTest: { l1ToEarth: "", l2ToEarth: "", l3ToEarth: "", nToEarth: "" },
          sign: "",
          mccbSerialNumber: "",
          microLogicSerialNumber: "",
        });
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onBoard(label)}
              className={`flex h-[4.5rem] w-11 shrink-0 flex-col items-center justify-center rounded-xl text-lg font-bold ${
                boardDone ? "bg-emerald-600 text-white" : "bg-ink text-white"
              }`}
            >
              {label}
              <span className="text-[9px] font-normal leading-tight">
                {boardDone ? "IR" : "board"}
              </span>
            </button>
            <div className="grid flex-1 grid-cols-8 gap-1.5">
              {cbsds.breakerPositions.map((b) => {
                const used = isUsed(b);
                const done = serialsComplete(b);
                const tested = meggerComplete(frame.electricalTesting.perBreakerTest[label][b.position - 1]);
                const amps = b.micrologicSettingAmps;
                const colors = amps ? AMP_COLORS[amps] : null;
                return (
                  <button
                    key={slotId(label, b.position)}
                    type="button"
                    onClick={() => onSlot(label, b.position)}
                    className={[
                      "relative aspect-square rounded-lg text-[11px] font-semibold",
                      !used && "bg-zinc-200 text-zinc-400",
                      used && !done && colors && `bg-white ring-2 ${colors.ring} ${colors.label}`,
                      used && done && colors && `${colors.fill} text-white`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {label}
                    {b.position}
                    {tested ? (
                      <span className="absolute right-0.5 top-0.5 text-[9px] leading-none">✓</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 px-1 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-zinc-200" /> empty
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-sky-500" /> 32A
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-orange-500" /> 63A
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 rounded bg-violet-500" /> 100A
        </span>
        <span>✓ megger done</span>
      </div>
    </div>
  );
}
