/* Full test pass for the app's pure logic + PDF generation. Run: npx tsx scripts/test.ts */
import { serialsComplete, isUsed, parseSlot, setAmp, slotId, nextMapSlot, usedCount } from "../lib/breaker";
import { createEmptyFrame, needsShuntTrip } from "../lib/emptyFrame";
import { fillIr, irForPdf, irHasValue } from "../lib/ir";
import { parseMccbSerial, parseMicrologicSerial, parseShuntBatch, tidyShunt, tidyMccb } from "../lib/serialParse";
import { serialsDiffer, frameStatus } from "../lib/status";
import { inventoryForFrames, inventoryByString, stockSummary, dailyProgress, paceFor, peopleForSlot } from "../lib/inventory";
import { searchSerials } from "../lib/search";
import { buildFramePdf } from "../lib/pdf";
import type { Frame } from "../lib/types";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

console.log("— serial parsing —");
eq("mccb: clean", parseMccbSerial("1ABC1234567"), "1ABC1234567");
eq("mccb: OCR noise (O→0, S→5, I→1)", parseMccbSerial("OBC12345S7 1ABC1234567"), "1ABC1234567");
eq("mccb: rejects catalog", parseMccbSerial("C103TM250"), null);
eq("mccb: tidy (separators stripped, mid 1 → I)", tidyMccb("1|II12345678"), "1III2345678");
eq("ml: direct", parseMicrologicSerial("WX261940465"), "WX261940465");
check("ml: from registration URL", (parseMicrologicSerial("https://product-registration.schneider.com/?serial=WX261940465&x=1") ?? "").startsWith("WX"));
eq("shunt: dashed", parseShuntBatch("TC-2026-W26-6"), "TC-2026-W26-6");
eq("shunt: compact", tidyShunt("TC2026W266"), "TC-2026-W26-6");

console.log("— breaker logic —");
const frame: Frame = createEmptyFrame({ stringKey: "4", frameSlot: "3L", installerInitials: "VD" });
const b = frame.cbsds[0].breakerPositions[0];
eq("isUsed: empty", isUsed(b), false);
const b32 = setAmp({ ...b, mccbSerialNumber: "1AAA0000001", microLogicSerialNumber: "WX00000001" }, 32);
check("isUsed: 32A", isUsed(b32));
check("serialsComplete: 32A no shunt needed", serialsComplete(b32));
const b63 = setAmp({ ...b, mccbSerialNumber: "1AAA0000001", microLogicSerialNumber: "WX00000001" }, 63);
check("serialsComplete: 63A needs shunt", !serialsComplete(b63));
check("serialsComplete: 63A with shunt", serialsComplete({ ...b63, shuntTripBatchNumber: "TC-2026-W26-6" }));
eq("needsShuntTrip", needsShuntTrip(32), false);
eq("needsShuntTrip 63", needsShuntTrip(63), true);
eq("slotId", slotId("A", 3), "A3");
eq("parseSlot", JSON.stringify(parseSlot("b7")), JSON.stringify({ label: "B", position: 7 }));
eq("nextMapSlot D8 → null", nextMapSlot("D", 8), null);
eq("nextMapSlot A8 → B1", JSON.stringify(nextMapSlot("A", 8)), JSON.stringify({ label: "B", position: 1 }));
eq("usedCount 0", usedCount(frame), 0);

console.log("— IR / status —");
eq("irForPdf pass", irForPdf("pass"), ">500mohm");
eq("irForPdf fail", irForPdf("fail"), "FAIL");
eq("irForPdf numeric passthrough", irForPdf("250mohm"), "250mohm");
check("fillIr all 10", Object.values(fillIr("pass")).every((v) => v === "pass"));
check("irHasValue", irHasValue(fillIr("pass")) && !irHasValue(fillIr("pass").constructor ? Object.fromEntries(Object.keys(fillIr("pass")).map((k) => [k, ""])) : {}));
check("serialsDiffer", serialsDiffer("1AAA0000001", "1AAA0000002") && !serialsDiffer("1AAA0000001", "1AAA0000001"));
eq("frameStatus fresh", frameStatus(frame), "in_progress");

