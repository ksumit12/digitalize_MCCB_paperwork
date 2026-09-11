"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { serialCandidates } from "@/lib/serialParse";
import { formatPaddleItems, getPaddleOcr } from "@/lib/paddleOcr";

type StepShot = { title: string; url: string; note: string };
type Box = { x: number; y: number; w: number; h: number };
type Profile = {
  mean: [number, number, number];
  std: [number, number, number];
  lumMin: number;
  lumMax: number;
  gLeadMin: number;
  gLeadMax: number;
  chromaMax: number;
  inkMax: number;
  n: number;
};

function lumOf(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isPaper(r: number, g: number, b: number, p: Profile, loosen = 1.6) {
  const lum = lumOf(r, g, b);
  if (lum < p.inkMax) return false;
  if (lum < p.lumMin - 18 * loosen || lum > Math.min(255, p.lumMax + 12 * loosen)) return false;
  const gLead = g - Math.max(r, b);
  if (gLead < p.gLeadMin - 4 * loosen || gLead > p.gLeadMax + 4 * loosen) return false;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > p.chromaMax + 10 * loosen) return false;
  const dr = (r - p.mean[0]) / Math.max(6, p.std[0] * loosen);
  const dg = (g - p.mean[1]) / Math.max(6, p.std[1] * loosen);
  const db = (b - p.mean[2]) / Math.max(6, p.std[2] * loosen);
  return dr * dr + dg * dg + db * db <= 9;
}

function findTaughtBox(data: Uint8ClampedArray, width: number, height: number, profile: Profile) {
  const cell = 12;
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const heat = new Uint16Array(gw * gh);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (!isPaper(data[i], data[i + 1], data[i + 2], profile)) continue;
      heat[((y / cell) | 0) * gw + ((x / cell) | 0)] += 1;
    }
  }
  let peak = 0;
  for (const v of heat) if (v > peak) peak = v;
  if (peak < 6) return null;
  const floor = Math.max(4, Math.floor(peak * 0.18));
  const seen = new Uint8Array(heat.length);
  let best: Box & { count: number } | null = null;
  let bestScore = 0;
  for (let start = 0; start < heat.length; start += 1) {
    if (seen[start] || heat[start] < floor) continue;
    const q = [start];
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    while (q.length) {
      const i = q.pop() as number;
      const gx = i % gw;
      const gy = (i / gw) | 0;
      count += heat[i];
      const x0 = gx * cell;
      const y0 = gy * cell;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, Math.min(width, x0 + cell));
      maxY = Math.max(maxY, Math.min(height, y0 + cell));
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (seen[ni] || heat[ni] < floor) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const aspect = w / Math.max(1, h);
    const shape = (aspect >= 1.3 && aspect <= 6.5) || (aspect >= 0.18 && aspect <= 0.8) ? 1.5 : 0.5;
    const score = count * shape * Math.min(w, h);
    if (score > bestScore) {
      bestScore = score;
      best = { count, x: minX, y: minY, w, h };
    }
  }
  if (!best || best.w < 36 || best.h < 14) return null;
  const pad = 10;
  const x = Math.max(0, best.x - pad);
  const y = Math.max(0, best.y - pad);
  return {
    count: best.count,
    x,
    y,
    w: Math.min(width, best.x + best.w + pad) - x,
    h: Math.min(height, best.y + best.h + pad) - y,
  };
}

function sampleProfile(data: Uint8ClampedArray, width: number, height: number, box: Box): Profile | null {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const lums: number[] = [];
  const leads: number[] = [];
  const chromas: number[] = [];
  let ink = 0;
  let inkN = 0;
  const x1 = Math.min(width, box.x + box.w);
  const y1 = Math.min(height, box.y + box.h);
  for (let y = Math.max(0, box.y); y < y1; y += 1) {
    for (let x = Math.max(0, box.x); x < x1; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = lumOf(r, g, b);
      if (lum < 70) {
        ink += lum;
        inkN += 1;
        continue;
      }
      rs.push(r);
      gs.push(g);
      bs.push(b);
      lums.push(lum);
      leads.push(g - Math.max(r, b));
      chromas.push(Math.max(r, g, b) - Math.min(r, g, b));
    }
  }
  if (rs.length < 40) return null;
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) =>
    Math.sqrt(arr.reduce((a, v) => a + (v - m) * (v - m), 0) / arr.length);
  const pct = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  };
  const mr = mean(rs);
  const mg = mean(gs);
  const mb = mean(bs);
  return {
    mean: [mr, mg, mb],
    std: [std(rs, mr), std(gs, mg), std(bs, mb)],
    lumMin: pct(lums, 0.08),
    lumMax: pct(lums, 0.97),
    gLeadMin: pct(leads, 0.05),
    gLeadMax: pct(leads, 0.95),
    chromaMax: pct(chromas, 0.95),
    inkMax: inkN ? Math.max(55, ink / inkN + 25) : 70,
    n: rs.length,
  };
}

