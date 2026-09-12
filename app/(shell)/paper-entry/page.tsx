"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PaperScanSheet } from "@/components/PaperScanSheet";
import { Field, PassFailSelect, TextInput, YesNaRow } from "@/components/ui";
import { emptySlot, isUsed, patchBreaker, setAmp } from "@/lib/breaker";
import {
  findFrameBySlot,
  listStringRuns,
  normalizeInitials,
  saveFrame,
  saveInstaller,
  saveStringRun,
} from "@/lib/db";
import { createEmptyFrame, needsShuntTrip } from "@/lib/emptyFrame";
import { fillIr } from "@/lib/ir";
import type { PaperScanResult } from "@/lib/paperScan";
import { frameStatus } from "@/lib/status";
import type { AmpSetting, AncillaryCircuits, BreakerPosition, CbsdsLabel, Frame } from "@/lib/types";

const LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

const INSTALL_ITEMS: { key: keyof Frame["installChecklist"]; label: string }[] = [
  { key: "verticalCableLadders", label: "Install Vertical Cable Ladders" },
  { key: "horizontalUnistrutWhipSupport", label: "Install Horizontal Unistrut Whip Support" },
  { key: "earthBarAngleBrackets", label: "Install Earth Bar Angle Brackets" },
  { key: "cbsdsSupports", label: "Install CBSDS Supports" },
  { key: "cAndEAirSamplingConduit", label: "Install C&E Air Sampling Conduit" },
  { key: "whipsPerShopDrawing", label: "Install Whip's per Shop Drawing" },
];

type AncillaryItemKey = Exclude<
  keyof AncillaryCircuits,
  "mcbTorqueLineSideConfirmed" | "mcbTorqueLoadSideConfirmed" | "rcboTorqueLineSideConfirmed" | "rcboTorqueLoadSideConfirmed"
>;

const ANCILLARY_ITEMS: { key: AncillaryItemKey; label: string }[] = [
  { key: "combinedLightingPowerCircuit", label: "Combined lighting/power circuit" },
  { key: "hmcuASub", label: "HMCU-A Sub single phase circuit" },
  { key: "hmcuBSub", label: "HMCU-B Sub single phase circuit" },
  { key: "hacuThreePhase", label: "HACU three phase circuit (if drawing req)" },
  { key: "hmbnpSinglePhase", label: "HMBNP single phase circuit (if drawing req)" },
  { key: "firmusDataRackSinglePhase", label: "Firmus Data Rack single phase circuit (if drawing req)" },
  { key: "bmsControlPanelCircuit", label: "BMS Control Panel circuit (if drawing req)" },
  { key: "shieldedPairCables", label: "Shunt trip cable: 1 pair shielded 1.5mm looped through CBSDS" },
  { key: "mcbsRcdsIntoDbChassis", label: "MCB's/RCD's into DB Chassis per Shop Drawing" },
  { key: "dinRailGpo", label: "Din Rail GPO" },
  { key: "emLightTestFacility", label: "Em Light Test Facility (INT Only)" },
  { key: "unusedFrameHolesWithCaps", label: "Unused frame holes with caps" },
  { key: "cbLabels1to8", label: "CB Labels 1-8 per CBSDS" },
  { key: "bungsUnusedGlandplateHoles", label: "Bungs into unused glandplate holes" },
  { key: "bungsCablePathHoles", label: "Bungs into cable path holes in frames" },
];

const POSITION_TASKS: Partial<BreakerPosition> = {
  mccbInstalled: true,
  flexibarCapsRemoved: true,
  whipTerminated: true,
  torqueLineSideConfirmed: true,
  torqueLoadSideConfirmed: true,
  micrologicSettingConfirmed: true,
};

