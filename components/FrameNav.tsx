"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FrameNav({ frameId }: { frameId: string }) {
  const pathname = usePathname();
  const base = `/frames/${frameId}`;
  const mapOn = pathname.includes("/map");
  const officeOn =
    pathname.includes("/more") ||
    pathname.includes("/handover") ||
    pathname.includes("/install") ||
    pathname.includes("/ancillary") ||
    pathname.includes("/testing");

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-rule bg-canvas/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-3 px-1 md:max-w-2xl">
        <Link
          href="/"
          className="mx-1 my-2 rounded-xl bg-surface py-3 text-center text-sm font-semibold text-ink ring-1 ring-rule"
        >
          Strings
        </Link>
        <Link
          href={`${base}/map`}
          className={`mx-1 my-2 rounded-xl py-3 text-center text-sm font-semibold ${
            mapOn ? "bg-testing text-on-testing" : "bg-surface text-ink ring-1 ring-rule"
          }`}
        >
          Board
        </Link>
        <Link
          href={`${base}/more`}
          className={`mx-1 my-2 rounded-xl py-3 text-center text-sm font-semibold ${
            officeOn ? "bg-done text-on-done" : "bg-surface text-ink ring-1 ring-rule"
          }`}
        >
          Office
        </Link>
      </div>
    </nav>
  );
}