function canvasFromVideo(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas;
}

async function canvasFromFile(file: File) {
  const bmp = await createImageBitmap(file);
  const max = 1800;
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

function grayscale(src: HTMLCanvasElement, contrast = 1.55) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.filter = `grayscale(1) contrast(${contrast})`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  return out;
}

function otsuCut(src: HTMLCanvasElement) {
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 110;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const hist = new Array(256).fill(0);
  const d = img.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])] += 1;
    n += 1;
  }
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let cut = 110;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      cut = t;
    }
  }
  return cut;
}

function threshold(src: HTMLCanvasElement, cut: number) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < cut ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function toUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", 0.85);
}

function sliceCanvas(src: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number) {
  const x = Math.round(src.width * x0);
  const y = Math.round(src.height * y0);
  const w = Math.max(8, Math.round(src.width * (x1 - x0)));
  const h = Math.max(8, Math.round(src.height * (y1 - y0)));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

type OcrAttempt = {
  label: string;
  confidence: number;
  chars: number;
  text: string;
  error?: string;
};

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

export default function SerialLabPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stillCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [camError, setCamError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasStill, setHasStill] = useState(false);
  const [cropBox, setCropBox] = useState<Box | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileNote, setProfileNote] = useState("Snap or upload, then drag a box around the lime sticker.");
  const [attempts, setAttempts] = useState<OcrAttempt[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepShot[]>([]);
  const lastLabelRef = useRef("");
  const camGenRef = useRef(0);
  const [boxLabel, setBoxLabel] = useState("Camera off");

  const stopCam = useCallback(() => {
    camGenRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current?.pause();
  }, []);

  const startCam = useCallback(async () => {
    setCamError("");
    camGenRef.current += 1;
    const gen = camGenRef.current;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (gen !== camGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.muted = true;
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      if (gen !== camGenRef.current) return;
      const name = e instanceof DOMException ? e.name : "";
      if (name === "AbortError") return;
      setCamError(e instanceof Error ? e.message : "Camera blocked");
    }
  }, [facing]);

  useEffect(() => {
    void startCam();
    return () => stopCam();
  }, [startCam, stopCam]);

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

  const freeze = useCallback((frame: HTMLCanvasElement) => {
    stillCanvasRef.current = frame;
    setHasStill(true);
    setCropBox(null);
    setAttempts([]);
    setHits([]);
    setSteps([{ title: "Still", url: toUrl(frame), note: `${frame.width}×${frame.height} — drag a box on the lime sticker` }]);
    requestAnimationFrame(() => paintStill(null));
  }, [paintStill]);

  useEffect(() => {
    paintStill(cropBox);
  }, [cropBox, paintStill, hasStill]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!hasStill && video && overlay && video.readyState >= 2 && video.videoWidth && profile) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        const ctx = overlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          const tmp = document.createElement("canvas");
          tmp.width = overlay.width;
          tmp.height = overlay.height;
          const tctx = tmp.getContext("2d", { willReadFrequently: true });
          if (tctx) {
            tctx.drawImage(video, 0, 0);
            const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
            const box = findTaughtBox(img.data, tmp.width, tmp.height, profile);
            if (box) {
              ctx.strokeStyle = "#22c55e";
              ctx.lineWidth = 5;
              ctx.strokeRect(box.x, box.y, box.w, box.h);
            }
            const label = box ? `taught box ${box.w}×${box.h}` : "taught colours not in frame";
            if (label !== lastLabelRef.current) {
              lastLabelRef.current = label;
              setBoxLabel(label);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasStill, profile]);

  function pointerToStill(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = stillRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  async function runOcrOnCrop(frame: HTMLCanvasElement, box: Box, taught: Profile) {
    setBusy(true);
    setAttempts([]);
    setHits([]);
    const rows: OcrAttempt[] = [];
    try {
      const cropped = crop(frame, box);
      const gray = grayscale(cropped, 1.55);
      setSteps([
        { title: "1. Still", url: toUrl(frame), note: `${frame.width}×${frame.height}` },
        { title: "2. Color crop (PaddleOCR input)", url: toUrl(cropped), note: `${box.w}×${box.h} → ${cropped.width}×${cropped.height}` },
        { title: "3. Grayscale (preview only)", url: toUrl(gray), note: "not sent to PaddleOCR" },
      ]);
      setProfileNote(
        `Sampled ${taught.n} paper pixels  RGB ${taught.mean.map((v) => Math.round(v)).join(", ")}  lum ${Math.round(taught.lumMin)}–${Math.round(taught.lumMax)}  G-lead ${taught.gLeadMin.toFixed(1)}…${taught.gLeadMax.toFixed(1)}`,
      );

      const paddle = await getPaddleOcr();
      const [result] = await paddle.predict(cropped, {
        textDetLimitSideLen: 480,
        textRecognitionBatchSize: 1,
      });
      const lines = result?.items ?? [];
      const text = lines.map((item) => item.text ?? "").join("\n");
      const ms = result?.metrics?.totalMs;
      rows.push({
        label: `PaddleOCR tiny${typeof ms === "number" ? ` · ${Math.round(ms)} ms` : ""}`,
        confidence: Math.round((lines[0]?.score ?? 0) * 100),
        chars: text.replace(/\s+/g, "").length,
        text: text || formatPaddleItems(lines),
      });
      setAttempts([...rows]);

      const blob = rows.map((r) => r.text).join("\n");
      setHits(serialCandidates(blob, "mccb"));
    } catch (e) {
      rows.push({
        label: "worker",
        confidence: 0,
        chars: 0,
        text: "",
        error: e instanceof Error ? e.message : String(e),
      });
      setAttempts([...rows]);
    } finally {
      setBusy(false);
    }
  }

  async function teachFromCrop() {
    const frame = stillCanvasRef.current;
    if (!frame || !cropBox || cropBox.w < 12 || cropBox.h < 8) return;
    const ctx = frame.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, frame.width, frame.height);
    const taught = sampleProfile(img.data, frame.width, frame.height, cropBox);
    if (!taught) {
      setProfileNote("Crop is too small or too dark — draw around the whole lime sticker.");
      return;
    }
    setProfile(taught);
    await runOcrOnCrop(frame, cropBox, taught);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">MCCB serial lab</h1>
      <p className="text-sm text-neutral-600">
        Snap or upload one frame, then drag a box around the whole lime sticker. That crop is sent to PaddleOCR in the
        browser. First run downloads the models onto this device.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void canvasFromFile(file).then(freeze);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void startCam()} className="rounded-xl bg-ink px-4 py-2 text-white">
          Start camera
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          className="rounded-xl border border-rule bg-white px-4 py-2"
        >
          {facing === "user" ? "Front camera" : "Rear camera"}
        </button>
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (video?.videoWidth) freeze(canvasFromVideo(video));
          }}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-white"
        >
          Snap still
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-rule bg-white px-4 py-2">
          Upload photo
        </button>
        <button
          type="button"
          onClick={() => void teachFromCrop()}
          disabled={busy || !cropBox}
          className="rounded-xl bg-ink px-4 py-2 text-white disabled:opacity-40"
        >
          {busy ? "Reading…" : "Use this crop"}
        </button>
        <button
          type="button"
          onClick={() => {
            stillCanvasRef.current = null;
            setHasStill(false);
            setCropBox(null);
          }}
          className="rounded-xl border border-rule bg-white px-4 py-2"
        >
          Back to live
        </button>
      </div>
      {camError ? <p className="text-sm text-red-700">{camError}</p> : null}
      <p className="text-sm font-medium">{hasStill ? profileNote : boxLabel}</p>

      <div className={hasStill ? "pointer-events-none absolute h-px w-px overflow-hidden opacity-0" : "relative overflow-hidden rounded-2xl bg-black"}>
        <video ref={videoRef} playsInline muted autoPlay className="w-full -scale-x-100" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
      </div>
      {hasStill ? (
        <canvas
          ref={stillRef}
          className="w-full cursor-crosshair touch-none rounded-2xl bg-black"
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

      <div className="rounded-2xl bg-white p-4">
        <p className="text-xs uppercase text-neutral-500">Parsed (1 digit + 3 letters + 7 digits)</p>
        <p className="mt-1 text-xl font-semibold">{hits[0] || "no 11-char serial in the text below"}</p>
        {hits.length > 1 ? <p className="text-sm text-neutral-500">{hits.slice(1).join(" · ")}</p> : null}
        <p className="mt-4 text-xs uppercase text-neutral-500">What PaddleOCR actually returned</p>
        {attempts.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">{busy ? "Running…" : "—"}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {attempts.map((a) => (
              <li key={a.label} className="rounded-xl bg-neutral-50 p-3 font-mono text-sm">
                <p className="text-xs text-neutral-500">
                  {a.label} · confidence {a.confidence} · {a.chars} letters/digits
                </p>
                {a.error ? <p className="mt-1 text-red-700">error: {a.error}</p> : null}
                <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(a.text)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <figure key={s.title} className="rounded-2xl bg-white p-3">
            <figcaption className="mb-2 text-sm font-medium">
              {s.title}
              <span className="block text-xs font-normal text-neutral-500">{s.note}</span>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={s.title} className="w-full rounded-lg border border-rule bg-neutral-100" />
          </figure>
        ))}
      </div>
    </main>
  );
}
