"use client";

import { useEffect, useState } from "react";
import { scanPaperPage, type PaperScanResult } from "@/lib/paperScan";

/*
 * Modal that photos/scans one page of an old paper form and offers to fill
 * a CBSDS board's serial table from what OCR found.
 */

export function PaperScanSheet({
  label,
  onApply,
  onClose,
}: {
  label: string;
  onApply: (result: PaperScanResult) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaperScanResult | null>(null);

  useEffect(() => {
    if (busy) setError("");
  }, [busy]);

  async function read(file: File) {
    setBusy(true);
    try {
      setResult(await scanPaperPage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const found = result
    ? result.mccbs.length + result.mls.length + result.shunts.length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Scan paper page — CBSDS {label}</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            Close
          </button>
        </div>
        <p className="text-sm text-neutral-600">
          Photo the board&apos;s serial table page. Serials are read top-to-bottom and filled into
          positions 1–8 — check the result before saving.
        </p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

        <label className="mt-3 block rounded-xl bg-ink px-4 py-3 text-center text-sm font-medium text-white">
          {busy ? "Reading…" : "Take photo / choose image"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void read(file);
            }}
          />
        </label>

        {result ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">
              Found {found} serial{found === 1 ? "" : "s"}: {result.mccbs.length} MCCB · {result.mls.length}{" "}
              Micrologic · {result.shunts.length} shunt
            </p>
            {result.switchboardLine ? (
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Switchboard S/N line: {result.switchboardLine}
              </p>
            ) : null}
            <div className="max-h-32 overflow-auto rounded-lg bg-neutral-50 p-2 font-mono text-xs">
              {result.mccbs.map((s, i) => (
                <p key={`m${i}`}>
                  {i + 1}: {s}
                  {result.mls[i] ? ` · ML ${result.mls[i]}` : ""}
                  {result.shunts[i] ? ` · shunt ${result.shunts[i]}` : ""}
                </p>
              ))}
            </div>
            <button
              type="button"
              disabled={found === 0}
              onClick={() => onApply(result)}
              className="w-full rounded-xl bg-ink py-3 text-white disabled:opacity-30"
            >
              Fill CBSDS {label} from this page
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
