import { getPaddleOcr } from "./paddleOcr";
import { serialCandidates } from "./serialParse";

/*
 * Full-page OCR of an old paper form, reusing the existing in-browser
 * PaddleOCR engine and serial parsers (no OCR code changed).
 * Used by paper entry to auto-fill a board's serial table from a photo.
 */

export type PaperScanResult = {
  lines: string[];
  mccbs: string[];
  mls: string[];
  shunts: string[];
  switchboardLine?: string;
};

export async function scanPaperPage(file: File): Promise<PaperScanResult> {
  const bmp = await createImageBitmap(file);
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot read image");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();

  const paddle = await getPaddleOcr();
  const [result] = await paddle.predict(canvas, {
    textDetLimitSideLen: 960,
    textRecognitionBatchSize: 1,
  });
  const lines = (result?.items ?? [])
    .map((item) => (item.text ?? "").trim())
    .filter((t) => t.length > 0);
  const text = lines.join("\n");

  return {
    lines,
    mccbs: serialCandidates(text, "mccb"),
    mls: serialCandidates(text, "ml"),
    shunts: serialCandidates(text, "shunt"),
    switchboardLine: lines.find((l) => /switchboard\s+s\/?n/i.test(l)),
  };
}
