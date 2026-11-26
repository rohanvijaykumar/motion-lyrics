/**
 * Ready-made looks. Each preset only lists what differs from the defaults in
 * src/schema/style.ts. Pick one in project.json ("style": { "preset": "..." })
 * and override any field next to it. See docs/styles.md for pictures and tips.
 */
import type { StyleInput } from "../schema/style";

const GOLD_UNSUNG_SHADOW =
  "0 2px 18px rgba(15,8,0,.7), 0 1px 3px rgba(0,0,0,.5)";
const GOLD_SUNG_SHADOW =
  "0 0 22px rgba(255,160,48,.8), 0 0 6px rgba(255,214,140,.55), 0 2px 6px rgba(40,18,0,.5)";

export const PRESETS: Record<string, StyleInput & { description: string }> = {
  "golden-sparkle": {
    description:
      "Warm gold karaoke fill with a spinning star at the wipe head and sparkles shed from each sung word. Lines rise out of a soft blur over a dark halo in the lower third.",
    text: {
      primary: {
        fontFamily: "Poppins",
        fontSize: 80,
        fontWeight: 700,
        lineHeight: 1.38,
        color: "rgba(255,250,240,.6)",
        sungColor: "#ffe3a3",
        shadow: GOLD_UNSUNG_SHADOW,
        sungShadow: GOLD_SUNG_SHADOW,
      },
      secondary: {
        fontFamily: "Poppins",
        fontSize: 60,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: 0.005,
        color: "rgba(255,250,240,.6)",
        sungColor: "#ffe3a3",
        shadow: GOLD_UNSUNG_SHADOW,
        sungShadow: GOLD_SUNG_SHADOW,
      },
    },
    layout: { type: "stack", position: "bottom", marginY: 0.1037 },
    effects: {
      scrim: { type: "radial", color: "rgba(12,6,0,0.62)" },
      glint: { enabled: true },
      sparkles: { enabled: true },
    },
  },

  chalk: {
    description:
      "Hand-written chalk lettering in soft white with a warm yellow fill, over a cool dark halo. Friendly and classroom-like.",
    text: {
      primary: {
        fontFamily: "Kalam",
        fontSize: 84,
        fontWeight: 700,
        lineHeight: 1.3,
        color: "rgba(251,250,245,.55)",
        sungColor: "#ffc94a",
        shadow: "0 2px 12px rgba(10,20,30,.6), 0 0 2px rgba(0,0,0,.4)",
        sungShadow:
          "0 0 16px rgba(255,214,110,.6), 0 2px 8px rgba(10,20,30,.55)",
      },
      secondary: {
        fontFamily: "Kalam",
        fontSize: 66,
        fontWeight: 700,
        lineHeight: 1.15,
        color: "rgba(251,250,245,.55)",
        sungColor: "#ffc94a",
        shadow: "0 2px 12px rgba(10,20,30,.6), 0 0 2px rgba(0,0,0,.4)",
        sungShadow:
          "0 0 16px rgba(255,214,110,.6), 0 2px 8px rgba(10,20,30,.55)",
      },
    },
    highlight: { softEdge: 0.18 },
    effects: {
      scrim: { type: "radial", color: "rgba(8,14,22,0.62)" },
      grain: { enabled: true, opacity: 0.06 },
    },
  },

  "classic-karaoke": {
    description:
      "Two alternating rows like a karaoke machine: the next line waits in the other row while the current one fills from white to blue. Bold outlined type, no backing.",
    layout: { type: "alternate", position: "bottom", marginY: 0.08 },
    text: {
      primary: {
        fontFamily: "Nunito",
        fontSize: 78,
        fontWeight: 900,
        lineHeight: 1.25,
        color: "#ffffff",
        sungColor: "#2f9bff",
        strokeWidth: 7,
        strokeColor: "#0b1b33",
        shadow: "0 4px 0 rgba(0,0,0,.35)",
        sungShadow: "0 4px 0 rgba(0,0,0,.35)",
      },
      secondary: {
        fontFamily: "Nunito",
        fontSize: 50,
        fontWeight: 800,
        color: "#e8eefc",
        sungColor: "#9fd0ff",
        strokeWidth: 5,
        strokeColor: "#0b1b33",
        shadow: "0 3px 0 rgba(0,0,0,.3)",
        sungShadow: "0 3px 0 rgba(0,0,0,.3)",
      },
    },
    timing: { lead: 2.6, tail: 0.35, holdLast: true },
    enter: { type: "fade", duration: 0.3, wordStagger: 0, stagger: 0 },
    exit: { type: "fade", duration: 0.25 },
    highlight: {
      type: "wipe",
      wipeEase: "linear",
      liftY: 0,
      liftScale: 1,
      dimUpcoming: 1,
      dimFinished: 1,
      translation: "none",
    },
    effects: { scrim: { type: "none" } },
  },

  "social-pop": {
    description:
      "Short-form captions: two or three words at a time, big and uppercase, with a bright box jumping to the word being sung. Built for vertical and square video.",
    layout: {
      type: "pop",
      position: "center",
      wordsPerPage: 3,
      maxCharsPerPage: 18,
      marginY: 0.2,
    },
    text: {
      primary: {
        fontFamily: "Montserrat",
        fontSize: 96,
        fontWeight: 900,
        lineHeight: 1.15,
        textTransform: "uppercase",
        color: "#ffffff",
        sungColor: "#ffffff",
        strokeWidth: 8,
        strokeColor: "#000000",
        shadow: "0 6px 18px rgba(0,0,0,.45)",
        sungShadow: "0 6px 18px rgba(0,0,0,.45)",
      },
    },
    timing: { lead: 0.08, tail: 0.25, holdLast: false },
    enter: { type: "pop", duration: 0.22, wordStagger: 0.03, stagger: 0 },
    exit: { type: "none", duration: 0.05 },
    highlight: {
      type: "color",
      liftY: -4,
      liftScale: 1.08,
      dimUpcoming: 1,
      dimFinished: 1,
      box: {
        enabled: true,
        color: "#ffd23f",
        textColor: "#111111",
        radius: 16,
      },
    },
    effects: { scrim: { type: "none" } },
  },

  kinetic: {
    description:
      "Big centred type where each word lands the moment it is sung, then the line clears for the next. Energetic and rhythmic.",
    layout: { type: "kinetic", position: "center", maxWidth: 0.8 },
    text: {
      primary: {
        fontFamily: "Anton",
        fontSize: 120,
        fontWeight: 400,
        lineHeight: 1.1,
        textTransform: "uppercase",
        letterSpacing: 0.01,
        color: "#ffffff",
        sungColor: "#ffffff",
        shadow: "0 8px 30px rgba(0,0,0,.5)",
        sungShadow: "0 8px 30px rgba(0,0,0,.5)",
      },
      secondary: {
        fontFamily: "Inter",
        fontSize: 46,
        fontWeight: 600,
        color: "rgba(255,255,255,.85)",
        sungColor: "#ffffff",
        shadow: "0 4px 16px rgba(0,0,0,.5)",
        sungShadow: "0 4px 16px rgba(0,0,0,.5)",
      },
    },
    timing: { lead: 0.15, tail: 0.45, holdLast: true },
    enter: { type: "pop", duration: 0.32, stagger: 0, wordStagger: 0 },
    exit: { type: "scale", duration: 0.25 },
    highlight: {
      type: "none",
      liftY: 0,
      liftScale: 1,
      dimUpcoming: 1,
      dimFinished: 1,
    },
    effects: {
      scrim: {
        type: "radial",
        color: "rgba(0,0,0,0.5)",
        width: 0.9,
        height: 0.6,
      },
      beatPulse: { enabled: true },
    },
  },

  "scroll-focus": {
    description:
      "The whole lyric sheet scrolls smoothly; the line being sung is bright and large while the others fade back. Great over a dimmed or abstract background.",
    layout: {
      type: "scroll",
      position: "center",
      align: "start",
      marginX: 0.1,
      maxWidth: 0.78,
      scrollVisibleLines: 7,
      inactiveOpacity: 0.3,
    },
    text: {
      primary: {
        fontFamily: "Inter",
        fontSize: 72,
        fontWeight: 800,
        lineHeight: 1.2,
        color: "rgba(255,255,255,.5)",
        sungColor: "#ffffff",
        shadow: "none",
        sungShadow: "0 0 24px rgba(255,255,255,.35)",
      },
      secondary: {
        fontFamily: "Inter",
        fontSize: 44,
        fontWeight: 600,
        color: "rgba(255,255,255,.55)",
        sungColor: "rgba(255,255,255,.9)",
        shadow: "none",
        sungShadow: "none",
      },
    },
    highlight: { type: "wipe", softEdge: 0.35, liftY: 0, liftScale: 1 },
    effects: { scrim: { type: "none" } },
  },

  "minimal-subtitles": {
    description:
      "Clean, quiet subtitles: one screen at a time, a gentle brightening on the sung word, a thin dark band for legibility.",
    layout: { type: "stack", position: "bottom", marginY: 0.07 },
    text: {
      primary: {
        fontFamily: "Inter",
        fontSize: 56,
        fontWeight: 600,
        lineHeight: 1.3,
        color: "rgba(255,255,255,.72)",
        sungColor: "#ffffff",
        shadow: "0 1px 6px rgba(0,0,0,.6)",
        sungShadow: "0 1px 6px rgba(0,0,0,.6)",
      },
      secondary: {
        fontFamily: "Inter",
        fontSize: 42,
        fontWeight: 500,
        color: "rgba(255,255,255,.7)",
        sungColor: "rgba(255,255,255,.95)",
        shadow: "0 1px 6px rgba(0,0,0,.6)",
        sungShadow: "0 1px 6px rgba(0,0,0,.6)",
      },
    },
    timing: { lead: 0.3, tail: 0.6 },
    enter: { type: "fade", duration: 0.25, stagger: 0, wordStagger: 0 },
    exit: { type: "fade", duration: 0.25 },
    highlight: {
      type: "color",
      liftY: 0,
      liftScale: 1,
      dimUpcoming: 0.8,
      dimFinished: 0.8,
    },
    effects: {
      scrim: { type: "linear", color: "rgba(0,0,0,0.55)", height: 0.3 },
    },
  },

  cinematic: {
    description:
      "Elegant serif lettering that blooms in slowly with a soft glowing fill, framed by a vignette, film grain and drifting light motes.",
    fontFallback: "serif",
    layout: { type: "stack", position: "bottom", marginY: 0.12 },
    text: {
      primary: {
        fontFamily: "Cormorant Garamond",
        fontSize: 84,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: 0.02,
        color: "rgba(255,248,236,.5)",
        sungColor: "#fff4e0",
        shadow: "0 2px 20px rgba(0,0,0,.6)",
        sungShadow: "0 0 26px rgba(255,236,200,.55), 0 2px 16px rgba(0,0,0,.5)",
      },
      secondary: {
        fontFamily: "Cormorant Garamond",
        fontSize: 58,
        fontWeight: 500,
        italic: true,
        color: "rgba(255,248,236,.5)",
        sungColor: "#fff4e0",
        shadow: "0 2px 20px rgba(0,0,0,.6)",
        sungShadow: "0 0 20px rgba(255,236,200,.45), 0 2px 16px rgba(0,0,0,.5)",
      },
    },
    timing: { lead: 0.9, tail: 1.4 },
    enter: {
      type: "blur-rise",
      duration: 1.0,
      distance: 14,
      blur: 14,
      wordStagger: 0.06,
    },
    exit: { type: "blur-rise", duration: 0.7, distance: 10, blur: 12 },
    highlight: { type: "wipe", softEdge: 0.45, liftY: -2, liftScale: 1.01 },
    effects: {
      scrim: { type: "radial", color: "rgba(0,0,0,0.5)" },
      vignette: { enabled: true, strength: 0.55 },
      grain: { enabled: true, opacity: 0.07 },
      particles: {
        enabled: true,
        count: 28,
        color: "rgba(255,236,200,0.55)",
        speed: 10,
      },
    },
  },

  neon: {
    description:
      "Electric neon tubes: words switch on with a hot pink glow as they are sung, over a deep purple haze.",
    layout: { type: "stack", position: "bottom" },
    text: {
      primary: {
        fontFamily: "Righteous",
        fontSize: 82,
        fontWeight: 400,
        lineHeight: 1.3,
        color: "rgba(255,190,240,.35)",
        sungColor: "#fff0fb",
        shadow: "0 0 6px rgba(255,80,200,.35)",
        sungShadow:
          "0 0 6px #ff4fd8, 0 0 18px #ff4fd8, 0 0 42px rgba(255,79,216,.75), 0 0 80px rgba(160,60,255,.6)",
      },
      secondary: {
        fontFamily: "Righteous",
        fontSize: 58,
        fontWeight: 400,
        color: "rgba(160,230,255,.35)",
        sungColor: "#effcff",
        shadow: "0 0 6px rgba(60,200,255,.35)",
        sungShadow:
          "0 0 6px #3fd2ff, 0 0 18px #3fd2ff, 0 0 42px rgba(63,210,255,.7)",
      },
    },
    enter: { type: "fade", duration: 0.4, wordStagger: 0.03 },
    exit: { type: "fade", duration: 0.3 },
    highlight: {
      type: "color",
      colorTransition: 0.06,
      liftY: 0,
      liftScale: 1.02,
    },
    effects: {
      scrim: { type: "radial", color: "rgba(30,0,40,0.6)" },
      vignette: { enabled: true, strength: 0.4 },
    },
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
