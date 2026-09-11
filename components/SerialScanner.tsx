"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MccbPhotoSheet } from "@/components/MccbPhotoSheet";
import { parseKind, serialCandidates, type SerialKind } from "@/lib/serialParse";

type ScannerHandle = { stop: () => Promise<void>; clear?: () => void };

async function safeStop(scanner: ScannerHandle | null) {
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {
    /* already stopped */
  }
  try {
    scanner.clear?.();
  } catch {
    /* ignore */
  }
}

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
  const [photoOpen, setPhotoOpen] = useState(false);
  const [manual, setManual] = useState(value);
  const [error, setError] = useState("");
  const readerId = useId().replace(/:/g, "");
  const videoHost = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<ScannerHandle | null>(null);
  const savingRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    setManual(value);
  }, [value]);

  useEffect(() => {
    if (!open || serialKind !== "ml") return;
    let cancelled = false;
    savingRef.current = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled || !videoHost.current) return;
        videoHost.current.id = readerId;
        const inst = new Html5Qrcode(readerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.DATA_MATRIX],
          verbose: false,
        });
        scannerRef.current = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decoded) => {
            if (cancelled || savingRef.current) return;
            const parsed = parseKind(decoded, "ml");
            const list = serialCandidates(decoded, "ml");
            const best = parsed || list[0] || "";
            if (!best) {
              setManual(decoded.replace(/\s+/g, "").toUpperCase().slice(0, 32));
              setError("QR read — check serial, then confirm.");
              return;
            }
            savingRef.current = true;
            cancelled = true;
            void safeStop(inst).then(() => {
              scannerRef.current = null;
              onConfirmRef.current(best);
            });
          },
          () => undefined,
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      if (savingRef.current) return;
      const inst = scannerRef.current;
      scannerRef.current = null;
      void safeStop(inst);
    };
  }, [open, readerId, serialKind]);

  function close() {
    savingRef.current = false;
    setOpen(false);
    setError("");
  }

  function save(serial: string) {
    const v = serial.trim().toUpperCase();
    if (!v) return;
    onConfirm(v);
    setManual(v);
    close();
  }

  return (
    <div className="space-y-2">
      {hero ? (
        <div className="space-y-3">
          {value ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-center text-lg font-semibold">{value}</p>
          ) : null}
          {serialKind === "ml" ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setOpen(true);
              }}
              className="w-full rounded-2xl bg-ink py-5 text-lg font-medium text-white"
            >
              Scan QR
            </button>
          ) : null}
          {serialKind === "mccb" ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setPhotoOpen(true);
              }}
              className="w-full rounded-2xl bg-ink py-5 text-lg font-medium text-white"
            >
              Scan sticker
            </button>
          ) : null}
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="Serial"
            className="w-full rounded-2xl border border-rule px-4 py-4 text-lg uppercase"
          />
          <button
            type="button"
            disabled={!manual.trim()}
            onClick={() => save(manual)}
            className="w-full rounded-2xl bg-ink py-4 text-white disabled:opacity-30"
          >
            Use typed
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            onBlur={() => {
              if (manual.trim()) onConfirm(manual.trim().toUpperCase());
            }}
            placeholder={label}
            className="min-w-0 flex-1 rounded-lg border border-rule px-3 py-2.5 uppercase"
          />
          {serialKind === "ml" ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setOpen(true);
              }}
              className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm text-white"
            >
              QR
            </button>
          ) : null}
          {serialKind === "mccb" ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setPhotoOpen(true);
              }}
              className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm text-white"
            >
              Scan
            </button>
          ) : null}
        </div>
      )}
      {photoOpen && serialKind === "mccb" ? (
        <MccbPhotoSheet
          onClose={() => setPhotoOpen(false)}
          onSerial={(serial) => {
            setPhotoOpen(false);
            save(serial);
          }}
        />
      ) : null}
      {open && serialKind === "ml" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{label}</h2>
              <button type="button" onClick={close} className="text-sm text-neutral-500">
                Close
              </button>
            </div>
            {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
            <div id={readerId} ref={videoHost} className="min-h-48 overflow-hidden rounded-lg" />
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase())}
              placeholder="Serial"
              className="mt-3 w-full rounded-lg border border-rule px-3 py-3 uppercase"
            />
            <button
              type="button"
              disabled={!manual.trim()}
              onClick={() => save(manual)}
              className="mt-2 w-full rounded-lg bg-ink py-3 text-white disabled:opacity-40"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
