"use client";

import { use, useState } from "react";
import { NextChecklist } from "@/components/NextChecklist";
import { IrPassFail, PolarityPassFail } from "@/components/PassFailPaint";
import { SerialScanner } from "@/components/SerialScanner";
import { SignPick } from "@/components/SignPick";
import { Field, PassFailSelect, Screen } from "@/components/ui";
import { serialsDiffer } from "@/lib/status";
import { useFrame } from "@/lib/useFrame";
import type { BreakerTest, CbsdsLabel, PassFail } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

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
        <h2 className="font-medium">IR — all MCCBs OFF, FCL fuses pulled</h2>
        {LABELS.map((l) => (
          <details key={l} className="rounded-lg border border-rule p-2">
            <summary className="cursor-pointer font-medium">CBSDS {l}</summary>
            <div className="mt-2">
              <IrPassFail
                readings={et.perCbsdsIr[l].readings}
                onChange={(readings) =>
                  patchEt({
                    ...et,
                    perCbsdsIr: {
                      ...et.perCbsdsIr,
                      [l]: { readings },
                    },
                  })
                }
              />
            </div>
          </details>
        ))}
        <Field label="Sign">
          <SignPick
            value={et.frameIrSign}
            onChange={(v) => patchEt({ ...et, frameIrSign: v })}
            placeholder="Sparky sign-off"
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
                  <IrPassFail
                    readings={test.irTest}
                    onChange={(irTest) => patchBreaker(l, i, { ...test, irTest })}
                  />
                  <PolarityPassFail
                    values={test.polarityTest}
                    onChange={(polarityTest) => patchBreaker(l, i, { ...test, polarityTest })}
                  />
                  <Field label="Sign">
                    <SignPick
                      value={test.sign}
                      onChange={(v) => patchBreaker(l, i, { ...test, sign: v })}
                      placeholder="Sparky sign-off"
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
      <NextChecklist frameId={id} current="testing" />
    </Screen>
  );
}
