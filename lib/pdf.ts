import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { IR_ROWS, POLARITY_ROWS } from "./ir";
import { frameStatus, statusLabel } from "./status";
import type { BreakerPosition, Cbsds, CbsdsLabel, ChecklistItem, Frame } from "./types";

/*
 * FIXED-FORM PDF RENDERER
 *
 * This replaces the old flowing Writer/table renderer.
 *
 * The paperwork is a fixed A4 portrait form:
 *   - fixed X/Y coordinates
 *   - fixed row heights
 *   - fixed Task / Tick Box / Installer Sign columns
 *   - no automatic pagination
 *   - one physical form section per PDF page
 *
 * IMPORTANT:
 * If the printed master form changes by even a few millimetres, adjust the
 * constants below rather than changing the data/model code.
 */

const A4: [number, number] = [595.28, 841.89];

const ink = rgb(0.07, 0.09, 0.12);
const grid = rgb(0.20, 0.20, 0.20);
const black = rgb(0, 0, 0);
const white = rgb(1, 1, 1);
const light = rgb(0.92, 0.92, 0.92);

/*
 * The original sheet has a narrow outside margin and a large ruled grid.
 * These values deliberately use fixed geometry rather than PDF text flow.
 */
const LEFT = 35;
const RIGHT = 35;
const TOP = 35;
const BOTTOM = 35;

const FORM_W = A4[0] - LEFT - RIGHT;
const FORM_R = A4[0] - RIGHT;

const TASK_W = 365;
const TICK_W = 55;
const SIGN_W = FORM_W - TASK_W - TICK_W;

const ROW_H = 17;
const SMALL_ROW_H = 15;
const HEADER_ROW_H = 22;

function yn(v: boolean): string {
  return v ? "Yes" : "";
}

function sanitizeForPdf(text: string): string {
  return String(text ?? "")
    .replace(/Ω/g, "ohm")
    .replace(/µ/g, "u")
    .replace(/°/g, "deg")
    .replace(/[^\x00-\xFF]/g, "");
}

function safe(value: unknown, fallback = ""): string {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function ticked(item: ChecklistItem | undefined): boolean {
  return !!item?.ticked;
}

function signOf(item: ChecklistItem | undefined): string {
  return safe(item?.installerSign);
}

function checkMark(done: boolean): string {
  return done ? "X" : "";
}

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): { text: string; size: number } {
  const value = sanitizeForPdf(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) {
    return { text: value, size };
  }

  let s = size;
  while (s > 5.5 && font.widthOfTextAtSize(value, s) > maxWidth) {
    s -= 0.25;
  }

  if (font.widthOfTextAtSize(value, s) <= maxWidth) {
    return { text: value, size: s };
  }

  let out = value;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, s) > maxWidth) {
    out = out.slice(0, -1);
  }

  return { text: `${out}...`, size: s };
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size = 7,
  maxWidth?: number
) {
  const fitted = maxWidth
    ? fitText(text, font, size, maxWidth)
    : { text: sanitizeForPdf(text), size };

  page.drawText(fitted.text, {
    x,
    y,
    size: fitted.size,
    font,
    color: ink,
  });
}

function drawCell(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  font: PDFFont,
  size = 7,
  align: "left" | "center" = "left"
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: grid,
    borderWidth: 0.45,
    color: white,
  });

  const value = sanitizeForPdf(text);
  if (!value) return;

  const fitted = fitText(value, font, size, Math.max(4, width - 7));
  const tw = font.widthOfTextAtSize(fitted.text, fitted.size);

  const tx = align === "center"
    ? x + (width - tw) / 2
    : x + 3;

  const ty = y + (height - fitted.size) / 2 + 1.8;

  page.drawText(fitted.text, {
    x: tx,
    y: ty,
    size: fitted.size,
    font,
    color: ink,
  });
}

function drawTaskRow(
  page: PDFPage,
  y: number,
  task: string,
  done = false,
  sign = "",
  font: PDFFont,
  bold: PDFFont,
  rowHeight = ROW_H
) {
  let x = LEFT;

  drawCell(page, x, y, TASK_W, rowHeight, task, font, 7);
  x += TASK_W;

  // The real form has a dedicated Tick Box column.
  drawCell(page, x, y, TICK_W, rowHeight, checkMark(done), bold, 8.5, "center");
  x += TICK_W;

  drawCell(page, x, y, SIGN_W, rowHeight, sign, font, 7, "center");
}

