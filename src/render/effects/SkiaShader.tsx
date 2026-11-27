/**
 * Full-frame GPU shaders drawn with @remotion/skia (React Native Skia on the
 * web, CanvasKit). Only imported after CanvasKit has loaded; see Shader.tsx.
 * The shader time comes from Remotion's frame, never from a clock.
 */
import { SkiaCanvas } from "@remotion/skia";
import { Fill, Shader, Skia } from "@shopify/react-native-skia";
import React, { useMemo } from "react";

const COMMON = `
uniform float2 res;
uniform float time;
uniform float4 c1;
uniform float4 c2;
uniform float4 c3;
uniform float alpha;
float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float vnoise(float2 p) {
  float2 i = floor(p); float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}
`;

const SOURCES: Record<string, string> = {
  aurora: `${COMMON}
half4 main(float2 xy) {
  float2 uv = xy / res;
  float t = time * 0.06;
  float band = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = 0.14 + 0.11 * fi + 0.07 * sin(uv.x * 3.0 + t * (1.5 + fi) + fi * 2.0)
              + 0.06 * (fbm(float2(uv.x * 2.5 + t * 2.0, fi * 4.0)) - 0.5);
    float d = abs(uv.y - y);
    band += exp(-d * d * 260.0) * (0.55 + 0.45 * fbm(float2(uv.x * 6.0 - t * 3.0, fi)));
  }
  float3 col = mix(c1.rgb, c2.rgb, smoothstep(0.0, 1.0, uv.x));
  col = mix(col, c3.rgb, 0.3 * (0.5 + 0.5 * sin(uv.x * 4.0 + t * 4.0)));
  float a = clamp(band, 0.0, 1.0) * alpha * (1.0 - smoothstep(0.45, 0.8, uv.y));
  return half4(col * a, a);
}`,
  plasma: `${COMMON}
half4 main(float2 xy) {
  float2 uv = xy / res.y;
  float t = time * 0.25;
  float v = sin(uv.x * 3.0 + t) + sin(uv.y * 2.5 - t * 1.3)
          + sin((uv.x + uv.y) * 2.0 + t * 0.7) + 2.0 * fbm(uv * 1.5 + t * 0.2);
  float k = 0.5 + 0.5 * sin(v);
  float3 col = mix(mix(c1.rgb, c2.rgb, k), c3.rgb, 0.5 + 0.5 * cos(v * 0.7));
  return half4(col * alpha, alpha);
}`,
  rays: `${COMMON}
half4 main(float2 xy) {
  float2 o = float2(res.x * 0.5, -res.y * 0.15);
  float2 d = xy - o;
  float ang = atan(d.x, d.y);
  float r = length(d) / res.y;
  float t = time * 0.12;
  float beams = pow(0.5 + 0.5 * sin(ang * 14.0 + t * 2.0 + fbm(float2(ang * 3.0, t)) * 3.0), 6.0);
  beams *= smoothstep(1.6, 0.2, r);
  float3 col = mix(c1.rgb, c2.rgb, clamp(r, 0.0, 1.0));
  col = mix(col, c3.rgb, 0.3);
  float a = beams * alpha;
  return half4(col * a, a);
}`,
};

function rgba(c: string): [number, number, number, number] {
  const m = Skia.Color(c);
  return [m[0], m[1], m[2], m[3]];
}

export const SkiaShaderLayer: React.FC<{
  type: string;
  width: number;
  height: number;
  time: number;
  colors: [string, string, string];
  opacity: number;
}> = ({ type, width, height, time, colors, opacity }) => {
  const effect = useMemo(() => {
    const src = SOURCES[type] ?? SOURCES.aurora;
    const e = Skia.RuntimeEffect.Make(src);
    if (!e) throw new Error(`Could not compile the "${type}" shader`);
    return e;
  }, [type]);
  const uniforms = {
    res: [width, height],
    time,
    c1: rgba(colors[0]),
    c2: rgba(colors[1]),
    c3: rgba(colors[2]),
    alpha: opacity,
  };
  return (
    <SkiaCanvas width={width} height={height}>
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </SkiaCanvas>
  );
};

export default SkiaShaderLayer;
