"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Strings", short: "Strings", hint: "Frames on the shop floor" },
  { href: "/progress", label: "Progress", short: "Progress", hint: "Day, week and month figures" },
  { href: "/find", label: "Find MCCB", short: "Find", hint: "Serial → string · slot · hole" },
  { href: "/faults", label: "Faults", short: "Faults", hint: "Replaced MCCB, ML, shunt" },
  { href: "/projects", label: "Projects", short: "Projects", hint: "This job vs a new job" },
];

export function HomeMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="tile-press flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-ink shadow-card ring-1 ring-rule md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M5 8h14M5 12h10M5 16h14" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            className="sheet-backdrop absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="sheet-in absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-canvas px-4 py-6 shadow-lift">
            <div className="mb-6 flex items-center justify-between px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Menu</p>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
            <nav className="space-y-2">
              {LINKS.map((item, i) => {
                const on = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ animationDelay: `${80 + i * 45}ms` }}
                    className={`sheet-in block rounded-2.5xl px-4 py-4 ${
                      on ? "bg-accent text-accent-ink" : "bg-surface text-ink"
                    }`}
                  >
                    <p className="text-lg font-semibold tracking-tight">{item.label}</p>
                    <p className={`mt-0.5 text-sm ${on ? "text-accent-ink/70" : "text-muted"}`}>{item.hint}</p>
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

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden min-w-0 flex-wrap items-center gap-1 md:flex">
      {LINKS.map((item) => {
        const on = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3.5 py-2 text-sm font-medium ${
              on ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