function drawSectionTitle(
  page: PDFPage,
  y: number,
  title: string,
  font: PDFFont,
  bold: PDFFont
): number {
  page.drawRectangle({
    x: LEFT,
    y: y - 12,
    width: FORM_W,
    height: 12,
    color: black,
  });

  drawText(page, title, LEFT + 4, y - 9.5, bold, 7.2, FORM_W - 8);

  return y - 15;
}

function drawHeader(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
): number {
  /*
   * Header is intentionally compact and fixed.
   * The main body starts at the same Y coordinate on every physical page.
   */
  let y = A4[1] - TOP;

  // Outer header grid.
  const headerH = 108;
  page.drawRectangle({
    x: LEFT,
    y: y - headerH,
    width: FORM_W,
    height: headerH,
    borderColor: grid,
    borderWidth: 0.6,
  });

  const col1 = 205;
  const col2 = 190;
  const col3 = FORM_W - col1 - col2;

  // Horizontal rules.
  for (const dy of [22, 44, 66, 87]) {
    page.drawLine({
      start: { x: LEFT, y: y - dy },
      end: { x: FORM_R, y: y - dy },
      thickness: 0.45,
      color: grid,
    });
  }

  // Vertical rules.
  for (const x of [LEFT + col1, LEFT + col1 + col2]) {
    page.drawLine({
      start: { x, y },
      end: { x, y: y - headerH },
      thickness: 0.45,
      color: grid,
    });
  }

  const row = (topY: number, label: string, value: string, x: number, w: number) => {
    drawText(page, label, x + 3, topY - 14, bold, 6.5);
    drawText(page, value, x + 60, topY - 14, font, 6.8, w - 65);
  };

  row(y, "Start Date:", safe(frame.startDate), LEFT, col1);
  row(y, "Start Time:", safe(frame.startTime), LEFT + col1, col2);

  drawText(page, "INT", LEFT + col1 + col2 + 7, y - 14, bold, 7);
  drawText(page, "AUS", LEFT + col1 + col2 + 7, y - 35, bold, 7);

  row(y - 22, "Finish Date:", safe(frame.finishDate), LEFT, col1);
  row(y - 22, "Finish Time:", safe(frame.finishTime), LEFT + col1, col2);

  row(y - 44, "Module Frame Serial:", safe(frame.moduleFrameSerialNumber), LEFT, col1);
  row(y - 44, "String:", safe(frame.stringId), LEFT + col1, col2);

  row(y - 66, "Shepherd Frame ID:", safe(frame.shepherdFrameId), LEFT, col1);
  row(y - 66, "ACTSW Frame ID:", safe(frame.actswFrameId), LEFT + col1, col2);

  row(y - 87, "Installer:", `${safe(frame.installerName)} ${safe(frame.installerInitials)}`.trim(), LEFT, col1);
  row(y - 87, "Market:", safe(frame.market), LEFT + col1, col2);

  drawText(
    page,
    statusLabel(frameStatus(frame)),
    LEFT + col1 + col2 + 5,
    y - 70,
    bold,
    6.2,
    col3 - 10
  );

  return y - headerH - 8;
}

function drawChecklist(
  page: PDFPage,
  y: number,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
): number {
  y = drawSectionTitle(page, y, "Install checklist", font, bold);

  const rows: Array<[string, ChecklistItem | undefined]> = [
    ["Install Vertical Cable Ladders", frame.installChecklist.verticalCableLadders],
    ["Install Horizontal Unistrut Whip Support", frame.installChecklist.horizontalUnistrutWhipSupport],
    ["Install Earth Bar Angle Brackets", frame.installChecklist.earthBarAngleBrackets],
    ["Install CBSDS Supports", frame.installChecklist.cbsdsSupports],
    ["Install C&E Air Sampling Conduit", frame.installChecklist.cAndEAirSamplingConduit],
    ["Install Whip's per Shop Drawing", frame.installChecklist.whipsPerShopDrawing],
  ];

  for (const [label, item] of rows) {
    drawTaskRow(page, y, label, ticked(item), signOf(item), font, bold);
    y -= ROW_H;
  }

  return y - 4;
}

