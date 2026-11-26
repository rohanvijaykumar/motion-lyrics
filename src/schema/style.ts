/**
 * The style system. A style is built from small, independent parts:
 *
 *   layout    - where and how lines sit on screen (stack, alternate, pop, kinetic, scroll)
 *   text      - typography for the primary and secondary tracks
 *   timing    - how early lines appear and how long they linger
 *   enter/exit- how lines animate in and out
 *   highlight - how the word being sung is marked
 *   effects   - sparkles, glints, particles, grain, scrims, vignettes, beat pulses
 *
 * Every field has a default, so a preset only states what makes it different
 * and a project only states what it wants to change. Sizes are in pixels for a
 * 1080-pixel-tall frame and scale with the output automatically.
 */
import { z } from "zod";

const Color = z
  .string()
  .describe("Any CSS color, e.g. #ffe3a3 or rgba(255,255,255,.6)");

export const TextStyleSchema = z
  .object({
    fontFamily: z
      .string()
      .nullable()
      .default(null)
      .describe(
        "Google Font or local font family. null = the best font for each script.",
      ),
    fontWeight: z.number().default(700),
    fontSize: z.number().default(72).describe("Pixels at 1080p"),
    letterSpacing: z.number().default(0).describe("em"),
    lineHeight: z.number().default(1.3),
    textTransform: z.enum(["none", "uppercase", "lowercase"]).default("none"),
    italic: z.boolean().default(false),
    color: Color.default("rgba(255,255,255,0.62)").describe(
      "Words not sung yet",
    ),
    sungColor: Color.default("#ffffff").describe("Words being or already sung"),
    shadow: z
      .string()
      .default("0 2px 14px rgba(0,0,0,0.55)")
      .describe("CSS text-shadow for unsung text"),
    sungShadow: z
      .string()
      .default("0 2px 14px rgba(0,0,0,0.55)")
      .describe("CSS text-shadow for sung text (glow)"),
    strokeWidth: z
      .number()
      .default(0)
      .describe("Outline width in px (0 = none)"),
    strokeColor: Color.default("rgba(0,0,0,0.85)"),
  })
  .describe("Typography for one track");

export type TextStyle = z.infer<typeof TextStyleSchema>;

/** Same fields with no defaults, for per-track overrides (only what is written applies). */
export const TextStyleOverrideSchema = z.object({
  fontFamily: z.string().nullable().optional(),
  fontWeight: z.number().optional(),
  fontSize: z.number().optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase"]).optional(),
  italic: z.boolean().optional(),
  color: Color.optional(),
  sungColor: Color.optional(),
  shadow: z.string().optional(),
  sungShadow: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeColor: Color.optional(),
});

const EnterType = z.enum([
  "fade",
  "blur-rise",
  "rise",
  "slide",
  "scale",
  "pop",
  "mask",
  "typewriter",
  "letters",
  "none",
]);
const ExitType = z.enum([
  "fade",
  "blur-rise",
  "drift-up",
  "sink",
  "slide",
  "scale",
  "mask",
  "none",
]);
const Ease = z.enum(["out", "inOut", "spring", "linear"]);

