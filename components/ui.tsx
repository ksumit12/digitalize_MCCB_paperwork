"use client";

import type { ReactNode } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-rule bg-white px-3 py-2.5 ${props.className ?? ""}`}
    />
  );
}

export function CheckRow({
  label,
  checked,
  onChange,
  sign,
  onSign,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  sign?: string;
  onSign?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-rule bg-white p-3 sm:flex-row sm:items-center">
      <label className="flex flex-1 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {onSign ? (
        <input
          value={sign ?? ""}
          onChange={(e) => onSign(e.target.value)}
          placeholder="Installer sign"
          className="w-full rounded-lg border border-rule px-3 py-2 sm:w-40"
        />
      ) : null}
    </div>
  );
}

export function PassFailSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "pass" | "fail" | "") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "pass" | "fail" | "")}
      className="rounded-lg border border-rule bg-white px-2 py-2"
    >
      <option value="">—</option>
      <option value="pass">Pass</option>
      <option value="fail">Fail</option>
    </select>
  );
}

export function YesNaRow({
  label,
  ticked,
  na,
  sign,
  onYes,
  onNa,
  onSign,
}: {
  label: string;
  ticked: boolean;
  na?: boolean;
  sign?: string;
  onYes: () => void;
  onNa: () => void;
  onSign?: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-rule bg-white p-3">
      <p className="text-base font-medium leading-snug">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onYes}
          className={`rounded-2xl py-4 text-lg font-semibold ${
            ticked && !na ? "bg-emerald-600 text-white" : "bg-zinc-100"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={onNa}
          className={`rounded-2xl py-4 text-lg font-semibold ${
            na ? "bg-neutral-700 text-white" : "bg-zinc-100"
          }`}
        >
          N/A
        </button>
      </div>
      {onSign ? (
        <input
          value={sign ?? ""}
          onChange={(e) => onSign(e.target.value)}
          placeholder="Initials"
          className="w-full rounded-xl border border-rule px-3 py-3"
        />
      ) : null}
    </div>
  );
}

export function Screen({
  title,
  savedAt,
  children,
}: {
  title: string;
  savedAt?: string | null;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-24">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {savedAt ? <p className="text-xs text-neutral-500">Saved {savedAt}</p> : null}
      </div>
      {children}
    </main>
  );
}
