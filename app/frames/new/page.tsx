"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lastInstaller, rememberLastInstaller } from "@/lib/crew";
import { lookupInstaller, normalizeInitials, saveFrame, saveInstaller } from "@/lib/db";
import { createEmptyFrame } from "@/lib/emptyFrame";

const LEVELS = [7, 6, 5, 4, 3, 2, 1] as const;

export default function NewFramePage() {
  const router = useRouter();
  const [stringId, setStringId] = useState("");
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

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <h1 className="text-2xl font-semibold">Which string?</h1>
      <p className="text-sm text-neutral-600">
        Same as the drawing: left stack L, right stack R, 7 at the top.
      </p>
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-2">
        <div />
        <p className="text-center text-xs font-medium text-neutral-500">L</p>
        <p className="text-center text-xs font-medium text-neutral-500">R</p>
        {LEVELS.map((n) => (
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
          placeholder="Installer name (change if needed)"
          className="w-full rounded-2xl border border-rule bg-white px-4 py-3 text-lg"
        />
        <p className="text-xs text-neutral-500">
          Initials look up your saved name. You can still type a different name for this frame.
        </p>
      </div>

      <button
        type="button"
        disabled={saving || !stringId || !name.trim()}
        className="w-full rounded-2xl bg-ink py-4 text-lg text-white disabled:opacity-30"
        onClick={async () => {
          setSaving(true);
          const installer = { initials: normalizeInitials(initials) || name.slice(0, 2).toUpperCase(), name: name.trim() };
          await saveInstaller(installer);
          rememberLastInstaller(installer);
          const frame = createEmptyFrame({
            stringId,
            installerInitials: installer.initials,
            installerName: installer.name,
          });
          await saveFrame(frame);
          router.push(`/frames/${frame.id}/map`);
        }}
      >
        Open {stringId || "board"}
      </button>
    </main>
  );
}
