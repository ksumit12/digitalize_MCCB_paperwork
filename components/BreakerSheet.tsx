"use client";

import { useState } from "react";
import { IrPassFail, PolarityPassFail } from "@/components/PassFailPaint";
import { SerialScanner } from "@/components/SerialScanner";
import { SignPick } from "@/components/SignPick";
import { emptySlot, serialsComplete, setAmp } from "@/lib/breaker";
import { lastInstaller } from "@/lib/crew";
import { newId, saveDefect } from "@/lib/db";
import { needsShuntTrip } from "@/lib/emptyFrame";
import type { BreakerPosition, BreakerTest, SerialReplacement } from "@/lib/types";

type Step = "amp" | "mccb" | "ml" | "shunt" | "done" | "megger" | "replace";
type ReplaceKind = "mccb" | "ml" | "shunt";

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
  const [replaceKind, setReplaceKind] = useState<ReplaceKind | null>(null);

  function oldSerialOf(kind: ReplaceKind): string {
    if (kind === "mccb") return breaker.mccbSerialNumber;
    if (kind === "ml") return breaker.microLogicSerialNumber;
    return breaker.shuntTripBatchNumber;
  }

  function partName(kind: ReplaceKind): string {
    if (kind === "mccb") return "MCCB";
    if (kind === "ml") return "Micrologic trip unit";
    return "Shunt trip";
  }

  async function applyReplacement(kind: ReplaceKind, newSerial: string, note: string) {
    const oldSerial = oldSerialOf(kind).trim();
    const initials = lastInstaller()?.initials || "—";
    const now = new Date().toISOString();
    const entry: SerialReplacement = {
      kind,
      oldSerial,
      newSerial: newSerial.trim().toUpperCase(),
      note: note.trim() || undefined,
      replacedBy: initials,
      replacedAt: now,
    };
    onBreaker({
      ...breaker,
      serialHistory: [...(breaker.serialHistory ?? []), entry],
      mccbSerialNumber: kind === "mccb" ? newSerial.trim().toUpperCase() : breaker.mccbSerialNumber,
      microLogicSerialNumber: kind === "ml" ? newSerial.trim().toUpperCase() : breaker.microLogicSerialNumber,
      shuntTripBatchNumber: kind === "shunt" ? newSerial.trim().toUpperCase() : breaker.shuntTripBatchNumber,
    });
    // The old part is now faulty gear — log it in the same faults register the office uses.
    await saveDefect({
      id: newId(),
      stringKey: stringKey || "",
      frameSlot: frameSlot || undefined,
      slot,
      part: partName(kind),
      serial: oldSerial || undefined,
      description: `Replaced on the board — old ${partName(kind)} ${oldSerial || "—"} swapped for ${newSerial.trim().toUpperCase()}${note.trim() ? ` — ${note.trim()}` : ""}`,
      raisedBy: initials,
      raisedAt: now,
      status: "resolved",
      resolvedBy: initials,
      resolvedAt: now,
      updatedAt: now,
    });
    setReplaceKind(null);
    setStep(mode === "testing" ? "megger" : "done");
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
        {replaceKind ? (
          <ReplaceStep
            kind={replaceKind}
            oldSerial={oldSerialOf(replaceKind)}
            onConfirm={(v, note) => void applyReplacement(replaceKind, v, note)}
            onBack={() => setReplaceKind(null)}
          />
        ) : (
          <>
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
              onBreaker({
                ...breaker,
                mccbSerialNumber: v,
                serialCapturedBy: lastInstaller()?.initials || breaker.serialCapturedBy || "",
                serialCapturedAt: new Date().toISOString(),
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
            onTasks={(patch) =>
              onBreaker({
                ...breaker,
                ...patch,
                installedBy: patch.mccbInstalled
                  ? breaker.installedBy || lastInstaller()?.initials || ""
                  : breaker.installedBy,
                installedAt: patch.mccbInstalled
                  ? breaker.installedAt || new Date().toISOString()
                  : breaker.installedAt,
              })
            }
            onReplace={(kind) => setReplaceKind(kind)}
            onEmpty={() => {
              onBreaker(emptySlot(breaker));
              onClose();
            }}
          />
        ) : null}

        {mode === "testing" ? (
          <MeggerStep
            breaker={breaker}
            test={test}
            onTest={onTest}
            onBack={onClose}
            onNext={onNext}
            onReplace={(kind) => setReplaceKind(kind)}
          />
        ) : null}

        <ReportBreakage
          slot={slot}
          breaker={breaker}
          stringKey={stringKey}
          frameSlot={frameSlot}
        />
          </>
        )}
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
  onReplace,
  onEmpty,
}: {
  breaker: BreakerPosition;
  onClose: () => void;
  onNext?: () => void;
  onEditAmp: () => void;
  onEditSerials: () => void;
  onTasks: (patch: Partial<BreakerPosition>) => void;
  onReplace: (kind: ReplaceKind) => void;
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
        {breaker.serialCapturedBy || breaker.installedBy ? (
          <li className="text-neutral-500">
            Scanned by {breaker.serialCapturedBy || "—"}
            {breaker.serialCapturedAt
              ? ` ${new Date(breaker.serialCapturedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
              : ""}
            {breaker.installedBy ? ` · Fitted by ${breaker.installedBy}` : ""}
          </li>
        ) : null}
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

      {(breaker.mccbSerialNumber || breaker.microLogicSerialNumber || breaker.shuntTripBatchNumber) ? (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Replace a part — old serial is kept for traceability</p>
          <div className="grid grid-cols-3 gap-2">
            {breaker.mccbSerialNumber ? (
              <button type="button" onClick={() => onReplace("mccb")} className="rounded-xl bg-white px-2 py-2 text-xs font-semibold ring-1 ring-amber-300">
                MCCB
              </button>
            ) : null}
            {breaker.microLogicSerialNumber ? (
              <button type="button" onClick={() => onReplace("ml")} className="rounded-xl bg-white px-2 py-2 text-xs font-semibold ring-1 ring-amber-300">
                Micrologic
              </button>
            ) : null}
            {breaker.shuntTripBatchNumber ? (
              <button type="button" onClick={() => onReplace("shunt")} className="rounded-xl bg-white px-2 py-2 text-xs font-semibold ring-1 ring-amber-300">
                Shunt
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
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

function ReplaceStep({
  kind,
  oldSerial,
  onConfirm,
  onBack,
}: {
  kind: ReplaceKind;
  oldSerial: string;
  onConfirm: (newSerial: string, note: string) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState("");
  const title = kind === "mccb" ? "MCCB" : kind === "ml" ? "Micrologic" : "Shunt trip";
  return (
    <div className="space-y-4 pt-4">
      <h2 className="text-2xl font-semibold">Replace {title}</h2>
      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Old serial {oldSerial || "—"} will be kept on this slot and logged as a fault, so the swap can be
        traced later.
      </p>
      <SerialScanner
        type={kind === "ml" ? "qr" : "ocr"}
        kind={kind}
        label={`New ${title} serial`}
        value=""
        onConfirm={(v) => onConfirm(v, note)}
        hero
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why is it being replaced? (optional)"
        className="w-full rounded-2xl border border-rule bg-white px-4 py-3"
      />
      <button type="button" onClick={onBack} className="w-full py-2 text-sm text-neutral-500">
        Back
      </button>
    </div>
  );
}

function MeggerStep({
  breaker,
  test,
  onTest,
  onBack,
  onNext,
  onReplace,
}: {
  breaker: BreakerPosition;
  test: BreakerTest;
  onTest: (t: BreakerTest) => void;
  onBack: () => void;
  onNext?: () => void;
  onReplace: (kind: ReplaceKind) => void;
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
      {(breaker.mccbSerialNumber || breaker.microLogicSerialNumber || breaker.shuntTripBatchNumber) ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">Replace:</span>
          {breaker.mccbSerialNumber ? (
            <button type="button" onClick={() => onReplace("mccb")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold ring-1 ring-rule">
              MCCB
            </button>
          ) : null}
          {breaker.microLogicSerialNumber ? (
            <button type="button" onClick={() => onReplace("ml")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold ring-1 ring-rule">
              Micrologic
            </button>
          ) : null}
          {breaker.shuntTripBatchNumber ? (
            <button type="button" onClick={() => onReplace("shunt")} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold ring-1 ring-rule">
              Shunt
            </button>
          ) : null}
        </div>
      ) : null}
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
