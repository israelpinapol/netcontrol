import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          900: "#0a0e17",
          800: "#0f1420",
          700: "#161d2e",
          600: "#1e2740",
          500: "#2a3554",
        },
        brand: {
          DEFAULT: "#38e1c4",
          soft: "#8affe6",
        },
        accent: "#7c8cff",
        danger: "#ff5c72",
        warn: "#ffb84d",
        ok: "#3ddc84",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
