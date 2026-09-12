"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HomeMenu } from "@/components/HomeMenu";
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
    <main className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <HomeMenu />
        <h1 className="text-2xl font-semibold">Find MCCB</h1>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type serial or batch"
        autoCapitalize="characters"
        className="w-full rounded-2xl border border-rule px-4 py-4 text-lg"
      />
      {q.trim().length > 0 && q.trim().length < 3 ? (
        <p className="mt-3 text-sm text-neutral-500">Keep typing — 3 characters.</p>
      ) : null}
      <div className="mt-4 space-y-2">
        {hits.map((hit) => (
          <Link
            key={hit.id}
            href={`/frames/${hit.frameId}/map?slot=${hit.hole}`}
            className="block rounded-2xl bg-white p-4"
          >
            <p className="text-xl font-semibold">
              {hit.stringKey} · {hit.frameSlot} · {hit.hole}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              MCCB {hit.mccbSerial || "—"}
            </p>
            <p className="text-sm text-neutral-600">
              Micrologic ML {hit.mlModel} {hit.mlSerial || "—"}
            </p>
            {hit.shuntBatch ? <p className="text-sm text-neutral-600">Shunt {hit.shuntBatch}</p> : null}
            {hit.scannedBy ? (
              <p className="mt-1 text-sm text-neutral-500">
                Scanned by {hit.scannedBy}
                {hit.scannedAt ? ` · ${new Date(hit.scannedAt).toLocaleString()}` : ""}
              </p>
            ) : null}
          </Link>
        ))}
        {q.trim().length >= 3 && hits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule p-8 text-center text-neutral-600">
            No match on this phone.
          </p>
        ) : null}
      </div>
    </main>
  );
}
