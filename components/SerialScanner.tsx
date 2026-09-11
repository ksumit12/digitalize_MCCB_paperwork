"use client";

import { useEffect, useId, useRef, useState } from "react";
import { looksLikeUrl, parseMicrologicSerial } from "@/lib/serialParse";

type ScannerType = "qr" | "ocr";

export function SerialScanner({
  type,
  label,
  value,
  onConfirm,
  hero = false,
}: {
  type: ScannerType;
  label: string;
  value: string;
  onConfirm: (serial: string) => void;
  hero?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(value);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const readerId = useId().replace(/:/g, "");
  const videoHost = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setManual(value);
  }, [value]);

  useEffect(() => {
    if (!open || type !== "qr") return;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !videoHost.current) return;
        const id = videoHost.current.id || readerId;
        const inst = new Html5Qrcode(id);
        scanner = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            setRaw(decoded);
            setParsed(parseMicrologicSerial(decoded));
            void inst.stop();
          },
          () => undefined,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) void scanner.stop().catch(() => undefined);
    };
  }, [open, type]);

  useEffect(() => {
    if (!open || type !== "ocr") return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, type]);

  async function runOcr() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const cropW = Math.min(video.videoWidth, 640);
    const cropH = Math.min(video.videoHeight, 180);
    const sx = Math.max(0, (video.videoWidth - cropW) / 2);
    const sy = Math.max(0, (video.videoHeight - cropH) / 2);
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
    setBusy(true);
    setError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const cleaned = data.text.replace(/\s+/g, "").toUpperCase();
      setOcrText(cleaned);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setRaw("");
    setParsed(null);
    setOcrText("");
    setError("");
  }

  return (
    <div className="space-y-2">
      {hero ? (
        <div className="space-y-3">
          {value ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-center text-lg font-semibold">{value}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-2xl bg-ink py-5 text-lg font-medium text-white"
          >
            {type === "qr" ? "Scan QR" : "Take photo"}
          </button>
          {typing ? (
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type serial"
              className="w-full rounded-2xl border border-rule px-4 py-4 text-lg"
            />
          ) : (
            <button type="button" onClick={() => setTyping(true)} className="w-full py-3 text-sm text-neutral-600">
              Type it instead
            </button>
          )}
          {typing ? (
            <button
              type="button"
              disabled={!manual.trim()}
              onClick={() => onConfirm(manual.trim())}
              className="w-full rounded-2xl bg-sky-600 py-4 text-white disabled:opacity-30"
            >
              Use typed serial
            </button>
          ) : null}
        </div>
      ) : (
      <div className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onBlur={() => onConfirm(manual.trim())}
          placeholder={label}
          className="min-w-0 flex-1 rounded-lg border border-rule px-3 py-2.5"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm text-white"
        >
          {type === "qr" ? "Scan QR" : "OCR"}
        </button>
      </div>
      )}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{label}</h2>
              <button type="button" onClick={close} className="text-sm text-neutral-500">
                Close
              </button>
            </div>
            {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
            {type === "qr" ? (
              <>
                <div id={readerId} ref={videoHost} className="overflow-hidden rounded-lg" />
                {raw ? (
                  <div className="mt-3 space-y-2 text-sm">
                    {parsed ? (
                      <p>
                        Parsed serial: <strong>{parsed}</strong>
                      </p>
                    ) : (
                      <p className="rounded-lg bg-amber-50 p-2 text-amber-900">
                        Could not parse a serial from the scan. Do not save the URL as a serial —
                        type it below.
                      </p>
                    )}
                    <p className="break-all text-neutral-600">Raw: {raw}</p>
                    {looksLikeUrl(raw) && !parsed ? (
                      <p className="text-xs text-neutral-500">
                        This looks like a product-registration URL.
                      </p>
                    ) : null}
                    <input
                      value={parsed ?? ""}
                      onChange={(e) => setParsed(e.target.value || null)}
                      placeholder="Type serial"
                      className="w-full rounded-lg border border-rule px-3 py-2"
                    />
                    <button
                      type="button"
                      disabled={!parsed}
                      onClick={() => {
                        if (!parsed) return;
                        onConfirm(parsed);
                        setManual(parsed);
                        close();
                      }}
                      className="w-full rounded-lg bg-ink py-2.5 text-white disabled:opacity-40"
                    >
                      Confirm serial
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Point at the Micrologic QR on the clear cover.</p>
                )}
              </>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-lg bg-black">
                  <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted />
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-16 -translate-y-1/2 rounded border-2 border-lime-300/90" />
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Line up the soft green MCCB sticker in the lime box, then capture. Confirm before
                  saving.
                </p>
                <canvas ref={canvasRef} className="mt-2 max-h-24 w-full rounded border border-rule bg-neutral-50" />
                <button
                  type="button"
                  onClick={runOcr}
                  disabled={busy}
                  className="mt-2 w-full rounded-lg border border-ink py-2.5"
                >
                  {busy ? "Reading…" : "Capture & OCR"}
                </button>
                {ocrText ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm">
                      OCR candidate: <strong>{ocrText}</strong>
                    </p>
                    <input
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      className="w-full rounded-lg border border-rule px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onConfirm(ocrText);
                        setManual(ocrText);
                        close();
                      }}
                      className="w-full rounded-lg bg-ink py-2.5 text-white"
                    >
                      Confirm
                    </button>
                  </div>
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                onConfirm(manual.trim());
                close();
              }}
              className="mt-3 w-full text-sm text-neutral-600"
            >
              Use typed value instead
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
