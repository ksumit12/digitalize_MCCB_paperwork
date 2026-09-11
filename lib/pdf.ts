import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isUsed } from "./breaker";
import { IR_ROWS, POLARITY_ROWS } from "./ir";
import { frameStatus, statusLabel } from "./status";
import type { BreakerPosition, Cbsds, CbsdsLabel, ChecklistItem, Frame } from "./types";

const ink = rgb(0.07, 0.09, 0.12);
const rule = rgb(0.55, 0.55, 0.55);
const light = rgb(0.92, 0.92, 0.92);

function yn(v: boolean): string {
  return v ? "Yes" : "";
}

function tick(item: ChecklistItem): string {
  return `${item.ticked ? "[x]" : "[ ]"}  ${item.installerSign}`.trim();
}

function breakerLine(b: BreakerPosition): string {
  const shunt =
    b.micrologicSettingAmps === 32
      ? "—"
      : b.shuntTripBatchNumber || "";
  return `${b.position}: MCCB ${b.mccbSerialNumber || "—"}  ML ${b.microLogicSerialNumber || "—"}  ST ${shunt}  ${b.micrologicSettingAmps || "—"}A  L${b.torqueLineSideConfirmed ? "x" : " "} ${b.torqueLineSideNm}Nm  Ld${b.torqueLoadSideConfirmed ? "x" : " "} ${b.torqueLoadSideNm}Nm`;
}

class Writer {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  size: number;
  margin: number;
  width: number;
  height: number;

  constructor(page: PDFPage, font: PDFFont, bold: PDFFont) {
    this.page = page;
    this.font = font;
    this.bold = bold;
    this.size = 8;
    this.margin = 28;
    const { width, height } = page.getSize();
    this.width = width;
    this.height = height;
    this.y = height - 28;
  }

  title(text: string) {
    this.page.drawText(text, {
      x: this.margin,
      y: this.y,
      size: 13,
      font: this.bold,
      color: ink,
    });
    this.y -= 16;
  }

  line(text: string, bold = false) {
    const font = bold ? this.bold : this.font;
    const max = this.width - this.margin * 2;
    const words = text.split(" ");
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, this.size) > max) {
        if (current) this.draw(current, font);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) this.draw(current, font);
  }

  draw(text: string, font: PDFFont) {
    if (this.y < 36) return;
    this.page.drawText(text.slice(0, 220), {
      x: this.margin,
      y: this.y,
      size: this.size,
      font,
      color: ink,
    });
    this.y -= 11;
  }

  gap() {
    this.y -= 6;
  }

  rule() {
    this.page.drawLine({
      start: { x: this.margin, y: this.y + 4 },
      end: { x: this.width - this.margin, y: this.y + 4 },
      thickness: 0.6,
      color: rule,
    });
    this.y -= 8;
  }
}

function headerBlock(w: Writer, frame: Frame) {
  w.line(
    `String: ${frame.stringId || "—"}    Installer: ${frame.installerName || "—"} (${frame.installerInitials || "—"})`,
  );
  w.line(
    `Shepherd Frame ID: ${frame.shepherdFrameId || "—"}    ACTSW Frame ID: ${frame.actswFrameId || "—"}    Market: ${frame.market || "—"}`,
  );
  w.line(
    `Module Frame Serial: ${frame.moduleFrameSerialNumber || "—"}    Status: ${statusLabel(frameStatus(frame))}`,
  );
  w.line(
    `Start: ${frame.startDate} ${frame.startTime}    Finish: ${frame.finishDate || "—"} ${frame.finishTime || ""}`.trim(),
  );
  w.gap();
}

function cbsdsBlock(w: Writer, cbsds: Cbsds) {
  w.line(`Install CBSDS ${cbsds.label} per Shop Drawing`, true);
  w.line(
    `Mounting bolts tight: ${yn(cbsds.mountingBoltsTight)}    Serial: ${cbsds.cbsdsSerialNumber || "—"}    Mfr: ${cbsds.manufacturer || "—"}`,
  );
  w.line(
    `Gland plates & glands: ${yn(cbsds.glandPlatesAndGlandsInstalled)}    MCCBs selected per drawing (trip unit & ML pre-installed): ${yn(cbsds.mccbsSelectedPerShopDrawing)}`,
  );
  for (const b of cbsds.breakerPositions) {
    if (!isUsed(b)) continue;
    w.line(breakerLine(b));
    w.line(
      `    Installed ${b.mccbInstalled ? "[x]" : "[ ]"}  Flexibar caps ${b.flexibarCapsRemoved ? "[x]" : "[ ]"}  Whip terminated ${b.whipTerminated ? "[x]" : "[ ]"}  ML set ${b.micrologicSettingConfirmed ? "[x]" : "[ ]"}`,
    );
  }
  w.gap();
}

