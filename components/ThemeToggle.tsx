"use client";

import { usePalette, useTheme, type Palette } from "@/lib/theme";

const DOTS: { id: Palette; label: string; swatch: string }[] = [
  { id: "volt", label: "Volt — yellow on black", swatch: "#f5c400" },
  { id: "pulse", label: "Pulse — purple", swatch: "#8b6cff" },
  { id: "nix", label: "Nix — cream on black", swatch: "#f3efe4" },
];

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const [palette, choose] = usePalette();
  const dark = theme === "dark";

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-full bg-surface px-1.5 py-1.5 ring-1 ring-rule">
        {DOTS.map((dot) => (
          <button
            key={dot.id}
            type="button"
            aria-label={dot.label}
            title={dot.label}
            onClick={() => choose(dot.id)}
            className={`h-5 w-5 rounded-full ring-2 transition-transform ${
              palette === dot.id ? "scale-110 ring-ink" : "ring-transparent"
            }`}
            style={{ background: dot.swatch }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        className="tile-press flex h-11 items-center gap-2 rounded-full bg-surface px-3 text-xs font-semibold text-ink ring-1 ring-rule"
      >
        <span className="relative flex h-5 w-9 items-center rounded-full bg-surface-2 ring-1 ring-rule">
          <span
            className={`absolute h-4 w-4 rounded-full bg-accent transition-transform ${
              dark ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className="hidden sm:inline">{dark ? "Dark" : "Light"}</span>
      </button>
    </div>
  );
}
