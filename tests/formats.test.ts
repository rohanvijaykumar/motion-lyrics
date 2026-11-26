import { describe, expect, it } from "vitest";
import { facesInOutput, outputSize, videoRect } from "../src/core/frame";
import { parseFontFile } from "../src/core/fontfiles";
import { MASK_COLORS } from "../src/core/qc";
import { resolveStyle } from "../src/style/resolve";
import { styleForPreset } from "../scripts/lib/prefs";

describe("export sizes", () => {
  it.each([
    ["1080", "16:9", 1920, 1080],
    ["1080", "9:16", 1080, 1920],
    ["4k", "16:9", 3840, 2160],
    ["4k", "9:16", 2160, 3840],
  ] as const)("%s %s", (size, aspect, w, h) => {
    expect(outputSize(1920, 1080, size, aspect)).toEqual({
      width: w,
      height: h,
    });
  });

  it("keeps the source when nothing is asked", () => {
    expect(outputSize(1280, 720, "source", "source")).toEqual({
      width: 1280,
      height: 720,
    });
    expect(outputSize(1280, 720, "4k", "source")).toEqual({
      width: 3840,
      height: 2160,
    });
  });
});

describe("framing", () => {
  const vertical = {
    mode: "cover" as const,
    srcW: 1920,
    srcH: 1080,
    W: 1080,
    H: 1920,
  };
  it("fills a vertical frame from wide footage and follows the focus", () => {
    const centre = videoRect(vertical, 0.5, 0.5);
    expect(centre.h).toBeCloseTo(1920);
    expect(centre.x).toBeCloseTo((1080 - centre.w) / 2);
    const left = videoRect(vertical, 0.1, 0.5);
    expect(left.x).toBeCloseTo(0); // clamped: never shows past the picture edge
  });

  it("maps faces into the cropped frame", () => {
    const faces = facesInOutput(vertical, [
      { t: 1, boxes: [[0.45, 0.3, 0.1, 0.2]] },
    ]);
    const [x, , w] = faces[0].boxes[0];
    expect(x + w / 2).toBeCloseTo(0.5, 1); // the face ends up in the middle of the vertical frame
  });

  it("contain and blur show the whole picture", () => {
    const r = videoRect({ ...vertical, mode: "contain" });
    expect(r.w).toBeCloseTo(1080);
    expect(r.y).toBeGreaterThan(0);
  });
});

describe("font files", () => {
  it.each([
    ["fonts/Gotham-Bold.otf", "Gotham", "700", "normal"],
    ["fonts/Gotham-BookItalic.otf", "Gotham", "400", "italic"],
    ["fonts/My_Brand_Font.ttf", "My Brand Font", "400", "normal"],
    ["fonts/MyFont.woff2", "MyFont", "400", "normal"],
    ["fonts/Inter[wght].ttf", "Inter", "100 900", "normal"],
    ["fonts/Brand-SemiBold.ttf", "Brand", "600", "normal"],
  ])("%s", (file, family, weight, style) => {
    expect(parseFontFile(file)).toEqual({ family, src: file, weight, style });
  });
  it("ignores other files", () =>
    expect(parseFontFile("fonts/readme.txt")).toBeNull());
});

describe("presets and QC", () => {
  it("custom presets extend built-in ones", () => {
    const style = styleForPreset("example-brand");
    expect(style.preset).toBe("golden-sparkle");
    const resolved = resolveStyle(style);
    expect(resolved.text.primary.fontFamily).toBe("Montserrat");
    expect(resolved.effects.sparkles.enabled).toBe(false);
    expect(resolved.effects.scrim.type).toBe("radial"); // inherited
  });

  it("mask colours are distinct", () => {
    expect(new Set(MASK_COLORS.map((c) => c.join())).size).toBe(
      MASK_COLORS.length,
    );
  });

  it("face avoidance is off unless asked for", () => {
    expect(resolveStyle({ preset: "golden-sparkle" }).layout.avoidFaces).toBe(
      false,
    );
  });
});
