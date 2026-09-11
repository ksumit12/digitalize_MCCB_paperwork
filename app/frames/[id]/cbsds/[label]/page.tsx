"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use } from "react";
import { CheckRow, Field, Screen, TextInput } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";
import type { Cbsds, CbsdsLabel } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

export default function CbsdsPage({
  params,
}: {
  params: Promise<{ id: string; label: string }>;
}) {
  const { id, label } = use(params);
  const router = useRouter();
  const { frame, loading, update, savedAt } = useFrame(id);
  const cbsdsLabel = label.toUpperCase() as CbsdsLabel;

  if (!LABELS.includes(cbsdsLabel)) notFound();
  if (loading) return <Screen title={`CBSDS ${cbsdsLabel}`}>Loading…</Screen>;
  if (!frame) return <Screen title={`CBSDS ${cbsdsLabel}`}>Frame not found.</Screen>;

  const idx = frame.cbsds.findIndex((c) => c.label === cbsdsLabel);
  const cbsds = frame.cbsds[idx];
  if (!cbsds) return <Screen title={`CBSDS ${cbsdsLabel}`}>Missing CBSDS.</Screen>;

  function patchCbsds(next: Cbsds) {
    update((f) => {
      const copy = [...f.cbsds];
      copy[idx] = next;
      return { ...f, cbsds: copy };
    });
  }

  return (
    <Screen title={`Install CBSDS ${cbsdsLabel} per Shop Drawing`} savedAt={savedAt}>
      <div className="flex gap-2">
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => router.push(`/frames/${id}/cbsds/${l}`)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              l === cbsdsLabel ? "bg-ink text-white" : "bg-neutral-100"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <CheckRow
        label="CBSDS Mounting Bolts Tight"
        checked={cbsds.mountingBoltsTight}
        onChange={(v) => patchCbsds({ ...cbsds, mountingBoltsTight: v })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CBSDS serial number">
          <TextInput
            value={cbsds.cbsdsSerialNumber}
            onChange={(e) => patchCbsds({ ...cbsds, cbsdsSerialNumber: e.target.value })}
          />
        </Field>
        <Field label="Manufacturer">
          <TextInput
            value={frame.manufacturer || "—"}
            readOnly
            className="bg-neutral-50"
          />
        </Field>
      </div>
      <CheckRow
        label="Install Gland Plates and Glands per Shop Drawing"
        checked={cbsds.glandPlatesAndGlandsInstalled}
        onChange={(v) => patchCbsds({ ...cbsds, glandPlatesAndGlandsInstalled: v })}
      />
      <CheckRow
        label="Select MCCB's from Shop Drawing with trip unit & ML pre-installed"
        checked={cbsds.mccbsSelectedPerShopDrawing}
        onChange={(v) => patchCbsds({ ...cbsds, mccbsSelectedPerShopDrawing: v })}
      />
      <ul className="space-y-2">
        {cbsds.breakerPositions.map((b) => (
          <li key={b.position}>
            <Link
              href={`/frames/${id}/cbsds/${cbsdsLabel}/breakers/${b.position}`}
              className="block rounded-xl border border-rule bg-white p-3"
            >
              <p className="font-medium">
                Position {b.position} · {cbsdsLabel}
                {b.position}
              </p>
              <p className="text-sm text-neutral-600">
                MCCB {b.mccbSerialNumber || "—"} · ML {b.microLogicSerialNumber || "—"} ·{" "}
                {b.micrologicSettingAmps || "—"}A
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
