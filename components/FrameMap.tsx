"use client";

import {
  AMP_COLORS,
  isUsed,
  meggerComplete,
  serialsComplete,
  slotId,
} from "@/lib/breaker";
import type { CbsdsLabel, Frame, FramePhase } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

export function FrameMap({
  frame,
  phase,
  onSlot,
  onBoard,
}: {
  frame: Frame;
  phase: FramePhase;
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
          <div key={label} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => onBoard(label)}
              className={`flex h-[4.5rem] w-11 shrink-0 flex-col items-center justify-center rounded-xl text-lg font-bold ${
                boardDone ? "bg-emerald-600 text-white" : "bg-ink text-white"
              }`}
            >
              {label}
              <span className="text-[9px] font-normal leading-tight">
                {phase === "testing" ? (boardDone ? "IR" : "test") : frame.manufacturer ? "mfr" : "pick"}
              </span>
            </button>
            <div className="grid flex-1 grid-cols-8 gap-x-1.5 gap-y-0">
              {cbsds.breakerPositions.map((b) => {
                const used = isUsed(b);
                const done = serialsComplete(b);
                const tested = meggerComplete(frame.electricalTesting.perBreakerTest[label][b.position - 1]);
                const amps = b.micrologicSettingAmps;
                const colors = amps ? AMP_COLORS[amps] : null;
                return (
                  <div key={slotId(label, b.position)} className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => onSlot(label, b.position)}
                      className={[
                        "relative aspect-square w-full rounded-lg text-[11px] font-semibold",
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
                    <span className="flex h-3 items-center justify-center">
                      {used ? (
                        <span
                          className={`h-2 w-2 rounded-full ${
                            b.micrologicSettingConfirmed ? "bg-emerald-500" : "bg-red-500"
                          }`}
                        />
                      ) : null}
                    </span>
                  </div>
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
        <span>✓ megger done (testing)</span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full bg-red-500" /> Micrologic not set
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Micrologic set
        </span>
      </div>
    </div>
  );
}
