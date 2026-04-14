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
        muted: "#8B8B96",
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
