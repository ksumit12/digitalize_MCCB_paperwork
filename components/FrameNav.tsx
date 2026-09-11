"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FrameNav({ frameId }: { frameId: string }) {
  const pathname = usePathname();
  const base = `/frames/${frameId}`;
  const mapActive = pathname.includes("/map");
  const moreActive = pathname.includes("/more") || pathname.includes("/handover") || pathname.includes("/install") || pathname.includes("/ancillary") || pathname.includes("/testing");

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-30 border-t border-rule bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-lg grid-cols-3">
        <Link href="/" className="py-3 text-center text-sm text-neutral-500">
          Home
        </Link>
        <Link
          href={`${base}/map`}
          className={`py-3 text-center text-sm font-medium ${mapActive ? "text-ink" : "text-neutral-500"}`}
        >
          Board
        </Link>
        <Link
          href={`${base}/more`}
          className={`py-3 text-center text-sm font-medium ${moreActive ? "text-ink" : "text-neutral-500"}`}
        >
          Office
        </Link>
      </div>
    </nav>
  );
}
