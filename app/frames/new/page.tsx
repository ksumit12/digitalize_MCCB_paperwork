"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { lastInstaller, rememberLastInstaller } from "@/lib/crew";
import {
  findFrameBySlot,
  lookupInstaller,
  normalizeInitials,
  saveFrame,
  saveInstaller,
} from "@/lib/db";
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
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const last = lastInstaller();
    if (last) {
      setInitials(last.initials);
      setName(last.name);
    }
  }, []);

  async function onInitials(raw: string) {
    const next = normalizeInitials(raw);
    setInitials(next);
    const found = await lookupInstaller(next);
    if (found) {
      setName(found.name);
      setNameTouched(false);
    } else if (!nameTouched) {
      setName("");
    }
  }

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
          <p className="text-sm text-neutral-600">Left stack L, right stack R, 7 at the top.</p>
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
        <p className="text-sm font-medium">Who is filling this out?</p>
        <input
          value={initials}
          onChange={(e) => void onInitials(e.target.value)}
          placeholder="Initials"
          autoCapitalize="characters"
          className="w-full rounded-2xl border border-rule bg-white px-4 py-3 text-lg uppercase"
        />
        <input
          value={name}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
          placeholder="Name (change if needed)"
          className="w-full rounded-2xl border border-rule bg-white px-4 py-3 text-lg"
        />
      </div>

      <button
        type="button"
        disabled={saving || !slot || !name.trim() || !stringKey.trim()}
        className="w-full rounded-2xl bg-ink py-4 text-lg text-white disabled:opacity-30"
        onClick={async () => {
          setSaving(true);
          const existing = await findFrameBySlot(stringKey.trim(), slot);
          if (existing) {
            router.push(`/frames/${existing.id}/map`);
            return;
          }
          const installer = {
            initials: normalizeInitials(initials) || name.slice(0, 2).toUpperCase(),
            name: name.trim(),
          };
          await saveInstaller(installer);
          rememberLastInstaller(installer);
          const frame = createEmptyFrame({
            stringKey: stringKey.trim(),
            frameSlot: slot,
            stringId: slot,
            installerInitials: installer.initials,
            installerName: installer.name,
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
