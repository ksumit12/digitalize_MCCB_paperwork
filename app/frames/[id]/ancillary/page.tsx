"use client";

import { use } from "react";
import { NextChecklist } from "@/components/NextChecklist";
import { SignPick } from "@/components/SignPick";
import { YesNaRow, Screen } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";
import type { AncillaryCircuits, AncillaryItem, ChecklistItem } from "@/lib/types";

function mark(item: ChecklistItem, kind: "yes" | "na", initials: string): ChecklistItem {
  return {
    ...item,
    ticked: kind === "yes",
    na: kind === "na",
    installerSign: item.installerSign || initials,
  };
}

function ItemRow({
  label,
  item,
  initials,
  onChange,
}: {
  label: string;
  item: AncillaryItem;
  initials: string;
  onChange: (item: AncillaryItem) => void;
}) {
  return (
    <div className="space-y-2">
      <YesNaRow
        label={label}
        ticked={item.ticked}
        na={item.na}
        sign={item.installerSign}
        onYes={() => onChange(mark(item, "yes", initials))}
        onNa={() => onChange(mark(item, "na", initials))}
        onSign={(installerSign) => onChange({ ...item, installerSign })}
      />
      {item.qty !== undefined ? (
        <input
          value={item.qty}
          onChange={(e) => onChange({ ...item, qty: e.target.value })}
          placeholder="Qty as required"
          className="w-full rounded-xl border border-rule px-3 py-3"
        />
      ) : null}
    </div>
  );
}

export default function AncillaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);

  if (loading) return <Screen title="Lights & wiring">Loading…</Screen>;
  if (!frame) return <Screen title="Lights & wiring">Frame not found.</Screen>;

  const initials = frame.installerInitials || "";

  function setItem<K extends keyof AncillaryCircuits>(key: K, value: AncillaryCircuits[K]) {
    update((f) => ({
      ...f,
      ancillaryCircuits: { ...f.ancillaryCircuits, [key]: value },
    }));
  }

  const a = frame.ancillaryCircuits;
  const hideEm = frame.market === "AUS";

  return (
    <Screen title="Lights & wiring" savedAt={savedAt} backHref={`/frames/${id}/more`} backLabel="Office">
      <div className="rounded-2xl border border-rule bg-white p-3">
        <p className="mb-2 text-sm font-medium">Who is wiring</p>
        <SignPick
          value={initials}
          onChange={(v) => update((f) => ({ ...f, installerInitials: v, installerName: v }))}
          placeholder="Initials"
        />
      </div>
      <ItemRow
        label="Install combined lighting/power circuit"
        item={a.combinedLightingPowerCircuit}
        initials={initials}
        onChange={(v) => setItem("combinedLightingPowerCircuit", v)}
      />
      <ItemRow
        label="Install HMCU-A Sub single phase circuit"
        item={a.hmcuASub}
        initials={initials}
        onChange={(v) => setItem("hmcuASub", v)}
      />
      <ItemRow
        label="Install HMCU-B Sub single phase circuit"
        item={a.hmcuBSub}
        initials={initials}
        onChange={(v) => setItem("hmcuBSub", v)}
      />
      <ItemRow
        label="Install HACU three phase circuit (if drawing required)"
        item={a.hacuThreePhase}
        initials={initials}
        onChange={(v) => setItem("hacuThreePhase", v)}
      />
      <ItemRow
        label="Install HMBNP single phase circuit (if drawing required)"
        item={a.hmbnpSinglePhase}
        initials={initials}
        onChange={(v) => setItem("hmbnpSinglePhase", v)}
      />
      <ItemRow
        label="Install Firmus Data Rack single phase circuit (if drawing required)"
        item={a.firmusDataRackSinglePhase}
        initials={initials}
        onChange={(v) => setItem("firmusDataRackSinglePhase", v)}
      />
      <ItemRow
        label="Install BMS Control Panel circuit (if drawing required)"
        item={a.bmsControlPanelCircuit}
        initials={initials}
        onChange={(v) => setItem("bmsControlPanelCircuit", v)}
      />
      <ItemRow
        label="Shunt trip cable: 1 pair shielded 1.5mm from HMCU looped through CBSDS"
        item={a.shieldedPairCables}
        initials={initials}
        onChange={(v) => setItem("shieldedPairCables", v)}
      />
      <ItemRow
        label="Install MCB's/RCD's into DB Chassis per Shop Drawing"
        item={a.mcbsRcdsIntoDbChassis}
        initials={initials}
        onChange={(v) => setItem("mcbsRcdsIntoDbChassis", v)}
      />
      <ItemRow
        label="Install Din Rail GPO"
        item={a.dinRailGpo}
        initials={initials}
        onChange={(v) => setItem("dinRailGpo", v)}
      />
      {hideEm ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm">Em Light Test Facility is INT only.</p>
      ) : (
        <ItemRow
          label="Install Em Light Test Facility (INT only)"
          item={a.emLightTestFacility}
          initials={initials}
          onChange={(v) => setItem("emLightTestFacility", v)}
        />
      )}
      <YesNaRow
        label="MCB Torque Setting — Line Side 2 Nm"
        ticked={a.mcbTorqueLineSideConfirmed}
        onYes={() => setItem("mcbTorqueLineSideConfirmed", true)}
        onNa={() => setItem("mcbTorqueLineSideConfirmed", false)}
      />
      <YesNaRow
        label="MCB Torque Setting — Load Side 2 Nm"
        ticked={a.mcbTorqueLoadSideConfirmed}
        onYes={() => setItem("mcbTorqueLoadSideConfirmed", true)}
        onNa={() => setItem("mcbTorqueLoadSideConfirmed", false)}
      />
      <YesNaRow
        label="RCBO Torque Setting — Line side 3.5 Nm"
        ticked={a.rcboTorqueLineSideConfirmed}
        onYes={() => setItem("rcboTorqueLineSideConfirmed", true)}
        onNa={() => setItem("rcboTorqueLineSideConfirmed", false)}
      />
      <YesNaRow
        label="RCBO Torque Setting — Load side 2 Nm"
        ticked={a.rcboTorqueLoadSideConfirmed}
        onYes={() => setItem("rcboTorqueLoadSideConfirmed", true)}
        onNa={() => setItem("rcboTorqueLoadSideConfirmed", false)}
      />
      <ItemRow
        label="Install unused frame holes with caps"
        item={a.unusedFrameHolesWithCaps}
        initials={initials}
        onChange={(v) => setItem("unusedFrameHolesWithCaps", v)}
      />
      <ItemRow
        label="Install CB Labels 1-8 per CBSDS"
        item={a.cbLabels1to8}
        initials={initials}
        onChange={(v) => setItem("cbLabels1to8", v)}
      />
      <ItemRow
        label="Install Bungs into unused holes in glandplates"
        item={a.bungsUnusedGlandplateHoles}
        initials={initials}
        onChange={(v) => setItem("bungsUnusedGlandplateHoles", v)}
      />
      <ItemRow
        label="Install Bungs into cable path holes in frames"
        item={a.bungsCablePathHoles}
        initials={initials}
        onChange={(v) => setItem("bungsCablePathHoles", v)}
      />
      <NextChecklist frameId={id} current="ancillary" />
    </Screen>
  );
}
