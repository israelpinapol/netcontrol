import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Branding ASCII Studio (tema claro)
        bg: "#f8fafc",
        surface: "#ffffff",
        ink: "#0f172b",
        muted: "#62748e",
        line: "#e2e8f0",
        accent: {
          DEFAULT: "#79a4ff",
          deep: "#6d8fe8",
          ink: "#4d6fd0",
          soft: "#eef3ff",
        },
        ok: "#00c758",
        danger: "#fb2c36",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Satoshi", "ui-rounded", "SF Pro Rounded", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 24px 48px -28px rgba(15,23,43,0.28)",
        nav: "0 10px 30px -14px rgba(15,23,43,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
