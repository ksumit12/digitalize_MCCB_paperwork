"use client";

import Link from "next/link";
import { use } from "react";
import { PdfButtons } from "@/components/PdfButtons";
import { Field, TextInput } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";

export default function MorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update } = useFrame(id);

  if (loading) return <p className="p-6 text-sm">Loading…</p>;
  if (!frame) return <p className="p-6">Frame not found.</p>;

  const slot = `${frame.stringKey || "1"}-${frame.frameSlot || frame.stringId || ""}`;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-28 md:max-w-2xl">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Back to strings"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink ring-1 ring-rule"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Link
          href={`/frames/${id}/map`}
          className="inline-flex rounded-xl bg-testing px-3 py-2 text-sm font-semibold text-on-testing"
        >
          ← Board
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Office</h1>

      <Field label="Shepherd Frame ID">
        <TextInput
          value={frame.shepherdFrameId}
          onChange={(e) => update((f) => ({ ...f, shepherdFrameId: e.target.value }))}
          className="text-lg"
        />
      </Field>
      <Field label="ACTSW Frame ID">
        <TextInput
          value={frame.actswFrameId}
          onChange={(e) => update((f) => ({ ...f, actswFrameId: e.target.value }))}
          className="text-lg"
        />
      </Field>
      <div className="rounded-2xl bg-surface p-4 ring-1 ring-rule">
        <p className="text-sm font-medium text-muted">Module frame serial</p>
        <p className="mt-1 text-lg font-semibold">{frame.moduleFrameSerialNumber || slot}</p>
      </div>

      <Link
        href={`/frames/${id}/install`}
        className="block rounded-2xl bg-surface p-5 text-lg font-semibold ring-1 ring-rule"
      >
        Frame install
      </Link>
      <Link
        href={`/frames/${id}/ancillary`}
        className="block rounded-2xl bg-surface p-5 text-lg font-semibold ring-1 ring-rule"
      >
        Lights & wiring
      </Link>
      <Link
        href={`/frames/${id}/testing`}
        className="block rounded-2xl bg-surface p-5 text-lg font-semibold ring-1 ring-rule"
      >
        Electrical testing
      </Link>
      <Link
        href={`/frames/${id}/handover`}
        className="block rounded-2xl bg-surface p-5 text-lg font-semibold ring-1 ring-rule"
      >
        Handover
      </Link>

      <div className="rounded-2xl bg-surface p-4 ring-1 ring-rule">
        <PdfButtons frame={frame} />
      </div>
    </main>
  );
}
