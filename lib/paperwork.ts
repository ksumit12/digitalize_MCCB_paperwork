/**
 * Official Shepherd QA-003 / QA-004 / QA-001 field helpers.
 *
 * Derived ticks: a checklist line that is fully implied by data already
 * captured (serials, torque, ML settings, …) prints as ticked. The installer
 * does not have to tick it again. Manual ticks still win when present.
 *
 * Assumptions flagged for confirmation:
 * - Switchboard S/N is printed per CBSDS from `cbsds.cbsdsSerialNumber`.
 *   The paper may mean one serial for the whole switchboard.
 * - Per-breaker IR prints for A–D to match the shop electrical sheet
 *   (Whips IR Test, each MCCB ON one at a time, results in MOhm).
 * - CB labels / glandplate bungs / cable-path bungs sit on QA-003 page 1
 *   (your typed list). Photos also show those three rows at the top of CBSDS-A.
 */
import type {
  BondTest,
  BreakerPosition,
  Cbsds,
  CbsdsIrSummary,
  CbsdsLabel,
  ChecklistItem,
  ElectricalTesting,
  Frame,
  PassFail,
  ShuntReleaseStatus,
} from "./types";

function holeUsed(b: BreakerPosition): boolean {
  if (b.inUse === false) return false;
  if (b.inUse === true) return true;
  return Boolean(b.micrologicSettingAmps || b.mccbSerialNumber || b.microLogicSerialNumber);
}

export const CBSDS_LABELS: CbsdsLabel[] = ["A", "B", "C", "D"];

export function emptyPfEight(): PassFail[] {
  return ["", "", "", "", "", "", "", ""];
}

export function emptyBond(): BondTest {
  return { result: "", ohms: "" };
}

export function emptyIrSummary(): CbsdsIrSummary {
  return { result: "", mohm: "", condition: "" };
}

function byBoard<T>(make: () => T): Record<CbsdsLabel, T> {
  return { A: make(), B: make(), C: make(), D: make() };
}

export function emptyElectricalExtras(): Pick<
  ElectricalTesting,
  | "fclFusesPulled"
  | "witnessName"
  | "witnessSign"
  | "mechanicalOperation"
  | "shuntTripOperation"
  | "chassisEarthBond"
  | "cbsdsIrSummary"
  | "polarityAllClosed"
  | "polarityCondition"
> {
  return {
    fclFusesPulled: false,
    witnessName: "",
    witnessSign: "",
    mechanicalOperation: byBoard(emptyPfEight),
    shuntTripOperation: byBoard(emptyPfEight),
    chassisEarthBond: byBoard(emptyBond),
    cbsdsIrSummary: byBoard(emptyIrSummary),
    polarityAllClosed: { A: false, B: false, C: false, D: false },
    polarityCondition: { A: "", B: "", C: "", D: "" },
  };
}

function eightOf(list: PassFail[] | undefined): PassFail[] {
  const next = emptyPfEight();
  for (let i = 0; i < 8; i += 1) next[i] = list?.[i] ?? "";
  return next;
}

export function withElectricalDefaults(e: ElectricalTesting): ElectricalTesting {
  const extras = emptyElectricalExtras();
  return {
    ...e,
    fclFusesPulled: e.fclFusesPulled ?? extras.fclFusesPulled,
    witnessName: e.witnessName ?? "",
    witnessSign: e.witnessSign ?? "",
    mechanicalOperation: {
      A: eightOf(e.mechanicalOperation?.A),
      B: eightOf(e.mechanicalOperation?.B),
      C: eightOf(e.mechanicalOperation?.C),
      D: eightOf(e.mechanicalOperation?.D),
    },
    shuntTripOperation: {
      A: eightOf(e.shuntTripOperation?.A),
      B: eightOf(e.shuntTripOperation?.B),
      C: eightOf(e.shuntTripOperation?.C),
      D: eightOf(e.shuntTripOperation?.D),
    },
    chassisEarthBond: {
      A: { ...emptyBond(), ...e.chassisEarthBond?.A },
      B: { ...emptyBond(), ...e.chassisEarthBond?.B },
      C: { ...emptyBond(), ...e.chassisEarthBond?.C },
      D: { ...emptyBond(), ...e.chassisEarthBond?.D },
    },
    cbsdsIrSummary: {
      A: { ...emptyIrSummary(), ...e.cbsdsIrSummary?.A },
      B: { ...emptyIrSummary(), ...e.cbsdsIrSummary?.B },
      C: { ...emptyIrSummary(), ...e.cbsdsIrSummary?.C },
      D: { ...emptyIrSummary(), ...e.cbsdsIrSummary?.D },
    },
    polarityAllClosed: {
      A: e.polarityAllClosed?.A ?? extras.polarityAllClosed!.A,
      B: e.polarityAllClosed?.B ?? extras.polarityAllClosed!.B,
      C: e.polarityAllClosed?.C ?? extras.polarityAllClosed!.C,
      D: e.polarityAllClosed?.D ?? extras.polarityAllClosed!.D,
    },
    polarityCondition: {
      A: e.polarityCondition?.A ?? extras.polarityCondition!.A,
      B: e.polarityCondition?.B ?? extras.polarityCondition!.B,
      C: e.polarityCondition?.C ?? extras.polarityCondition!.C,
      D: e.polarityCondition?.D ?? extras.polarityCondition!.D,
    },
  };
}

