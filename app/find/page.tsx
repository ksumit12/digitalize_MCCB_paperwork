"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DesktopNav, HomeMenu } from "@/components/HomeMenu";
import { searchBreakerRows } from "@/lib/db";
import type { BreakerRow } from "@/lib/types";

export default function FindPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BreakerRow[]>([]);

  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    void searchBreakerRows(q).then(setHits);
  }, [q]);

  return (
    <main className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl lg:max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HomeMenu />
          <DesktopNav />
          <h1 className="text-2xl font-semibold md:hidden">Find MCCB</h1>
        </div>
      </div>
      <h1 className="mb-4 hidden text-2xl font-semibold md:block">Find MCCB</h1>
      <div className="max-w-lg">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type serial or batch"
          autoCapitalize="characters"
          className="w-full rounded-2xl border border-rule bg-surface px-4 py-4 text-lg text-ink"
        />
        {q.trim().length > 0 && q.trim().length < 3 ? (
          <p className="mt-3 text-sm text-muted">Keep typing — 3 characters.</p>
        ) : null}
        <div className="mt-4 space-y-2">
          {hits.map((hit) => (
            <Link
              key={hit.id}
              href={`/frames/${hit.frameId}/map?slot=${hit.hole}`}
              className="block rounded-2xl bg-surface p-4 ring-1 ring-rule"
            >
              <p className="text-xl font-semibold">
                {hit.stringKey} · {hit.frameSlot} · {hit.hole}
              </p>
              <p className="mt-1 text-sm text-muted">
                MCCB {hit.mccbSerial || "—"}
              </p>
              <p className="text-sm text-muted">
                Micrologic ML {hit.mlModel} {hit.mlSerial || "—"}
              </p>
              {hit.shuntBatch ? <p className="text-sm text-muted">Shunt {hit.shuntBatch}</p> : null}
              {hit.scannedBy ? (
                <p className="mt-1 text-sm text-muted">
                  Scanned by {hit.scannedBy}
                  {hit.scannedAt ? ` · ${new Date(hit.scannedAt).toLocaleString()}` : ""}
                </p>
              ) : null}
            </Link>
          ))}
          {q.trim().length >= 3 && hits.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-muted">
              No match on this phone.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