export const StyleSchema = z.object({
  name: z.string().default("custom"),
  layout: z
    .object({
      type: z
        .enum(["stack", "alternate", "pop", "kinetic", "scroll"])
        .default("stack")
        .describe(
          "stack: a group of lines together. alternate: classic two-row karaoke. pop: a few words at a time (social captions). kinetic: words land one by one. scroll: the whole lyric sheet scrolls past.",
        ),
      position: z.enum(["bottom", "center", "top"]).default("bottom"),
      avoidFaces: z
        .boolean()
        .default(false)
        .describe(
          "Off (default): lyrics stay in one place all video. On: a screen moves to the other end of the frame if it would cover a face.",
        ),
      align: z.enum(["center", "start", "end"]).default("center"),
      marginX: z
        .number()
        .default(0.06)
        .describe("Fraction of width kept clear at the sides"),
      marginY: z
        .number()
        .default(0.09)
        .describe("Fraction of height kept clear at the top and bottom"),
      maxWidth: z
        .number()
        .default(0.86)
        .describe("Fraction of width a line may use before wrapping"),
      lineGap: z
        .number()
        .default(0.1)
        .describe("Space between lines, em of the primary font"),
      wordSpacing: z
        .number()
        .default(0.07)
        .describe("Extra space on each side of a word, em"),
      wordsPerPage: z
        .number()
        .default(3)
        .describe("pop layout: most words on screen at once"),
      maxCharsPerPage: z
        .number()
        .default(22)
        .describe("pop layout: most characters on screen at once"),
      scrollVisibleLines: z
        .number()
        .default(7)
        .describe("scroll layout: lines visible at once"),
      inactiveOpacity: z
        .number()
        .default(0.35)
        .describe("scroll layout: opacity of lines not being sung"),
    })
    .prefault({}),
  text: z
    .object({
      primary: TextStyleSchema.prefault({}),
      secondary: TextStyleSchema.prefault({ fontSize: 54, fontWeight: 600 }),
    })
    .prefault({}),
  tracks: z
    .record(z.string(), TextStyleOverrideSchema)
    .default({})
    .describe(
      "Per-track overrides keyed by track id, e.g. { en: { fontSize: 60 } }",
    ),
  fontFallback: z
    .enum(["sans", "serif"])
    .default("sans")
    .describe(
      "Family used for scripts the chosen font does not cover (Noto Sans or Noto Serif)",
    ),
  fonts: z
    .record(z.string(), z.string())
    .default({})
    .describe(
      "Font per script (ISO 15924 code), e.g. { Deva: 'Kalam', Latn: 'Kalam' }",
    ),
  timing: z
    .object({
      lead: z
        .number()
        .default(0.55)
        .describe("Seconds a page appears before its first word"),
      tail: z
        .number()
        .default(1.1)
        .describe("Seconds a page lingers after its last word"),
      holdLast: z
        .boolean()
        .default(true)
        .describe("Keep the final page up until the video ends"),
      minEnter: z
        .number()
        .default(0.34)
        .describe("Shortest entrance when there is room for it"),
    })
    .prefault({}),
  enter: z
    .object({
      type: EnterType.default("blur-rise"),
      duration: z.number().default(0.6),
      stagger: z
        .number()
        .default(0.09)
        .describe("Delay between lines of a page"),
      wordStagger: z
        .number()
        .default(0.045)
        .describe("Delay between words of a line"),
      distance: z.number().default(26).describe("px"),
      blur: z.number().default(10).describe("px"),
      ease: Ease.default("out"),
    })
    .prefault({}),
  exit: z
    .object({
      type: ExitType.default("drift-up"),
      duration: z.number().default(0.38),
      distance: z.number().default(34),
      blur: z.number().default(8),
      ease: Ease.default("inOut"),
    })
    .prefault({}),
  highlight: z
    .object({
      type: z.enum(["wipe", "color", "none"]).default("wipe"),
      softEdge: z
        .number()
        .default(0)
        .describe(
          "wipe: feathered edge as a fraction of the word (0 = hard edge)",
        ),
      wipeEase: z.enum(["linear", "sine"]).default("sine"),
      wipeLead: z
        .number()
        .default(0.03)
        .describe(
          "Seconds the wipe starts before the word, to meet the consonant",
        ),
      minWordDuration: z
        .number()
        .default(0.14)
        .describe("Shortest wipe, so quick words still read"),
      persist: z
        .boolean()
        .default(true)
        .describe("Sung words stay highlighted"),
      colorTransition: z
        .number()
        .default(0.12)
        .describe("color: seconds to fade into the sung color"),
      liftY: z.number().default(-5).describe("px the active word rises"),
      liftScale: z.number().default(1.035).describe("Scale of the active word"),
      liftIn: z.number().default(0.16),
      liftOut: z.number().default(0.42),
      dimUpcoming: z
        .number()
        .default(0.55)
        .describe("Opacity of a line waiting to be sung (1 = no dimming)"),
      dimFinished: z
        .number()
        .default(0.62)
        .describe("Opacity of a line already sung (1 = no dimming)"),
      underline: z
        .object({
          enabled: z.boolean().default(false),
          color: Color.default("#ffffff"),
          thickness: z.number().default(5),
          offset: z.number().default(8),
        })
        .prefault({}),
      box: z
        .object({
          enabled: z.boolean().default(false),
          color: Color.default("#ffd23f"),
          textColor: Color.default("#111111"),
          radius: z.number().default(14),
          padX: z.number().default(0.18).describe("em"),
          padY: z.number().default(0.04).describe("em"),
        })
        .prefault({}),
      translation: z
        .enum(["line", "none"])
        .default("line")
        .describe(
          "Unsung translation lines: fill along with their sung line, or stay static",
        ),
    })
    .prefault({}),
  effects: z
    .object({
      scrim: z
        .object({
          type: z.enum(["radial", "linear", "box", "none"]).default("radial"),
          color: Color.default("rgba(12,6,0,0.62)").describe(
            "Darkest point of the backing",
          ),
          width: z.number().default(0.917).describe("Fraction of frame width"),
          height: z
            .number()
            .default(0.435)
            .describe("Fraction of frame height (linear: band height)"),
        })
        .prefault({}),
      glint: z
        .object({
          enabled: z.boolean().default(false),
          size: z.number().default(58).describe("px"),
          color: Color.default("#fff8e4").describe("Star"),
          core: Color.default("rgba(255,250,232,0.95)").describe(
            "Bright centre dot",
          ),
          halo: Color.default("rgba(255,240,200,0.9)").describe("Inner glow"),
          haloOuter: Color.default("rgba(255,176,64,0.55)").describe(
            "Outer glow",
          ),
          spin: z
            .number()
            .default(160)
            .describe("Degrees of spin per second of word"),
        })
        .prefault({}),
      sparkles: z
        .object({
          enabled: z.boolean().default(false),
          perWord: z.tuple([z.number(), z.number()]).default([5, 12]),
          size: z.tuple([z.number(), z.number()]).default([18, 38]),
          dustRatio: z
            .number()
            .default(0.4)
            .describe("Share of sparkles that are tiny dots"),
          perChar: z
            .number()
            .default(1.4)
            .describe("Sparkles per character of the word, clamped to perWord"),
          colors: z
            .array(Color)
            .default(["#fff8e4"])
            .describe("Star colours, picked at random per sparkle"),
          core: Color.default("rgba(255,248,225,0.9)"),
          glow: Color.default("rgba(255,214,140,0.85)"),
          glowOuter: Color.default("rgba(255,170,60,0.4)"),
          rise: z
            .tuple([z.number(), z.number()])
            .default([30, 86])
            .describe("px they float up"),
          life: z
            .tuple([z.number(), z.number()])
            .default([0.7, 1.25])
            .describe("seconds"),
        })
        .prefault({}),
      particles: z
        .object({
          enabled: z.boolean().default(false),
          count: z.number().default(40),
          color: Color.default("rgba(255,240,210,0.7)"),
          size: z.tuple([z.number(), z.number()]).default([2, 6]),
          speed: z.number().default(18).describe("px per second upward drift"),
        })
        .prefault({}),
      grain: z
        .object({
          enabled: z.boolean().default(false),
          opacity: z.number().default(0.08),
        })
        .prefault({}),
      vignette: z
        .object({
          enabled: z.boolean().default(false),
          strength: z.number().default(0.45),
        })
        .prefault({}),
      beatPulse: z
        .object({
          enabled: z.boolean().default(false),
          amount: z
            .number()
            .default(0.025)
            .describe("Extra scale on each beat"),
        })
        .prefault({}),
    })
    .prefault({}),
});

export type Style = z.infer<typeof StyleSchema>;
/** What a preset or project may write: any subset of the style. */
export type StyleInput = z.input<typeof StyleSchema>;
