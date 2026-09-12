"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { lastInstaller, lastTester, rememberLastInstaller, rememberLastTester } from "@/lib/crew";
import { PeopleChips } from "@/components/SignPick";
import {
  findFrameBySlot,
  lookupInstaller,
  normalizeInitials,
  saveFrame,
  saveInstaller,
} from "@/lib/db";
import { currentProjectId } from "@/lib/project";
import { createEmptyFrame } from "@/lib/emptyFrame";
import { STRING_LEVELS, parseFrameSlot } from "@/lib/stringLayout";

function NewFrameForm() {
  const router = useRouter();
  const search = useSearchParams();
  const presetKey = search.get("string")?.trim() || "";
  const presetSlot = parseFrameSlot(search.get("slot") || "");
  const [stringKey, setStringKey] = useState(presetKey);
  const [stringId, setStringId] = useState(presetSlot || "");
  const [initials, setInitials] = useState("");
  const [testerInitials, setTesterInitials] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const last = lastInstaller();
    if (last?.initials) setInitials(last.initials);
    const tester = lastTester();
    if (tester?.initials && tester.initials !== last?.initials) {
      setTesterInitials(tester.initials);
    }
  }, []);

  const slot = parseFrameSlot(stringId) || stringId;

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <h1 className="text-2xl font-semibold">
        {presetKey && presetSlot ? `${presetKey} · ${presetSlot}` : "Which frame?"}
      </h1>
      {!presetSlot ? (
        <>
          <input
            value={stringKey}
            onChange={(e) => setStringKey(e.target.value)}
            placeholder="String no. e.g. 4"
            className="w-full rounded-2xl border border-rule bg-white px-4 py-3"
          />
          <div className="grid grid-cols-[2rem_1fr_1fr] gap-2">
            <div />
            <p className="text-center text-xs font-medium text-neutral-500">L</p>
            <p className="text-center text-xs font-medium text-neutral-500">R</p>
            {STRING_LEVELS.map((n) => (
              <div key={n} className="contents">
                <p className="flex items-center justify-center text-sm font-semibold text-neutral-400">{n}</p>
                {(["L", "R"] as const).map((hand) => {
                  const id = `${n}${hand}`;
                  const on = stringId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStringId(id)}
                      className={`h-12 rounded-xl text-lg font-bold ${
                        on ? "bg-ink text-white" : "bg-white ring-1 ring-rule"
                      }`}
                    >
                      {id}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="space-y-3">
        <p className="text-sm font-medium">Installer</p>
        <PeopleChips selected={initials} onPick={(p) => setInitials(p.initials)} />
        <input
          value={initials}
          onChange={(e) => setInitials(normalizeInitials(e.target.value))}
          placeholder="Initials"
          autoCapitalize="characters"
          className="w-full rounded-2xl border border-rule bg-white px-4 py-3 text-lg uppercase"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Testing</p>
        <PeopleChips selected={testerInitials} onPick={(p) => setTesterInitials(p.initials)} />
        <input
          value={testerInitials}
          onChange={(e) => setTesterInitials(normalizeInitials(e.target.value))}
          placeholder="Initials"
          autoCapitalize="characters"
          className="w-full rounded-2xl border border-rule bg-white px-4 py-3 text-lg uppercase"
        />
      </div>

      <button
        type="button"
        disabled={saving || !slot || !initials.trim() || !stringKey.trim()}
        className="w-full rounded-2xl bg-ink py-4 text-lg text-white disabled:opacity-30"
        onClick={async () => {
          setSaving(true);
          const existing = await findFrameBySlot(stringKey.trim(), slot);
          if (existing) {
            router.push(`/frames/${existing.id}/map`);
            return;
          }
          const installerKey = normalizeInitials(initials);
          const testerKey = normalizeInitials(testerInitials);
          const knownInstaller = await lookupInstaller(installerKey);
          const knownTester = testerKey ? await lookupInstaller(testerKey) : undefined;
          const installer = {
            initials: installerKey,
            name: knownInstaller?.name || installerKey,
          };
          await saveInstaller(installer);
          rememberLastInstaller(installer);
          if (testerKey) {
            const tester = {
              initials: testerKey,
              name: knownTester?.name || testerKey,
            };
            await saveInstaller(tester);
            rememberLastTester(tester);
          }
          const frame = createEmptyFrame({
            projectId: currentProjectId(),
            stringKey: stringKey.trim(),
            frameSlot: slot,
            stringId: slot,
            installerInitials: installer.initials,
            installerName: installer.name,
            testerInitials: testerKey,
            testerName: testerKey ? knownTester?.name || testerKey : "",
          });
          await saveFrame(frame);
          router.push(`/frames/${frame.id}/map`);
        }}
      >
        Open {stringKey && slot ? `${stringKey} · ${slot}` : "board"}
      </button>
    </main>
  );
}

export default function NewFramePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <NewFrameForm />
    </Suspense>
  );
}
