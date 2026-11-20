import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#090a0f",
        header: "#0c0e16",
        rail: "#0c0e14",
        card: "#11131a",
        cardwarm: "#181b25",
        line: "#292d3d",
        seg: "#272b44",
        fg: "#f3f4f6",
        sub: "#aeb6cb",
        mute: "#909ab3",
        brand: "#a19bff",
        brandtint: "#232548",
        gain: "#56dead",
        loss: "#ff869e",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
