"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DesktopNav, HomeMenu } from "@/components/HomeMenu";
import { listFaults } from "@/lib/db";
import type { Fault } from "@/lib/types";

export default function FaultsPage() {
  const [rows, setRows] = useState<Fault[]>([]);

  useEffect(() => {
    void listFaults().then(setRows);
  }, []);

  return (
    <main className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl lg:max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HomeMenu />
          <DesktopNav />
          <h1 className="text-2xl font-semibold md:hidden">Faults</h1>
        </div>
      </div>
      <h1 className="mb-4 hidden text-2xl font-semibold md:block">Faults</h1>
      <div className="max-w-lg">
      {!rows.length ? (
        <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-muted">
          Replaced units show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <Link
              key={f.id}
              href={`/frames/${f.frameId}/map?slot=${f.hole}`}
              className="block rounded-2xl bg-surface p-4 ring-1 ring-rule"
            >
              <p className="text-lg font-semibold">
                {f.stringKey} · {f.frameSlot} · {f.hole}
              </p>
              <p className="mt-1 text-sm text-muted">
                {f.kind === "unit"
                  ? `MCCB ${f.oldMccb || "—"} · ML ${f.oldMlModel} ${f.oldMl || "—"}`
                  : `Shunt ${f.oldShunt || "—"}`}
              </p>
              <p className="mt-1 text-sm text-muted">
                {f.reason}
                {f.raisedBy ? ` · ${f.raisedBy}` : ""}
                {f.raisedAt ? ` · ${new Date(f.raisedAt).toLocaleString()}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
      </div>
    </main>
  );
}
