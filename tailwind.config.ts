import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        caveau: {
          black: "#0A0A0B",
          charcoal: "#141416",
          graphite: "#1C1C20",
        },
        // Borders
        slate: "#2A2A30",
        // Text
        primary: "#E8E6E1",
        secondary: "#ADABA6",
        // Bumped from #8B8B96 — the old value cleared WCAG AA only at ≥18px
        // against caveau-graphite (#1C1C20), but the app uses `text-muted`
        // at 12px throughout for metadata. #A0A0AA hits ~4.9:1 on graphite
        // and ~6.8:1 on caveau-black, comfortably AA for small text on
        // both surfaces.
        muted: "#A0A0AA",
        // Accents
        gold: {
          DEFAULT: "#FFD166",
          text: "#D4A034",
        },
        burgundy: "#C23152",
        // Status
        ok: "#34D399",
        warn: "#FBBF24",
        danger: "#F87171",
        info: "#60A5FA",
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Playfair Display", "serif"],
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      backdropBlur: {
        xl: "24px",
      },
    },
  },
  plugins: [],
};
export default config;