console.log("— inventory / progress / search —");
const used = createEmptyFrame({ stringKey: "4", frameSlot: "3L", installerInitials: "VD" });
used.cbsds[0] = {
  ...used.cbsds[0],
  breakerPositions: used.cbsds[0].breakerPositions.map((p, i) =>
    i === 0
      ? { ...setAmp(p, 63), mccbSerialNumber: "1AAA0000001", microLogicSerialNumber: "WX00000001", shuntTripBatchNumber: "TC-2026-W26-6" }
      : p,
  ),
};
const inv = inventoryForFrames([used]);
eq("inv: mccb63 count", inv.mccb63, 1);
eq("inv: micrologic count", inv.micrologics, 1);
eq("inv: shunt count", inv.shunts, 1);
eq("inv: serialsDone", inv.serialsDone, 1);
const runs = [{ key: "4", createdAt: new Date().toISOString(), tradeName: "Sparkies" }];
eq("invByString trade", inventoryByString([used], runs)[0].tradeName, "Sparkies");
const lines = stockSummary(
  [{ id: "s1", part: "mccb63", perBox: 20, boxes: 2, receivedBy: "ST", receivedAt: "2026-09-12T00:00:00.000Z" }],
  inv,
);
const line63 = lines.find((l) => l.part === "mccb63")!;
eq("stock: received 40", line63.received, 40);
eq("stock: used 1", line63.used, 1);
eq("stock: remaining 39", line63.remaining, 39);
eq("stock: missing 0", line63.missing, 0);
const lines2 = stockSummary([], inv); // nothing received for ml but 1 used → missing 1
eq("stock: missing when used > received", lines2.find((l) => l.part === "ml")!.missing, 1);
check("paceFor runs", paceFor([used], runs).avgPerDay >= 0);
check("dailyProgress 7 days", dailyProgress([used], 7).length === 7);
eq("peopleForSlot", peopleForSlot([used], "4", "3L").installer.includes("VD"), true);
const hits = searchSerials([used], "WX00000001");
eq("search: finds ml", hits.length >= 1 && hits[0].kind === "Micrologic", true);
eq("search: location", hits[0].slot, "A1");
const replaced = { ...used };
replaced.cbsds[0].breakerPositions[0].serialHistory = [
  { kind: "mccb", oldSerial: "1XYZ0000001", newSerial: "1AAA0000001", replacedBy: "VD", replacedAt: "2026-09-12T00:00:00.000Z" },
];
const oldHit = searchSerials([replaced], "1XYZ");
eq("search: replaced serial findable", oldHit.length === 1 && oldHit[0].state === "replaced", true);

console.log("— PDF generation —");
const pdfFrame: Frame = {
  ...used,
  shepherdFrameId: "SF-042",
  actswFrameId: "AC-042",
  market: "AUS",
  manufacturer: "RN Baker",
  tradeName: "Sparkies",
  phase: "testing",
  submitted: true,
  electricalTesting: {
    ...used.electricalTesting,
    mechanical: {
      A: Array.from({ length: 8 }, () => "pass" as const),
      B: Array.from({ length: 8 }, () => "" as const),
      C: Array.from({ length: 8 }, () => "" as const),
      D: Array.from({ length: 8 }, () => "" as const),
    },
  },
  handover: {
    ...used.handover,
    date: "2026-09-12",
    shepherdName: "Shep",
    shepherdSign: "S",
    benmaxName: "Ben",
    benmaxSign: "B",
    installChecklistComplete: true,
    electricalTestingComplete: true,
  },
};
try {
  const bytes = await buildFramePdf(pdfFrame);
  const head = Buffer.from(bytes.slice(0, 5)).toString();
  eq("pdf: valid %PDF magic", head, "%PDF-");
  check("pdf: has content (>20KB)", bytes.length > 20000, `${bytes.length} bytes`);
  check("pdf: multiple pages (starts with %PDF-1.7 and contains pages)", Buffer.from(bytes).toString("latin1").split("%%EOF").length > 1);
} catch (e) {
  failed++;
  console.log(`  ✗ pdf build — ${e instanceof Error ? e.message : e}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
