/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Vantage design system, lifted from the mock in
      // "AI Interview Platform UI/AI Interview.dc.html".
      colors: {
        brand: {
          DEFAULT: "#0E7490",  // teal accent everywhere
          deep: "#0C5F76",     // hover
          soft: "#3FA8BC",     // dark-theme accent text
          wash: "#EDF4F5",     // light callout background
          washline: "#D8E6E8", // light callout border
        },
        // Light pages
        mist: "#F5F7F7",
        ink: "#101615",
        muted: "#5C6867",
        faint: "#6B7776",
        line: "#E2E7E7",
        hairline: "#EDF1F1",
        // Dark interview room
        night: "#0B0F10",
        panel: "#0E1314",
        edge: "#1D2526",
        stage: "#101718",
        tile: "#151C1D",
        tileedge: "#262F30",
        editor: "#0A0E0F",
        dtext: "#E6EDED",
        dsub: "#97A4A4",
        dmute: "#7E8C8C",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "Helvetica", "Arial", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        speakpulse: {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "70%": { transform: "scale(1.35)", opacity: "0" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        recblink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        fadeup: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-5px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(5px)" },
        },
      },
      animation: {
        speakpulse: "speakpulse 1.9s ease-out infinite",
        "speakpulse-late": "speakpulse 1.9s ease-out infinite 0.95s",
        recblink: "recblink 1.6s ease-in-out infinite",
        fadeup: "fadeup 0.28s ease-out",
        shake: "shake 0.5s",
      },
    },
  },
  plugins: [],
}
