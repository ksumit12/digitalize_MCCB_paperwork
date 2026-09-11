"use client";

import { useState } from "react";
import { buildFramePdf, downloadPdfBytes, printPdfBytes } from "@/lib/pdf";
import type { Frame } from "@/lib/types";

export function PdfButtons({ frame }: { frame: Frame }) {
  const [busy, setBusy] = useState(false);

  async function bytes() {
    setBusy(true);
    try {
      return await buildFramePdf(frame);
    } finally {
      setBusy(false);
    }
  }

  const name = `frame-${frame.stringId || frame.shepherdFrameId || frame.id.slice(0, 8)}.pdf`;

  return (
    <div className="no-print flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => downloadPdfBytes(await bytes(), name)}
        className="rounded-lg bg-ink px-4 py-2.5 text-sm text-white"
      >
        {busy ? "Building…" : "Download PDF"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => printPdfBytes(await bytes())}
        className="rounded-lg border border-ink px-4 py-2.5 text-sm"
      >
        Print
      </button>
    </div>
  );
}
