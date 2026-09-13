"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STIFFNESS = 380;
const DAMPING = 28;
const MASS = 1;
const SETTLE_X = 0.8;
const SETTLE_V = 16;
const DISTANCE_RATIO = 0.16;
const FLICK_PX_MS = 0.28;
const LOCK_PX = 6;

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
  const trackRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const xRef = useRef(0);
  const velRef = useRef(0);
  const dragging = useRef(false);
  const locked = useRef(false);
  const swiped = useRef(false);
  const startRef = useRef({ x: 0, y: 0, origin: 0 });
  const lastRef = useRef({ x: 0, t: 0 });
  const raf = useRef<number | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const [tick, setTick] = useState(index);

  function paint(next: number) {
    xRef.current = next;
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${next}px,0,0)`;
  }

  function restX(at = indexRef.current) {
    return -at * widthRef.current;
  }

  function stopSpring() {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }

  function springTo(target: number, seedVel = velRef.current) {
    stopSpring();
    if (!widthRef.current || prefersReducedMotion()) {
      paint(target);
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
        paint(target);
        velRef.current = 0;
        raf.current = null;
        return;
      }
      paint(next);
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
      widthRef.current = next;
      if (!dragging.current) {
        paint(-indexRef.current * next);
        velRef.current = 0;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setTick(index);
    if (!widthRef.current || dragging.current) return;
    springTo(restX(index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => stopSpring(), []);

  function go(next: number) {
    if (next < 0 || next >= count || next === index) return;
    onIndex(next);
  }

  function rubber(raw: number, at: number) {
    if (at === 0 && raw > 0) return raw * 0.28;
    if (at === count - 1 && raw < 0) return raw * 0.28;
    return raw;
  }

  function onStart(clientX: number, clientY: number) {
    stopSpring();
    dragging.current = true;
    locked.current = false;
    const t = performance.now();
    startRef.current = { x: clientX, y: clientY, origin: xRef.current };
    lastRef.current = { x: clientX, t };
    velRef.current = 0;
  }

  function onMove(clientX: number, clientY: number) {
    if (!dragging.current) return;
    const dx = clientX - startRef.current.x;
    const dy = clientY - startRef.current.y;
    if (!locked.current) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        dragging.current = false;
        return;
      }
      locked.current = true;
      swiped.current = true;
    }
    const t = performance.now();
    const dt = t - lastRef.current.t;
    if (dt > 0) velRef.current = ((clientX - lastRef.current.x) / dt) * 1000;
    lastRef.current = { x: clientX, t };
    paint(startRef.current.origin + rubber(dx, indexRef.current));
  }

  function onEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    const current = indexRef.current;
    const width = widthRef.current;
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
    else springTo(restX(next), velRef.current);
    locked.current = false;
    window.setTimeout(() => {
      swiped.current = false;
    }, 350);
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

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onClick = (e: Event) => {
      if (!swiped.current) return;
      e.preventDefault();
      e.stopPropagation();
      swiped.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      onMove(touch.clientX, touch.clientY);
      if (locked.current) e.preventDefault();
    };

    el.addEventListener("click", onClick, true);
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  if (count <= 1) return <div>{items[0]}</div>;

  return (
    <div>
      <div
        ref={viewportRef}
        className="string-dial relative select-none overflow-hidden rounded-3xl"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if ((e.target as HTMLElement).closest("input,textarea,select")) return;
          onStart(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "touch") return;
          onMove(e.clientX, e.clientY);
          if (locked.current && viewportRef.current && !viewportRef.current.hasPointerCapture(e.pointerId)) {
            viewportRef.current.setPointerCapture(e.pointerId);
          }
        }}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      >
        <div
          ref={trackRef}
          className="flex"
          style={{ width: `${count * 100}%`, transform: `translate3d(${-index * (widthRef.current || 0)}px,0,0)` }}
        >
          {items.map((item, i) => (
            <div
              key={i}
              className="shrink-0"
              style={{ width: `${100 / count}%` }}
              aria-hidden={i !== index}
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        {items.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full ${i === tick ? "w-6 bg-accent" : "w-1.5 bg-rule"}`}
          />
        ))}
      </div>
    </div>
  );
}