function sortedPositions(cbsds: Cbsds): BreakerPosition[] {
  return [...cbsds.breakerPositions]
    .sort((a, b) => a.position - b.position)
    .slice(0, 8);
}

function drawNumberedRows(
  page: PDFPage,
  y: number,
  title: string,
  values: string[],
  font: PDFFont,
  bold: PDFFont
): number {
  drawText(page, title, LEFT + 3, y, bold, 7);
  y -= SMALL_ROW_H;

  // Numbered serial rows in the original form are deliberately long and empty.
  for (let i = 0; i < 8; i++) {
    const value = safe(values[i]);
    drawCell(
      page,
      LEFT,
      y,
      TASK_W,
      SMALL_ROW_H,
      `${i + 1}/   ${value}`,
      font,
      7
    );
    drawCell(page, LEFT + TASK_W, y, TICK_W, SMALL_ROW_H, "", font, 7);
    drawCell(
      page,
      LEFT + TASK_W + TICK_W,
      y,
      SIGN_W,
      SMALL_ROW_H,
      "",
      font,
      7
    );
    y -= SMALL_ROW_H;
  }

  return y - 3;
}

function drawCbsdsPage(
  page: PDFPage,
  frame: Frame,
  cbsds: Cbsds,
  font: PDFFont,
  bold: PDFFont,
  includeChecklist: boolean
) {
  let y = drawHeader(page, frame, font, bold);

  if (includeChecklist) {
    y = drawChecklist(page, y, frame, font, bold);
  }

  y = drawSectionTitle(
    page,
    y,
    `Install CBSDS ${cbsds.label} per Shop Drawing`,
    font,
    bold
  );

  drawTaskRow(
    page,
    y,
    "CBSDS Mounting Bolts Tight",
    !!cbsds.mountingBoltsTight,
    "",
    font,
    bold
  );
  y -= ROW_H;

  drawTaskRow(
    page,
    y,
    `CBSDS Serial Number: ${safe(cbsds.cbsdsSerialNumber)}`,
    false,
    "",
    font,
    bold
  );
  y -= ROW_H;

  drawTaskRow(
    page,
    y,
    `CBSDS Manufacturer: ${safe(frame.manufacturer)}`,
    false,
    "",
    font,
    bold
  );
  y -= ROW_H;

  drawTaskRow(
    page,
    y,
    "Install Gland Plates and Glands per Shop Drawing",
    !!cbsds.glandPlatesAndGlandsInstalled,
    "",
    font,
    bold
  );
  y -= ROW_H;

  drawTaskRow(
    page,
    y,
    "Select MCCB's from Shop Drawing with trip unit & ML pre-installed",
    !!cbsds.mccbsSelectedPerShopDrawing,
    "",
    font,
    bold
  );
  y -= ROW_H + 3;

  const positions = sortedPositions(cbsds);

  y = drawNumberedRows(
    page,
    y,
    "Record MCCB serial numbers:",
    positions.map((p) => safe(p.mccbSerialNumber)),
    font,
    bold
  );

  y = drawNumberedRows(
    page,
    y,
    "Record Micro Logic serial numbers:",
    positions.map((p) => safe(p.microLogicSerialNumber)),
    font,
    bold
  );

  y = drawNumberedRows(
    page,
    y,
    cbsds.label === "D"
      ? "Record Shunt Trip Unit serial numbers:"
      : "Record Trip Unit serial numbers:",
    positions.map((p) =>
      p.micrologicSettingAmps === 32 ? "" : safe(p.shuntTripBatchNumber)
    ),
    font,
    bold
  );

  const lineTorqueDone =
    positions.length > 0 && positions.every((p) => !!p.torqueLineSideConfirmed);
  const loadTorqueDone =
    positions.length > 0 && positions.every((p) => !!p.torqueLoadSideConfirmed);
  const mlSetDone =
    positions.length > 0 && positions.every((p) => !!p.micrologicSettingConfirmed);

  drawTaskRow(
    page,
    y,
    `MCCB Torque Setting:  Line Side 10 Nm ${checkMark(lineTorqueDone)}   Load Side 10 Nm ${checkMark(loadTorqueDone)}`,
    lineTorqueDone && loadTorqueDone,
    "",
    font,
    bold,
    19
  );
  y -= 19;

  const mlNote = cbsds.label === "D" ? "  (32A, 63A, 100A whips)" : "";

  drawTaskRow(
    page,
    y,
    `Set Micrologic unit to required setting${mlNote}`,
    mlSetDone,
    "",
    font,
    bold,
    19
  );
}

function drawAncillaryPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawHeader(page, frame, font, bold);
  y = drawSectionTitle(page, y, "Ancillary circuits", font, bold);

  const a = frame.ancillaryCircuits;

  const rows: Array<[string, ChecklistItem | undefined]> = [
    ["Install combined lighting/power circuit", a.combinedLightingPowerCircuit],
    ["Install HMCU-A Sub single phase circuit", a.hmcuASub],
    ["Install HMCU-B Sub single phase circuit", a.hmcuBSub],
    ["Install HACU three phase circuit (if Drawing req)", a.hacuThreePhase],
    ["Install HMBNP single phase circuit (if Drawing req)", a.hmbnpSinglePhase],
    ["Install Firmus Data Rack single phase circuit (if Drawing req)", a.firmusDataRackSinglePhase],
    ["Install BMS Control Panel circuit (if Drawing req)", a.bmsControlPanelCircuit],
    [
      `Install 1 pair shielded 1.5mm cables from HMCU looped through CBSDS for Shunt Trip. Qty: ${safe(a.shieldedPairCables.qty)}`,
      a.shieldedPairCables
    ],
    ["Install MCB's/RCD's into DB Chassis per Shop Drawing", a.mcbsRcdsIntoDbChassis],
    ["Install Din Rail GPO", a.dinRailGpo],
    ["Install Em Light Test Facility (INT Only)", a.emLightTestFacility],
  ];

  for (const [label, item] of rows) {
    drawTaskRow(page, y, label, ticked(item), signOf(item), font, bold, 20);
    y -= 20;
  }

  drawTaskRow(
    page,
    y,
    `MCB Torque  Line 2 Nm ${checkMark(!!a.mcbTorqueLineSideConfirmed)}  Load 2 Nm ${checkMark(!!a.mcbTorqueLoadSideConfirmed)}`,
    !!a.mcbTorqueLineSideConfirmed && !!a.mcbTorqueLoadSideConfirmed,
    "",
    font,
    bold,
    20
  );
  y -= 20;

  drawTaskRow(
    page,
    y,
    `RCBO Torque  Line 3.5 Nm ${checkMark(!!a.rcboTorqueLineSideConfirmed)}  Load 2 Nm ${checkMark(!!a.rcboTorqueLoadSideConfirmed)}`,
    !!a.rcboTorqueLineSideConfirmed && !!a.rcboTorqueLoadSideConfirmed,
    "",
    font,
    bold,
    20
  );
  y -= 20;

  const finalRows: Array<[string, ChecklistItem | undefined]> = [
    ["Install unused frame holes with caps", a.unusedFrameHolesWithCaps],
    ["Install CB Labels 1-8 per CBSDS", a.cbLabels1to8],
    ["Install Bungs into unused holes in glandplates", a.bungsUnusedGlandplateHoles],
    ["Install Bungs into cable path holes in frames", a.bungsCablePathHoles],
  ];

  for (const [label, item] of finalRows) {
    drawTaskRow(page, y, label, ticked(item), signOf(item), font, bold, 20);
    y -= 20;
  }
}

function drawElectricalHeader(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
): number {
  let y = A4[1] - TOP;

  page.drawRectangle({
    x: LEFT,
    y: y - 60,
    width: FORM_W,
    height: 60,
    borderColor: grid,
    borderWidth: 0.6,
  });

  drawText(page, "Electrical Testing", LEFT + 5, y - 14, bold, 10);

  drawText(
    page,
    `Shepherd Frame ID: ${safe(frame.shepherdFrameId)}`,
    LEFT + 5,
    y - 31,
    font,
    7
  );

  drawText(
    page,
    `ACTSW Frame ID: ${safe(frame.actswFrameId)}`,
    LEFT + 220,
    y - 31,
    font,
    7
  );

  const vis = frame.electricalTesting.visualInspection;

  drawText(
    page,
    `Visual Inspection P/F    A: ${safe(vis.A)}    B: ${safe(vis.B)}    C: ${safe(vis.C)}    D: ${safe(vis.D)}`,
    LEFT + 5,
    y - 48,
    font,
    7,
    FORM_W - 10
  );

  return y - 68;
}