/** Used holes on a board, or every hole if none are marked in use yet. */
export function holesInPlay(board: Cbsds) {
  const used = board.breakerPositions.filter(holeUsed);
  return used.length ? used : board.breakerPositions;
}

export function shuntReleaseOf(b: { shuntReleaseStatus?: ShuntReleaseStatus; micrologicSettingAmps?: unknown }): ShuntReleaseStatus {
  // 32A whips never carry an MX. Amp setting wins over a leftover Same tick.
  if (b.micrologicSettingAmps === 32) return "na";
  if (b.shuntReleaseStatus === "same" || b.shuntReleaseStatus === "na") return b.shuntReleaseStatus;
  return "";
}

const PAIR_HOLES: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
};

/** Live-test pair has an MX on any board. 32A-only pairs print N/A. */
export function shuntLivePairExpected(frame: Frame, pair: 1 | 2 | 3 | 4): boolean {
  const holes = PAIR_HOLES[pair];
  return frame.cbsds.some((board) =>
    holes.some((pos) => {
      const b = board.breakerPositions[pos - 1];
      return Boolean(b && holeUsed(b) && shuntTripExpected(b));
    }),
  );
}

export function shuntTripExpected(b: Parameters<typeof shuntReleaseOf>[0] & { micrologicSettingAmps?: "" | 32 | 63 | 100 }): boolean {
  if (shuntReleaseOf(b) === "na") return false;
  return b.micrologicSettingAmps === 63 || b.micrologicSettingAmps === 100;
}

function tickOr(item: ChecklistItem | undefined, derived: boolean): "yes" | "na" | "" {
  if (item?.na) return "na";
  if (item?.ticked || derived) return "yes";
  return "";
}

export function derivedBoardTicks(board: Cbsds, manufacturer: string) {
  const holes = holesInPlay(board);
  const all = (fn: (b: (typeof holes)[number]) => boolean) => holes.length > 0 && holes.every(fn);
  return {
    installedPerDrawing: tickOr(undefined, Boolean(board.cbsdsSerialNumber) || board.mountingBoltsTight),
    bolts: tickOr(undefined, board.mountingBoltsTight),
    serialAndMfr: tickOr(undefined, Boolean(board.cbsdsSerialNumber && (manufacturer || board.cbsdsSerialNumber))),
    glands: tickOr(undefined, board.glandPlatesAndGlandsInstalled),
    selected: tickOr(undefined, board.mccbsSelectedPerShopDrawing || all((b) => Boolean(b.mccbSerialNumber && b.microLogicSerialNumber))),
    mccbsInstalled: tickOr(undefined, all((b) => b.mccbInstalled || Boolean(b.mccbSerialNumber))),
    flexibar: tickOr(undefined, all((b) => b.flexibarCapsRemoved)),
    whips: tickOr(undefined, all((b) => b.whipTerminated)),
    torque: tickOr(undefined, all((b) => b.torqueLineSideConfirmed && b.torqueLoadSideConfirmed)),
    micrologic: tickOr(undefined, all((b) => b.micrologicSettingConfirmed)),
    serialsRecorded: all((b) => Boolean(b.mccbSerialNumber && b.microLogicSerialNumber)),
  };
}

export function standardMark(market: Frame["market"]): { aus: boolean; int: boolean } {
  return { aus: market === "AUS", int: market === "INT" };
}
