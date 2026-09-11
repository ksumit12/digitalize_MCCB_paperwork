"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { SerialScanner } from "@/components/SerialScanner";
import { CheckRow, Field, Screen } from "@/components/ui";
import { needsShuntTrip } from "@/lib/emptyFrame";
import { useFrame } from "@/lib/useFrame";
import type { AmpSetting, CbsdsLabel } from "@/lib/types";

export default function BreakerPage({
  params,
}: {
  params: Promise<{ id: string; label: string; pos: string }>;
}) {
  const { id, label, pos } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);
  const cbsdsLabel = label.toUpperCase() as CbsdsLabel;
  const position = Number(pos);

  if (!["A", "B", "C", "D"].includes(cbsdsLabel) || position < 1 || position > 8) notFound();
  if (loading) return <Screen title="Breaker">Loading…</Screen>;
  if (!frame) return <Screen title="Breaker">Frame not found.</Screen>;

  const cIdx = frame.cbsds.findIndex((c) => c.label === cbsdsLabel);
  const cbsds = frame.cbsds[cIdx];
  const bIdx = position - 1;
  const breaker = cbsds.breakerPositions[bIdx];

  function patchBreaker(next: typeof breaker) {
    if (next.micrologicSettingAmps === 32) next = { ...next, shuntTripBatchNumber: "" };
    update((f) => {
      const cbsdsCopy = [...f.cbsds];
      const unit = { ...cbsdsCopy[cIdx] };
      const positions = [...unit.breakerPositions];
      positions[bIdx] = next;
      unit.breakerPositions = positions;
      cbsdsCopy[cIdx] = unit;
      return { ...f, cbsds: cbsdsCopy };
    });
  }

  const showShunt = needsShuntTrip(breaker.micrologicSettingAmps);

  return (
    <Screen title={`${cbsdsLabel}${position} — serials & torque`} savedAt={savedAt}>
      <Link href={`/frames/${id}/cbsds/${cbsdsLabel}`} className="text-sm text-neutral-600">
        ← CBSDS {cbsdsLabel}
      </Link>
      <Field label="MCCB serial">
        <SerialScanner
          type="ocr"
          kind="mccb"
          label="MCCB serial"
          value={breaker.mccbSerialNumber}
          onConfirm={(v) => patchBreaker({ ...breaker, mccbSerialNumber: v })}
        />
      </Field>
      <Field label="Micrologic serial">
        <SerialScanner
          type="qr"
          kind="ml"
          label="Micrologic serial"
          value={breaker.microLogicSerialNumber}
          onConfirm={(v) => patchBreaker({ ...breaker, microLogicSerialNumber: v })}
        />
      </Field>
      <Field label="Micrologic setting (whip)">
        <div className="flex gap-2">
          {([32, 63, 100] as const).map((amp) => (
            <button
              key={amp}
              type="button"
              onClick={() =>
                patchBreaker({
                  ...breaker,
                  micrologicSettingAmps: amp as AmpSetting,
                  shuntTripBatchNumber: amp === 32 ? "" : breaker.shuntTripBatchNumber,
                })
              }
              className={`flex-1 rounded-lg border py-2 ${
                breaker.micrologicSettingAmps === amp ? "bg-ink text-white" : "bg-white"
              }`}
            >
              {amp}A
            </button>
          ))}
        </div>
      </Field>
      {showShunt ? (
        <Field label="Shunt trip">
          <SerialScanner
            type="ocr"
            kind="shunt"
            label="Shunt trip"
            value={breaker.shuntTripBatchNumber}
            onConfirm={(v) => patchBreaker({ ...breaker, shuntTripBatchNumber: v })}
          />
        </Field>
      ) : breaker.micrologicSettingAmps === 32 ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm">No shunt (32A)</p>
      ) : null}
      <CheckRow
        label="Install MCCB per Shop Drawing"
        checked={breaker.mccbInstalled}
        onChange={(v) => patchBreaker({ ...breaker, mccbInstalled: v })}
      />
      <CheckRow
        label="Remove and retain unused flexibar protection caps"
        checked={breaker.flexibarCapsRemoved}
        onChange={(v) => patchBreaker({ ...breaker, flexibarCapsRemoved: v })}
      />
      <CheckRow
        label="Terminate Whip Leads"
        checked={breaker.whipTerminated}
        onChange={(v) => patchBreaker({ ...breaker, whipTerminated: v })}
      />
      <CheckRow
        label={`MCCB Torque Line Side ${breaker.torqueLineSideNm} Nm`}
        checked={breaker.torqueLineSideConfirmed}
        onChange={(v) => patchBreaker({ ...breaker, torqueLineSideConfirmed: v })}
      />
      <CheckRow
        label={`MCCB Torque Load Side ${breaker.torqueLoadSideNm} Nm`}
        checked={breaker.torqueLoadSideConfirmed}
        onChange={(v) => patchBreaker({ ...breaker, torqueLoadSideConfirmed: v })}
      />
      <CheckRow
        label="Set Micrologic unit to required setting"
        checked={breaker.micrologicSettingConfirmed}
        onChange={(v) => patchBreaker({ ...breaker, micrologicSettingConfirmed: v })}
      />
      <div className="flex justify-between text-sm">
        {position > 1 ? (
          <Link href={`/frames/${id}/cbsds/${cbsdsLabel}/breakers/${position - 1}`}>Previous</Link>
        ) : (
          <span />
        )}
        {position < 8 ? (
          <Link href={`/frames/${id}/cbsds/${cbsdsLabel}/breakers/${position + 1}`}>Next</Link>
        ) : (
          <span />
        )}
      </div>
    </Screen>
  );
}
