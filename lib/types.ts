export type Market = "INT" | "AUS";
export type CbsdsLabel = "A" | "B" | "C" | "D";
export type PassFail = "pass" | "fail" | "";
export type AmpSetting = 32 | 63 | 100 | "";
export type Manufacturer = "RN Baker" | "SMBE" | "";
export type FramePhase = "installation" | "testing";
export type WorkStatus = "installing" | "testing" | "submitted";

export type ChecklistItem = {
  ticked: boolean;
  na?: boolean;
  installerSign: string;
};

export type BreakerPosition = {
  position: number;
  inUse?: boolean;
  mccbSerialNumber: string;
  microLogicSerialNumber: string;
  shuntTripBatchNumber: string;
  mccbInstalled: boolean;
  flexibarCapsRemoved: boolean;
  whipTerminated: boolean;
  torqueLineSideNm: number;
  torqueLoadSideNm: number;
  torqueLineSideConfirmed: boolean;
  torqueLoadSideConfirmed: boolean;
  micrologicSettingAmps: AmpSetting;
  micrologicSettingConfirmed: boolean;
};

export type Cbsds = {
  label: CbsdsLabel;
  mountingBoltsTight: boolean;
  cbsdsSerialNumber: string;
  glandPlatesAndGlandsInstalled: boolean;
  mccbsSelectedPerShopDrawing: boolean;
  breakerPositions: BreakerPosition[];
};

export type IrReadings = {
  l1ToEarth: string;
  l2ToEarth: string;
  l3ToEarth: string;
  nToEarth: string;
  l1ToNeutral: string;
  l2ToNeutral: string;
  l3ToNeutral: string;
  l1ToL2: string;
  l1ToL3: string;
  l2ToL3: string;
};

export type PolarityTest = {
  l1ToEarth: PassFail;
  l2ToEarth: PassFail;
  l3ToEarth: PassFail;
  nToEarth: PassFail;
};

export type FrameIrColumn = {
  readings: IrReadings;
};

export type BreakerTest = {
  irTest: IrReadings;
  polarityTest: PolarityTest;
  sign: string;
  mccbSerialNumber: string;
  microLogicSerialNumber: string;
};

export type AncillaryItem = ChecklistItem & {
  qty?: string;
  drawingRequired?: boolean;
  intOnly?: boolean;
};

export type AncillaryCircuits = {
  combinedLightingPowerCircuit: AncillaryItem;
  hmcuASub: AncillaryItem;
  hmcuBSub: AncillaryItem;
  hacuThreePhase: AncillaryItem;
  hmbnpSinglePhase: AncillaryItem;
  firmusDataRackSinglePhase: AncillaryItem;
  bmsControlPanelCircuit: AncillaryItem;
  shieldedPairCables: AncillaryItem;
  mcbsRcdsIntoDbChassis: AncillaryItem;
  dinRailGpo: AncillaryItem;
  emLightTestFacility: AncillaryItem;
  mcbTorqueLineSideConfirmed: boolean;
  mcbTorqueLoadSideConfirmed: boolean;
  rcboTorqueLineSideConfirmed: boolean;
  rcboTorqueLoadSideConfirmed: boolean;
  unusedFrameHolesWithCaps: AncillaryItem;
  cbLabels1to8: AncillaryItem;
  bungsUnusedGlandplateHoles: AncillaryItem;
  bungsCablePathHoles: AncillaryItem;
};

export type ElectricalTesting = {
  visualInspection: Record<CbsdsLabel, PassFail>;
  frameIrSign: string;
  perCbsdsIr: Record<CbsdsLabel, FrameIrColumn>;
  perBreakerTest: Record<CbsdsLabel, BreakerTest[]>;
  shuntTripLiveTest: {
    breakerStack1and2: PassFail;
    breakerStack3and4: PassFail;
    breakerStack5and6: PassFail;
    breakerStack7and8: PassFail;
  };
};

export type Handover = {
  date: string;
  time: string;
  shepherdName: string;
  shepherdSign: string;
  benmaxName: string;
  benmaxSign: string;
  installChecklistComplete: boolean;
  electricalTestingComplete: boolean;
  notes?: string;
};

export type InstallChecklist = {
  verticalCableLadders: ChecklistItem;
  horizontalUnistrutWhipSupport: ChecklistItem;
  earthBarAngleBrackets: ChecklistItem;
  cbsdsSupports: ChecklistItem;
  cAndEAirSamplingConduit: ChecklistItem;
  whipsPerShopDrawing: ChecklistItem;
};

export type Installer = {
  initials: string;
  name: string;
};

export type Frame = {
  id: string;
  stringId?: string;
  stringKey?: string;
  frameSlot?: string;
  submitted?: boolean;
  installerInitials?: string;
  installerName?: string;
  shepherdFrameId: string;
  actswFrameId: string;
  moduleFrameSerialNumber: string;
  market: Market | "";
  manufacturer: Manufacturer;
  phase: FramePhase;
  startDate: string;
  startTime: string;
  finishDate: string;
  finishTime: string;
  createdAt: string;
  updatedAt: string;
  installChecklist: InstallChecklist;
  cbsds: Cbsds[];
  ancillaryCircuits: AncillaryCircuits;
  electricalTesting: ElectricalTesting;
  handover: Handover;
};

export type FrameStatus = "in_progress" | "testing" | "handed_over";
