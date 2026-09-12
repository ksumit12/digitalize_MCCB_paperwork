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
    <main className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-28">
      <Link
        href={`/frames/${id}/map`}
        className="inline-flex rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
      >
        ← Board
      </Link>
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
      <div className="rounded-2xl bg-white p-4">
        <p className="text-sm font-medium text-neutral-700">Module frame serial</p>
        <p className="mt-1 text-lg font-semibold">{frame.moduleFrameSerialNumber || slot}</p>
      </div>

      <Link
        href={`/frames/${id}/install`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Frame install
      </Link>
      <Link
        href={`/frames/${id}/ancillary`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Lights & wiring
      </Link>
      <Link
        href={`/frames/${id}/testing`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Electrical testing
      </Link>
      <Link
        href={`/frames/${id}/handover`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Handover
      </Link>
      <Link
        href="/paper-entry"
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Enter old paperwork
      </Link>

      <div className="rounded-2xl bg-white p-4">
        <PdfButtons frame={frame} />
      </div>
    </main>
  );
}
