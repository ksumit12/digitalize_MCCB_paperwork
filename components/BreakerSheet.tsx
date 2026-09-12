"use client";

import { useState } from "react";
import { IrPassFail, PolarityPassFail } from "@/components/PassFailPaint";
import { SerialScanner } from "@/components/SerialScanner";
import { SignPick } from "@/components/SignPick";
import { emptySlot, serialsComplete, setAmp } from "@/lib/breaker";
import { lastInstaller } from "@/lib/crew";
import { newId, saveDefect } from "@/lib/db";
import { needsShuntTrip } from "@/lib/emptyFrame";
import type { BreakerPosition, BreakerTest } from "@/lib/types";

type Step = "amp" | "mccb" | "ml" | "shunt" | "done" | "megger";

const BREAKER_TASKS: {
  key: keyof Pick<
    BreakerPosition,
    | "mccbInstalled"
    | "flexibarCapsRemoved"
    | "whipTerminated"
    | "torqueLineSideConfirmed"
    | "torqueLoadSideConfirmed"
    | "micrologicSettingConfirmed"
  >;
  label: string;
}[] = [
  { key: "mccbInstalled", label: "Install MCCB per Shop Drawing" },
  { key: "flexibarCapsRemoved", label: "Remove flexibar protection caps" },
  { key: "whipTerminated", label: "Terminate whip leads" },
  { key: "torqueLineSideConfirmed", label: "Torque line side 10 Nm" },
  { key: "torqueLoadSideConfirmed", label: "Torque load side 10 Nm" },
  { key: "micrologicSettingConfirmed", label: "Micrologic set to required setting" },
];

const ALL_TASKS_DONE: Partial<BreakerPosition> = {
  mccbInstalled: true,
  flexibarCapsRemoved: true,
  whipTerminated: true,
  torqueLineSideConfirmed: true,
  torqueLoadSideConfirmed: true,
  micrologicSettingConfirmed: true,
};

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
  stringKey,
  frameSlot,
  onBreaker,
  onTest,
  onClose,
  onNext,
}: {
  slot: string;
  breaker: BreakerPosition;
  test: BreakerTest;
  mode: "installation" | "testing";
  stringKey?: string;
  frameSlot?: string;
  onBreaker: (b: BreakerPosition) => void;
  onTest: (t: BreakerTest) => void;
  onClose: () => void;
  onNext?: () => void;
}) {
  const [step, setStep] = useState<Step>(() => (mode === "testing" ? "megger" : stepFor(breaker)));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-teal-50">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
        >
          ← Board
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
            onTasks={(patch) => onBreaker({ ...breaker, ...patch })}
            onEmpty={() => {
              onBreaker(emptySlot(breaker));
              onClose();
            }}
          />
        ) : null}

        {mode === "testing" ? (
          <MeggerStep breaker={breaker} test={test} onTest={onTest} onBack={onClose} onNext={onNext} />
        ) : null}

        <ReportBreakage
          slot={slot}
          breaker={breaker}
          stringKey={stringKey}
          frameSlot={frameSlot}
        />
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
  onTasks,
  onEmpty,
}: {
  breaker: BreakerPosition;
  onClose: () => void;
  onNext?: () => void;
  onEditAmp: () => void;
  onEditSerials: () => void;
  onTasks: (patch: Partial<BreakerPosition>) => void;
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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Install tasks</p>
          <button
            type="button"
            onClick={() => onTasks(ALL_TASKS_DONE)}
            className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white"
          >
            All done
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {BREAKER_TASKS.map((t) => {
            const done = !!breaker[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTasks({ [t.key]: !done } as Partial<BreakerPosition>)}
                className={`rounded-xl px-3 py-2.5 text-left text-xs font-medium leading-snug ${
                  done ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-rule"
                }`}
              >
                {done ? "✓ " : ""}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
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
            ← Board
          </button>
        </>
      )}
      <button type="button" onClick={onEmpty} className="w-full py-2 text-sm text-zinc-500">
        Mark empty
      </button>
    </div>
  );
}

function ReportBreakage({
  slot,
  breaker,
  stringKey,
  frameSlot,
}: {
  slot: string;
  breaker: BreakerPosition;
  stringKey?: string;
  frameSlot?: string;
}) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState("MCCB");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <div className="pt-6">
        <p className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white">
          Fault logged for {slot}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="pt-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-red-300 bg-red-50 py-3 text-sm font-semibold text-red-700"
        >
          Report breakage on {slot}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-6">
      <h2 className="text-xl font-semibold">Report breakage — {slot}</h2>
      <p className="text-sm text-neutral-600">
        String {stringKey || "—"} · Frame {frameSlot || "—"} · Serial{" "}
        {breaker.mccbSerialNumber || "—"}
      </p>
      <select
        value={part}
        onChange={(e) => setPart(e.target.value)}
        className="w-full rounded-2xl border border-rule bg-white px-4 py-3"
      >
        {["MCCB", "Micrologic trip unit", "Shunt trip", "Whip lead", "Flexibar cap", "Other"].map(
          (p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ),
        )}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What happened?"
        className="min-h-20 w-full rounded-2xl border border-rule bg-white px-4 py-3"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!description.trim()}
          onClick={async () => {
            await saveDefect({
              id: newId(),
              stringKey: stringKey || "",
              frameSlot: frameSlot || undefined,
              slot,
              part,
              serial: breaker.mccbSerialNumber || undefined,
              description: description.trim(),
              raisedBy: lastInstaller()?.initials || "—",
              raisedAt: new Date().toISOString(),
              status: "open",
              updatedAt: new Date().toISOString(),
            });
            setSaved(true);
          }}
          className="flex-1 rounded-2xl bg-red-600 py-3 text-white disabled:opacity-30"
        >
          Log fault
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-2xl border border-rule bg-white px-4 py-3 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function MeggerStep({
  breaker,
  test,
  onTest,
  onBack,
  onNext,
}: {
  breaker: BreakerPosition;
  test: BreakerTest;
  onTest: (t: BreakerTest) => void;
  onBack: () => void;
  onNext?: () => void;
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
      {onNext ? (
        <button type="button" onClick={onNext} className="w-full rounded-2xl bg-emerald-700 py-4 text-white">
          Save & next
        </button>
      ) : null}
      <button type="button" onClick={onBack} className="w-full rounded-2xl bg-ink py-4 text-white">
        Done
      </button>
    </div>
  );
}
