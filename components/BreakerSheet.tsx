"use client";

import { useState } from "react";
import { IrPassFail, PolarityPassFail } from "@/components/PassFailPaint";
import { SerialScanner } from "@/components/SerialScanner";
import { SignPick } from "@/components/SignPick";
import { emptySlot, serialsComplete, setAmp } from "@/lib/breaker";
import { needsShuntTrip } from "@/lib/emptyFrame";
import type { BreakerPosition, BreakerTest } from "@/lib/types";

type Step = "amp" | "mccb" | "ml" | "shunt" | "done" | "megger";

function stepFor(b: BreakerPosition): Step {
  if (!b.micrologicSettingAmps) return "amp";
  if (!b.mccbSerialNumber) return "mccb";
  if (!b.microLogicSerialNumber) return "ml";
  if (needsShuntTrip(b.micrologicSettingAmps) && !b.shuntTripBatchNumber) return "shunt";
  return "done";
}

export function BreakerSheet({
  slot,
  breaker,
  test,
  mode,
  onBreaker,
  onTest,
  onClose,
  onNext,
}: {
  slot: string;
  breaker: BreakerPosition;
  test: BreakerTest;
  mode: "installation" | "testing";
  onBreaker: (b: BreakerPosition) => void;
  onTest: (t: BreakerTest) => void;
  onClose: () => void;
  onNext?: () => void;
}) {
  const [step, setStep] = useState<Step>(() => (mode === "testing" ? "megger" : stepFor(breaker)));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="text-sm font-medium text-neutral-600">
          Map
        </button>
        <p className="text-lg font-bold">{slot}</p>
        <span className="w-8" />
      </header>

      <div className="flex-1 overflow-auto px-4 pb-8">
        {mode === "installation" && step === "amp" ? (
          <AmpStep
            onEmpty={() => {
              onBreaker(emptySlot(breaker));
              if (onNext) onNext();
              else onClose();
            }}
            onAmp={(amps) => {
              onBreaker(setAmp(breaker, amps));
              setStep("mccb");
            }}
          />
        ) : null}

        {mode === "installation" && step === "mccb" ? (
          <CaptureStep
            title="MCCB serial"
            type="ocr"
            kind="mccb"
            value={breaker.mccbSerialNumber}
            onConfirm={(v) => {
              onBreaker({ ...breaker, mccbSerialNumber: v });
              setStep("ml");
            }}
            onBack={() => setStep("amp")}
          />
        ) : null}

        {mode === "installation" && step === "ml" ? (
          <CaptureStep
            title="Micrologic serial"
            type="qr"
            kind="ml"
            value={breaker.microLogicSerialNumber}
            onConfirm={(v) => {
              const next = { ...breaker, microLogicSerialNumber: v };
              onBreaker(next);
              setStep(needsShuntTrip(next.micrologicSettingAmps) ? "shunt" : "done");
            }}
            onBack={() => setStep("mccb")}
          />
        ) : null}

        {mode === "installation" && step === "shunt" ? (
          <div className="space-y-4 pt-6">
            <h2 className="text-2xl font-semibold">Shunt trip</h2>
            <SerialScanner
              type="ocr"
              kind="shunt"
              label="Shunt trip"
              value={breaker.shuntTripBatchNumber}
              onConfirm={(v) => {
                onBreaker({ ...breaker, shuntTripBatchNumber: v });
                setStep("done");
              }}
              hero
            />
            <button type="button" onClick={() => setStep("ml")} className="w-full py-2 text-sm text-neutral-500">
              Back
            </button>
          </div>
        ) : null}

        {mode === "installation" && step === "done" ? (
          <DoneStep
            breaker={breaker}
            onClose={onClose}
            onNext={onNext}
            onEditAmp={() => setStep("amp")}
            onEditSerials={() => setStep("mccb")}
            onEmpty={() => {
              onBreaker(emptySlot(breaker));
              onClose();
            }}
          />
        ) : null}

        {mode === "testing" ? (
          <MeggerStep breaker={breaker} test={test} onTest={onTest} onBack={onClose} />
        ) : null}
      </div>
    </div>
  );
}