function drawMatrix(
  page: PDFPage,
  y: number,
  title: string,
  headers: string[],
  rowLabels: string[],
  values: string[][],
  font: PDFFont,
  bold: PDFFont,
  firstColW = 150
): number {
  drawText(page, title, LEFT + 3, y, bold, 7.2, FORM_W - 6);
  y -= 17;

  const n = Math.max(1, headers.length);
  const dataW = (FORM_W - firstColW) / n;
  const h = 16;

  // Header row.
  drawCell(page, LEFT, y, firstColW, h, "", bold, 6.5);
  for (let c = 0; c < headers.length; c++) {
    drawCell(
      page,
      LEFT + firstColW + c * dataW,
      y,
      dataW,
      h,
      headers[c],
      bold,
      6.5,
      "center"
    );
  }
  y -= h;

  for (let r = 0; r < rowLabels.length; r++) {
    drawCell(page, LEFT, y, firstColW, h, rowLabels[r], font, 6.2);

    for (let c = 0; c < headers.length; c++) {
      drawCell(
        page,
        LEFT + firstColW + c * dataW,
        y,
        dataW,
        h,
        values[r]?.[c] ?? "",
        font,
        6.2,
        "center"
      );
    }

    y -= h;
  }

  return y - 8;
}

function drawIrPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawElectricalHeader(page, frame, font, bold);

  const headers = (["A", "B", "C", "D"] as CbsdsLabel[])
    .map((l) => `CBSDS ${l}`);

  const values = IR_ROWS.map((row) =>
    (["A", "B", "C", "D"] as CbsdsLabel[]).map(
      (label) =>
        safe(frame.electricalTesting.perCbsdsIr[label]?.readings[row.key])
    )
  );

  y = drawMatrix(
    page,
    y,
    "IR Test — All MCCBs OFF and FCL fuses pulled (Mohm)",
    headers,
    IR_ROWS.map((row) => row.label),
    values,
    font,
    bold,
    150
  );

  drawText(
    page,
    `Frame IR Sign: ${safe(frame.electricalTesting.frameIrSign)}`,
    LEFT + 3,
    y,
    font,
    7
  );
}

function drawPerBreakerPage(
  page: PDFPage,
  frame: Frame,
  label: CbsdsLabel,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawElectricalHeader(page, frame, font, bold);

  const cbsds = frame.cbsds.find((c) => c.label === label);
  const positions = cbsds ? sortedPositions(cbsds) : [];
  const tests = frame.electricalTesting.perBreakerTest[label] || [];

  const headers = positions.map((p) => `${label}${p.position}`);

  const irValues = IR_ROWS.map((row) =>
    positions.map((_, i) => safe(tests[i]?.irTest?.[row.key]))
  );

  y = drawMatrix(
    page,
    y,
    `CBSDS ${label} — Whips (Each MCCB ON, one at a time) — IR`,
    headers,
    IR_ROWS.map((row) => row.label),
    irValues,
    font,
    bold,
    150
  );

  const polarityValues = POLARITY_ROWS.map((row) =>
    positions.map((_, i) => safe(tests[i]?.polarityTest?.[row.key]))
  );

  y = drawMatrix(
    page,
    y,
    "Polarity test",
    headers,
    POLARITY_ROWS.map((row) => row.label),
    polarityValues,
    font,
    bold,
    150
  );

  const sign = tests.find((t) => safe(t.sign))?.sign || "";

  drawText(
    page,
    `Sign: ${safe(sign)}`,
    LEFT + 3,
    y,
    font,
    7
  );
}

function drawShuntTripPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawElectricalHeader(page, frame, font, bold);

  const st = frame.electricalTesting.shuntTripLiveTest;

  y = drawSectionTitle(page, y, "Shunt Trip Live Test", font, bold);

  const values = [
    ["Stack 1&2", safe(st.breakerStack1and2)],
    ["Stack 3&4", safe(st.breakerStack3and4)],
    ["Stack 5&6", safe(st.breakerStack5and6)],
    ["Stack 7&8", safe(st.breakerStack7and8)],
  ];

  for (const [label, value] of values) {
    drawTaskRow(page, y, label, false, value, font, bold, 22);
    y -= 22;
  }
}

function drawHandoverPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = A4[1] - TOP;

  y = drawSectionTitle(page, y, "Frame Handover Sheet", font, bold);

  const rows: Array<[string, string]> = [
    ["Shepherd Frame ID", safe(frame.shepherdFrameId)],
    ["ACTSW Frame ID", safe(frame.actswFrameId)],
    ["Date", safe(frame.handover.date)],
    ["Time", safe(frame.handover.time)],
  ];

  for (const [label, value] of rows) {
    drawTaskRow(page, y, label, false, value, font, bold, 24);
    y -= 24;
  }

  y -= 10;

  // Signature table.
  drawCell(page, LEFT, y, 150, 22, "Role", bold, 7);
  drawCell(page, LEFT + 150, y, 205, 22, "Name", bold, 7);
  drawCell(page, LEFT + 355, y, FORM_W - 355, 22, "Sign", bold, 7);
  y -= 22;

  const signatureRows = [
    ["Shepherd", safe(frame.handover.shepherdName), safe(frame.handover.shepherdSign)],
    ["Benmax", safe(frame.handover.benmaxName), safe(frame.handover.benmaxSign)],
  ];

  for (const [role, name, sign] of signatureRows) {
    drawCell(page, LEFT, y, 150, 30, role, font, 7);
    drawCell(page, LEFT + 150, y, 205, 30, name, font, 7);
    drawCell(page, LEFT + 355, y, FORM_W - 355, 30, sign, font, 7);
    y -= 30;
  }

  y -= 15;

  drawTaskRow(
    page,
    y,
    "All Install Checklist items completed and initialled",
    !!frame.handover.installChecklistComplete,
    "",
    font,
    bold,
    24
  );
  y -= 24;

  drawTaskRow(
    page,
    y,
    "All Electrical testing items completed and initialled",
    !!frame.handover.electricalTestingComplete,
    "",
    font,
    bold,
    24
  );

  page.drawRectangle({
    x: LEFT,
    y: BOTTOM,
    width: FORM_W,
    height: 18,
    color: light,
    borderColor: grid,
    borderWidth: 0.4,
  });
}

export async function buildFramePdf(frame: Frame): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  /*
   * PHYSICAL PAGE MAP
   *
   * Page 1  = Install checklist + CBSDS A
   * Page 2  = CBSDS B
   * Page 3  = CBSDS C
   * Page 4  = CBSDS D
   * Page 5  = Ancillary circuits
   * Page 6  = Electrical IR
   * Page 7  = CBSDS A per-whip IR + polarity
   * Page 8  = CBSDS B per-whip IR + polarity
   * Page 9  = CBSDS C per-whip IR + polarity
   * Page 10 = CBSDS D per-whip IR + polarity
   * Page 11 = Shunt Trip Live Test
   * Page 12 = Handover
   *
   * There is deliberately NO Writer.ensureSpace() and NO automatic
   * pagination. Each page corresponds to a fixed piece of paper.
   */

  // Page 1.
  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[0], font, bold, true);
  }

  // Page 2.
  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[1], font, bold, false);
  }

  // Page 3.
  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[2], font, bold, false);
  }

  // Page 4.
  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[3], font, bold, false);
  }

  // Page 5.
  {
    const page = doc.addPage(A4);
    drawAncillaryPage(page, frame, font, bold);
  }

  // Page 6.
  {
    const page = doc.addPage(A4);
    drawIrPage(page, frame, font, bold);
  }

  // Pages 7–10.
  for (const label of ["A", "B", "C", "D"] as CbsdsLabel[]) {
    const page = doc.addPage(A4);
    drawPerBreakerPage(page, frame, label, font, bold);
  }

  // Page 11.
  {
    const page = doc.addPage(A4);
    drawShuntTripPage(page, frame, font, bold);
  }

  // Page 12.
  {
    const page = doc.addPage(A4);
    drawHandoverPage(page, frame, font, bold);
  }

  return doc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printPdfBytes(bytes: Uint8Array) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");

  if (win) {
    win.addEventListener("load", () => {
      win.print();
    });
  }
}
