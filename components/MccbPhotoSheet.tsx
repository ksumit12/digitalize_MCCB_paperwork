"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPaddleOcr } from "@/lib/paddleOcr";
import { serialCandidates } from "@/lib/serialParse";

type Box = { x: number; y: number; w: number; h: number };

async function canvasFromFile(file: File) {
  const bmp = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

function crop(src: HTMLCanvasElement, box: Box, maxSide = 640) {
  const scale = Math.min(2, maxSide / Math.max(1, box.w, box.h));
  const out = document.createElement("canvas");
  out.width = Math.max(160, Math.round(box.w * scale));
  out.height = Math.max(48, Math.round(box.h * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out;
}

function normBox(a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number): Box {
  const x = Math.max(0, Math.min(a.x, b.x));
  const y = Math.max(0, Math.min(a.y, b.y));
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(Math.min(w - x, Math.abs(b.x - a.x))),
    h: Math.round(Math.min(h - y, Math.abs(b.y - a.y))),
  };
}

export function MccbPhotoSheet({
  onClose,
  onSerial,
}: {
  onClose: () => void;
  onSerial: (serial: string) => void;
}) {
  const stillRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStill, setHasStill] = useState(false);
  const [cropBox, setCropBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("Take a photo of the lime serial sticker, then drag a box around it.");
  const [raw, setRaw] = useState("");
  const [guess, setGuess] = useState("");

  const paintStill = useCallback((box?: Box | null) => {
    const src = stillCanvasRef.current;
    const dest = stillRef.current;
    if (!src || !dest) return;
    dest.width = src.width;
    dest.height = src.height;
    const ctx = dest.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    if (!box || box.w < 4 || box.h < 4) return;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, dest.width, dest.height);
    ctx.drawImage(src, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = Math.max(3, Math.round(dest.width / 400));
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }, []);

  useEffect(() => {
    paintStill(cropBox);
  }, [cropBox, paintStill, hasStill]);

  function pointerToStill(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = stillRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  async function readCrop() {
    const frame = stillCanvasRef.current;
    if (!frame || !cropBox || cropBox.w < 12 || cropBox.h < 8) {
      setHint("Drag a box around the whole lime sticker first.");
      return;
    }
    setBusy(true);
    setHint("Reading… first time downloads models, then it stays on this phone.");
    try {
      const paddle = await getPaddleOcr();
      const [result] = await paddle.predict(crop(frame, cropBox), {
        textDetLimitSideLen: 480,
        textRecognitionBatchSize: 1,
      });
      const text = (result?.items ?? []).map((item) => item.text ?? "").join("\n");
      const parsed = serialCandidates(text, "mccb")[0] ?? "";
      setRaw(text.trim());
      setGuess(parsed);
      setHint(parsed ? "Check the serial, then confirm." : "No 11-character serial in that crop — drag again or type it.");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">MCCB photo</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            Close
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-600">{hint}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void canvasFromFile(file).then((frame) => {
              stillCanvasRef.current = frame;
              setHasStill(true);
              setCropBox(null);
              setRaw("");
              setGuess("");
              setHint("Drag a box around the lime sticker.");
              requestAnimationFrame(() => paintStill(null));
            });
          }}
        />
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-xl bg-ink py-3 text-white"
          >
            Take photo
          </button>
          <button
            type="button"
            disabled={busy || !cropBox}
            onClick={() => void readCrop()}
            className="flex-1 rounded-xl bg-emerald-700 py-3 text-white disabled:opacity-40"
          >
            {busy ? "Reading…" : "Read sticker"}
          </button>
        </div>
        {hasStill ? (
          <canvas
            ref={stillRef}
            className="mb-3 w-full cursor-crosshair touch-none rounded-xl bg-black"
            onPointerDown={(e) => {
              const p = pointerToStill(e);
              if (!p) return;
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              dragRef.current = p;
              setCropBox({ x: p.x, y: p.y, w: 1, h: 1 });
            }}
            onPointerMove={(e) => {
              if (!dragRef.current) return;
              const p = pointerToStill(e);
              const src = stillCanvasRef.current;
              if (!p || !src) return;
              setCropBox(normBox(dragRef.current, p, src.width, src.height));
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
          />
        ) : null}
        {raw ? <pre className="mb-2 whitespace-pre-wrap break-all rounded-lg bg-neutral-50 p-2 font-mono text-xs">{raw}</pre> : null}
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value.toUpperCase())}
          placeholder="Serial"
          className="w-full rounded-lg border border-rule px-3 py-3 uppercase"
        />
        <button
          type="button"
          disabled={!guess.trim()}
          onClick={() => onSerial(guess.trim().toUpperCase())}
          className="mt-2 w-full rounded-lg bg-ink py-3 text-white disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
