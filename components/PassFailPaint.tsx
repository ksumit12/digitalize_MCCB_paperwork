"use client";

import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { fillIr, IR_ROWS } from "@/lib/ir";
import type { IrReadings, PassFail, PolarityTest } from "@/lib/types";
import { POLARITY_ROWS } from "@/lib/ir";

export function PassFailPaint({
  rows,
  getValue,
  onPaint,
  onPaintAll,
}: {
  rows: { key: string; label: string }[];
  getValue: (key: string) => string;
  onPaint: (key: string, value: "pass" | "fail") => void;
  onPaintAll?: (value: "pass" | "fail") => void;
}) {
  const brush = useRef<"pass" | "fail" | null>(null);

  function apply(key: string, value: "pass" | "fail") {
    brush.current = value;
    onPaint(key, value);
  }

  function drag(e: ReactPointerEvent) {
    if (!brush.current) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const row = hit?.closest("[data-row-key]") as HTMLElement | null;
    const key = row?.dataset.rowKey;
    if (key) onPaint(key, brush.current);
  }

  function endBrush() {
    brush.current = null;
  }

  return (
    <div data-paint className="space-y-2">
      {onPaintAll ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPaintAll("pass")}
            className="rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white"
          >
            All pass
          </button>
          <button
            type="button"
            onClick={() => onPaintAll("fail")}
            className="rounded-2xl bg-red-600 py-3 text-sm font-semibold text-white"
          >
            All fail
          </button>
        </div>
      ) : null}
      {rows.map((row) => {
        const v = getValue(row.key).toLowerCase();
        return (
          <div
            key={row.key}
            data-row-key={row.key}
            className="flex items-center gap-2 rounded-xl bg-white px-2 py-2"
          >
            <span className="flex-1 text-sm leading-tight">{row.label.replace(" Pass/Fail", "")}</span>
            {(["pass", "fail"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  apply(row.key, opt);
                }}
                onPointerMove={drag}
                onPointerUp={endBrush}
                onPointerCancel={endBrush}
                className={`touch-none min-w-[4.5rem] rounded-xl py-3 text-sm font-medium ${
                  v === opt
                    ? opt === "pass"
                      ? "bg-emerald-600 text-white"
                      : "bg-red-600 text-white"
                    : "bg-zinc-100"
                }`}
              >
                {opt === "pass" ? "Pass" : "Fail"}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function IrPassFail({
  readings,
  onChange,
}: {
  readings: IrReadings;
  onChange: (next: IrReadings) => void;
}) {
  return (
    <PassFailPaint
      rows={IR_ROWS}
      getValue={(key) => readings[key as keyof IrReadings]}
      onPaint={(key, value) => onChange({ ...readings, [key]: value })}
      onPaintAll={(value) => onChange(fillIr(value))}
    />
  );
}

export function PolarityPassFail({
  values,
  onChange,
}: {
  values: PolarityTest;
  onChange: (next: PolarityTest) => void;
}) {
  return (
    <PassFailPaint
      rows={POLARITY_ROWS}
      getValue={(key) => values[key as keyof PolarityTest]}
      onPaint={(key, value) => onChange({ ...values, [key]: value as PassFail })}
      onPaintAll={(value) =>
        onChange({
          l1ToEarth: value,
          l2ToEarth: value,
          l3ToEarth: value,
          nToEarth: value,
        })
      }
    />
  );
}
