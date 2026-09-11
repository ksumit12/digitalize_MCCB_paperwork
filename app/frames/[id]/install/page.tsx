"use client";

import { use } from "react";
import { NextChecklist } from "@/components/NextChecklist";
import { Field, Screen, TextInput, YesNaRow } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";
import type { ChecklistItem, InstallChecklist } from "@/lib/types";

const ITEMS: { key: keyof InstallChecklist; label: string }[] = [
  { key: "verticalCableLadders", label: "Install Vertical Cable Ladders" },
  { key: "horizontalUnistrutWhipSupport", label: "Install Horizontal Unistrut Whip Support" },
  { key: "earthBarAngleBrackets", label: "Install Earth Bar Angle Brackets" },
  { key: "cbsdsSupports", label: "Install CBSDS Supports" },
  { key: "cAndEAirSamplingConduit", label: "Install C&E Air Sampling Conduit" },
  { key: "whipsPerShopDrawing", label: "Install Whip's per Shop Drawing" },
];

function mark(item: ChecklistItem, kind: "yes" | "na", initials: string): ChecklistItem {
  return {
    ...item,
    ticked: kind === "yes",
    na: kind === "na",
    installerSign: item.installerSign || initials,
  };
}

export default function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);

  if (loading) return <Screen title="Frame install">Loading…</Screen>;
  if (!frame) return <Screen title="Frame install">Frame not found.</Screen>;

  const initials = frame.installerInitials || "";

  return (
    <Screen title="Frame install" savedAt={savedAt}>
      <p className="rounded-2xl bg-white px-4 py-3 text-sm text-neutral-600">
        String {frame.stringKey || "1"} · {frame.frameSlot || frame.stringId || "—"}
        <span className="mt-1 block text-xs">
          Paper IDs and PDF live in Office. Tick Yes or N/A as you go.
        </span>
      </p>
      <div className="grid grid-cols-2 gap-3">
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
        <Field label="Market">
          <select
            value={frame.market}
            onChange={(e) => update((f) => ({ ...f, market: e.target.value as typeof f.market }))}
            className="w-full rounded-lg border border-rule bg-white px-3 py-2.5"
          >
            <option value="">—</option>
            <option value="INT">INT</option>
            <option value="AUS">AUS</option>
          </select>
        </Field>
      </div>
      <div className="space-y-3">
        {ITEMS.map((item) => {
          const row = frame.installChecklist[item.key];
          return (
            <YesNaRow
              key={item.key}
              label={item.label}
              ticked={row.ticked}
              na={row.na}
              sign={row.installerSign}
              onYes={() =>
                update((f) => ({
                  ...f,
                  installChecklist: {
                    ...f.installChecklist,
                    [item.key]: mark(f.installChecklist[item.key], "yes", initials),
                  },
                }))
              }
              onNa={() =>
                update((f) => ({
                  ...f,
                  installChecklist: {
                    ...f.installChecklist,
                    [item.key]: mark(f.installChecklist[item.key], "na", initials),
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
          );
        })}
      </div>
      <NextChecklist frameId={id} current="install" />
    </Screen>
  );
}
