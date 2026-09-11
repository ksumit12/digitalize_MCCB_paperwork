"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFrame, saveFrame } from "./db";
import type { Frame } from "./types";

export function useFrame(id: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Frame | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFrame(id).then((found) => {
      if (cancelled) return;
      setFrame(found ?? null);
      latest.current = found ?? null;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const persist = useCallback((next: Frame) => {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveFrame(next).then(() => setSavedAt(new Date().toLocaleTimeString()));
    }, 250);
  }, []);

  const update = useCallback(
    (patch: (current: Frame) => Frame) => {
      setFrame((current) => {
        if (!current) return current;
        const next = patch(current);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current) void saveFrame(latest.current);
    };
  }, []);

  return { frame, loading, update, savedAt };
}
