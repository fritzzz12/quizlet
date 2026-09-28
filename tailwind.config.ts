import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3efe6",
        card: "#fffdf8",
        ink: "#1c1915",
        muted: "#6d655c",
        line: "#e6dfd2",
        accent: "#c6531a",
        accentdark: "#9a3e12",
        navy: "#243044",
        teal: "#1d6b5f",
        good: "#1d6b5f",
        bad: "#b42318",
        warn: "#8a5a00",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "Segoe UI", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(36, 48, 68, 0.04), 0 12px 32px rgba(36, 48, 68, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
