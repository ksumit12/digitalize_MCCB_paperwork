import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { IR_ROWS, POLARITY_ROWS, irForPdf } from "./ir";
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

  drawText(page, "SHEPHERD", FORM_R - 90, y - 2, bold, 14);
  drawText(page, "HIRD INSPECTION TEST CHECKLIST", LEFT, y - 2, bold, 10, 380);
  y -= 18;

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

  row(
    y - 87,
    "Installer:",
    `${safe(frame.installerName)} ${safe(frame.installerInitials)}${frame.tradeName?.trim() ? ` · ${safe(frame.tradeName)}` : ""}`.trim(),
    LEFT,
    col1,
  );
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
  drawTaskHeader(page, y, font, bold);
  y -= HEADER_ROW_H;

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
  const mccbW = 175;
  const mlW = 175;
  const shuntW = FORM_W - cbW - mccbW - mlW;
  const h = 16;

  page.drawRectangle({
    x: LEFT,
    y: y - 12,
    width: FORM_W,
    height: 12,
    color: black,
  });
  drawText(page, "Record serial numbers", LEFT + 4, y - 9.5, bold, 7.2, FORM_W - 8);
  y -= 15;

  drawCell(page, LEFT, y, cbW, h, "CB", bold, 6, "center");
  drawCell(page, LEFT + cbW, y, mccbW, h, "MCCB Basic Frame", bold, 6);
  drawCell(page, LEFT + cbW + mccbW, y, mlW, h, "MCCB Trip unit (Micrologic)", bold, 6);
  drawCell(page, LEFT + cbW + mccbW + mlW, y, shuntW, h, "Shunt Release Same / N/A", bold, 5.5);
  y -= h;

  for (let i = 0; i < 8; i++) {
    const p = positions[i];
    const shunt =
      p?.micrologicSettingAmps === 32
        ? "N/A"
        : p?.shuntTripBatchNumber
          ? `Same  ${safe(p.shuntTripBatchNumber)}`
          : "";
    drawCell(page, LEFT, y, cbW, h, String(i + 1), font, 7, "center");
    drawCell(page, LEFT + cbW, y, mccbW, h, safe(p?.mccbSerialNumber), font, 6.2);
    drawCell(
      page,
      LEFT + cbW + mccbW,
      y,
      mlW,
      h,
      safe(p?.microLogicSerialNumber),
      font,
      6.2
    );
    drawCell(page, LEFT + cbW + mccbW + mlW, y, shuntW, h, shunt, font, 6);
    y -= h;
  }

  drawText(
    page,
    `Switchboard S/N: ${safe(cbsds.cbsdsSerialNumber)}`,
    LEFT + 3,
    y - 4,
    font,
    7,
    FORM_W - 6
  );
  return y - 16;
}

function drawItcFrontPage(
  page: PDFPage,
  frame: Frame,
  font: PDFFont,
  bold: PDFFont
) {
  let y = drawHeader(page, frame, font, bold);
  y = drawSectionTitle(page, y, "SHEPHERD - HIRD INSPECTION TEST CHECKLIST", font, bold);
  drawTaskHeader(page, y, font, bold);
  y -= HEADER_ROW_H;

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
  ];

  for (const [label, item] of rows) {
    const tick = typeof item === "boolean" ? item : itemTick(item);
    const sign = typeof item === "boolean" ? "" : signOf(item);
    drawTaskRow(page, y, label, tick, sign, font, bold, 16);
    y -= 16;
  }

  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-003-01 - HIRD ITC", "Page 1 of 5");
}

