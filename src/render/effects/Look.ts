/**
 * Looks for the background picture, built from @remotion/effects (WebGL, so
 * renders use Chrome's ANGLE backend; see styleUsesWebGL). A look only touches
 * the picture, never the lyrics, so text stays sharp and QC contrast checks
 * still see the real frame.
 */
import { brightness } from "@remotion/effects/brightness";
import { chromaticAberration } from "@remotion/effects/chromatic-aberration";
import { contrast } from "@remotion/effects/contrast";
import { dotGrid } from "@remotion/effects/dot-grid";
import { duotone } from "@remotion/effects/duotone";
import { glow } from "@remotion/effects/glow";
import { grayscale } from "@remotion/effects/grayscale";
import { halftone } from "@remotion/effects/halftone";
import { noise } from "@remotion/effects/noise";
import { paper } from "@remotion/effects/paper";
import { pixelate } from "@remotion/effects/pixelate";
import { saturation } from "@remotion/effects/saturation";
import { scanlines } from "@remotion/effects/scanlines";
import { thermalVision } from "@remotion/effects/thermal-vision";
import { tint } from "@remotion/effects/tint";
import type { EffectsProp } from "remotion";
import type { Style } from "../../schema/style";

/** The effect chain for a look. `scale` is output height / 1080, `frame` seeds animated noise. */
export function lookEffects(
  look: Style["effects"]["look"],
  scale: number,
  frame: number,
): EffectsProp {
  const a = Math.max(0, Math.min(1, look.amount));
  const px = (n: number) => Math.max(1, Math.round(n * scale));
  switch (look.type) {
    case "noir":
      return [
        grayscale({ amount: a }),
        contrast({ amount: 1 + 0.35 * a }),
        brightness({ amount: -0.06 * a }),
      ];
    case "duotone":
      return [
        duotone({ darkColor: look.colors[0], lightColor: look.colors[1] }),
      ];
    case "halftone":
      return [
        halftone({ dotSize: px(8), colorMode: "source", invert: true }),
      ];
    case "comic":
      return [
        saturation({ amount: 1 + 0.6 * a }),
        contrast({ amount: 1 + 0.25 * a }),
        halftone({ dotSize: px(6), colorMode: "source", invert: true }),
      ];
    case "vhs":
      return [
        saturation({ amount: 1 - 0.25 * a }),
        chromaticAberration({ amount: px(5 * a) }),
        scanlines({ amount: 0.35 * a, spacing: px(4), thickness: px(1.5) }),
        noise({ amount: 0.12 * a, seed: frame % 97 }),
      ];
    case "dreamy":
      return [
        glow({ radius: px(30), intensity: 0.6 * a, threshold: 0.55 }),
        saturation({ amount: 1 - 0.15 * a }),
        brightness({ amount: 0.04 * a }),
      ];
    case "warm":
      return [
        tint({ color: "#ff9a3c", amount: 0.22 * a }),
        saturation({ amount: 1 + 0.15 * a }),
      ];
    case "cool":
      return [
        tint({ color: "#3c8bff", amount: 0.2 * a }),
        saturation({ amount: 1 - 0.1 * a }),
      ];
    case "faded":
      return [
        contrast({ amount: 1 - 0.25 * a }),
        saturation({ amount: 1 - 0.35 * a }),
        brightness({ amount: 0.05 * a }),
        noise({ amount: 0.05 * a, seed: frame % 97 }),
      ];
    case "paper":
      return [paper({ amount: 0.7 * a })];
    case "pixel":
      return [pixelate({ blockSize: px(14 * Math.max(0.3, a)) })];
    case "dot-grid":
      return [dotGrid({ dotSize: px(6), gridSize: px(10) })];
    case "thermal":
      return [thermalVision({ amount: a })];
    default:
      return [];
  }
}