export default function PaperEntryPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Frame>(() => createEmptyFrame());
  const [tradeName, setTradeName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanBoard, setScanBoard] = useState<CbsdsLabel | null>(null);

  function applyScan(label: CbsdsLabel, res: PaperScanResult) {
    patch((f) => ({
      ...f,
      cbsds: f.cbsds.map((c) => {
        if (c.label !== label) return c;
        return {
          ...c,
          cbsdsSerialNumber: c.cbsdsSerialNumber || res.switchboardLine || "",
          breakerPositions: c.breakerPositions.map((b) => {
            const i = b.position - 1;
            const next = { ...b };
            if (res.mccbs[i]) next.mccbSerialNumber = res.mccbs[i];
            if (res.mls[i]) next.microLogicSerialNumber = res.mls[i];
            if (res.shunts[i]) next.shuntTripBatchNumber = res.shunts[i];
            if (res.mccbs[i] || res.mls[i] || res.shunts[i]) next.inUse = true;
            return next;
          }),
        };
      }),
    }));
    setScanBoard(null);
  }

  function patch(fn: (f: Frame) => Frame) {
    setDraft((f) => fn(f));
  }

  function patchBreakerAt(label: CbsdsLabel, position: number, next: BreakerPosition) {
    patch((f) => patchBreaker(f, label, position, next));
  }

  function patchBoard(label: CbsdsLabel, board: Partial<Frame["cbsds"][number]>) {
    patch((f) => ({
      ...f,
      cbsds: f.cbsds.map((c) => (c.label === label ? { ...c, ...board } : c)),
    }));
  }

  function tickBoardTasks(label: CbsdsLabel) {
    patch((f) => ({
      ...f,
      cbsds: f.cbsds.map((c) => {
        if (c.label !== label) return c;
        return {
          ...c,
          mountingBoltsTight: true,
          glandPlatesAndGlandsInstalled: true,
          mccbsSelectedPerShopDrawing: true,
          breakerPositions: c.breakerPositions.map((b) =>
            isUsed(b) ? { ...b, ...POSITION_TASKS } : b,
          ),
        };
      }),
    }));
  }

  function boardIr(label: CbsdsLabel, value: "pass" | "fail") {
    patch((f) => ({
      ...f,
      electricalTesting: {
        ...f.electricalTesting,
        perCbsdsIr: { ...f.electricalTesting.perCbsdsIr, [label]: { readings: fillIr(value) } },
      },
    }));
  }

  function usedBreakersPass(label: CbsdsLabel) {
    const tester = draft.testerInitials || draft.testerName || "";
    patch((f) => ({
      ...f,
      electricalTesting: {
        ...f.electricalTesting,
        perBreakerTest: {
          ...f.electricalTesting.perBreakerTest,
          [label]: f.electricalTesting.perBreakerTest[label].map((t, i) => {
            const breaker = f.cbsds.find((c) => c.label === label)?.breakerPositions[i];
            if (!breaker || !isUsed(breaker)) return t;
            return {
              ...t,
              irTest: fillIr("pass"),
              polarityTest: { l1ToEarth: "pass", l2ToEarth: "pass", l3ToEarth: "pass", nToEarth: "pass" },
              sign: tester,
              mccbSerialNumber: breaker.mccbSerialNumber,
              microLogicSerialNumber: breaker.microLogicSerialNumber,
            };
          }),
        },
      },
    }));
  }

  async function save() {
    setError("");
    const stringKey = (draft.stringKey || "").trim();
    const frameSlot = (draft.frameSlot || "").trim().toUpperCase();
    if (!stringKey || !frameSlot) {
      setError("String no. and frame slot are required.");
      return;
    }
    setSaving(true);
    try {
      const existing = await findFrameBySlot(stringKey, frameSlot);
      if (existing) {
        setError(`String ${stringKey} · ${frameSlot} already exists. Open it instead of importing.`);
        setSaving(false);
        return;
      }

      // Make sure the string exists and carries the trade.
      const runs = await listStringRuns();
      let run = runs.find((r) => r.key === stringKey);
      const trade = tradeName.trim();
      if (!run) {
        run = { key: stringKey, createdAt: new Date().toISOString(), tradeId: "", tradeName: trade };
        await saveStringRun(run);
      } else if (trade && !run.tradeName) {
        run = { ...run, tradeName: trade };
        await saveStringRun(run);
      }

      const installerKey = normalizeInitials(draft.installerInitials || "");
      if (installerKey) await saveInstaller({ initials: installerKey, name: (draft.installerName || "").trim() || installerKey });
      const testerKey = normalizeInitials(draft.testerInitials || "");
      if (testerKey) await saveInstaller({ initials: testerKey, name: (draft.testerName || "").trim() || testerKey });

      const status = frameStatus(draft);
      const frame: Frame = {
        ...draft,
        stringKey,
        frameSlot,
        stringId: frameSlot,
        tradeName: run.tradeName || trade,
        installerInitials: installerKey,
        installerName: (draft.installerName || "").trim() || installerKey,
        testerInitials: testerKey,
        testerName: (draft.testerName || "").trim() || testerKey,
        phase: status === "handed_over" || status === "testing" ? "testing" : "installation",
        submitted: true,
        paperImport: true,
      };
      await saveFrame(frame);
      router.push(`/frames/${frame.id}/more`);
    } finally {
      setSaving(false);
    }
  }

  const et = draft.electricalTesting;
  const h = draft.handover;

  return (
    <main>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Old paperwork entry</h1>
        <p className="text-sm text-neutral-500">
          Type in one old paper form. It lands in the database like a live frame — counts in inventory and
          progress, and you can re-print the paperwork from Office.
        </p>
      </div>
      {error ? <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section className="space-y-3 rounded-2xl border border-rule bg-white p-4">
        <h2 className="font-medium">Header</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="String no. *">
            <TextInput value={draft.stringKey} onChange={(e) => patch((f) => ({ ...f, stringKey: e.target.value }))} placeholder="e.g. 4" />
          </Field>
          <Field label="Frame slot *">
            <TextInput value={draft.frameSlot || ""} onChange={(e) => patch((f) => ({ ...f, frameSlot: e.target.value.toUpperCase() }))} placeholder="e.g. 3L" className="uppercase" />
          </Field>
          <Field label="Shepherd Frame ID">
            <TextInput value={draft.shepherdFrameId} onChange={(e) => patch((f) => ({ ...f, shepherdFrameId: e.target.value }))} />
          </Field>
          <Field label="ACTSW Frame ID">
            <TextInput value={draft.actswFrameId} onChange={(e) => patch((f) => ({ ...f, actswFrameId: e.target.value }))} />
          </Field>
          <Field label="Module frame serial">
            <TextInput value={draft.moduleFrameSerialNumber} onChange={(e) => patch((f) => ({ ...f, moduleFrameSerialNumber: e.target.value }))} placeholder={`${draft.stringKey || "1"}-${draft.frameSlot || ""}`} />
          </Field>
          <Field label="Trade / team">
            <TextInput value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="e.g. Sparkies" />
          </Field>
          <Field label="Start date">
            <TextInput type="date" value={draft.startDate} onChange={(e) => patch((f) => ({ ...f, startDate: e.target.value }))} />
          </Field>
          <Field label="Start time">
            <TextInput type="time" value={draft.startTime} onChange={(e) => patch((f) => ({ ...f, startTime: e.target.value }))} />
          </Field>
          <Field label="Finish date">
            <TextInput type="date" value={draft.finishDate} onChange={(e) => patch((f) => ({ ...f, finishDate: e.target.value }))} />
          </Field>
          <Field label="Finish time">
            <TextInput type="time" value={draft.finishTime} onChange={(e) => patch((f) => ({ ...f, finishTime: e.target.value }))} />
          </Field>
          <Field label="Market">
            <select
              value={draft.market}
              onChange={(e) => patch((f) => ({ ...f, market: e.target.value as typeof f.market }))}
              className="w-full rounded-lg border border-rule bg-white px-3 py-2.5"
            >
              <option value="">—</option>
              <option value="INT">INT</option>
              <option value="AUS">AUS</option>
            </select>
          </Field>
          <Field label="Manufacturer">
            <select
              value={draft.manufacturer}
              onChange={(e) => patch((f) => ({ ...f, manufacturer: e.target.value as typeof f.manufacturer }))}
              className="w-full rounded-lg border border-rule bg-white px-3 py-2.5"
            >
              <option value="">—</option>
              <option value="RN Baker">RN Baker</option>
              <option value="SMBE">SMBE</option>
            </select>
          </Field>
          <Field label="Installer initials">
            <TextInput value={draft.installerInitials || ""} onChange={(e) => patch((f) => ({ ...f, installerInitials: e.target.value.toUpperCase() }))} className="uppercase" />
          </Field>
          <Field label="Installer name">
            <TextInput value={draft.installerName || ""} onChange={(e) => patch((f) => ({ ...f, installerName: e.target.value }))} />
          </Field>
          <Field label="Tester initials">
            <TextInput value={draft.testerInitials || ""} onChange={(e) => patch((f) => ({ ...f, testerInitials: e.target.value.toUpperCase() }))} className="uppercase" />
          </Field>
          <Field label="Tester name">
            <TextInput value={draft.testerName || ""} onChange={(e) => patch((f) => ({ ...f, testerName: e.target.value }))} />
          </Field>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-rule bg-white p-4">
        <h2 className="font-medium">Install checklist</h2>
        {INSTALL_ITEMS.map((item) => {
          const row = draft.installChecklist[item.key];
          const initials = draft.installerInitials || "";
          return (
            <YesNaRow
              key={item.key}
              label={item.label}
              ticked={row.ticked}
              na={row.na}
              sign={row.installerSign}
              onYes={() =>
                patch((f) => ({
                  ...f,
                  installChecklist: {
                    ...f.installChecklist,
                    [item.key]: { ...row, ticked: true, na: false, installerSign: row.installerSign || initials },
                  },
                }))
              }
              onNa={() =>
                patch((f) => ({
                  ...f,
                  installChecklist: {
                    ...f.installChecklist,
                    [item.key]: { ...row, ticked: false, na: true, installerSign: row.installerSign || initials },
                  },
                }))
              }
            />
          );
        })}
      </section>

      <details className="rounded-2xl border border-rule bg-white p-4">
        <summary className="cursor-pointer font-medium">Ancillary circuits (lights & wiring)</summary>
        <div className="mt-3 space-y-2">
          {ANCILLARY_ITEMS.map((item) => {
            const row = draft.ancillaryCircuits[item.key];
            const initials = draft.installerInitials || "";
            const setRow = (next: typeof row) =>
              patch((f) => ({ ...f, ancillaryCircuits: { ...f.ancillaryCircuits, [item.key]: next } }));
            return (
              <YesNaRow
                key={item.key}
                label={item.label}
                ticked={row.ticked}
                na={row.na}
                sign={row.installerSign}
                onYes={() => setRow({ ...row, ticked: true, na: false, installerSign: row.installerSign || initials })}
                onNa={() => setRow({ ...row, ticked: false, na: true, installerSign: row.installerSign || initials })}
              />
            );
          })}
        </div>
      </details>

      <section className="space-y-3">
        <h2 className="font-medium">CBSDS serial numbers</h2>
        {LABELS.map((label) => {
          const board = draft.cbsds.find((c) => c.label === label)!;
          const used = board.breakerPositions.filter(isUsed).length;
          return (
            <details key={label} className="rounded-2xl border border-rule bg-white p-4">
              <summary className="cursor-pointer font-medium">
                CBSDS {label} {used ? `· ${used} used` : ""}
              </summary>
              <div className="mt-3 space-y-3">
                <Field label={`Switchboard ${label} serial`}>
                  <TextInput
                    value={board.cbsdsSerialNumber}
                    onChange={(e) => patchBoard(label, { cbsdsSerialNumber: e.target.value })}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => tickBoardTasks(label)}
                    className="rounded-2xl bg-ink px-4 py-2 text-sm font-medium text-white"
                  >
                    Tick all install tasks on this board
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanBoard(label)}
                    className="rounded-2xl border border-ink bg-white px-4 py-2 text-sm font-medium"
                  >
                    📷 Scan paper page
                  </button>
                </div>
                <div className="space-y-2">
                  {board.breakerPositions.map((b) => (
                    <div key={b.position} className="rounded-xl border border-rule p-2">
                      <div className="flex items-center gap-2">
                        <p className="w-8 shrink-0 text-sm font-semibold">
                          {label}
                          {b.position}
                        </p>
                        <select
                          value={b.micrologicSettingAmps || ""}
                          onChange={(e) => {
                            const amps = e.target.value as AmpSetting;
                            patchBreakerAt(label, b.position, amps ? setAmp(b, amps as 32 | 63 | 100) : emptySlot(b));
                          }}
                          className="w-20 shrink-0 rounded-lg border border-rule bg-white px-2 py-2 text-sm"
                        >
                          <option value="">—</option>
                          <option value="32">32A</option>
                          <option value="63">63A</option>
                          <option value="100">100A</option>
                        </select>
                        {isUsed(b) ? (
                          <div className="grid flex-1 grid-cols-2 gap-2">
                            <TextInput
                              value={b.mccbSerialNumber}
                              onChange={(e) => patchBreakerAt(label, b.position, { ...b, mccbSerialNumber: e.target.value.toUpperCase() })}
                              placeholder="MCCB serial"
                              className="uppercase"
                            />
                            <TextInput
                              value={b.microLogicSerialNumber}
                              onChange={(e) => patchBreakerAt(label, b.position, { ...b, microLogicSerialNumber: e.target.value.toUpperCase() })}
                              placeholder="Micrologic WX…"
                              className="uppercase"
                            />
                            {needsShuntTrip(b.micrologicSettingAmps) ? (
                              <TextInput
                                value={b.shuntTripBatchNumber}
                                onChange={(e) => patchBreakerAt(label, b.position, { ...b, shuntTripBatchNumber: e.target.value.toUpperCase() })}
                                placeholder="Shunt batch TC-…"
                                className="uppercase"
                              />
                            ) : null}
                          </div>
                        ) : (
                          <p className="flex-1 text-xs text-neutral-400">Set amps to enter serials</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </section>

      <section className="space-y-3 rounded-2xl border border-rule bg-white p-4">
        <h2 className="font-medium">Electrical testing</h2>
        {LABELS.map((label) => {
          const board = draft.cbsds.find((c) => c.label === label)!;
          const used = board.breakerPositions.filter(isUsed).length;
          return (
            <div key={label} className="space-y-2 rounded-xl border border-rule p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">CBSDS {label}</p>
                <PassFailSelect
                  value={et.visualInspection[label]}
                  onChange={(v) =>
                    patch((f) => ({
                      ...f,
                      electricalTesting: {
                        ...f.electricalTesting,
                        visualInspection: { ...f.electricalTesting.visualInspection, [label]: v },
                      },
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => boardIr(label, "pass")}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Board IR all pass
                </button>
                <button
                  type="button"
                  onClick={() => boardIr(label, "fail")}
                  className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Board IR all fail
                </button>
                <button
                  type="button"
                  disabled={!used}
                  onClick={() => usedBreakersPass(label)}
                  className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-30"
                >
                  All {used} breakers IR + polarity pass
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch((f) => ({
                      ...f,
                      electricalTesting: {
                        ...f.electricalTesting,
                        mechanical: {
                          ...f.electricalTesting.mechanical,
                          [label]: Array.from({ length: 8 }, () => "pass" as const),
                        },
                      },
                    }))
                  }
                  className="rounded-xl border border-ink bg-white px-3 py-2 text-xs font-semibold"
                >
                  Mechanical all pass
                </button>
              </div>
            </div>
          );
        })}
        <Field label="Frame IR sign">
          <TextInput
            value={et.frameIrSign}
            onChange={(e) =>
              patch((f) => ({
                ...f,
                electricalTesting: { ...f.electricalTesting, frameIrSign: e.target.value },
              }))
            }
            placeholder="Sparky sign-off"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["breakerStack1and2", "Shunt trip stack 1 & 2"],
              ["breakerStack3and4", "Shunt trip stack 3 & 4"],
              ["breakerStack5and6", "Shunt trip stack 5 & 6"],
              ["breakerStack7and8", "Shunt trip stack 7 & 8"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-2 text-sm">
              {label}
              <PassFailSelect
                value={et.shuntTripLiveTest[key]}
                onChange={(v) =>
                  patch((f) => ({
                    ...f,
                    electricalTesting: {
                      ...f.electricalTesting,
                      shuntTripLiveTest: { ...f.electricalTesting.shuntTripLiveTest, [key]: v },
                    },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-rule bg-white p-4">
        <h2 className="font-medium">Handover</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={h.date} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, date: e.target.value } }))} />
          </Field>
          <Field label="Time">
            <TextInput type="time" value={h.time} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, time: e.target.value } }))} />
          </Field>
          <Field label="Shepherd name">
            <TextInput value={h.shepherdName} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, shepherdName: e.target.value } }))} />
          </Field>
          <Field label="Shepherd sign">
            <TextInput value={h.shepherdSign} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, shepherdSign: e.target.value } }))} />
          </Field>
          <Field label="Benmax name">
            <TextInput value={h.benmaxName} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, benmaxName: e.target.value } }))} />
          </Field>
          <Field label="Benmax sign">
            <TextInput value={h.benmaxSign} onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, benmaxSign: e.target.value } }))} />
          </Field>
        </div>
        <p className="text-sm font-medium">Install checklist QA</p>
        <div className="grid grid-cols-2 gap-2">
          {(["pass", "fail"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => patch((f) => ({ ...f, handover: { ...f.handover, installChecklistComplete: v === "pass" } }))}
              className={`rounded-2xl py-3 text-sm font-semibold ${
                h.installChecklistComplete
                  ? v === "pass"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100"
                  : v === "fail"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100"
              }`}
            >
              QA {v === "pass" ? "Passed" : "Failed"}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium">Electrical testing QA</p>
        <div className="grid grid-cols-2 gap-2">
          {(["pass", "fail"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => patch((f) => ({ ...f, handover: { ...f.handover, electricalTestingComplete: v === "pass" } }))}
              className={`rounded-2xl py-3 text-sm font-semibold ${
                h.electricalTestingComplete
                  ? v === "pass"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100"
                  : v === "fail"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100"
              }`}
            >
              QA {v === "pass" ? "Passed" : "Failed"}
            </button>
          ))}
        </div>
        <Field label="Notes">
          <textarea
            value={h.notes ?? ""}
            onChange={(e) => patch((f) => ({ ...f, handover: { ...f.handover, notes: e.target.value } }))}
            className="min-h-20 w-full rounded-xl border border-rule px-3 py-3"
          />
        </Field>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="w-full rounded-2xl bg-ink py-4 text-lg text-white disabled:opacity-30"
      >
        {saving ? "Saving…" : "Save old paperwork into database"}
      </button>

      {scanBoard ? (
        <PaperScanSheet
          label={scanBoard}
          onApply={(res) => applyScan(scanBoard, res)}
          onClose={() => setScanBoard(null)}
        />
      ) : null}
    </main>
  );
}
