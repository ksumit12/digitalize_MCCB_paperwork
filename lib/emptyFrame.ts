import { emptyIr } from "./ir";
import type {
  AncillaryItem,
  BreakerPosition,
  BreakerTest,
  Cbsds,
  CbsdsLabel,
  ChecklistItem,
  Frame,
} from "./types";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function item(sign = ""): ChecklistItem {
  return { ticked: false, installerSign: sign };
}

function ancillary(sign: string, extra?: Partial<AncillaryItem>): AncillaryItem {
  return { ticked: false, installerSign: sign, ...extra };
}

function emptyBreaker(position: number): BreakerPosition {
  return {
    position,
    inUse: false,
    mccbSerialNumber: "",
    microLogicSerialNumber: "",
    shuntTripBatchNumber: "",
    mccbInstalled: false,
    flexibarCapsRemoved: false,
    whipTerminated: false,
    torqueLineSideNm: 10,
    torqueLoadSideNm: 10,
    torqueLineSideConfirmed: false,
    torqueLoadSideConfirmed: false,
    micrologicSettingAmps: "",
    micrologicSettingConfirmed: false,
    mccbScannedBy: "",
    mccbScannedAt: "",
    micrologicModel: "2.2",
  };
}

function emptyBreakerTest(sign: string): BreakerTest {
  return {
    irTest: emptyIr(),
    polarityTest: {
      l1ToEarth: "",
      l2ToEarth: "",
      l3ToEarth: "",
      nToEarth: "",
    },
    sign,
    mccbSerialNumber: "",
    microLogicSerialNumber: "",
  };
}

function emptyCbsds(label: CbsdsLabel): Cbsds {
  return {
    label,
    mountingBoltsTight: false,
    cbsdsSerialNumber: "",
    glandPlatesAndGlandsInstalled: false,
    mccbsSelectedPerShopDrawing: false,
    breakerPositions: Array.from({ length: 8 }, (_, i) => emptyBreaker(i + 1)),
  };
}

export function needsShuntTrip(amps: BreakerPosition["micrologicSettingAmps"]): boolean {
  return amps === 63 || amps === 100;
}

export function createEmptyFrame(opts?: {
  projectId?: string;
  stringId?: string;
  stringKey?: string;
  frameSlot?: string;
  installerInitials?: string;
  installerName?: string;
  testerInitials?: string;
  testerName?: string;
}): Frame {
  const now = new Date();
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const labels: CbsdsLabel[] = ["A", "B", "C", "D"];
  const sign = opts?.installerInitials?.trim() || opts?.installerName?.trim() || "";
  const testSign = opts?.testerInitials?.trim() || opts?.testerName?.trim() || "";

  return {
    id: generateId(),
    projectId: opts?.projectId,
    stringId: opts?.frameSlot ?? opts?.stringId ?? "",
    stringKey: opts?.stringKey ?? "1",
    frameSlot: opts?.frameSlot ?? opts?.stringId ?? "",
    submitted: false,
    shopStage: "",
    installerInitials: opts?.installerInitials ?? "",
    installerName: opts?.installerName?.trim() || sign,
    testerInitials: opts?.testerInitials ?? "",
    testerName: opts?.testerName ?? "",
    shepherdFrameId: "",
    actswFrameId: "",
    moduleFrameSerialNumber: "",
    market: "",
    manufacturer: "",
    phase: "installation",
    startDate: date,
    startTime: time,
    finishDate: "",
    finishTime: "",
    createdAt: iso,
    updatedAt: iso,
    installChecklist: {
      verticalCableLadders: item(sign),
      horizontalUnistrutWhipSupport: item(sign),
      earthBarAngleBrackets: item(sign),
      cbsdsSupports: item(sign),
      cAndEAirSamplingConduit: item(sign),
      whipsPerShopDrawing: item(sign),
    },
    cbsds: labels.map(emptyCbsds),
    ancillaryCircuits: {
      combinedLightingPowerCircuit: ancillary(sign),
      hmcuASub: ancillary(sign),
      hmcuBSub: ancillary(sign),
      hacuThreePhase: ancillary(sign, { drawingRequired: true }),
      hmbnpSinglePhase: ancillary(sign, { drawingRequired: true }),
      firmusDataRackSinglePhase: ancillary(sign, { drawingRequired: true }),
      bmsControlPanelCircuit: ancillary(sign, { drawingRequired: true }),
      shieldedPairCables: ancillary(sign, { qty: "" }),
      mcbsRcdsIntoDbChassis: ancillary(sign),
      dinRailGpo: ancillary(sign),
      emLightTestFacility: ancillary(sign, { intOnly: true }),
      mcbTorqueLineSideConfirmed: false,
      mcbTorqueLoadSideConfirmed: false,
      rcboTorqueLineSideConfirmed: false,
      rcboTorqueLoadSideConfirmed: false,
      unusedFrameHolesWithCaps: ancillary(sign),
      cbLabels1to8: ancillary(sign),
      bungsUnusedGlandplateHoles: ancillary(sign),
      bungsCablePathHoles: ancillary(sign),
    },
    electricalTesting: {
      visualInspection: { A: "", B: "", C: "", D: "" },
      frameIrSign: testSign,
      perCbsdsIr: {
        A: { readings: emptyIr() },
        B: { readings: emptyIr() },
        C: { readings: emptyIr() },
        D: { readings: emptyIr() },
      },
      perBreakerTest: {
        A: Array.from({ length: 8 }, () => emptyBreakerTest(testSign)),
        B: Array.from({ length: 8 }, () => emptyBreakerTest(testSign)),
        C: Array.from({ length: 8 }, () => emptyBreakerTest(testSign)),
        D: Array.from({ length: 8 }, () => emptyBreakerTest(testSign)),
      },
      shuntTripLiveTest: {
        breakerStack1and2: "",
        breakerStack3and4: "",
        breakerStack5and6: "",
        breakerStack7and8: "",
      },
    },
    handover: {
      date: "",
      time: "",
      shepherdName: "",
      shepherdSign: "",
      benmaxName: "",
      benmaxSign: "",
      installChecklistComplete: false,
      electricalTestingComplete: false,
      notes: "",
    },
  };
}
