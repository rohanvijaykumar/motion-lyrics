/**
 * project.json - the one file a person edits to control a video.
 * Created by `npm run new` / `npm run make`; every field is optional except media.
 */
import { z } from "zod";
import { StyleSchema } from "./style";

const Placement = z.object({
  x: z.number().default(0.5).describe("Horizontal anchor, 0 = left edge, 1 = right edge"),
  y: z.number().default(0.5).describe("Vertical anchor, 0 = top edge, 1 = bottom edge"),
});

const GraphicBase = z.object({
  start: z.number().describe("Seconds"),
  end: z.number().describe("Seconds"),
  enter: z.enum(["fade", "rise", "scale", "pop", "none"]).default("fade"),
  exit: z.enum(["fade", "sink", "scale", "none"]).default("fade"),
  transition: z.number().default(0.5).describe("Seconds for enter and exit"),
});

export const GraphicSchema = z.discriminatedUnion("type", [
  GraphicBase.extend({
    type: z.literal("title"),
    title: z.string(),
    subtitle: z.string().optional(),
    at: Placement.prefault({}),
    size: z.number().default(110),
    color: z.string().default("#ffffff"),
    accent: z.string().default("#ffd27a"),
    fontFamily: z.string().nullable().default(null),
    scrim: z.boolean().default(true),
  }),
  GraphicBase.extend({
    type: z.literal("text"),
    text: z.string(),
    at: Placement.prefault({}),
    size: z.number().default(48),
    weight: z.number().default(600),
    color: z.string().default("#ffffff"),
    fontFamily: z.string().nullable().default(null),
    background: z.string().nullable().default(null),
  }),
  GraphicBase.extend({
    type: z.literal("lowerThird"),
    title: z.string(),
    subtitle: z.string().optional(),
    side: z.enum(["left", "right"]).default("left"),
    color: z.string().default("#ffffff"),
    accent: z.string().default("#ffd27a"),
    fontFamily: z.string().nullable().default(null),
  }),
  GraphicBase.extend({
    type: z.literal("image"),
    src: z.string().describe("Path inside the project folder, e.g. media/logo.png"),
    at: Placement.prefault({ x: 0.92, y: 0.1 }),
    width: z.number().default(0.12).describe("Fraction of frame width"),
    opacity: z.number().default(1),
  }),
  GraphicBase.extend({
    type: z.literal("lottie"),
    src: z.string().describe("Lottie JSON inside the project folder"),
    at: Placement.prefault({}),
    width: z.number().default(0.3),
    loop: z.boolean().default(true),
  }),
  GraphicBase.extend({
    type: z.literal("credits"),
    lines: z.array(z.string()),
    size: z.number().default(44),
    color: z.string().default("#ffffff"),
    fontFamily: z.string().nullable().default(null),
  }),
]);

export type Graphic = z.infer<typeof GraphicSchema>;

export const BackgroundSchema = z.object({
  type: z.enum(["video", "image", "color", "gradient"]).default("video"),
  src: z.string().optional().describe("Image path when type is image"),
  color: z.string().default("#0b0b10"),
  colors: z.array(z.string()).default(["#1b1033", "#3a1c4a", "#0e2a47"]),
  dim: z.number().default(0).describe("0-1 darkening over the background"),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

export const ProjectSchema = z.object({
  $schema: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  media: z
    .object({
      video: z.string().optional().describe("Path inside the project, e.g. media/video.mp4"),
      audio: z.string().optional().describe("Separate audio file; defaults to the video's own sound"),
      duration: z.number().describe("Seconds (filled in automatically)"),
      width: z.number().default(1920),
      height: z.number().default(1080),
      fps: z.number().default(30),
    })
    .describe("Filled in automatically by `npm run make`"),
  output: z
    .object({
      width: z.number().optional().describe("Defaults to the source width"),
      height: z.number().optional().describe("Defaults to the source height"),
      fps: z.number().optional().describe("Defaults to the source frame rate"),
      file: z.string().optional().describe("Output file name inside out/"),
    })
    .prefault({}),
  background: BackgroundSchema.prefault({}),
  style: z
    .object({ preset: z.string().default("golden-sparkle") })
    .catchall(z.unknown())
    .prefault({})
    .describe("A preset name plus any style fields to override (see docs/styles.md)"),
  graphics: z.array(GraphicSchema).default([]),
  localFonts: z
    .array(
      z.object({
        family: z.string(),
        src: z.string().describe("Font file inside the project folder, e.g. fonts/MyFont-Bold.ttf"),
        weight: z.string().default("400"),
        style: z.enum(["normal", "italic"]).default("normal"),
      }),
    )
    .default([])
    .describe("Font files to use instead of, or alongside, Google Fonts"),
  sectionLabels: z.boolean().default(false).describe("Show [Section] names from lyrics.txt as labels"),
  tokenize: z
    .record(z.string(), z.enum(["word", "char"]))
    .default({})
    .describe('Per-language highlight unit, e.g. { "zh": "char" } for per-character karaoke'),
  pipeline: z
    .object({
      separate: z.boolean().default(true).describe("Isolate the vocal before aligning (recommended)"),
      verify: z.boolean().default(true).describe("Cross-check timing with Whisper and flag disagreements"),
      whisperModel: z.string().default("medium"),
      faces: z.boolean().default(true).describe("Detect faces so lyrics can avoid them"),
    })
    .prefault({}),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;

export { StyleSchema };
