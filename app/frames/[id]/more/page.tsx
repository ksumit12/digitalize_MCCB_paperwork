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

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-5">
      <h1 className="text-xl font-semibold">Office / paper header</h1>
      <p className="text-sm text-neutral-600">
        Frame numbers and checklists live here so the crew on the board only logs serials.
      </p>
      <Field label="Shepherd Frame ID">
        <TextInput
          value={frame.shepherdFrameId}
          onChange={(e) => update((f) => ({ ...f, shepherdFrameId: e.target.value }))}
        />
      </Field>
      <Field label="ACTSW Frame ID">
        <TextInput
          value={frame.actswFrameId}
          onChange={(e) => update((f) => ({ ...f, actswFrameId: e.target.value }))}
        />
      </Field>
      <Field label="Module frame serial">
        <TextInput
          value={frame.moduleFrameSerialNumber}
          onChange={(e) => update((f) => ({ ...f, moduleFrameSerialNumber: e.target.value }))}
        />
      </Field>
      <PdfButtons frame={frame} />
      <div className="flex flex-col gap-2 pt-2 text-sm">
        <Link className="text-neutral-600" href={`/frames/${id}/install`}>
          Install checklist (paper)
        </Link>
        <Link className="text-neutral-600" href={`/frames/${id}/ancillary`}>
          Ancillary sheet (paper)
        </Link>
        <Link className="text-neutral-600" href={`/frames/${id}/testing`}>
          Full testing grid (paper)
        </Link>
        <Link className="text-neutral-600" href={`/frames/${id}/handover`}>
          Handover + PDF
        </Link>
      </div>
    </main>
  );
}
