"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = {
  home: {
    off: "bg-zinc-100 text-zinc-800",
    on: "bg-zinc-800 text-white",
  },
  board: {
    off: "bg-teal-100 text-teal-900",
    on: "bg-teal-700 text-white",
  },
  office: {
    off: "bg-indigo-100 text-indigo-900",
    on: "bg-indigo-800 text-white",
  },
} as const;

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
    <nav className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-rule bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:bottom-auto md:top-0 md:border-b md:border-t-0 md:pb-0 md:bg-white">
      <div className="mx-auto grid max-w-lg grid-cols-3 px-1">
        <Link href="/" className={`mx-1 my-2 rounded-xl py-3 text-center text-sm font-semibold ${TABS.home.off}`}>
          Home
        </Link>
        <Link
          href={`${base}/map`}
          className={`mx-1 my-2 rounded-xl py-3 text-center text-sm font-semibold ${mapOn ? TABS.board.on : TABS.board.off}`}
        >
          Board
        </Link>
        <Link
          href={`${base}/more`}
          className={`mx-1 my-2 rounded-xl py-3 text-center text-sm font-semibold ${officeOn ? TABS.office.on : TABS.office.off}`}
        >
          Office
        </Link>
      </div>
    </nav>
  );
}
