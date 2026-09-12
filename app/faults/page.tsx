"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HomeMenu } from "@/components/HomeMenu";
import { listFaults } from "@/lib/db";
import type { Fault } from "@/lib/types";

export default function FaultsPage() {
  const [rows, setRows] = useState<Fault[]>([]);

  useEffect(() => {
    void listFaults().then(setRows);
  }, []);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <HomeMenu />
        <h1 className="text-2xl font-semibold">Faults</h1>
      </div>
      {!rows.length ? (
        <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-neutral-600">
          Replaced units show up here.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <Link
              key={f.id}
              href={`/frames/${f.frameId}/map?slot=${f.hole}`}
              className="block rounded-2xl bg-white p-4"
            >
              <p className="text-lg font-semibold">
                {f.stringKey} · {f.frameSlot} · {f.hole}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {f.kind === "unit"
                  ? `MCCB ${f.oldMccb || "—"} · ML ${f.oldMlModel} ${f.oldMl || "—"}`
                  : `Shunt ${f.oldShunt || "—"}`}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {f.reason}
                {f.raisedBy ? ` · ${f.raisedBy}` : ""}
                {f.raisedAt ? ` · ${new Date(f.raisedAt).toLocaleString()}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
