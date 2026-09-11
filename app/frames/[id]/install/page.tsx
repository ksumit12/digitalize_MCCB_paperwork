"use client";

import Link from "next/link";
import { use } from "react";
import { PdfButtons } from "@/components/PdfButtons";
import { CheckRow, Field, Screen, TextInput } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";
import type { InstallChecklist } from "@/lib/types";

const ITEMS: { key: keyof InstallChecklist; label: string }[] = [
  { key: "verticalCableLadders", label: "Install Vertical Cable Ladders" },
  { key: "horizontalUnistrutWhipSupport", label: "Install Horizontal Unistrut Whip Support" },
  { key: "earthBarAngleBrackets", label: "Install Earth Bar Angle Brackets" },
  { key: "cbsdsSupports", label: "Install CBSDS Supports" },
  { key: "cAndEAirSamplingConduit", label: "Install C&E Air Sampling Conduit" },
  { key: "whipsPerShopDrawing", label: "Install Whip's per Shop Drawing" },
];

export default function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);

  if (loading) return <Screen title="Install checklist">Loading…</Screen>;
  if (!frame) return <Screen title="Install checklist">Frame not found.</Screen>;

  return (
    <Screen title="Install checklist" savedAt={savedAt}>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Module Frame Serial">
          <TextInput
            value={frame.moduleFrameSerialNumber}
            onChange={(e) => update((f) => ({ ...f, moduleFrameSerialNumber: e.target.value }))}
          />
        </Field>
        <Field label="Market">
          <select
            value={frame.market}
            onChange={(e) =>
              update((f) => ({ ...f, market: e.target.value as typeof f.market }))
            }
            className="w-full rounded-lg border border-rule bg-white px-3 py-2.5"
          >
            <option value="">—</option>
            <option value="INT">INT</option>
            <option value="AUS">AUS</option>
          </select>
        </Field>
        <Field label="Start date">
          <TextInput
            type="date"
            value={frame.startDate}
            onChange={(e) => update((f) => ({ ...f, startDate: e.target.value }))}
          />
        </Field>
        <Field label="Start time">
          <TextInput
            type="time"
            value={frame.startTime}
            onChange={(e) => update((f) => ({ ...f, startTime: e.target.value }))}
          />
        </Field>
        <Field label="Finish date">
          <TextInput
            type="date"
            value={frame.finishDate}
            onChange={(e) => update((f) => ({ ...f, finishDate: e.target.value }))}
          />
        </Field>
        <Field label="Finish time">
          <TextInput
            type="time"
            value={frame.finishTime}
            onChange={(e) => update((f) => ({ ...f, finishTime: e.target.value }))}
          />
        </Field>
      </div>
      <div className="space-y-2">
        {ITEMS.map((item) => (
          <CheckRow
            key={item.key}
            label={item.label}
            checked={frame.installChecklist[item.key].ticked}
            sign={frame.installChecklist[item.key].installerSign}
            onChange={(ticked) =>
              update((f) => ({
                ...f,
                installChecklist: {
                  ...f.installChecklist,
                  [item.key]: { ...f.installChecklist[item.key], ticked },
                },
              }))
            }
            onSign={(installerSign) =>
              update((f) => ({
                ...f,
                installChecklist: {
                  ...f.installChecklist,
                  [item.key]: { ...f.installChecklist[item.key], installerSign },
                },
              }))
            }
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {frame.cbsds.map((c) => (
          <Link
            key={c.label}
            href={`/frames/${id}/cbsds/${c.label}`}
            className="rounded-xl border border-rule bg-white p-4 text-center font-medium"
          >
            CBSDS {c.label}
          </Link>
        ))}
      </div>
      <PdfButtons frame={frame} />
    </Screen>
  );
}
