#!/usr/bin/env node
/**
 * Offline check: can tesseract.js read MCCB / Micrologic serials from the site photos?
 *   node scripts/read-serials.mjs [folder]
 */
import { createWorker } from "tesseract.js";
import fs from "node:fs";
import path from "node:path";

const WX_RE = /WX\d{8,}/gi;
const MCCB_RE = /\d[A-Z]{2,3}\d{7,12}/gi;

const ROOT =
  process.argv[2] ||
  path.join(process.env.HOME, ".cursor/projects/Users-sumit-projects-mccb-frame-qa/assets");

function hits(text, re) {
  const compact = String(text || "").toUpperCase().replace(/[^A-Z0-9-]+/g, " ");
  return [...new Set([...(compact.match(re) || [])])];
}

async function main() {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => /\.jpe?g$/i.test(f))
    .filter((f) => /IMG_757[89]|IMG_758[0-9]|IMG_759[0-9]|IMG_7603/.test(f))
    .sort();
  if (!files.length) {
    console.error("No jpgs in", ROOT);
    process.exit(1);
  }

  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
  });

  console.log(`OCR ${files.length} photos\n`);
  let wxOk = 0;
  let mccbOk = 0;

  for (const file of files) {
    const full = path.join(ROOT, file);
    const { data } = await worker.recognize(full);
    const wx = hits(data.text, WX_RE);
    const mccb = hits(data.text, MCCB_RE).filter((v) => !v.startsWith("WX") && !v.startsWith("NSX") && !v.startsWith("C10"));
    if (wx.length) wxOk += 1;
    if (mccb.length) mccbOk += 1;
    console.log(file);
    console.log("  WX  ", wx.join(", ") || "—");
    console.log("  MCCB", mccb.join(", ") || "—");
    console.log("  raw ", data.text.replace(/\s+/g, " ").slice(0, 160));
    console.log("");
  }

  await worker.terminate();
  console.log(`WX found on ${wxOk}/${files.length}  MCCB-like on ${mccbOk}/${files.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
