"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPaddleOcr } from "@/lib/paddleOcr";
import { serialCandidates } from "@/lib/serialParse";

type Box = { x: number; y: number; w: number; h: number };

/** Matches the on-screen preview (object-cover, aspect 13/5). */
const VIEW_ASPECT = 13 / 5;

function visibleRoi(vw: number, vh: number): Box {
  const band = vw / VIEW_ASPECT;
  if (band <= vh) return { x: 0, y: (vh - band) / 2, w: vw, h: band };
  const wide = vh * VIEW_ASPECT;
  return { x: (vw - wide) / 2, y: 0, w: wide, h: vh };
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
  const streamRef = useRef<MediaStream | null>(null);
  const camGenRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState("");
  const [hint, setHint] = useState("Lime sticker in the green window, then Snap.");
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

  async function readCanvas(frame: HTMLCanvasElement, framed: boolean) {
    setBusy(true);
    setHint("Reading…");
    try {
      const region = framed ? visibleRoi(frame.width, frame.height) : { x: 0, y: 0, w: frame.width, h: frame.height };
      const paddle = await getPaddleOcr();
      const [result] = await paddle.predict(crop(frame, region), {
        textDetLimitSideLen: 480,
        textRecognitionBatchSize: 1,
      });
      const text = (result?.items ?? []).map((item) => item.text ?? "").join("\n");
      const parsed = serialCandidates(text, "mccb")[0] ?? "";
      setGuess(parsed || text.replace(/\s+/g, "").slice(0, 11));
      setHint(parsed ? "Check, then confirm." : "Nothing in the window — move closer and Snap.");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-white p-3 sm:h-auto sm:max-h-[100dvh] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="font-semibold">MCCB sticker</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            Close
          </button>
        </div>
        <p className="mt-1 shrink-0 truncate text-sm text-neutral-600">{hint}</p>
        {camError ? <p className="shrink-0 text-sm text-red-700">{camError}</p> : null}

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

        <div className="relative mt-2 aspect-[13/5] w-full shrink-0 overflow-hidden rounded-xl border-2 border-emerald-600 bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover object-center" />
        </div>

        <div className="mt-2 flex shrink-0 gap-2">
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
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-rule px-4 py-3">
            Album
          </button>
        </div>

        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value.toUpperCase())}
          placeholder="Serial"
          className="mt-2 w-full shrink-0 rounded-lg border border-rule px-3 py-3 uppercase"
        />
        <button
          type="button"
          disabled={!guess.trim()}
          onClick={() => onSerial(guess.trim().toUpperCase())}
          className="mt-2 w-full shrink-0 rounded-lg bg-ink py-3 text-white disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
