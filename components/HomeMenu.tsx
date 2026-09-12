"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Strings", hint: "Frames on the shop floor" },
  { href: "/find", label: "Find MCCB", hint: "Serial → string · slot · hole" },
  { href: "/faults", label: "Faults", hint: "Replaced MCCB, ML, shunt" },
  { href: "/projects", label: "Projects", hint: "This job vs a new job" },
];

export function HomeMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white px-4 py-6 shadow-xl">
            <p className="px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Menu</p>
            <nav className="mt-3 space-y-2">
              {LINKS.map((item) => {
                const on = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-2xl px-4 py-4 ${on ? "bg-ink text-white" : "bg-zinc-100"}`}
                  >
                    <p className="text-lg font-semibold">{item.label}</p>
                    <p className={`text-sm ${on ? "text-white/70" : "text-neutral-500"}`}>{item.hint}</p>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