function AmpStep({
  onAmp,
  onEmpty,
}: {
  onAmp: (a: 32 | 63 | 100) => void;
  onEmpty: () => void;
}) {
  return (
    <div className="space-y-3 pt-4">
      <h2 className="text-2xl font-semibold">Whip rating</h2>
      <button
        type="button"
        onClick={() => onAmp(32)}
        className="flex h-20 w-full items-center justify-center rounded-2xl bg-sky-500 text-2xl font-bold text-white"
      >
        32A
      </button>
      <button
        type="button"
        onClick={() => onAmp(63)}
        className="flex h-20 w-full items-center justify-center rounded-2xl bg-orange-500 text-2xl font-bold text-white"
      >
        63A
      </button>
      <button
        type="button"
        onClick={() => onAmp(100)}
        className="flex h-20 w-full items-center justify-center rounded-2xl bg-violet-500 text-2xl font-bold text-white"
      >
        100A
      </button>
      <button
        type="button"
        onClick={onEmpty}
        className="flex h-16 w-full items-center justify-center rounded-2xl bg-zinc-200 text-lg font-medium text-zinc-600"
      >
        Empty — not on this frame
      </button>
    </div>
  );
}

function CaptureStep({
  title,
  type,
  kind,
  value,
  onConfirm,
  onBack,
}: {
  title: string;
  type: "qr" | "ocr";
  kind: "mccb" | "ml" | "shunt";
  value: string;
  onConfirm: (v: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 pt-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <SerialScanner type={type} kind={kind} label={title} value={value} onConfirm={onConfirm} hero />
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-neutral-500">
        Back
      </button>
    </div>
  );
}

function DoneStep({
  breaker,
  onClose,
  onNext,
  onEditAmp,
  onEditSerials,
  onEmpty,
}: {
  breaker: BreakerPosition;
  onClose: () => void;
  onNext?: () => void;
  onEditAmp: () => void;
  onEditSerials: () => void;
  onEmpty: () => void;
}) {
  const ready = serialsComplete(breaker);
  return (
    <div className="space-y-4 pt-6">
      <h2 className="text-2xl font-semibold">{ready ? "Breaker logged" : "Almost there"}</h2>
      <ul className="space-y-1 rounded-2xl bg-white p-4 text-sm">
        <li>
          {breaker.micrologicSettingAmps || "—"}A{" "}
          <button type="button" onClick={onEditAmp} className="text-neutral-500">
            change
          </button>
        </li>
        <li>MCCB {breaker.mccbSerialNumber || "—"}</li>
        <li>Micrologic {breaker.microLogicSerialNumber || "—"}</li>
        {needsShuntTrip(breaker.micrologicSettingAmps) ? (
          <li>Shunt batch {breaker.shuntTripBatchNumber || "—"}</li>
        ) : (
          <li className="text-neutral-400">No shunt trip (32A)</li>
        )}
      </ul>
      {!ready ? (
        <button type="button" onClick={onEditSerials} className="w-full rounded-2xl bg-ink py-4 text-white">
          Finish serials
        </button>
      ) : (
        <>
          {onNext ? (
            <button type="button" onClick={onNext} className="w-full rounded-2xl bg-ink py-4 text-lg text-white">
              Next
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-2xl py-4 text-lg ${onNext ? "border border-rule bg-white" : "bg-ink text-white"}`}
          >
            Map
          </button>
        </>
      )}
      <button type="button" onClick={onEmpty} className="w-full py-2 text-sm text-zinc-500">
        Mark empty
      </button>
    </div>
  );
}

function MeggerStep({
  breaker,
  test,
  onTest,
  onBack,
}: {
  breaker: BreakerPosition;
  test: BreakerTest;
  onTest: (t: BreakerTest) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 pt-2">
      <h2 className="text-2xl font-semibold">Megger / IR</h2>
      <ul className="rounded-2xl bg-white p-3 text-sm text-neutral-700">
        <li>
          {breaker.micrologicSettingAmps || "—"}A · MCCB {breaker.mccbSerialNumber || "—"}
        </li>
        <li>Micrologic {breaker.microLogicSerialNumber || "—"}</li>
      </ul>
      <p className="text-sm text-neutral-600">This MCCB ON, others off.</p>
      <IrPassFail
        readings={test.irTest}
        onChange={(irTest) => onTest({ ...test, irTest })}
      />
      <p className="text-sm font-medium">Polarity</p>
      <PolarityPassFail
        values={test.polarityTest}
        onChange={(polarityTest) => onTest({ ...test, polarityTest })}
      />
      <label className="block text-sm">
        Sign-off
        <div className="mt-1">
          <SignPick value={test.sign} onChange={(v) => onTest({ ...test, sign: v })} placeholder="Sparky sign-off" />
        </div>
      </label>
      <button type="button" onClick={onBack} className="w-full rounded-2xl bg-ink py-4 text-white">
        Done
      </button>
    </div>
  );
}
