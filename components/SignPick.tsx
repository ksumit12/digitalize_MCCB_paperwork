"use client";

import { useEffect, useState } from "react";
import { listInstallers } from "@/lib/db";
import type { Installer } from "@/lib/types";

export function SignPick({
  value,
  onChange,
  placeholder = "Initials or name",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [people, setPeople] = useState<Installer[]>([]);

  useEffect(() => {
    void listInstallers().then(setPeople);
  }, []);

  return (
    <div className="space-y-2">
      {people.length ? (
        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const label = `${p.initials}${p.name ? ` · ${p.name}` : ""}`;
            const on = value === p.initials || value === p.name || value === label;
            return (
              <button
                key={p.initials}
                type="button"
                onClick={() => onChange(p.initials || p.name)}
                className={`rounded-full px-3 py-2 text-sm ${on ? "bg-ink text-white" : "bg-zinc-100"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-rule bg-white px-4 py-3"
      />
    </div>
  );
}

export function PeopleChips({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (person: Installer) => void;
}) {
  const [people, setPeople] = useState<Installer[]>([]);

  useEffect(() => {
    void listInstallers().then(setPeople);
  }, []);

  if (!people.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => {
        const on = selected === p.initials;
        return (
          <button
            key={p.initials}
            type="button"
            onClick={() => onPick(p)}
            className={`rounded-full px-3 py-2 text-sm ${on ? "bg-ink text-white" : "bg-zinc-100"}`}
          >
            {p.initials}
            {p.name ? ` · ${p.name}` : ""}
          </button>
        );
      })}
    </div>
  );
}
