"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
export type Palette = "volt" | "pulse" | "nix";

const THEME_KEY = "qa-theme";
const PALETTE_KEY = "qa-palette";
export const PALETTES: Palette[] = ["volt", "pulse", "nix"];

export function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function readPalette(): Palette {
  if (typeof document === "undefined") return "volt";
  const value = document.documentElement.dataset.palette;
  return PALETTES.includes(value as Palette) ? (value as Palette) : "volt";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}

export function applyPalette(palette: Palette) {
  document.documentElement.dataset.palette = palette;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    /* private mode */
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return [theme, toggle];
}

export function usePalette(): [Palette, (next: Palette) => void] {
  const [palette, setPalette] = useState<Palette>("volt");

  useEffect(() => {
    setPalette(readPalette());
  }, []);

  function choose(next: Palette) {
    applyPalette(next);
    setPalette(next);
  }

  return [palette, choose];
}
