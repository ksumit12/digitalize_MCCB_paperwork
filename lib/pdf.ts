import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { IR_ROWS, irForPdf } from "./ir";
import {
  CBSDS_LABELS,
  derivedBoardTicks,
  shuntLivePairExpected,
  shuntReleaseOf,
  shuntTripExpected,
  standardMark,
} from "./paperwork";
import type { BreakerPosition, Cbsds, CbsdsLabel, ChecklistItem, Frame, PassFail } from "./types";

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

const TASK_W = 330;
const YES_W = 28;
const NA_W = 28;
const TICK_W = YES_W + NA_W;
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

function itemTick(item: ChecklistItem | undefined): "yes" | "na" | "" {
  if (item?.na) return "na";
  if (item?.ticked) return "yes";
  return "";
}

function signOf(item: ChecklistItem | undefined): string {
  return safe(item?.installerSign);
}

function checkMark(done: boolean): string {
  return done ? "X" : "";
}

function tickBoxes(tick: boolean | "yes" | "na" | ""): { yes: string; na: string } {
  if (tick === true || tick === "yes") return { yes: "X", na: "" };
  if (tick === "na") return { yes: "", na: "X" };
  return { yes: "", na: "" };
}

function pfPrint(value: string): string {
  const t = value.trim().toLowerCase();
  if (t === "pass") return "Pass";
  if (t === "fail") return "Fail";
  return value.trim();
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
  while (s > 4.5 && font.widthOfTextAtSize(value, s) > maxWidth) {
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
  maxWidth?: number,
  color = ink,
) {
  const fitted = maxWidth
    ? fitText(text, font, size, maxWidth)
    : { text: sanitizeForPdf(text), size };

  page.drawText(fitted.text, {
    x,
    y,
    size: fitted.size,
    font,
    color,
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

  const fitted = fitText(value, font, size, Math.max(4, width - 6));
  const tw = font.widthOfTextAtSize(fitted.text, fitted.size);

  const tx = align === "center"
    ? x + (width - tw) / 2
    : x + 3;

  const ty = y + (height - fitted.size) / 2 + fitted.size * 0.2;

  page.drawText(fitted.text, {
    x: tx,
    y: ty,
    size: fitted.size,
    font,
    color: ink,
  });
}

function drawTaskHeader(page: PDFPage, y: number, font: PDFFont, bold: PDFFont, rowHeight = HEADER_ROW_H) {
  let x = LEFT;
  drawCell(page, x, y, TASK_W, rowHeight, "Task", bold, 7);
  x += TASK_W;
  drawCell(page, x, y, YES_W, rowHeight, "Yes", bold, 6.5, "center");
  x += YES_W;
  drawCell(page, x, y, NA_W, rowHeight, "N/A", bold, 6.5, "center");
  x += NA_W;
  drawCell(page, x, y, SIGN_W, rowHeight, "Installer Initials", bold, 6.2, "center");
}

function drawTaskRow(
  page: PDFPage,
  y: number,
  task: string,
  done: boolean | "yes" | "na" | "" = false,
  sign = "",
  font: PDFFont,
  bold: PDFFont,
  rowHeight = ROW_H
) {
  const boxes = tickBoxes(done);
  let x = LEFT;

  drawCell(page, x, y, TASK_W, rowHeight, task, font, 7);
  x += TASK_W;
  drawCell(page, x, y, YES_W, rowHeight, boxes.yes, bold, 8.5, "center");
  x += YES_W;
  drawCell(page, x, y, NA_W, rowHeight, boxes.na, bold, 8.5, "center");
  x += NA_W;
  drawCell(page, x, y, SIGN_W, rowHeight, sign, font, 7, "center");
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  docId: string,
  pageNo: string
) {
  drawText(page, "SHEPHERD", LEFT, BOTTOM - 6, bold, 7);
  drawText(page, docId, LEFT, BOTTOM - 16, font, 6, 360);
  const fitted = fitText(pageNo, font, 7, 80);
  page.drawText(fitted.text, {
    x: FORM_R - font.widthOfTextAtSize(fitted.text, fitted.size),
    y: BOTTOM - 12,
    size: fitted.size,
    font,
    color: ink,
  });
}

/** Black title band. `y` is the top of free space; returns the bottom of the band. */
function drawSectionTitle(
  page: PDFPage,
  y: number,
  title: string,
  font: PDFFont,
  bold: PDFFont
): number {
  const h = 13;
  const bottom = y - h;
  page.drawRectangle({
    x: LEFT,
    y: bottom,
    width: FORM_W,
    height: h,
    color: black,
  });
  drawText(page, title, LEFT + 4, bottom + 3.4, bold, 7, FORM_W - 8, white);
  return bottom;
}

function drawLabelValue(
  page: PDFPage,
  y: number,
  x: number,
  labelW: number,
  valueW: number,
  h: number,
  label: string,
  value: string,
  font: PDFFont,
  bold: PDFFont,
) {
  drawCell(page, x, y, labelW, h, label, bold, 6.2);
  drawCell(page, x + labelW, y, valueW, h, value, font, 7);
}

function drawHeader(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
): number {
  let y = A4[1] - TOP;

  drawText(page, "SHEPHERD", FORM_R - 88, y - 2, bold, 14);
  drawText(page, "HIRD INSPECTION TEST CHECKLIST", LEFT, y - 2, bold, 10, 400);
  y -= 18;

  const h = 16;
  const labelW = 118;
  const half = FORM_W / 2;
  const valueW = half - labelW;
  const std = standardMark(frame.market);

  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Shepherd Frame ID", safe(frame.shepherdFrameId), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "ACTSW Frame ID", safe(frame.actswFrameId), font, bold);
  y -= h;

  drawCell(page, LEFT, y, labelW, h, "Applicable Standard", bold, 6);
  drawCell(
    page,
    LEFT + labelW,
    y,
    FORM_W - labelW,
    h,
    `${std.aus ? "[X]" : "[ ]"}  AUS (AS/NZS 61439)      ${std.int ? "[X]" : "[ ]"}  INT (IEC 61439)`,
    font,
    7,
  );
  y -= h;

  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Start Date", safe(frame.startDate), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "Start Time", safe(frame.startTime), font, bold);
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Finish Date", safe(frame.finishDate), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "Finish Time", safe(frame.finishTime), font, bold);
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Installer Name", safe(frame.installerName), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "Sign", safe(frame.installerInitials), font, bold);
  y -= h + 8;

  return y;
}

function drawChecklist(
  page: PDFPage,
  y: number,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
): number {
  y = drawSectionTitle(page, y, "Install checklist", font, bold);
  y -= HEADER_ROW_H;
  drawTaskHeader(page, y, font, bold);
  y -= ROW_H;

  const rows: Array<[string, ChecklistItem | undefined]> = [
    ["Install Vertical Cable Ladders", frame.installChecklist.verticalCableLadders],
    ["Install Horizontal Unistrut Whip Support", frame.installChecklist.horizontalUnistrutWhipSupport],
    ["Install Earth Bar Angle Brackets", frame.installChecklist.earthBarAngleBrackets],
    ["Install CBSDS Supports", frame.installChecklist.cbsdsSupports],
    ["Install C&E Air Sampling Conduit", frame.installChecklist.cAndEAirSamplingConduit],
    ["Install Whip's per Shop Drawing", frame.installChecklist.whipsPerShopDrawing],
  ];

  for (const [label, item] of rows) {
    drawTaskRow(page, y, label, itemTick(item), signOf(item), font, bold);
    y -= ROW_H;
  }

  return y - 4;
}

function sortedPositions(cbsds: Cbsds): BreakerPosition[] {
  return [...cbsds.breakerPositions]
    .sort((a, b) => a.position - b.position)
    .slice(0, 8);
}

function drawSerialTable(
  page: PDFPage,
  y: number,
  cbsds: Cbsds,
  font: PDFFont,
  bold: PDFFont
): number {
  const positions = sortedPositions(cbsds);
  const cbW = 22;
  const typeW = 36;
  const tickW = 28;
  const shuntW = 100;
  const serialW = (FORM_W - cbW - typeW * 2 - shuntW - tickW * 2) / 2;
  const mccbW = serialW;
  const mlW = serialW;
  const h = 15;

  y = drawSectionTitle(page, y, "Record serial numbers", font, bold);
  y -= h;

  let x = LEFT;
  drawCell(page, x, y, cbW, h, "CB", bold, 6, "center");
  x += cbW;
  drawCell(page, x, y, mccbW, h, "MCCB Basic Frame", bold, 5.8);
  x += mccbW;
  drawCell(page, x, y, mlW, h, "Trip unit (Micrologic) S/N", bold, 5.5);
  x += mlW;
  drawCell(page, x, y, typeW, h, "ML2.2", bold, 5.5, "center");
  x += typeW;
  drawCell(page, x, y, typeW, h, "ML5.2E", bold, 5.5, "center");
  x += typeW;
  drawCell(page, x, y, shuntW, h, "Shunt Release MX", bold, 5.5);
  x += shuntW;
  drawCell(page, x, y, tickW, h, "Same", bold, 5.5, "center");
  x += tickW;
  drawCell(page, x, y, tickW, h, "N/A", bold, 5.5, "center");
  y -= h;

  for (let i = 0; i < 8; i++) {
    const p = positions[i];
    const status = p ? shuntReleaseOf(p) : "";
    const model = p?.micrologicModel || "";
    x = LEFT;
    drawCell(page, x, y, cbW, h, String(i + 1), font, 7, "center");
    x += cbW;
    drawCell(page, x, y, mccbW, h, safe(p?.mccbSerialNumber), font, 6.4);
    x += mccbW;
    drawCell(page, x, y, mlW, h, safe(p?.microLogicSerialNumber), font, 6.4);
    x += mlW;
    drawCell(page, x, y, typeW, h, model === "2.2" ? "X" : "", bold, 8, "center");
    x += typeW;
    drawCell(page, x, y, typeW, h, model === "5.2E" ? "X" : "", bold, 8, "center");
    x += typeW;
    drawCell(page, x, y, shuntW, h, status === "na" ? "" : safe(p?.shuntTripBatchNumber), font, 6);
    x += shuntW;
    drawCell(page, x, y, tickW, h, status === "same" ? "X" : "", bold, 8, "center");
    x += tickW;
    drawCell(page, x, y, tickW, h, status === "na" ? "X" : "", bold, 8, "center");
    y -= h;
  }

  drawLabelValue(
    page,
    y,
    LEFT,
    118,
    FORM_W - 118,
    h,
    "Switchboard S/N",
    safe(cbsds.cbsdsSerialNumber),
    font,
    bold,
  );
  return y - 14;
}

function drawItcFrontPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawHeader(page, frame, font, bold);
  y = drawSectionTitle(page, y, "SHEPHERD - HIRD INSPECTION TEST CHECKLIST", font, bold);
  y -= HEADER_ROW_H;
  drawTaskHeader(page, y, font, bold);
  y -= 16;

  const a = frame.ancillaryCircuits;
  const rows: Array<[string, ChecklistItem | undefined | boolean]> = [
    ["Install Vertical Cable Ladders", frame.installChecklist.verticalCableLadders],
    ["Install Horizontal Unistrut Whip Support", frame.installChecklist.horizontalUnistrutWhipSupport],
    ["Install Earth Bar Angle Brackets", frame.installChecklist.earthBarAngleBrackets],
    ["Install CBSDS Supports", frame.installChecklist.cbsdsSupports],
    ["Install C&E Air Sampling Conduit", frame.installChecklist.cAndEAirSamplingConduit],
    ["Install Whip's per Shop Drawing", frame.installChecklist.whipsPerShopDrawing],
    ["Install combined lighting/power circuit", a.combinedLightingPowerCircuit],
    ["Install HMCU-A Sub single phase circuit", a.hmcuASub],
    ["Install HMCU-B Sub single phase circuit", a.hmcuBSub],
    ["Install HACU three phase circuit (if Drawing req)", a.hacuThreePhase],
    ["Install HMBNP single phase circuit (if Drawing req)", a.hmbnpSinglePhase],
    ["Install Firmus Data Rack single phase circuit (if Drawing req)", a.firmusDataRackSinglePhase],
    ["Install BMS Control Panel circuit (if Drawing req)", a.bmsControlPanelCircuit],
    [
      `Install 1 pair shielded 1.5mm cables from HMCU looped through CBSDS for Shunt Trip. Qty: ${safe(a.shieldedPairCables.qty)}`,
      a.shieldedPairCables,
    ],
    ["Install MCB's/RCD's into DB Chassis per Shop Drawing", a.mcbsRcdsIntoDbChassis],
    ["Install Din Rail GPO", a.dinRailGpo],
    ["Install Em Light Test Facility (INT Only)", a.emLightTestFacility],
    ["MCB Torque Setting: Line Side / Load Side 2 Nm", a.mcbTorqueLineSideConfirmed && a.mcbTorqueLoadSideConfirmed],
    ["RCBO Torque Setting: Line side 3.5 Nm / Load side 2 Nm", a.rcboTorqueLineSideConfirmed && a.rcboTorqueLoadSideConfirmed],
    ["Install unused frame holes with caps", a.unusedFrameHolesWithCaps],
    ["Install CB Labels 1-8 per CBSDS", a.cbLabels1to8],
    ["Install Bungs into unused holes in glandplates", a.bungsUnusedGlandplateHoles],
    ["Install Bungs into cable path holes in frames", a.bungsCablePathHoles],
  ];

  for (const [label, item] of rows) {
    const tick = typeof item === "boolean" ? item : itemTick(item);
    const sign = typeof item === "boolean" ? "" : signOf(item);
    drawTaskRow(page, y, label, tick, sign, font, bold, 16);
    y -= 16;
  }

  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-003-01", "Page 1 of 5");
}

function drawCbsdsPage(
  page: PDFPage,
  frame: Frame,
  cbsds: Cbsds,
  font: PDFFont,
  bold: PDFFont,
  pageNo: string,
) {
  let y = drawHeader(page, frame, font, bold);

  y = drawSectionTitle(
    page,
    y,
    `SHEPHERD INSPECTION TEST CHECKLIST - CBSDS ${cbsds.label}`,
    font,
    bold
  );
  y -= HEADER_ROW_H;
  drawTaskHeader(page, y, font, bold);
  y -= 15;

  const d = derivedBoardTicks(cbsds, frame.manufacturer);
  const tasks: Array<[string, boolean | "yes" | "na" | ""]> = [
    [`Install CBSDS ${cbsds.label} per Shop Drawing`, d.installedPerDrawing],
    ["CBSDS Mounting Bolts Tight", d.bolts],
    [
      `CBSDS serial number and Manufacturer: ${safe(cbsds.cbsdsSerialNumber)} ${safe(frame.manufacturer)}`.trim(),
      d.serialAndMfr,
    ],
    ["Install Gland Plates and Glands per Shop Drawing", d.glands],
    ["Select MCCB's from Shop Drawing with trip unit & ML pre-installed", d.selected],
    ["Install MCCB's per Shop Drawing", d.mccbsInstalled],
    ["Remove and retain unused flexibar protection caps", d.flexibar],
    ["Terminate Whip Leads", d.whips],
    ["MCCB Torque Setting (NSX100, up to 100A: Line Side 10 Nm / Load Side 10 Nm)", d.torque],
    ["Set Micrologic unit to required Trip Settings setting", d.micrologic],
  ];

  const initials = safe(frame.installerInitials);
  for (const [label, tick] of tasks) {
    drawTaskRow(page, y, label, tick, initials, font, bold, 15);
    y -= 15;
  }

  y -= 4;
  y = drawSerialTable(page, y, cbsds, font, bold);
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-003-01", pageNo);
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
    drawTaskRow(page, y, label, itemTick(item), signOf(item), font, bold, 20);
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
    drawTaskRow(page, y, label, itemTick(item), signOf(item), font, bold, 20);
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
  const std = standardMark(frame.market);
  const e = frame.electricalTesting;
  const h = 16;
  const labelW = 118;
  const half = FORM_W / 2;
  const valueW = half - labelW;

  drawText(page, "SHEPHERD", FORM_R - 88, y - 2, bold, 14);
  drawText(page, "HIRD ELECTRICAL INSPECTION TEST / CHECKLIST", LEFT, y - 2, bold, 9, 400);
  y -= 18;

  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Shepherd Frame ID", safe(frame.shepherdFrameId), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "ACTSW Frame ID", safe(frame.actswFrameId), font, bold);
  y -= h;
  drawCell(page, LEFT, y, labelW, h, "Applicable Standard", bold, 6);
  drawCell(
    page,
    LEFT + labelW,
    y,
    FORM_W - labelW,
    h,
    `${std.aus ? "[X]" : "[ ]"}  AUS (AS/NZS 61439)      ${std.int ? "[X]" : "[ ]"}  INT (IEC 61439)`,
    font,
    7,
  );
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Test Date", safe(frame.startDate), font, bold);
  drawLabelValue(page, y, LEFT + half, labelW, valueW, h, "Test Time", safe(frame.startTime), font, bold);
  y -= h;
  drawLabelValue(
    page,
    y,
    LEFT,
    labelW,
    valueW,
    h,
    "Installer",
    `${safe(frame.testerName || frame.installerName)}  ${safe(frame.testerInitials)}`.trim(),
    font,
    bold,
  );
  drawLabelValue(
    page,
    y,
    LEFT + half,
    labelW,
    valueW,
    h,
    "Witness",
    `${safe(e.witnessName)}  ${safe(e.witnessSign)}`.trim(),
    font,
    bold,
  );
  y -= h + 8;
  return y;
}

function drawPfMatrix(
  page: PDFPage,
  y: number,
  title: string,
  values: Record<CbsdsLabel, PassFail[]>,
  font: PDFFont,
  bold: PDFFont,
  naFor?: (label: CbsdsLabel, i: number) => boolean,
): number {
  y = drawSectionTitle(page, y, title, font, bold);
  const first = 70;
  const col = (FORM_W - first) / 4;
  const rh = 14;
  y -= rh;
  drawCell(page, LEFT, y, first, rh, "CB", bold, 6, "center");
  CBSDS_LABELS.forEach((label, i) => {
    drawCell(page, LEFT + first + i * col, y, col, rh, `CBSDS ${label}`, bold, 6, "center");
  });
  y -= rh;
  for (let i = 0; i < 8; i += 1) {
    drawCell(page, LEFT, y, first, rh, `CB${i + 1}`, font, 6.2, "center");
    CBSDS_LABELS.forEach((label, c) => {
      const na = naFor?.(label, i);
      const raw = values[label]?.[i] || "";
      const text = na ? "N/A" : pfPrint(raw);
      drawCell(page, LEFT + first + c * col, y, col, rh, text, font, 6, "center");
    });
    y -= rh;
  }
  return y - 6;
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
  firstColW = 150,
  rowH = 16,
): number {
  y = drawSectionTitle(page, y, title, font, bold);

  const n = Math.max(1, headers.length);
  const dataW = (FORM_W - firstColW) / n;
  const h = rowH;
  y -= h;

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

function drawQa004Page1(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
) {
  let y = drawElectricalHeader(page, frame, font, bold);
  const e = frame.electricalTesting;
  const vis = e.visualInspection;
  y = drawResultGrid(
    page,
    y,
    "Visual inspection  (P/F)",
    CBSDS_LABELS,
    ["Visual inspection"],
    [CBSDS_LABELS.map((label) => pfPrint(vis[label]))],
    font,
    bold,
    168,
    14,
  );
  const fclH = 16;
  y -= fclH;
  drawCell(
    page,
    LEFT,
    y,
    FORM_W,
    fclH,
    `FCL fuses pulled before insulation test:  ${e.fclFusesPulled ? "[X] Yes" : "[ ] No"}`,
    font,
    7,
  );
  y -= 8;
  y = drawPfMatrix(
    page,
    y,
    "Check mechanical operation of CBs (open / close / reset / push-to-test)",
    e.mechanicalOperation || { A: [], B: [], C: [], D: [] },
    font,
    bold,
  );
  y = drawPfMatrix(
    page,
    y,
    "Check shunt trip operation of CBs with MX installed (N/A if no shunt)",
    e.shuntTripOperation || { A: [], B: [], C: [], D: [] },
    font,
    bold,
    (label, i) => {
      const b = frame.cbsds.find((c) => c.label === label)?.breakerPositions[i];
      return !b || !shuntTripExpected(b);
    },
  );
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01", "Page 1 of 4");
}

const POLARITY_PAPER_ROWS: Array<{
  key: "l1ToEarth" | "l2ToEarth" | "l3ToEarth" | "nToEarth";
  label: string;
}> = [
  { key: "l1ToEarth", label: "L1 to Earth Pass/Fail" },
  { key: "l2ToEarth", label: "L2 to Earth Pass/Fail" },
  { key: "l3ToEarth", label: "L3 to Earth Pass/Fail" },
  { key: "nToEarth", label: "N to Earth Pass/Fail" },
];

/** Paper electrical sheet: test names as rows, holes as columns, results in MOhm / Pass-Fail. */
function drawResultGrid(
  page: PDFPage,
  y: number,
  title: string,
  colHeaders: string[],
  rowLabels: string[],
  values: string[][],
  font: PDFFont,
  bold: PDFFont,
  firstColW = 168,
  rowH = 11,
): number {
  if (title) y = drawSectionTitle(page, y, title, font, bold);
  const n = Math.max(1, colHeaders.length);
  const dataW = (FORM_W - firstColW) / n;
  y -= rowH;
  drawCell(page, LEFT, y, firstColW, rowH, "", bold, 5.5);
  colHeaders.forEach((header, c) => {
    drawCell(page, LEFT + firstColW + c * dataW, y, dataW, rowH, header, bold, 5.5, "center");
  });
  y -= rowH;
  rowLabels.forEach((label, r) => {
    drawCell(page, LEFT, y, firstColW, rowH, label, font, 5.6);
    for (let c = 0; c < n; c += 1) {
      drawCell(
        page,
        LEFT + firstColW + c * dataW,
        y,
        dataW,
        rowH,
        values[r]?.[c] ?? "",
        font,
        5.6,
        "center",
      );
    }
    y -= rowH;
  });
  return y - 6;
}

function boardIrValues(frame: Frame): string[][] {
  return IR_ROWS.map((row) =>
    CBSDS_LABELS.map((label) => irForPdf(frame.electricalTesting.perCbsdsIr[label]?.readings?.[row.key] ?? "", row.key)),
  );
}

function whipIrValues(frame: Frame, label: CbsdsLabel): string[][] {
  const tests = frame.electricalTesting.perBreakerTest[label] || [];
  return IR_ROWS.map((row) =>
    Array.from({ length: 8 }, (_, i) => irForPdf(tests[i]?.irTest?.[row.key] ?? "", row.key)),
  );
}

function polarityValues(frame: Frame, label: CbsdsLabel): string[][] {
  const tests = frame.electricalTesting.perBreakerTest[label] || [];
  return POLARITY_PAPER_ROWS.map((row) =>
    Array.from({ length: 8 }, (_, i) => pfPrint(safe(tests[i]?.polarityTest?.[row.key]))),
  );
}

function drawWhipAndPolarity(
  page: PDFPage,
  y: number,
  frame: Frame,
  label: CbsdsLabel,
  font: PDFFont,
  bold: PDFFont,
): number {
  const tests = frame.electricalTesting.perBreakerTest[label] || [];
  const sign = safe(tests[0]?.sign || frame.electricalTesting.frameIrSign);
  const holes = Array.from({ length: 8 }, (_, i) => `${label}${i + 1}`);
  y = drawResultGrid(
    page,
    y,
    `CBSDS ${label}  Whips IR Test (Each MCCB ON, one at a time)   Results in MOhm   Sign: ${sign}`,
    holes,
    IR_ROWS.map((row) => row.label),
    whipIrValues(frame, label),
    font,
    bold,
    168,
    12,
  );
  y = drawResultGrid(
    page,
    y,
    `CBSDS ${label}  Polarity test`,
    holes,
    POLARITY_PAPER_ROWS.map((row) => row.label),
    polarityValues(frame, label),
    font,
    bold,
    168,
    12,
  );
  return y;
}

function drawEarthBond(
  page: PDFPage,
  y: number,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
): number {
  y = drawSectionTitle(
    page,
    y,
    "Chassis earth bond continuity  (earth bar to body, 0.5 ohm or less)",
    font,
    bold,
  );
  const h = 16;
  y -= h;
  const bondW = FORM_W / 4;
  CBSDS_LABELS.forEach((label, i) => {
    const b = frame.electricalTesting.chassisEarthBond?.[label];
    drawCell(
      page,
      LEFT + i * bondW,
      y,
      bondW,
      h,
      `${label}:  ${pfPrint(b?.result || "")}${b?.ohms ? `  ${b.ohms} ohm` : ""}`,
      font,
      6.2,
      "center",
    );
  });
  return y - 10;
}

function drawShuntLive(
  page: PDFPage,
  y: number,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
): number {
  y = drawSectionTitle(page, y, "Shunt trip live test (breaker pairs)", font, bold);
  const h = 18;
  y -= h;
  const st = frame.electricalTesting.shuntTripLiveTest;
  const pairs: Array<[string, PassFail]> = [
    ["1 & 2", st.breakerStack1and2],
    ["3 & 4", st.breakerStack3and4],
    ["5 & 6", st.breakerStack5and6],
    ["7 & 8", st.breakerStack7and8],
  ];
  const pw = FORM_W / 4;
  pairs.forEach(([label, value], i) => {
    const pair = (i + 1) as 1 | 2 | 3 | 4;
    const text = shuntLivePairExpected(frame, pair) ? `${label}:  ${pfPrint(value)}` : `${label}:  N/A`;
    drawCell(page, LEFT + i * pw, y, pw, h, text, font, 7, "center");
  });
  return y - 8;
}

function drawQa004Page2(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
) {
  let y = drawElectricalHeader(page, frame, font, bold);
  const vis = frame.electricalTesting.visualInspection;
  y = drawResultGrid(
    page,
    y,
    "Visual inspection  (P/F)",
    CBSDS_LABELS,
    ["Visual inspection"],
    [CBSDS_LABELS.map((label) => pfPrint(vis[label]))],
    font,
    bold,
    168,
    14,
  );

  y = drawResultGrid(
    page,
    y,
    "IR Test (All MCCBs OFF and FCL fuses pulled)   Results in MOhm",
    [...CBSDS_LABELS, "Sign"],
    IR_ROWS.map((row) => row.label),
    boardIrValues(frame).map((row) => [...row, safe(frame.electricalTesting.frameIrSign)]),
    font,
    bold,
    168,
    13,
  );

  y = drawEarthBond(page, y, frame, font, bold);
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01", "Page 2 of 4");
}

function drawQa004Page3(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
) {
  let y = drawElectricalHeader(page, frame, font, bold);
  y = drawWhipAndPolarity(page, y, frame, "A", font, bold);
  y = drawWhipAndPolarity(page, y, frame, "B", font, bold);
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01", "Page 3 of 4");
}

function drawQa004Page4(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont,
) {
  let y = drawElectricalHeader(page, frame, font, bold);
  y = drawWhipAndPolarity(page, y, frame, "C", font, bold);
  y = drawWhipAndPolarity(page, y, frame, "D", font, bold);
  drawShuntLive(page, y, frame, font, bold);
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01", "Page 4 of 4");
}

function drawHandoverPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = A4[1] - TOP;
  const h = 20;
  const labelW = 200;
  const valueW = FORM_W - labelW;
  const tickW = 36;
  const textW = FORM_W - tickW;
  const ho = frame.handover;
  const verdict = ho.qaVerdict || "";

  drawText(page, "SHEPHERD", FORM_R - 88, y - 2, bold, 16);
  drawText(page, "QA INSPECTION & FRAME HANDOVER SHEET", LEFT, y - 4, bold, 11, 400);
  y -= 26;

  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Shepherd Frame ID", safe(frame.shepherdFrameId), font, bold);
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "ACTSW Frame ID", safe(frame.actswFrameId), font, bold);
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Date", safe(ho.date), font, bold);
  y -= h;
  drawLabelValue(page, y, LEFT, labelW, valueW, h, "Time", safe(ho.time), font, bold);
  y -= h;

  drawCell(page, LEFT, y, textW, h, "All Install Checklist items completed and initialled", font, 7.5);
  drawCell(page, LEFT + textW, y, tickW, h, ho.installChecklistComplete ? "X" : "", bold, 11, "center");
  y -= h;
  drawCell(page, LEFT, y, textW, h, "All Electrical testing items completed and initialled", font, 7.5);
  drawCell(page, LEFT + textW, y, tickW, h, ho.electricalTestingComplete ? "X" : "", bold, 11, "center");
  y -= h + 10;

  const boxW = 90;
  drawCell(page, LEFT, y, 80, 24, "Tick a Box", bold, 7);
  drawCell(page, LEFT + 80, y, boxW, 24, "QA Passed", font, 8);
  drawCell(page, LEFT + 80 + boxW, y, 28, 24, verdict === "passed" ? "X" : "", bold, 12, "center");
  drawCell(page, LEFT + 198, y, boxW, 24, "QA Failed", font, 8);
  drawCell(page, LEFT + 198 + boxW, y, 28, 24, verdict === "failed" ? "X" : "", bold, 12, "center");
  drawCell(page, LEFT + 316, y, FORM_W - 316, 24, "", font, 7);
  y -= 34;

  const notesH = 90;
  drawCell(page, LEFT, y, FORM_W, 16, "Notes (required for failure if any)", bold, 7.5);
  y -= 16;
  page.drawRectangle({
    x: LEFT,
    y: y - notesH + 16,
    width: FORM_W,
    height: notesH,
    borderColor: grid,
    borderWidth: 0.45,
    color: white,
  });
  drawText(page, safe(ho.notes), LEFT + 6, y - 2, font, 8, FORM_W - 12);
  y -= notesH + 16;

  const col = FORM_W / 2;
  const nameH = 26;
  drawCell(page, LEFT, y, col, 16, "Handover By", bold, 8, "center");
  drawCell(page, LEFT + col, y, col, 16, "Accepted By", bold, 8, "center");
  y -= 16;
  drawCell(page, LEFT, y, col, 28, "Shepherd Electrical (Authorised Person)", font, 7);
  drawCell(page, LEFT + col, y, col, 28, "Benmax (Authorised Person)", font, 7);
  y -= 28;
  drawCell(page, LEFT, y, 50, nameH, "Name", bold, 7);
  drawCell(page, LEFT + 50, y, col - 50, nameH, safe(ho.shepherdName), font, 9);
  drawCell(page, LEFT + col, y, 50, nameH, "Name", bold, 7);
  drawCell(page, LEFT + col + 50, y, col - 50, nameH, safe(ho.benmaxName), font, 9);
  y -= nameH;
  drawCell(page, LEFT, y, 50, nameH, "Sign", bold, 7);
  drawCell(page, LEFT + 50, y, col - 50, nameH, safe(ho.shepherdSign), font, 9);
  drawCell(page, LEFT + col, y, 50, nameH, "Sign", bold, 7);
  drawCell(page, LEFT + col + 50, y, col - 50, nameH, safe(ho.benmaxSign), font, 9);

  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-001-02", "Page 1 of 1");
}

export async function buildFramePdf(frame: Frame): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  {
    const page = doc.addPage(A4);
    drawItcFrontPage(page, frame, font, bold);
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[0], font, bold, "Page 2 of 5");
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[1], font, bold, "Page 3 of 5");
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[2], font, bold, "Page 4 of 5");
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[3], font, bold, "Page 5 of 5");
  }

  {
    const page = doc.addPage(A4);
    drawQa004Page1(page, frame, font, bold);
  }

  {
    const page = doc.addPage(A4);
    drawQa004Page2(page, frame, font, bold);
  }

  {
    const page = doc.addPage(A4);
    drawQa004Page3(page, frame, font, bold);
  }

  {
    const page = doc.addPage(A4);
    drawQa004Page4(page, frame, font, bold);
  }

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
