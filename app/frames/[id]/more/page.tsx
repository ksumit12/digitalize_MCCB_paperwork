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
      <h1 className="text-2xl font-semibold">Office</h1>
      <p className="text-sm text-neutral-600">
        Paper IDs and print. Lighting, shunt wiring, and testing are filled by the crew on the other cards.
      </p>

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
        <p className="mt-1 text-xs text-neutral-500">
          Filled from the string and slot you picked on the map ({slot}). Leave it unless the plate says something else.
        </p>
        <button
          type="button"
          className="mt-2 text-sm text-neutral-600 underline"
          onClick={() =>
            update((f) => ({
              ...f,
              moduleFrameSerialNumber: slot,
            }))
          }
        >
          Use {slot}
        </button>
      </div>

      <Link
        href={`/frames/${id}/install`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Frame install checklist
        <span className="mt-1 block text-sm font-normal text-neutral-500">
          Ladders, unistrut, earth bar, CBSDS supports, whips
        </span>
      </Link>
      <Link
        href={`/frames/${id}/ancillary`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Lights, exit lights & wiring
        <span className="mt-1 block text-sm font-normal text-neutral-500">
          Lighting circuits, HMCU, shunt-trip cable, MCBs, bungs
        </span>
      </Link>
      <Link
        href={`/frames/${id}/testing`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        Electrical testing
        <span className="mt-1 block text-sm font-normal text-neutral-500">
          Pass/fail IR and polarity. PDF prints &gt;500mohm
        </span>
      </Link>
      <Link
        href={`/frames/${id}/handover`}
        className="block rounded-2xl bg-white p-5 text-lg font-semibold"
      >
        QA handover
        <span className="mt-1 block text-sm font-normal text-neutral-500">
          Shepherd / Benmax sign-off and notes
        </span>
      </Link>

      <div className="rounded-2xl bg-white p-4">
        <p className="mb-3 text-sm text-neutral-600">Print looks like the SHEPHERD paperwork. IR pass prints as &gt;500mohm.</p>
        <PdfButtons frame={frame} />
      </div>
    </main>
  );
}
