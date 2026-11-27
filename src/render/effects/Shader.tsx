/**
 * Loads CanvasKit (Skia for the web) only when a style asks for a shader, then
 * draws it. Keeping Skia out of the main bundle path means videos without a
 * shader never download or start it.
 */
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import React, { useEffect, useState } from "react";
import { AbsoluteFill, cancelRender, continueRender, delayRender } from "remotion";
import { useRender } from "../context";

type Layer = typeof import("./SkiaShader").SkiaShaderLayer;

export const ShaderLayer: React.FC = () => {
  const { t, style, width: W, height: H } = useRender();
  const s = style.effects.shader;
  const [Comp, setComp] = useState<Layer | null>(null);
  const [handle] = useState(() =>
    delayRender("Loading Skia (CanvasKit) for the shader layer", {
      timeoutInMilliseconds: 120000,
    }),
  );
  useEffect(() => {
    let alive = true;
    LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
      .then(() => import("./SkiaShader"))
      .then((m) => {
        if (alive) setComp(() => m.SkiaShaderLayer);
        continueRender(handle);
      })
      .catch((e) =>
        cancelRender(new Error(`The shader layer could not start Skia: ${e}`)),
      );
    return () => {
      alive = false;
    };
  }, [handle]);
  if (!Comp) return null;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
      <Comp
        type={s.type}
        width={W}
        height={H}
        time={t * s.speed * 10}
        colors={s.colors}
        opacity={s.opacity}
      />
    </AbsoluteFill>
  );
};
