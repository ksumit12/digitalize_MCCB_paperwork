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
                {phase === "testing" ? (boardDone ? "IR" : "test") : frame.manufacturer ? "mfr" : "pick"}
              </span>
            </button>
            <div className="grid flex-1 grid-cols-8 gap-1.5">
              {cbsds.breakerPositions.map((b) => {
                const used = isUsed(b);
                const done = serialsComplete(b);
                const tested = meggerComplete(frame.electricalTesting.perBreakerTest[label][b.position - 1]);
                const tasksDone =
                  b.mccbInstalled &&
                  b.flexibarCapsRemoved &&
                  b.whipTerminated &&
                  b.torqueLineSideConfirmed &&
                  b.torqueLoadSideConfirmed &&
                  b.micrologicSettingConfirmed;
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
                    {used ? (
                      <span className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                        <i
                          title={b.micrologicSettingConfirmed ? "Micrologic set" : "Micrologic not set"}
                          className={`h-1.5 w-1.5 rounded-full ${
                            b.micrologicSettingConfirmed ? "bg-emerald-400" : "bg-red-500"
                          }`}
                        />
                        {tasksDone ? <i className="h-1.5 w-1.5 rounded-full bg-amber-400" /> : null}
                      </span>
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
        <span className="flex items-center gap-1">
          <i className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Micrologic set
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> Micrologic not set
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" /> tasks done
        </span>
        <span>✓ megger done (testing)</span>
      </div>
    </div>
  );
}
