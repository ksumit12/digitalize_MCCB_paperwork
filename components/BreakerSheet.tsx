"use client";

import { useEffect, useState } from "react";
import { IrPassFail, PolarityPassFail } from "@/components/PassFailPaint";
import { SerialScanner } from "@/components/SerialScanner";
import { HandsPick, SignPick } from "@/components/SignPick";
import { lastInstaller, rememberLastInstaller } from "@/lib/crew";
import { emptySlot, serialsComplete, setAmp } from "@/lib/breaker";
import { needsShuntTrip } from "@/lib/emptyFrame";
import { addFault, normalizeInitials } from "@/lib/db";
import { currentProjectId, mlModelOf } from "@/lib/project";
import type { BreakerPosition, BreakerTest, FaultKind, MicrologicModel } from "@/lib/types";

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
  frameId,
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
  frameId: string;
  stringKey: string;
  frameSlot: string;
  onBreaker: (b: BreakerPosition) => void;
  onTest: (t: BreakerTest) => void;
  onClose: () => void;
  onNext?: () => void;
}) {
  const [step, setStep] = useState<Step>(() => (mode === "testing" ? "megger" : stepFor(breaker)));

  async function logFault(kind: FaultKind) {
    const who = lastInstaller()?.initials || breaker.mccbScannedBy || "";
    await addFault({
      id: crypto.randomUUID(),
      projectId: currentProjectId(),
      frameId,
      stringKey,
      frameSlot,
      hole: slot,
      kind,
      oldMccb: kind === "unit" ? breaker.mccbSerialNumber : "",
      oldMl: kind === "unit" ? breaker.microLogicSerialNumber : "",
      oldMlModel: kind === "unit" ? mlModelOf(breaker) : "",
      oldShunt: kind === "shunt" ? breaker.shuntTripBatchNumber : "",
      reason: kind === "unit" ? "Replaced MCCB + Micrologic" : "Replaced shunt",
      raisedBy: who,
      raisedAt: new Date().toISOString(),
    });
  }

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
            whoLabel="Who scanned this MCCB"
            whoValue={breaker.mccbScannedBy || ""}
            onConfirm={(v, who) => {
              onBreaker({
                ...breaker,
                mccbSerialNumber: v,
                mccbScannedBy: who,
                mccbScannedAt: new Date().toISOString(),
              });
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
            model={mlModelOf(breaker)}
            onModel={(micrologicModel) => onBreaker({ ...breaker, micrologicModel })}
            onConfirm={(v) => {
              const next = {
                ...breaker,
                microLogicSerialNumber: v,
                micrologicModel: mlModelOf(breaker),
              };
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
            onToggleMicrologic={() =>
              onBreaker({ ...breaker, micrologicSettingConfirmed: !breaker.micrologicSettingConfirmed })
            }
            onEmpty={() => {
              onBreaker(emptySlot(breaker));
              onClose();
            }}
            onReplaceUnit={async () => {
              await logFault("unit");
              onBreaker({
                ...breaker,
                mccbSerialNumber: "",
                microLogicSerialNumber: "",
                mccbScannedBy: "",
                mccbScannedAt: "",
                micrologicSettingConfirmed: false,
              });
              setStep("mccb");
            }}
            onReplaceShunt={
              needsShuntTrip(breaker.micrologicSettingAmps)
                ? async () => {
                    await logFault("shunt");
                    onBreaker({ ...breaker, shuntTripBatchNumber: "" });
                    setStep("shunt");
                  }
                : undefined
            }
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
  whoLabel,
  whoValue,
  model,
  onModel,
  onConfirm,
  onBack,
}: {
  title: string;
  type: "qr" | "ocr";
  kind: "mccb" | "ml" | "shunt";
  value: string;
  whoLabel?: string;
  whoValue?: string;
  model?: MicrologicModel;
  onModel?: (m: MicrologicModel) => void;
  onConfirm: (v: string, who: string) => void;
  onBack: () => void;
}) {
  const [who, setWho] = useState(whoValue || "");

  useEffect(() => {
    if (who) return;
    const last = lastInstaller()?.initials || "";
    if (last) setWho(last);
  }, [who]);

  const initials = normalizeInitials(who);

  return (
    <div className="space-y-4 pt-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {kind === "ml" && onModel ? (
        <div className="flex gap-2">
          {(["2.2", "5.2E"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModel(m)}
              className={`flex-1 rounded-2xl py-4 text-lg font-semibold ${
                (model || "2.2") === m ? "bg-ink text-white" : "bg-white"
              }`}
            >
              ML {m}
            </button>
          ))}
        </div>
      ) : null}
      <SerialScanner
        type={type}
        kind={kind}
        label={title}
        value={value}
        onConfirm={(v) => {
          if (whoLabel && !initials) return;
          const last = lastInstaller();
          if (initials && (!last || last.initials !== initials)) {
            rememberLastInstaller({ initials, name: last?.name || initials });
          }
          onConfirm(v, initials);
        }}
        hero
      />
      {whoLabel ? (
        <div className="rounded-2xl bg-white p-3">
          <HandsPick label={whoLabel} value={who} onChange={setWho} />
        </div>
      ) : null}
      {whoLabel && !initials ? (
        <p className="text-center text-sm text-red-700">Pick who scanned before Confirm.</p>
      ) : null}
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-neutral-500">
        Back
      </button>
    </div>
  );
}

