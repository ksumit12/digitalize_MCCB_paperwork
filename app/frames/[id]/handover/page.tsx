"use client";

import { use } from "react";
import { NextChecklist } from "@/components/NextChecklist";
import { Field, Screen, TextInput } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";

export default function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);

  if (loading) return <Screen title="Frame handover">Loading…</Screen>;
  if (!frame) return <Screen title="Frame handover">Frame not found.</Screen>;

  const h = frame.handover;

  return (
    <Screen title="Frame handover sheet" savedAt={savedAt}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Shepherd Frame ID">
          <TextInput value={frame.shepherdFrameId} readOnly className="bg-neutral-50" />
        </Field>
        <Field label="ACTSW Frame ID">
          <TextInput value={frame.actswFrameId} readOnly className="bg-neutral-50" />
        </Field>
        <Field label="Date">
          <TextInput
            type="date"
            value={h.date}
            onChange={(e) => update((f) => ({ ...f, handover: { ...f.handover, date: e.target.value } }))}
          />
        </Field>
        <Field label="Time">
          <TextInput
            type="time"
            value={h.time}
            onChange={(e) => update((f) => ({ ...f, handover: { ...f.handover, time: e.target.value } }))}
          />
        </Field>
        <Field label="Shepherd name">
          <TextInput
            value={h.shepherdName}
            onChange={(e) =>
              update((f) => ({ ...f, handover: { ...f.handover, shepherdName: e.target.value } }))
            }
          />
        </Field>
        <Field label="Shepherd sign">
          <TextInput
            value={h.shepherdSign}
            onChange={(e) =>
              update((f) => ({ ...f, handover: { ...f.handover, shepherdSign: e.target.value } }))
            }
          />
        </Field>
        <Field label="Benmax name">
          <TextInput
            value={h.benmaxName}
            onChange={(e) =>
              update((f) => ({ ...f, handover: { ...f.handover, benmaxName: e.target.value } }))
            }
          />
        </Field>
        <Field label="Benmax sign">
          <TextInput
            value={h.benmaxSign}
            onChange={(e) =>
              update((f) => ({ ...f, handover: { ...f.handover, benmaxSign: e.target.value } }))
            }
          />
        </Field>
      </div>
      <p className="text-sm font-medium">All Install Checklist items completed and initialled</p>
      <div className="grid grid-cols-2 gap-2">
        {(["pass", "fail"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() =>
              update((f) => ({
                ...f,
                handover: { ...f.handover, installChecklistComplete: v === "pass" },
              }))
            }
            className={`rounded-2xl py-4 text-lg font-semibold ${
              h.installChecklistComplete
                ? v === "pass"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100"
                : v === "fail"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-100"
            }`}
          >
            {v === "pass" ? "QA Passed" : "QA Failed"}
          </button>
        ))}
      </div>
      <p className="text-sm font-medium">All Electrical testing items completed and initialled</p>
      <div className="grid grid-cols-2 gap-2">
        {(["pass", "fail"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() =>
              update((f) => ({
                ...f,
                handover: { ...f.handover, electricalTestingComplete: v === "pass" },
              }))
            }
            className={`rounded-2xl py-4 text-lg font-semibold ${
              h.electricalTestingComplete
                ? v === "pass"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100"
                : v === "fail"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-100"
            }`}
          >
            {v === "pass" ? "QA Passed" : "QA Failed"}
          </button>
        ))}
      </div>
      <Field label="Notes (required if anything failed)">
        <textarea
          value={h.notes ?? ""}
          onChange={(e) =>
            update((f) => ({ ...f, handover: { ...f.handover, notes: e.target.value } }))
          }
          className="min-h-28 w-full rounded-xl border border-rule px-3 py-3"
        />
      </Field>
      <NextChecklist frameId={id} current="handover" />
    </Screen>
  );
}
