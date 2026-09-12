import { isUsed } from "./breaker";
import type { Frame } from "./types";

/*
 * Serial lookup across every synced frame — answers "where does this serial
 * live?" (string · frame · slot) and keeps replaced/faulty gear findable
 * through the slot's serial history instead of silently disappearing.
 */

export type SerialHit = {
  serial: string;
  kind: string;
  frameId: string;
  stringKey: string;
  frameSlot: string;
  slot: string;
  amps: string;
  state: "active" | "replaced";
  newSerial?: string;
  note?: string;
  replacedBy?: string;
  replacedAt?: string;
};

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

export function searchSerials(frames: Frame[], query: string): SerialHit[] {
  const q = norm(query);
  if (q.length < 3) return [];
  const hits: SerialHit[] = [];

  for (const f of frames) {
    const stringKey = f.stringKey?.trim() || "1";
    const frameSlot = f.frameSlot || f.stringId || "";
    for (const c of f.cbsds) {
      for (const b of c.breakerPositions) {
        if (!isUsed(b)) continue;
        const slot = `${c.label}${b.position}`;
        const amps = b.micrologicSettingAmps ? `${b.micrologicSettingAmps}A` : "";

        const active: Array<[string, string]> = [
          [b.mccbSerialNumber, "MCCB"],
          [b.microLogicSerialNumber, "Micrologic"],
          [b.shuntTripBatchNumber, "Shunt trip"],
        ];
        for (const [serial, kind] of active) {
          if (serial && norm(serial).includes(q)) {
            hits.push({ serial, kind, frameId: f.id, stringKey, frameSlot, slot, amps, state: "active" });
          }
        }

        for (const r of b.serialHistory ?? []) {
          if (norm(r.oldSerial).includes(q) || norm(r.newSerial).includes(q)) {
            hits.push({
              serial: r.oldSerial,
              kind: r.kind === "mccb" ? "MCCB" : r.kind === "ml" ? "Micrologic" : "Shunt trip",
              frameId: f.id,
              stringKey,
              frameSlot,
              slot,
              amps,
              state: "replaced",
              newSerial: r.newSerial,
              note: r.note,
              replacedBy: r.replacedBy,
              replacedAt: r.replacedAt,
            });
          }
        }
      }
    }
  }

  return hits;
}
