"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPaddleOcr } from "@/lib/paddleOcr";
import { serialCandidates } from "@/lib/serialParse";

type Box = { x: number; y: number; w: number; h: number };

function guideBox(vw: number, vh: number): Box {
  const w = vw * 0.9;
  const h = Math.min(vh * 0.42, w / 2.6);
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
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

function frameFromVideo(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas;
}

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

export function MccbPhotoSheet({
  onClose,
  onSerial,
}: {
  onClose: () => void;
  onSerial: (serial: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camGenRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState("");
  const [hint, setHint] = useState("Fill the green box with the lime sticker, then Snap.");
  const [raw, setRaw] = useState("");
  const [guess, setGuess] = useState("");

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
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
  }, []);

  useEffect(() => {
    void startCam();
    void getPaddleOcr().catch(() => undefined);
    return () => stopCam();
  }, [startCam, stopCam]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (video && overlay && video.readyState >= 2 && video.videoWidth) {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        const ctx = overlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          const box = guideBox(overlay.width, overlay.height);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(0, 0, overlay.width, overlay.height);
          ctx.clearRect(box.x, box.y, box.w, box.h);
          ctx.strokeStyle = "#22c55e";
          ctx.lineWidth = Math.max(4, overlay.width / 220);
          ctx.strokeRect(box.x, box.y, box.w, box.h);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function readCanvas(frame: HTMLCanvasElement, framed: boolean) {
    setBusy(true);
    setHint("Reading…");
    try {
      const region = framed ? guideBox(frame.width, frame.height) : { x: 0, y: 0, w: frame.width, h: frame.height };
      const paddle = await getPaddleOcr();
      const [result] = await paddle.predict(crop(frame, region), {
        textDetLimitSideLen: 480,
        textRecognitionBatchSize: 1,
      });
      const text = (result?.items ?? []).map((item) => item.text ?? "").join("\n");
      const parsed = serialCandidates(text, "mccb")[0] ?? "";
      setRaw(text.trim());
      setGuess(parsed);
      setHint(
        parsed
          ? "Check the serial, then confirm."
          : "No 11-character serial in the box — move closer and Snap again.",
      );
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
          <h2 className="font-semibold">MCCB sticker</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            Close
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-600">{hint}</p>
        {camError ? <p className="mb-2 text-sm text-red-700">{camError}</p> : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void canvasFromFile(file).then((frame) => readCanvas(frame, false));
          }}
        />

        <div className="relative mb-3 overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="w-full" />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        </div>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const video = videoRef.current;
              if (video?.videoWidth) void readCanvas(frameFromVideo(video), true);
            }}
            className="flex-1 rounded-xl bg-emerald-700 py-3 text-white disabled:opacity-40"
          >
            {busy ? "Reading…" : "Snap"}
          </button>
          <button type="button" onClick={() => void startCam()} className="rounded-xl border border-rule px-3 py-3">
            Camera
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-rule px-3 py-3">
            Album
          </button>
        </div>

        {raw ? (
          <pre className="mb-2 whitespace-pre-wrap break-all rounded-lg bg-neutral-50 p-2 font-mono text-xs">{raw}</pre>
        ) : null}
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
