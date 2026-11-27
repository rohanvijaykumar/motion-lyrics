import { describe, expect, it } from "vitest";
import { cameraMove, shakeMove } from "../src/render/effects/Camera";
import { lookEffects } from "../src/render/effects/Look";
import { lightLeakTimes } from "../src/render/effects/Overlays";
import { cssFamily, registeredFamily } from "../src/render/fonts";
import { GraphicSchema } from "../src/schema/project";
import {
  LOOK_TYPES,
  StyleSchema,
  styleUsesWebGL,
} from "../src/schema/style";
import { MOODS, PRESETS, PRESET_NAMES } from "../src/style/presets";
import { resolveStyle } from "../src/style/resolve";

describe("extended presets", () => {
  it("has at least 25 presets, each with a description and known moods", () => {
    expect(PRESET_NAMES.length).toBeGreaterThanOrEqual(25);
    for (const name of PRESET_NAMES) {
      const p = PRESETS[name];
      expect(p.description.length, name).toBeGreaterThan(30);
      expect(p.tags.length, name).toBeGreaterThan(0);
      for (const t of p.tags) expect(MOODS, `${name}: ${t}`).toContain(t);
    }
  });

  it("every mood has at least one preset", () => {
    for (const m of MOODS)
      expect(
        PRESET_NAMES.some((n) => (PRESETS[n].tags as string[]).includes(m)),
        m,
      ).toBe(true);
  });

  it("tags and descriptions never leak into the resolved style", () => {
    const s = resolveStyle({ preset: "aurora" }) as Record<string, unknown>;
    expect(s.tags).toBeUndefined();
    expect(s.description).toBeUndefined();
  });

  it("knows which styles need WebGL", () => {
    expect(styleUsesWebGL(resolveStyle({ preset: "golden-sparkle" }))).toBe(false);
    expect(styleUsesWebGL(resolveStyle({ preset: "editorial" }))).toBe(true); // faded look
    expect(styleUsesWebGL(resolveStyle({ preset: "aurora" }))).toBe(true);
    expect(styleUsesWebGL(resolveStyle({ preset: "hand-drawn" }))).toBe(false);
    expect(
      styleUsesWebGL(
        resolveStyle({ preset: "chalk", effects: { depth: { type: "snow" } } }),
      ),
    ).toBe(true);
  });

  it("new parts default to off", () => {
    const s = StyleSchema.parse({});
    expect(s.transition.type).toBe("none");
    expect(s.highlight.mark.type).toBe("none");
    expect(s.effects.look.type).toBe("none");
    expect(s.effects.depth.type).toBe("none");
    expect(s.effects.shader.type).toBe("none");
    expect(s.effects.visualizer.type).toBe("none");
    expect(s.effects.motionBlur.type).toBe("none");
    expect(s.effects.drift.enabled).toBe(false);
    expect(s.effects.shake.enabled).toBe(false);
    expect(s.effects.lightLeaks.enabled).toBe(false);
    expect(s.effects.starburst.enabled).toBe(false);
    expect(s.effects.camera.type).toBe("none");
  });

  it("rejects unknown values for the new parts", () => {
    expect(() =>
      resolveStyle({ preset: "chalk", transition: { type: "spin" } }),
    ).toThrow(/transition\.type/);
    expect(() =>
      resolveStyle({ preset: "chalk", effects: { look: { type: "sepia" } } }),
    ).toThrow(/effects\.look\.type/);
  });
});

describe("motion", () => {
  it("camera moves are pure functions of time", () => {
    const push = { type: "push-in" as const, amount: 1 };
    expect(cameraMove(push, 0, 60, 1920, 1).scale).toBeCloseTo(1);
    expect(cameraMove(push, 60, 60, 1920, 1).scale).toBeCloseTo(1.07);
    const hand = { type: "handheld" as const, amount: 1 };
    expect(cameraMove(hand, 12.3, 60, 1920, 1)).toEqual(
      cameraMove(hand, 12.3, 60, 1920, 1),
    );
    expect(cameraMove({ type: "none", amount: 1 }, 5, 60, 1920, 1)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
      rotate: 0,
    });
  });

  it("beat shake is still between beats and moves just after one", () => {
    const shake = { enabled: true, amount: 5, speed: 1.2, onBeat: true };
    const far = shakeMove(shake, 5.9, [5, 7], 1);
    expect(Math.abs(far.x) + Math.abs(far.y)).toBeLessThan(0.01);
    const near = shakeMove(shake, 5.03, [5, 7], 1);
    expect(Math.abs(near.x) + Math.abs(near.y)).toBeGreaterThan(0);
    expect(shakeMove({ ...shake, enabled: false }, 5.03, [5], 1).x).toBe(0);
  });

  it("light leaks come at the start, at sections or at every screen", () => {
    const groups = [
      { start: 2 },
      { start: 8, section: "Chorus" },
      { start: 14 },
      { start: 20, section: "Verse 2" },
    ];
    expect(lightLeakTimes("start", groups)).toEqual([0]);
    expect(lightLeakTimes("sections", groups)).toEqual([8, 20]);
    expect(lightLeakTimes("screens", groups)).toEqual([2, 8, 14, 20]);
    expect(lightLeakTimes("sections", [{ start: 3 }])).toEqual([3]);
  });
});

describe("looks", () => {
  it("every look builds an effect chain, none builds nothing", () => {
    for (const type of LOOK_TYPES) {
      const fx = lookEffects(
        { type, amount: 1, colors: ["#000000", "#ffffff"] },
        1,
        10,
      );
      if (type === "none") expect(fx).toEqual([]);
      else expect(fx.length, type).toBeGreaterThan(0);
    }
  });
});

describe("font names with digits", () => {
  it("lists the spelled-out name @remotion/google-fonts registers", () => {
    expect(registeredFamily("Press Start 2P")).toBe("Press Start TwoP");
    expect(registeredFamily("B612 Mono")).toBe("BSixOneTwo Mono");
    expect(cssFamily(["Press Start 2P", "Noto Sans"])).toBe(
      '"Press Start 2P", "Press Start TwoP", "Noto Sans", sans-serif',
    );
  });
});

describe("new graphics", () => {
  it.each([
    { type: "gif", src: "media/a.gif", start: 0, end: 2 },
    { type: "rive", src: "media/a.riv", start: 0, end: 2 },
    { type: "emoji", emoji: "fire", start: 0, end: 2 },
    { type: "sound", sound: "whoosh", start: 0, end: 1 },
    { type: "lightLeak", start: 0, end: 2 },
    { type: "starburst", start: 0, end: 2 },
  ])("$type validates", (g) => {
    expect(GraphicSchema.safeParse(g).success).toBe(true);
  });
});
