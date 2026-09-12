"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/*
 * Shared shell for the module pages (Strings, Inventory, Faults, Progress,
 * Paper entry): left sidebar on desktop, slide-over drawer on mobile.
 */

const NAV = [
  {
    href: "/",
    label: "Strings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
        <path d="M3 7.5 12 12l9-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    href: "/faults",
    label: "Faults",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 3 2.5 19.5h19L12 3Z" />
        <path d="M12 10v4.5M12 17.5v.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/paper-entry",
    label: "Paper entry",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" strokeLinecap="round" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function DbStatus({ compact = false }: { compact?: boolean }) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    void ping();
    const t = setInterval(ping, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "text-xs text-neutral-500"}`}>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          online == null ? "bg-neutral-300" : online ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      <span>
        {online == null ? "Checking database…" : online ? "Database connected" : "Offline — working locally"}
      </span>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
        M
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">MCCB Frame QA</p>
        <p className="text-[11px] text-neutral-500">Switchboard paperwork</p>
      </div>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-ink text-white"
                : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-rule bg-white lg:flex">
        <div className="border-b border-rule px-5 py-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-auto px-3 py-4">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t border-rule px-5 py-4">
          <DbStatus />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="border-b border-rule px-5 py-5">
              <Brand />
            </div>
            <div className="flex-1 overflow-auto px-3 py-4">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-rule px-5 py-4">
              <DbStatus />
            </div>
          </aside>
        </div>
      ) : null}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-rule p-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        </button>
        <p className="text-sm font-semibold">MCCB Frame QA</p>
        <div className="ml-auto">
          <DbStatus compact />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
