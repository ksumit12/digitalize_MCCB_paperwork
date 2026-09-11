"use client";

import Link from "next/link";

const NEXT: Record<string, { href: (id: string) => string; label: string } | undefined> = {
  install: {
    href: (id) => `/frames/${id}/ancillary`,
    label: "Go on to lights, exit lights & wiring",
  },
  ancillary: {
    href: (id) => `/frames/${id}/testing`,
    label: "Go on to electrical testing",
  },
  testing: {
    href: (id) => `/frames/${id}/handover`,
    label: "Go on to QA handover",
  },
  handover: {
    href: (id) => `/frames/${id}/more`,
    label: "Go on to Office / print",
  },
};

export function NextChecklist({
  frameId,
  current,
}: {
  frameId: string;
  current: "install" | "ancillary" | "testing" | "handover";
}) {
  const next = NEXT[current];
  if (!next) return null;
  return (
    <Link
      href={next.href(frameId)}
      className="block rounded-2xl bg-ink py-4 text-center text-lg font-semibold text-white"
    >
      {next.label}
    </Link>
  );
}