export async function buildFramePdf(frame: Frame): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const p1 = doc.addPage([842, 595]);
  const w1 = new Writer(p1, font, bold);
  w1.title("Module Frame — Install Checklist & CBSDS A / B");
  headerBlock(w1, frame);
  w1.line("Install checklist", true);
  w1.line(`Install Vertical Cable Ladders  ${tick(frame.installChecklist.verticalCableLadders)}`);
  w1.line(
    `Install Horizontal Unistrut Whip Support  ${tick(frame.installChecklist.horizontalUnistrutWhipSupport)}`,
  );
  w1.line(`Install Earth Bar Angle Brackets  ${tick(frame.installChecklist.earthBarAngleBrackets)}`);
  w1.line(`Install CBSDS Supports  ${tick(frame.installChecklist.cbsdsSupports)}`);
  w1.line(`Install C&E Air Sampling Conduit  ${tick(frame.installChecklist.cAndEAirSamplingConduit)}`);
  w1.line(`Install Whip's per Shop Drawing  ${tick(frame.installChecklist.whipsPerShopDrawing)}`);
  w1.rule();
  cbsdsBlock(w1, frame.cbsds[0]);
  cbsdsBlock(w1, frame.cbsds[1]);

  const p2 = doc.addPage([842, 595]);
  const w2 = new Writer(p2, font, bold);
  w2.title("CBSDS C / D & Ancillary Circuits");
  headerBlock(w2, frame);
  cbsdsBlock(w2, frame.cbsds[2]);
  cbsdsBlock(w2, frame.cbsds[3]);
  w2.rule();
  w2.line("Ancillary circuits", true);
  const a = frame.ancillaryCircuits;
  w2.line(`Install combined lighting/power circuit  ${tick(a.combinedLightingPowerCircuit)}`);
  w2.line(`Install HMCU-A Sub single phase circuit  ${tick(a.hmcuASub)}`);
  w2.line(`Install HMCU-B Sub single phase circuit  ${tick(a.hmcuBSub)}`);
  w2.line(`Install HACU three phase circuit (if Drawing req)  ${tick(a.hacuThreePhase)}`);
  w2.line(`Install HMBNP single phase circuit (if Drawing req)  ${tick(a.hmbnpSinglePhase)}`);
  w2.line(
    `Install Firmus Data Rack single phase circuit (if Drawing req)  ${tick(a.firmusDataRackSinglePhase)}`,
  );
  w2.line(`Install BMS Control Panel circuit (if Drawing req)  ${tick(a.bmsControlPanelCircuit)}`);
  w2.line(
    `Install 1 pair shielded 1.5mm cables from HMCU looped through CBSDS for Shunt Trip. Qty: ${a.shieldedPairCables.qty || "—"}  ${tick(a.shieldedPairCables)}`,
  );
  w2.line(`Install MCB's/RCD's into DB Chassis per Shop Drawing  ${tick(a.mcbsRcdsIntoDbChassis)}`);
  w2.line(`Install Din Rail GPO  ${tick(a.dinRailGpo)}`);
  w2.line(`Install Em Light Test Facility (INT Only)  ${tick(a.emLightTestFacility)}`);
  w2.line(
    `MCB Torque Line 2 Nm ${a.mcbTorqueLineSideConfirmed ? "[x]" : "[ ]"}  Load 2 Nm ${a.mcbTorqueLoadSideConfirmed ? "[x]" : "[ ]"}`,
  );
  w2.line(
    `RCBO Torque Line 3.5 Nm ${a.rcboTorqueLineSideConfirmed ? "[x]" : "[ ]"}  Load 2 Nm ${a.rcboTorqueLoadSideConfirmed ? "[x]" : "[ ]"}`,
  );
  w2.line(`Install unused frame holes with caps  ${tick(a.unusedFrameHolesWithCaps)}`);
  w2.line(`Install CB Labels 1-8 per CBSDS  ${tick(a.cbLabels1to8)}`);
  w2.line(`Install Bungs into unused holes in glandplates  ${tick(a.bungsUnusedGlandplateHoles)}`);
  w2.line(`Install Bungs into cable path holes in frames  ${tick(a.bungsCablePathHoles)}`);

  const p3 = doc.addPage([842, 595]);
  const w3 = new Writer(p3, font, bold);
  w3.title("Electrical Testing");
  w3.line(
    `Shepherd Frame ID: ${frame.shepherdFrameId || "—"}    ACTSW Frame ID: ${frame.actswFrameId || "—"}`,
  );
  const vis = frame.electricalTesting.visualInspection;
  w3.line(
    `Visual Inspection P/F   A: ${vis.A || "—"}  B: ${vis.B || "—"}  C: ${vis.C || "—"}  D: ${vis.D || "—"}`,
  );
  w3.line("IR Test — All MCCBs OFF and FCL fuses pulled (MΩ)", true);
  w3.line(`Sign: ${frame.electricalTesting.frameIrSign || "—"}`);
  for (const row of IR_ROWS) {
    const vals = (["A", "B", "C", "D"] as CbsdsLabel[])
      .map((l) => `${l}:${frame.electricalTesting.perCbsdsIr[l].readings[row.key] || "—"}`)
      .join("  ");
    w3.line(`${row.label}  ${vals}`);
  }
  w3.gap();
  w3.line("Per-whip IR + polarity (each MCCB ON, one at a time)", true);
  for (const label of ["A", "B", "C", "D"] as CbsdsLabel[]) {
    w3.line(`CBSDS ${label}`, true);
    frame.electricalTesting.perBreakerTest[label].forEach((test, i) => {
      const pos = frame.cbsds.find((c) => c.label === label)?.breakerPositions[i];
      if (!pos || !isUsed(pos)) return;
      const ir = IR_ROWS.map((r) => test.irTest[r.key] || "-").join("/");
      const pol = POLARITY_ROWS.map((r) => test.polarityTest[r.key] || "-").join("/");
      w3.line(
        `${label}${i + 1}  MCCB ${test.mccbSerialNumber || frame.cbsds.find((c) => c.label === label)?.breakerPositions[i].mccbSerialNumber || "—"}  ML ${test.microLogicSerialNumber || frame.cbsds.find((c) => c.label === label)?.breakerPositions[i].microLogicSerialNumber || "—"}  IR ${ir}  Pol ${pol}  Sign ${test.sign || "—"}`,
      );
    });
  }
  const st = frame.electricalTesting.shuntTripLiveTest;
  w3.line("Shunt Trip Live Test", true);
  w3.line(
    `Stack 1&2: ${st.breakerStack1and2 || "—"}  3&4: ${st.breakerStack3and4 || "—"}  5&6: ${st.breakerStack5and6 || "—"}  7&8: ${st.breakerStack7and8 || "—"}`,
  );

  const p4 = doc.addPage([595, 842]);
  const w4 = new Writer(p4, font, bold);
  w4.title("Frame Handover Sheet");
  w4.line(`Shepherd Frame ID: ${frame.shepherdFrameId || "—"}`);
  w4.line(`ACTSW Frame ID: ${frame.actswFrameId || "—"}`);
  w4.line(`Date: ${frame.handover.date || "—"}    Time: ${frame.handover.time || "—"}`);
  w4.gap();
  w4.line(`Shepherd Name: ${frame.handover.shepherdName || "—"}`);
  w4.line(`Shepherd Sign: ${frame.handover.shepherdSign || "—"}`);
  w4.line(`Benmax Name: ${frame.handover.benmaxName || "—"}`);
  w4.line(`Benmax Sign: ${frame.handover.benmaxSign || "—"}`);
  w4.gap();
  w4.line(
    `All Install Checklist items completed and initialled  ${frame.handover.installChecklistComplete ? "[x]" : "[ ]"}`,
  );
  w4.line(
    `All Electrical testing items completed and initialled  ${frame.handover.electricalTestingComplete ? "[x]" : "[ ]"}`,
  );

  p4.drawRectangle({
    x: 28,
    y: 40,
    width: 539,
    height: 18,
    color: light,
  });

  return doc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printPdfBytes(bytes: Uint8Array) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("load", () => {
      win.print();
    });
  }
}
