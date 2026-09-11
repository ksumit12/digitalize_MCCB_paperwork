"use client";

import { use } from "react";
import { PdfButtons } from "@/components/PdfButtons";
import { CheckRow, Field, Screen, TextInput } from "@/components/ui";
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
      <CheckRow
        label="All Install Checklist items completed and initialled"
        checked={h.installChecklistComplete}
        onChange={(v) =>
          update((f) => ({ ...f, handover: { ...f.handover, installChecklistComplete: v } }))
        }
      />
      <CheckRow
        label="All Electrical testing items completed and initialled"
        checked={h.electricalTestingComplete}
        onChange={(v) =>
          update((f) => ({ ...f, handover: { ...f.handover, electricalTestingComplete: v } }))
        }
      />
      <PdfButtons frame={frame} />
    </Screen>
  );
}
