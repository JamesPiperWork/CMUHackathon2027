import type { Config } from "tailwindcss";

// Mavacy brand palette (Brand Guidelines, Sept 2025) — the only colors used in the UI.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        prussian: "#0A2536",
        indigo: "#153954",
        payne: "#33566D",
        sky: "#F2FDFF",
        mint: "#D5F9F4",
        cyan: "#3FE4E4",
        fawn: "#FFBA7A",
        icterine: "#FFFA70",
      },
      fontFamily: {
        // Licensed brand faces first (render if installed), then the bundled Google pairings.
        heading: ["Argent CF", "var(--font-heading)", "Georgia", "serif"],
        body: ["Almarena", "var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        brand: "0.75rem",
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
    },
  },
  plugins: [],
};
export default config;
