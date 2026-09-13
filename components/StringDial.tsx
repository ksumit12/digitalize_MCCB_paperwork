"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STIFFNESS = 420;
const DAMPING = 26;
const MASS = 1;
const SETTLE_X = 0.6;
const SETTLE_V = 12;
const DISTANCE_RATIO = 0.22;
const FLICK_PX_MS = 0.55;
const LOCK_PX = 8;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function StringDial({
  index,
  onIndex,
  items,
}: {
  index: number;
  onIndex: (next: number) => void;
  items: ReactNode[];
}) {
  const count = items.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [x, setX] = useState(0);
  const xRef = useRef(0);
  const velRef = useRef(0);
  const dragging = useRef(false);
  const locked = useRef(false);
  const startRef = useRef({ pointer: 0, origin: 0, t: 0 });
  const lastRef = useRef({ x: 0, t: 0 });
  const raf = useRef<number | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  function writeX(next: number) {
    xRef.current = next;
    setX(next);
  }

  function restX(at = indexRef.current) {
    return -at * width;
  }

  function stopSpring() {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }

  function springTo(target: number, seedVel = velRef.current) {
    stopSpring();
    if (!width) {
      writeX(target);
      velRef.current = 0;
      return;
    }
    if (prefersReducedMotion()) {
      writeX(target);
      velRef.current = 0;
      return;
    }
    velRef.current = seedVel;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const disp = xRef.current - target;
      const accel = (-STIFFNESS * disp - DAMPING * velRef.current) / MASS;
      velRef.current += accel * dt;
      const next = xRef.current + velRef.current * dt;
      if (Math.abs(disp) < SETTLE_X && Math.abs(velRef.current) < SETTLE_V) {
        writeX(target);
        velRef.current = 0;
        raf.current = null;
        return;
      }
      writeX(next);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const next = el.clientWidth;
      if (!next) return;
      setWidth(next);
      if (!dragging.current) {
        writeX(-indexRef.current * next);
        velRef.current = 0;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width || dragging.current) return;
    springTo(restX(index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, width]);

  useEffect(() => () => stopSpring(), []);

  function go(next: number) {
    if (next < 0 || next >= count || next === index) return;
    onIndex(next);
  }

  function rubber(raw: number) {
    if (index === 0 && raw > 0) return raw * 0.28;
    if (index === count - 1 && raw < 0) return raw * 0.28;
    return raw;
  }

  function onStart(clientX: number) {
    stopSpring();
    dragging.current = true;
    locked.current = false;
    const t = performance.now();
    startRef.current = { pointer: clientX, origin: xRef.current, t };
    lastRef.current = { x: clientX, t };
    velRef.current = 0;
  }

  function onMove(clientX: number) {
    if (!dragging.current) return;
    const dx = clientX - startRef.current.pointer;
    if (!locked.current) {
      if (Math.abs(dx) < LOCK_PX) return;
      locked.current = true;
    }
    const t = performance.now();
    const dt = t - lastRef.current.t;
    if (dt > 0) velRef.current = ((clientX - lastRef.current.x) / dt) * 1000;
    lastRef.current = { x: clientX, t };
    writeX(startRef.current.origin + rubber(dx));
  }

  function onEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    const current = indexRef.current;
    if (!locked.current || !width) {
      springTo(restX(current), 0);
      return;
    }
    const offset = xRef.current - restX(current);
    const flick = velRef.current / 1000;
    let next = current;
    if ((offset < -width * DISTANCE_RATIO || flick < -FLICK_PX_MS) && current < count - 1) next = current + 1;
    else if ((offset > width * DISTANCE_RATIO || flick > FLICK_PX_MS) && current > 0) next = current - 1;
    if (next !== current) onIndex(next);
    springTo(restX(next), velRef.current);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select")) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, index]);

  if (count <= 1) return <div>{items[0]}</div>;

  return (
    <div>
      <div
        ref={viewportRef}
        className="relative select-none overflow-hidden rounded-3xl"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("a,button,input")) return;
          onStart(e.clientX);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      >
        <div
          className="flex will-change-transform"
          style={{ width: `${count * 100}%`, transform: `translate3d(${x}px,0,0)` }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              className="shrink-0"
              style={{ width: `${100 / count}%` }}
              aria-hidden={i !== index}
              inert={i !== index ? true : undefined}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Previous string"
          disabled={index === 0}
          onClick={() => go(index - 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-lg disabled:opacity-30"
        >
          ‹
        </button>
        <div className="flex items-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`String ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-accent" : "w-1.5 bg-rule"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next string"
          disabled={index === count - 1}
          onClick={() => go(index + 1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-lg disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
}