function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function DoneStep({
  breaker,
  onClose,
  onNext,
  onEditAmp,
  onEditSerials,
  onToggleMicrologic,
  onEmpty,
  onReplaceUnit,
  onReplaceShunt,
}: {
  breaker: BreakerPosition;
  onClose: () => void;
  onNext?: () => void;
  onEditAmp: () => void;
  onEditSerials: () => void;
  onToggleMicrologic: () => void;
  onEmpty: () => void;
  onReplaceUnit: () => void | Promise<void>;
  onReplaceShunt?: () => void | Promise<void>;
}) {
  const ready = serialsComplete(breaker);
  const set = breaker.micrologicSettingConfirmed;
  const [replaceOpen, setReplaceOpen] = useState(false);
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
        <li>
          Micrologic ML {mlModelOf(breaker)} {breaker.microLogicSerialNumber || "—"}
        </li>
        {needsShuntTrip(breaker.micrologicSettingAmps) ? (
          <li>Shunt batch {breaker.shuntTripBatchNumber || "—"}</li>
        ) : (
          <li className="text-neutral-400">No shunt trip (32A)</li>
        )}
        <li>
          Scanned by {breaker.mccbScannedBy || "—"}
          {breaker.mccbScannedAt ? ` · ${formatWhen(breaker.mccbScannedAt)}` : ""}
        </li>
      </ul>
      {ready ? (
        <button
          type="button"
          onClick={onToggleMicrologic}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-semibold text-white ${
            set ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          <span className="h-3 w-3 rounded-full bg-white" />
          {set ? "Micrologic set" : "Set Micrologic"}
        </button>
      ) : null}
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
      {ready ? (
        replaceOpen ? (
          <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-950">Broken / replace</p>
            <button
              type="button"
              onClick={() => void onReplaceUnit()}
              className="w-full rounded-2xl bg-amber-700 py-4 text-lg font-semibold text-white"
            >
              Replace MCCB + ML
            </button>
            {onReplaceShunt ? (
              <button
                type="button"
                onClick={() => void onReplaceShunt()}
                className="w-full rounded-2xl border border-amber-300 bg-white py-3 text-sm font-semibold text-amber-950"
              >
                Replace shunt only
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setReplaceOpen(false)}
              className="w-full py-1 text-sm text-amber-900"
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReplaceOpen(true)}
            className="w-full py-2 text-sm text-neutral-400"
          >
            Broken / replace
          </button>
        )
      ) : null}
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
