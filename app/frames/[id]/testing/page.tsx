"use client";

import { use, useState } from "react";
import { SerialScanner } from "@/components/SerialScanner";
import { Field, PassFailSelect, Screen, TextInput } from "@/components/ui";
import { IR_ROWS, POLARITY_ROWS } from "@/lib/ir";
import { serialsDiffer } from "@/lib/status";
import { useFrame } from "@/lib/useFrame";
import type { BreakerTest, CbsdsLabel, IrReadings, PassFail } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

function IrGrid({
  readings,
  onChange,
}: {
  readings: IrReadings;
  onChange: (key: keyof IrReadings, value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {IR_ROWS.map((row) => (
        <label key={row.key} className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
          <span>{row.label}</span>
          <input
            inputMode="decimal"
            value={readings[row.key]}
            onChange={(e) => onChange(row.key, e.target.value)}
            className="rounded-lg border border-rule px-2 py-1.5"
            placeholder="MΩ"
          />
        </label>
      ))}
    </div>
  );
}

export default function TestingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);
  const [openWhip, setOpenWhip] = useState<string>("A1");

  if (loading) return <Screen title="Electrical testing">Loading…</Screen>;
  if (!frame) return <Screen title="Electrical testing">Frame not found.</Screen>;

  const et = frame.electricalTesting;

  function patchEt(next: typeof et) {
    update((f) => ({ ...f, electricalTesting: next }));
  }

  function patchBreaker(label: CbsdsLabel, index: number, next: BreakerTest) {
    const copy = {
      ...et,
      perBreakerTest: {
        ...et.perBreakerTest,
        [label]: et.perBreakerTest[label].map((b, i) => (i === index ? next : b)),
      },
    };
    patchEt(copy);
  }

  return (
    <Screen title="Electrical testing" savedAt={savedAt}>
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
      </div>
      <section className="space-y-2 rounded-xl border border-rule bg-white p-3">
        <h2 className="font-medium">Visual inspection P/F</h2>
        <div className="grid grid-cols-4 gap-2">
          {LABELS.map((l) => (
            <label key={l} className="text-sm">
              {l}
              <div>
                <PassFailSelect
                  value={et.visualInspection[l]}
                  onChange={(v) =>
                    patchEt({
                      ...et,
                      visualInspection: { ...et.visualInspection, [l]: v },
                    })
                  }
                />
              </div>
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-xl border border-rule bg-white p-3">
        <h2 className="font-medium">IR test — all MCCBs OFF, FCL fuses pulled (MΩ)</h2>
        {LABELS.map((l) => (
          <details key={l} className="rounded-lg border border-rule p-2">
            <summary className="cursor-pointer font-medium">CBSDS {l}</summary>
            <div className="mt-2">
              <IrGrid
                readings={et.perCbsdsIr[l].readings}
                onChange={(key, value) =>
                  patchEt({
                    ...et,
                    perCbsdsIr: {
                      ...et.perCbsdsIr,
                      [l]: { readings: { ...et.perCbsdsIr[l].readings, [key]: value } },
                    },
                  })
                }
              />
            </div>
          </details>
        ))}
        <Field label="Sign">
          <TextInput
            value={et.frameIrSign}
            onChange={(e) => patchEt({ ...et, frameIrSign: e.target.value })}
          />
        </Field>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Per-whip IR + polarity (each MCCB ON, one at a time)</h2>
        {LABELS.map((l) =>
          et.perBreakerTest[l].map((test, i) => {
            const key = `${l}${i + 1}`;
            const install = frame.cbsds.find((c) => c.label === l)!.breakerPositions[i];
            const mccbWarn = serialsDiffer(install.mccbSerialNumber, test.mccbSerialNumber);
            const mlWarn = serialsDiffer(install.microLogicSerialNumber, test.microLogicSerialNumber);
            const open = openWhip === key;
            return (
              <details
                key={key}
                open={open}
                onToggle={(e) => {
                  if ((e.target as HTMLDetailsElement).open) setOpenWhip(key);
                }}
                className="rounded-xl border border-rule bg-white p-3"
              >
                <summary className="cursor-pointer font-medium">{key}</summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-neutral-600">
                    Install serials — MCCB {install.mccbSerialNumber || "—"} · ML{" "}
                    {install.microLogicSerialNumber || "—"}
                  </p>
                  <Field label="Testing MCCB serial (optional re-check)">
                    <SerialScanner
                      type="ocr"
                      label={`${key} MCCB`}
                      value={test.mccbSerialNumber}
                      onConfirm={(v) => patchBreaker(l, i, { ...test, mccbSerialNumber: v })}
                    />
                  </Field>
                  {mccbWarn ? (
                    <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                      MCCB serial differs from install. Check the breaker is in the right slot.
                    </p>
                  ) : null}
                  <Field label="Testing Micrologic serial (optional re-check)">
                    <SerialScanner
                      type="qr"
                      label={`${key} Micrologic`}
                      value={test.microLogicSerialNumber}
                      onConfirm={(v) => patchBreaker(l, i, { ...test, microLogicSerialNumber: v })}
                    />
                  </Field>
                  {mlWarn ? (
                    <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                      Micrologic serial differs from install. Check the breaker is in the right slot.
                    </p>
                  ) : null}
                  <IrGrid
                    readings={test.irTest}
                    onChange={(k, v) =>
                      patchBreaker(l, i, { ...test, irTest: { ...test.irTest, [k]: v } })
                    }
                  />
                  <div className="space-y-2">
                    {POLARITY_ROWS.map((row) => (
                      <label key={row.key} className="flex items-center justify-between gap-2 text-sm">
                        {row.label}
                        <PassFailSelect
                          value={test.polarityTest[row.key]}
                          onChange={(v) =>
                            patchBreaker(l, i, {
                              ...test,
                              polarityTest: { ...test.polarityTest, [row.key]: v },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <Field label="Sign">
                    <TextInput
                      value={test.sign}
                      onChange={(e) => patchBreaker(l, i, { ...test, sign: e.target.value })}
                    />
                  </Field>
                </div>
              </details>
            );
          }),
        )}
      </section>
      <section className="space-y-2 rounded-xl border border-rule bg-white p-3">
        <h2 className="font-medium">Shunt trip live test</h2>
        {(
          [
            ["breakerStack1and2", "Breaker stack 1 & 2"],
            ["breakerStack3and4", "Breaker stack 3 & 4"],
            ["breakerStack5and6", "Breaker stack 5 & 6"],
            ["breakerStack7and8", "Breaker stack 7 & 8"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between text-sm">
            {label}
            <PassFailSelect
              value={et.shuntTripLiveTest[key]}
              onChange={(v) =>
                patchEt({
                  ...et,
                  shuntTripLiveTest: { ...et.shuntTripLiveTest, [key]: v as PassFail },
                })
              }
            />
          </label>
        ))}
      </section>
    </Screen>
  );
}
