import type { IrReadings } from "./types";

export const IR_ROWS: { key: keyof IrReadings; label: string }[] = [
  { key: "l1ToEarth", label: "L1 to Earth @ 500 VDC" },
  { key: "l2ToEarth", label: "L2 to Earth @ 500 VDC" },
  { key: "l3ToEarth", label: "L3 to Earth @ 500 VDC" },
  { key: "nToEarth", label: "N to Earth @ 500 VDC" },
  { key: "l1ToNeutral", label: "L1 to Neutral @ 500 VDC" },
  { key: "l2ToNeutral", label: "L2 to Neutral @ 500 VDC" },
  { key: "l3ToNeutral", label: "L3 to Neutral @ 500 VDC" },
  { key: "l1ToL2", label: "L1 to L2 @ 1000 VDC" },
  { key: "l1ToL3", label: "L1 to L3 @ 1000 VDC" },
  { key: "l2ToL3", label: "L2 to L3 @ 1000 VDC" },
];

export const POLARITY_ROWS = [
  { key: "l1ToEarth" as const, label: "L1 to Earth Pass/Fail" },
  { key: "l2ToEarth" as const, label: "L2 to Earth Pass/Fail" },
  { key: "l3ToEarth" as const, label: "L3 to Earth Pass/Fail" },
  { key: "nToEarth" as const, label: "N to Earth Pass/Fail" },
];

export function emptyIr(): IrReadings {
  return {
    l1ToEarth: "",
    l2ToEarth: "",
    l3ToEarth: "",
    nToEarth: "",
    l1ToNeutral: "",
    l2ToNeutral: "",
    l3ToNeutral: "",
    l1ToL2: "",
    l1ToL3: "",
    l2ToL3: "",
  };
}

export function irHasValue(ir: IrReadings): boolean {
  return Object.values(ir).some((v) => v.trim() !== "");
}

/** Screen stores pass/fail; paperwork prints >500mohm on pass. */
export function irForPdf(value: string): string {
  const t = value.trim().toLowerCase();
  if (!t) return "";
  if (t === "pass" || t === "p" || t === "yes") return ">500mohm";
  if (t === "fail" || t === "f") return "FAIL";
  return value.trim();
}

export function fillIr(value: "pass" | "fail"): IrReadings {
  return {
    l1ToEarth: value,
    l2ToEarth: value,
    l3ToEarth: value,
    nToEarth: value,
    l1ToNeutral: value,
    l2ToNeutral: value,
    l3ToNeutral: value,
    l1ToL2: value,
    l1ToL3: value,
    l2ToL3: value,
  };
}
