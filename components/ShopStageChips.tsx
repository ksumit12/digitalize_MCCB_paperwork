"use client";

import { canTapStage, effectiveStage, SHOP_STAGES, stageChipLabel } from "@/lib/shopStage";
import type { Frame, ShopStage } from "@/lib/types";

export function ShopStageChips({
  frame,
  onPick,
}: {
  frame: Frame;
  onPick: (stage: ShopStage) => void;
}) {
  const shop = effectiveStage(frame);
  return (
    <div className="flex flex-wrap gap-1.5">
      {SHOP_STAGES.filter((s) => s !== "submitted").map((stage) => {
        const tap = canTapStage(frame, stage);
        const on = shop === stage;
        return (
          <button
            key={stage}
            type="button"
            disabled={!tap}
            onClick={() => {
              if (!tap) return;
              onPick(stage);
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium ${
              on ? "bg-ink text-white" : tap ? "bg-white ring-1 ring-rule" : "bg-zinc-100 text-zinc-400"
            }`}
          >
            {stageChipLabel(stage)}
          </button>
        );
      })}
    </div>
  );
}
