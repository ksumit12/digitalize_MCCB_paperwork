"use client";

import { useEffect, useId, useRef, useState } from "react";
import { looksLikeUrl, parseKind, serialCandidates, type SerialKind } from "@/lib/serialParse";

export function SerialScanner({
  type,
  kind,
  label,
  value,
  onConfirm,
  hero = false,
}: {
  type: "qr" | "ocr";
  kind?: SerialKind;
  label: string;
  value: string;
  onConfirm: (serial: string) => void;
  hero?: boolean;
}) {
  const serialKind: SerialKind = kind ?? (type === "qr" ? "ml" : "mccb");
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(value);
  const [raw, setRaw] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const readerId = useId().replace(/:/g, "");
  const videoHost = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setManual(value);
  }, [value]);

  useEffect(() => {
    if (!open || type !== "qr") return;
    let scanner: { stop: () => Promise<void> } | null = null;
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
          { fps: 12, qrbox: { width: 280, height: 280 } },
          (decoded) => {
            setRaw(decoded);
            const parsed = parseKind(decoded, serialKind);
            const list = serialCandidates(decoded, serialKind);
            setHits(list);
            setPicked(parsed || list[0] || "");
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
  }, [open, type, readerId, serialKind]);

  async function readFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const canvases = await stillsFromFile(file);
      const texts: string[] = [];
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      });
      for (const canvas of canvases) {
        const { data } = await worker.recognize(canvas);
        texts.push(data.text);
      }
      await worker.terminate();

      if (serialKind === "ml") {
        const qr = await tryQrFromFile(file);
        if (qr) texts.push(qr);
      }

      const blob = texts.join("\n");
      setRaw(blob.replace(/\s+/g, " ").slice(0, 400));
      const list = serialCandidates(blob, serialKind);
      setHits(list);
      setPicked(list[0] || "");
      if (!list.length) setError("No serial found — type it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Read failed");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setRaw("");
    setHits([]);
    setPicked("");
    setError("");
  }

  function save(serial: string) {
    const v = serial.trim();
    if (!v) return;
    onConfirm(v);
    setManual(v);
    close();
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void readFile(file);
        }}
      />
      {hero ? (
        <div className="space-y-3">
          {value ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-center text-lg font-semibold">{value}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (type !== "qr") fileRef.current?.click();
            }}
            className="w-full rounded-2xl bg-ink py-5 text-lg font-medium text-white"
          >
            {type === "qr" ? "Scan QR" : "Photo"}
          </button>
          {type === "qr" ? (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                fileRef.current?.click();
              }}
              className="w-full rounded-2xl bg-zinc-200 py-4 text-lg"
            >
              Photo
            </button>
          ) : null}
          {typing ? (
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Serial"
              className="w-full rounded-2xl border border-rule px-4 py-4 text-lg"
            />
          ) : (
            <button type="button" onClick={() => setTyping(true)} className="w-full py-3 text-sm text-neutral-600">
              Type
            </button>
          )}
          {typing ? (
            <button
              type="button"
              disabled={!manual.trim()}
              onClick={() => save(manual)}
              className="w-full rounded-2xl bg-sky-600 py-4 text-white disabled:opacity-30"
            >
              Use typed
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
            onClick={() => {
              setOpen(true);
              if (type !== "qr") fileRef.current?.click();
            }}
            className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm text-white"
          >
            {type === "qr" ? "QR" : "Photo"}
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
            {busy ? <p className="mb-2 text-sm">Reading…</p> : null}
            {type === "qr" ? <div id={readerId} ref={videoHost} className="overflow-hidden rounded-lg" /> : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full rounded-lg border border-ink py-3"
            >
              Photo
            </button>
            {hits.length ? (
              <div className="mt-3 space-y-2">
                {hits.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setPicked(h)}
                    className={`w-full rounded-xl py-3 text-lg font-semibold ${
                      picked === h ? "bg-ink text-white" : "bg-zinc-100"
                    }`}
                  >
                    {h}
                  </button>
                ))}
                <input
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  className="w-full rounded-lg border border-rule px-3 py-2"
                />
                <button
                  type="button"
                  disabled={!picked.trim()}
                  onClick={() => save(picked)}
                  className="w-full rounded-lg bg-ink py-3 text-white disabled:opacity-40"
                >
                  Confirm
                </button>
              </div>
            ) : raw && type === "qr" ? (
              <p className="mt-2 break-all text-sm text-neutral-600">{looksLikeUrl(raw) ? "QR read — no WX serial." : raw}</p>
            ) : null}
            <button
              type="button"
              onClick={() => save(manual)}
              className="mt-3 w-full text-sm text-neutral-600"
            >
              Type instead
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function stillsFromFile(file: File): Promise<HTMLCanvasElement[]> {
  const bmp = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const out: HTMLCanvasElement[] = [];
  for (const angle of [0, 90, 270] as const) {
    const rw = angle % 180 === 0 ? w : h;
    const rh = angle % 180 === 0 ? h : w;
    const canvas = document.createElement("canvas");
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rw, rh);
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
    ctx.filter = "none";
    out.push(canvas);
  }
  bmp.close();
  return out;
}

async function tryQrFromFile(file: File): Promise<string> {
  try {
    const { Html5Qrcode } = await import("html5-qrcode");
    const id = `qr-file-${Math.random().toString(36).slice(2)}`;
    const host = document.createElement("div");
    host.id = id;
    host.style.display = "none";
    document.body.appendChild(host);
    const inst = new Html5Qrcode(id);
    const text = await inst.scanFile(file, true);
    inst.clear();
    host.remove();
    return text;
  } catch {
    return "";
  }
}
