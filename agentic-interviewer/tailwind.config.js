/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Dark drafting system, end to end. Near-black ink ground with a faint
      // grid; acid lime is the hand that acts (primary actions, selection);
      // electric cyan is the machine that speaks (mic meter, AI voice, live
      // signals). Bright green/red are reserved for pass/fail output.
      //
      // Token names kept from the drafting-office system so markup reads the
      // same - only the values inverted. "paper"/"ink" now mean ground/text.
      colors: {
        // Ground + surfaces (the former light-sheet tokens, re-valued)
        paper: "#0B0B0D",     // near-black ink ground
        card: "#131318",      // raised surface
        rule: "#26262E",      // hairlines / ruled cells
        ink: "#F2F2EE",       // primary text (and wireframe borders)
        inksub: "#9A9A93",    // secondary text
        inkfaint: "#8B8B85",  // annotations
        wash: "#121216",      // callout well
        washline: "#2B2B34",
        // Interview room surfaces
        field: "#0B0B0D",
        night: "#0B0B0D",
        stage: "#121216",
        panel: "#0E0E12",
        edge: "#24242B",
        tile: "#17171C",
        tileedge: "#2E2E38",
        editor: "#08080A",
        dtext: "#F2F2EE",
        dsub: "#96968F",
        dmute: "#6C6C66",
        // Accents
        signal: {
          DEFAULT: "#D3FB50", // acid lime - actions & selection
          deep: "#B8E437",
          dark: "#E4FF74",    // hover / brighter read
        },
        trace: "#4EE0F5",     // electric cyan - live signals
        alarm: "#FF7B72",     // errors, failing output
        pass: "#7EE787",      // passing output
        brand: {
          DEFAULT: "#D3FB50",
          deep: "#B8E437",
          soft: "#4EE0F5",
          wash: "#121216",
          washline: "#2B2B34",
        },
      },
      // Type from the reference mock. Bricolage Grotesque is a display
      // grotesque built for tight, sentence-case setting - it is set at
      // weight 800 with negative tracking, never uppercased with wide
      // tracking the way the previous condensed face was.
      fontFamily: {
        sans: ["'Schibsted Grotesk'", "Helvetica", "Arial", "sans-serif"],
        display: ["'Bricolage Grotesque'", "Helvetica", "sans-serif"],
        mono: ["'Azeret Mono'", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        // The mock's display tracking, by size band.
        hero: "-0.036em",
        title: "-0.032em",
        sub: "-0.026em",
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
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-5px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(5px)" },
        },
        ruledraw: {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        caret: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        speakpulse: "speakpulse 1.9s ease-out infinite",
        "speakpulse-late": "speakpulse 1.9s ease-out infinite 0.95s",
        recblink: "recblink 1.6s ease-in-out infinite",
        fadeup: "fadeup 0.28s ease-out",
        shake: "shake 0.5s",
        ruledraw: "ruledraw 0.5s ease-out both",
        caret: "caret 1s step-end infinite",
      },
    },
  },
  plugins: [],
}
