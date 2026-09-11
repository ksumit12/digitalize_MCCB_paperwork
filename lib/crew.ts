import type { Frame, Installer } from "./types";

const LAST_KEY = "mccb-last-installer";
const LAST_TESTER_KEY = "mccb-last-tester";

export function frameLabel(
  frame: Pick<Frame, "stringKey" | "frameSlot" | "stringId" | "moduleFrameSerialNumber" | "shepherdFrameId">,
): string {
  const slot = frame.frameSlot || frame.stringId;
  const key = frame.stringKey?.trim();
  if (key && slot) return `${key} · ${slot}`;
  return slot || frame.moduleFrameSerialNumber || frame.shepherdFrameId || "Frame";
}

export function applyInstallerName(frame: Frame, nextName: string, previousName = ""): Frame {
  const sign = nextName.trim();
  const prev = previousName.trim();

  function stamp(current: string): string {
    if (!current.trim() || (prev && current.trim() === prev)) return sign;
    return current;
  }

  const installChecklist = Object.fromEntries(
    Object.entries(frame.installChecklist).map(([k, v]) => [k, { ...v, installerSign: stamp(v.installerSign) }]),
  ) as Frame["installChecklist"];

  const ancillaryCircuits = { ...frame.ancillaryCircuits };
  for (const [key, value] of Object.entries(ancillaryCircuits)) {
    if (value && typeof value === "object" && "installerSign" in value) {
      (ancillaryCircuits as Record<string, unknown>)[key] = {
        ...value,
        installerSign: stamp(value.installerSign),
      };
    }
  }

  return {
    ...frame,
    installerName: sign,
    installChecklist,
    ancillaryCircuits,
    electricalTesting: {
      ...frame.electricalTesting,
      frameIrSign: stamp(frame.electricalTesting.frameIrSign),
    },
  };
}

export function rememberLastInstaller(installer: Installer) {
  localStorage.setItem(LAST_KEY, JSON.stringify(installer));
}

export function lastInstaller(): Installer | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Installer) : null;
  } catch {
    return null;
  }
}

export function rememberLastTester(installer: Installer) {
  localStorage.setItem(LAST_TESTER_KEY, JSON.stringify(installer));
}

export function lastTester(): Installer | null {
  try {
    const raw = localStorage.getItem(LAST_TESTER_KEY);
    return raw ? (JSON.parse(raw) as Installer) : null;
  } catch {
    return null;
  }
}
