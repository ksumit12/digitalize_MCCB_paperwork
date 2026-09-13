import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        rule: "var(--rule)",
        canvas: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        muted: "var(--muted)",
        install: "var(--install)",
        testing: "var(--testing)",
        done: "var(--done)",
        "on-install": "var(--on-install)",
        "on-testing": "var(--on-testing)",
        "on-done": "var(--on-done)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
