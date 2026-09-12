import { isUsed } from "./breaker";
import type { Frame, ShopStage } from "./types";

export const SHOP_STAGES = [
  "steel",
  "ladders",
  "cable",
  "boards",
  "bolts",
  "glands",
  "earth",
  "breakers",
  "mount",
  "whips",
  "torque",
  "testing",
  "submitted",
] as const satisfies readonly ShopStage[];

export const TAP_STAGES: ShopStage[] = [
  "steel",
  "ladders",
  "cable",
  "boards",
  "bolts",
  "glands",
  "earth",
  "mount",
  "whips",
  "torque",
];

const ORDER: ShopStage[] = ["", ...SHOP_STAGES];

const PERCENT: Record<Exclude<ShopStage, "">, number> = {
  steel: 8,
  ladders: 16,
  cable: 24,
  boards: 35,
  bolts: 45,
  glands: 55,
  earth: 62,
  breakers: 70,
  mount: 78,
  whips: 85,
  torque: 90,
  testing: 95,
  submitted: 100,
};

const SHORT: Record<Exclude<ShopStage, "">, string> = {
  steel: "Steel",
  ladders: "Ladders",
  cable: "Cable",
  boards: "Boards",
  bolts: "Bolts",
  glands: "Glands",
  breakers: "Serials",
  earth: "E/N",
  mount: "MCCB",
  whips: "Whips",
  torque: "Torque",
  testing: "Test",
  submitted: "Done",
};

function rank(stage: ShopStage): number {
  const i = ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

function higher(a: ShopStage, b: ShopStage): ShopStage {
  return rank(a) >= rank(b) ? a : b;
}

function hasAnySerial(frame: Frame): boolean {
  return frame.cbsds.some((c) =>
    c.breakerPositions.some(
      (b) => b.mccbSerialNumber.trim() !== "" || b.microLogicSerialNumber.trim() !== "",
    ),
  );
}

function torqueDone(frame: Frame): boolean {
  const used = frame.cbsds.flatMap((c) => c.breakerPositions).filter(isUsed);
  if (!used.length) return false;
  return used.every((b) => b.torqueLineSideConfirmed && b.torqueLoadSideConfirmed);
}

const NEEDS_SERIAL: ShopStage[] = ["mount", "whips", "torque"];

function autoFloor(frame: Frame): ShopStage {
  if (frame.submitted) return "submitted";
  if (frame.phase === "testing") return "testing";
  if (torqueDone(frame) && hasAnySerial(frame)) return "torque";
  if (hasAnySerial(frame)) return "breakers";
  return "";
}

export function effectiveStage(frame: Frame): ShopStage {
  const floor = autoFloor(frame);
  const tapped = frame.shopStage || "";
  const serialsIn = hasAnySerial(frame);
  const illegal = NEEDS_SERIAL.includes(tapped) && !serialsIn;
  const legalTap = !tapped || illegal ? "" : tapped;
  return higher(legalTap, floor);
}

export function stagePercent(frame: Frame): number {
  const stage = effectiveStage(frame);
  if (!stage) return 0;
  return PERCENT[stage];
}

export function stageShortLabel(frame: Frame): string {
  const stage = effectiveStage(frame);
  return stage ? SHORT[stage] : "";
}

export function stageChipLabel(stage: Exclude<ShopStage, "">): string {
  return SHORT[stage];
}

export function canTapStage(frame: Frame, stage: ShopStage): boolean {
  if (frame.submitted) return false;
  if (!TAP_STAGES.includes(stage)) return false;
  const floor = autoFloor(frame);
  if (floor === "testing" || floor === "submitted") return false;
  if (NEEDS_SERIAL.includes(stage) && !hasAnySerial(frame)) return false;
  if (stage === "earth") return rank(floor) < rank("mount");
  return rank(stage) >= rank(floor);
}

export function canTapAnyStage(frame: Frame): boolean {
  return TAP_STAGES.some((stage) => canTapStage(frame, stage));
}
