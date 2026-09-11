"use client";

import { use } from "react";
import { CheckRow, Screen } from "@/components/ui";
import { useFrame } from "@/lib/useFrame";
import type { AncillaryCircuits, AncillaryItem } from "@/lib/types";

function ItemRow({
  label,
  item,
  onChange,
}: {
  label: string;
  item: AncillaryItem;
  onChange: (item: AncillaryItem) => void;
}) {
  return (
    <div className="space-y-2">
      <CheckRow
        label={label}
        checked={item.ticked}
        sign={item.installerSign}
        onChange={(ticked) => onChange({ ...item, ticked })}
        onSign={(installerSign) => onChange({ ...item, installerSign })}
      />
      {item.qty !== undefined ? (
        <input
          value={item.qty}
          onChange={(e) => onChange({ ...item, qty: e.target.value })}
          placeholder="Qty as required"
          className="ml-8 w-40 rounded-lg border border-rule px-3 py-2"
        />
      ) : null}
    </div>
  );
}

export default function AncillaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { frame, loading, update, savedAt } = useFrame(id);

  if (loading) return <Screen title="Ancillary circuits">Loading…</Screen>;
  if (!frame) return <Screen title="Ancillary circuits">Frame not found.</Screen>;

  function setItem<K extends keyof AncillaryCircuits>(key: K, value: AncillaryCircuits[K]) {
    update((f) => ({
      ...f,
      ancillaryCircuits: { ...f.ancillaryCircuits, [key]: value },
    }));
  }

  const a = frame.ancillaryCircuits;
  const hideEm = frame.market === "AUS";

  return (
    <Screen title="Ancillary circuits" savedAt={savedAt}>
      <ItemRow
        label="Install combined lighting/power circuit"
        item={a.combinedLightingPowerCircuit}
        onChange={(v) => setItem("combinedLightingPowerCircuit", v)}
      />
      <ItemRow
        label="Install HMCU-A Sub single phase circuit"
        item={a.hmcuASub}
        onChange={(v) => setItem("hmcuASub", v)}
      />
      <ItemRow
        label="Install HMCU-B Sub single phase circuit"
        item={a.hmcuBSub}
        onChange={(v) => setItem("hmcuBSub", v)}
      />
      <ItemRow
        label="Install HACU three phase circuit (if Drawing req)"
        item={a.hacuThreePhase}
        onChange={(v) => setItem("hacuThreePhase", v)}
      />
      <ItemRow
        label="Install HMBNP single phase circuit (if Drawing req)"
        item={a.hmbnpSinglePhase}
        onChange={(v) => setItem("hmbnpSinglePhase", v)}
      />
      <ItemRow
        label="Install Firmus Data Rack single phase circuit (if Drawing req)"
        item={a.firmusDataRackSinglePhase}
        onChange={(v) => setItem("firmusDataRackSinglePhase", v)}
      />
      <ItemRow
        label="Install BMS Control Panel circuit (if Drawing req)"
        item={a.bmsControlPanelCircuit}
        onChange={(v) => setItem("bmsControlPanelCircuit", v)}
      />
      <ItemRow
        label="Install 1 pair shielded 1.5mm cables from HMCU looped through CBSDS for Shunt Trip. Qty as required"
        item={a.shieldedPairCables}
        onChange={(v) => setItem("shieldedPairCables", v)}
      />
      <ItemRow
        label="Install MCB's/RCD's into DB Chassis per Shop Drawing"
        item={a.mcbsRcdsIntoDbChassis}
        onChange={(v) => setItem("mcbsRcdsIntoDbChassis", v)}
      />
      <ItemRow
        label="Install Din Rail GPO"
        item={a.dinRailGpo}
        onChange={(v) => setItem("dinRailGpo", v)}
      />
      {hideEm ? (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm">Em Light Test Facility is INT only.</p>
      ) : (
        <ItemRow
          label="Install Em Light Test Facility (INT Only)"
          item={a.emLightTestFacility}
          onChange={(v) => setItem("emLightTestFacility", v)}
        />
      )}
      <CheckRow
        label="MCB Torque Setting — Line Side 2 Nm"
        checked={a.mcbTorqueLineSideConfirmed}
        onChange={(v) => setItem("mcbTorqueLineSideConfirmed", v)}
      />
      <CheckRow
        label="MCB Torque Setting — Load Side 2 Nm"
        checked={a.mcbTorqueLoadSideConfirmed}
        onChange={(v) => setItem("mcbTorqueLoadSideConfirmed", v)}
      />
      <CheckRow
        label="RCBO Torque Setting — Line side 3.5 Nm"
        checked={a.rcboTorqueLineSideConfirmed}
        onChange={(v) => setItem("rcboTorqueLineSideConfirmed", v)}
      />
      <CheckRow
        label="RCBO Torque Setting — Load side 2 Nm"
        checked={a.rcboTorqueLoadSideConfirmed}
        onChange={(v) => setItem("rcboTorqueLoadSideConfirmed", v)}
      />
      <ItemRow
        label="Install unused frame holes with caps"
        item={a.unusedFrameHolesWithCaps}
        onChange={(v) => setItem("unusedFrameHolesWithCaps", v)}
      />
      <ItemRow
        label="Install CB Labels 1-8 per CBSDS"
        item={a.cbLabels1to8}
        onChange={(v) => setItem("cbLabels1to8", v)}
      />
      <ItemRow
        label="Install Bungs into unused holes in glandplates"
        item={a.bungsUnusedGlandplateHoles}
        onChange={(v) => setItem("bungsUnusedGlandplateHoles", v)}
      />
      <ItemRow
        label="Install Bungs into cable path holes in frames"
        item={a.bungsCablePathHoles}
        onChange={(v) => setItem("bungsCablePathHoles", v)}
      />
    </Screen>
  );
}
