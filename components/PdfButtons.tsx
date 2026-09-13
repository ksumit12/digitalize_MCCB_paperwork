"use client";

import { useState } from "react";
import type { Frame } from "@/lib/types";

export function PdfButtons({ frame }: { frame: Frame }) {
  const [busy, setBusy] = useState(false);

  async function run(kind: "download" | "print") {
    setBusy(true);
    try {
      const { buildFramePdf, downloadPdfBytes, printPdfBytes } = await import("@/lib/pdf");
      const bytes = await buildFramePdf(frame);
      const name = `frame-${frame.stringId || frame.shepherdFrameId || frame.id.slice(0, 8)}.pdf`;
      if (kind === "download") downloadPdfBytes(bytes, name);
      else printPdfBytes(bytes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("download")}
        className="rounded-2xl bg-ink px-4 py-3.5 text-base text-white"
      >
        {busy ? "Building…" : "Download PDF"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("print")}
        className="rounded-2xl border border-ink bg-white px-4 py-3.5 text-base"
      >
        Print
      </button>
    </div>
  );
}