function drawCbsdsPage(
  page: PDFPage,
  frame: Frame,
  cbsds: Cbsds,
  font: PDFFont,
  bold: PDFFont,
  pageNo: string,
  extraTop: boolean
) {
  let y = drawHeader(page, frame, font, bold);

  y = drawSectionTitle(
    page,
    y,
    `SHEPHERD INSPECTION TEST CHECKLIST – CBSDS ${cbsds.label}`,
    font,
    bold
  );

  if (extraTop) {
    drawTaskHeader(page, y, font, bold);
    y -= HEADER_ROW_H;
    const extra: Array<[string, ChecklistItem]> = [
      ["Install CB Labels 1-8 per CBSDS", frame.ancillaryCircuits.cbLabels1to8],
      ["Install Bungs into unused holes in glandplates", frame.ancillaryCircuits.bungsUnusedGlandplateHoles],
      ["Install Bungs into unused holes in cable path holes in frames", frame.ancillaryCircuits.bungsCablePathHoles],
    ];
    for (const [label, item] of extra) {
      drawTaskRow(page, y, label, itemTick(item), signOf(item), font, bold);
      y -= ROW_H;
    }
    y -= 4;
  }

  drawTaskHeader(page, y, font, bold);
  y -= HEADER_ROW_H;

  const positions = sortedPositions(cbsds);
  const lineTorqueDone =
    positions.length > 0 && positions.every((p) => !!p.torqueLineSideConfirmed);
  const loadTorqueDone =
    positions.length > 0 && positions.every((p) => !!p.torqueLoadSideConfirmed);
  const mlSetDone =
    positions.length > 0 && positions.every((p) => !!p.micrologicSettingConfirmed);
  const mccbInstalled = positions.length > 0 && positions.every((p) => p.mccbInstalled);
  const flexibar = positions.length > 0 && positions.every((p) => p.flexibarCapsRemoved);
  const whipTerm = positions.length > 0 && positions.every((p) => p.whipTerminated);

  const tasks: Array<[string, boolean | "yes" | "na" | ""]> = [
    [`Install CBSDS ${cbsds.label} per Shop Drawing`, !!cbsds.mountingBoltsTight || !!cbsds.cbsdsSerialNumber],
    ["CBSDS Mounting Bolts Tight", !!cbsds.mountingBoltsTight],
    [`CBSDS serial number and Manufacturer: ${safe(cbsds.cbsdsSerialNumber)} ${safe(frame.manufacturer)}`.trim(), !!cbsds.cbsdsSerialNumber],
    ["Install Gland Plates and Glands per Shop Drawing", !!cbsds.glandPlatesAndGlandsInstalled],
    ["Select MCCB's from Shop Drawing with trip unit & ML pre-installed", !!cbsds.mccbsSelectedPerShopDrawing],
    ["Install MCCB's per Shop Drawing", mccbInstalled],
    ["Remove and retain unused flexibar protection caps", flexibar],
    ["Terminate Whip Leads", whipTerm],
    ["MCCB Torque Setting (NSX100, up to 100A: Line Side 10 Nm / Load Side 10 Nm)", lineTorqueDone && loadTorqueDone],
    ["Set Micrologic unit to required Trip Settings setting", mlSetDone],
  ];

  for (const [label, tick] of tasks) {
    drawTaskRow(page, y, label, tick, "", font, bold, 15);
    y -= 15;
  }

  y -= 4;
  y = drawSerialTable(page, y, cbsds, font, bold);
  drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-003-01 - HIRD ITC", pageNo);
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

  page.drawRectangle({
    x: LEFT,
    y: y - 60,
    width: FORM_W,
    height: 60,
    borderColor: grid,
    borderWidth: 0.6,
  });

  drawText(page, "SHEPHERD - HIRD ELECTRICAL INSPECTION TEST / CHECKLIST", LEFT + 5, y - 14, bold, 8, FORM_W - 10);

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
        irForPdf(frame.electricalTesting.perCbsdsIr[label]?.readings[row.key] ?? "")
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
    positions.map((_, i) => irForPdf(tests[i]?.irTest?.[row.key] ?? ""))
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
    positions.map((_, i) => pfPrint(safe(tests[i]?.polarityTest?.[row.key])))
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

  drawText(page, "SHEPHERD", FORM_R - 90, y - 2, bold, 16);
  drawText(page, "QA INSPECTION & FRAME HANDOVER SHEET", LEFT, y - 4, bold, 11, 380);
  y -= 28;

  drawCell(page, LEFT, y, FORM_W / 2, 16, "Shepherd Frame ID", bold, 8, "center");
  drawCell(page, LEFT + FORM_W / 2, y, FORM_W / 2, 16, "ACTSW Frame ID", bold, 8, "center");
  y -= 16;
  drawCell(page, LEFT, y, FORM_W / 2, 22, safe(frame.shepherdFrameId), font, 9);
  drawCell(page, LEFT + FORM_W / 2, y, FORM_W / 2, 22, safe(frame.actswFrameId), font, 9);
  y -= 30;

  drawTaskHeader(page, y, font, bold);
  y -= HEADER_ROW_H;
  drawTaskRow(page, y, `Date: ${safe(frame.handover.date)}`, false, "", font, bold, 20);
  y -= 20;
  drawTaskRow(page, y, `Time: ${safe(frame.handover.time)}`, false, "", font, bold, 20);
  y -= 20;

  const installPass = !!frame.handover.installChecklistComplete;
  const elecPass = !!frame.handover.electricalTestingComplete;

  drawCell(page, LEFT, y, TASK_W, 22, "All Install Checklist items completed and initialled", font, 7);
  drawCell(page, LEFT + TASK_W, y, YES_W, 22, installPass ? "X" : "", bold, 9, "center");
  drawCell(page, LEFT + TASK_W + YES_W, y, NA_W, 22, installPass ? "" : "", bold, 7, "center");
  drawCell(page, LEFT + TASK_W + TICK_W, y, SIGN_W, 22, installPass ? "QA Passed" : "", font, 6, "center");
  y -= 22;

  drawCell(page, LEFT, y, TASK_W, 22, "All Electrical testing items completed and initialled", font, 7);
  drawCell(page, LEFT + TASK_W, y, YES_W, 22, elecPass ? "X" : "", bold, 9, "center");
  drawCell(page, LEFT + TASK_W + YES_W, y, NA_W, 22, "", bold, 7, "center");
  drawCell(page, LEFT + TASK_W + TICK_W, y, SIGN_W, 22, elecPass ? "QA Passed" : "", font, 6, "center");
  y -= 28;

  drawText(page, "Notes (required for failure if any):", LEFT + 3, y, bold, 8);
  y -= 12;
  page.drawRectangle({
    x: LEFT,
    y: y - 70,
    width: FORM_W,
    height: 80,
    borderColor: grid,
    borderWidth: 0.45,
  });
  drawText(page, safe(frame.handover.notes), LEFT + 4, y - 10, font, 8, FORM_W - 8);
  y -= 100;

  drawCell(page, LEFT, y, FORM_W, 18, "Shepherd Electrical (Authorised Person) — Handover By", bold, 8);
  y -= 18;
  drawCell(page, LEFT, y, 80, 28, "Name", bold, 7);
  drawCell(page, LEFT + 80, y, FORM_W / 2 - 80, 28, safe(frame.handover.shepherdName), font, 8);
  drawCell(page, LEFT + FORM_W / 2, y, 80, 28, "Sign", bold, 7);
  drawCell(page, LEFT + FORM_W / 2 + 80, y, FORM_W / 2 - 80, 28, safe(frame.handover.shepherdSign), font, 8);
  y -= 36;

  drawCell(page, LEFT, y, FORM_W, 18, "Benmax (Authorised Person) — Accepted By", bold, 8);
  y -= 18;
  drawCell(page, LEFT, y, 80, 28, "Name", bold, 7);
  drawCell(page, LEFT + 80, y, FORM_W / 2 - 80, 28, safe(frame.handover.benmaxName), font, 8);
  drawCell(page, LEFT + FORM_W / 2, y, 80, 28, "Sign", bold, 7);
  drawCell(page, LEFT + FORM_W / 2 + 80, y, FORM_W / 2 - 80, 28, safe(frame.handover.benmaxSign), font, 8);

  drawFooter(
    page,
    font,
    bold,
    "SHEPHERD-FIRMUS-QA-001-02 - Inspection and Frame Handover Sheet",
    "Page 1 of 1"
  );
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
    drawCbsdsPage(page, frame, frame.cbsds[0], font, bold, "Page 2 of 5", true);
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[1], font, bold, "Page 3 of 5", false);
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[2], font, bold, "Page 4 of 5", false);
  }

  {
    const page = doc.addPage(A4);
    drawCbsdsPage(page, frame, frame.cbsds[3], font, bold, "Page 5 of 5", false);
  }

  {
    const page = doc.addPage(A4);
    drawIrPage(page, frame, font, bold);
    drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01 - HIRD ITP", "Page 1 of 3");
  }

  for (const label of ["A", "B"] as CbsdsLabel[]) {
    const page = doc.addPage(A4);
    drawPerBreakerPage(page, frame, label, font, bold);
    drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01 - HIRD ITP", "Page 2 of 3");
  }

  {
    const page = doc.addPage(A4);
    drawPerBreakerPage(page, frame, "C", font, bold);
    drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01 - HIRD ITP", "Page 3 of 3");
  }

  {
    const page = doc.addPage(A4);
    drawPerBreakerPage(page, frame, "D", font, bold);
    drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01 - HIRD ITP", "Page 3 of 3");
  }

  {
    const page = doc.addPage(A4);
    drawShuntTripPage(page, frame, font, bold);
    drawFooter(page, font, bold, "SHEPHERD-FIRMUS-QA-004-01 - HIRD ITP", "Page 3 of 3");
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
