/**
 * Graphics that are not lyrics: title cards, free text, lower thirds, logos,
 * Lottie animations, credits and section labels. Listed in project.json.
 */
import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import React, { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, Img, Sequence, staticFile } from "remotion";
import { detectScript } from "../core/script";
import type { Graphic } from "../schema/project";
import type { Style } from "../schema/style";
import { ease, lerp, seg } from "./anim";
import { useRender } from "./context";
import { cssFamily, fontStack } from "./fonts";

function useInOut(g: { start: number; end: number; enter: string; exit: string; transition: number }) {
  const { t, scale } = useRender();
  const a = seg(t, g.start, g.transition, ease.out3);
  const b = seg(t, g.end - g.transition, g.transition, ease.in2);
  const v = a * (1 - b);
  const style: React.CSSProperties = { opacity: g.enter === "none" && a < 1 ? (t >= g.start ? 1 : 0) : v };
  if (g.enter === "rise" && a < 1) style.translate = `0 ${(1 - a) * 30 * scale}px`;
  if (g.enter === "scale" && a < 1) style.scale = String(lerp(0.9, 1, a));
  if (g.enter === "pop" && a < 1) style.scale = String(lerp(0.6, 1, seg(t, g.start, g.transition, ease.backOut(2))));
  if (g.exit === "sink" && b > 0) style.translate = `0 ${b * 30 * scale}px`;
  if (g.exit === "scale" && b > 0) style.scale = String(lerp(1, 0.9, b));
  if (g.exit === "none" && b > 0) style.opacity = t >= g.end ? 0 : 1;
  return style;
}

function familyFor(style: Style, text: string, fontFamily: string | null) {
  const script = detectScript(text);
  return cssFamily(fontStack(style, { ...style.text.primary, fontFamily: fontFamily ?? style.text.primary.fontFamily }, script));
}

const At: React.FC<{ x: number; y: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, children, style }) => (
  <div style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, translate: "-50% -50%", textAlign: "center", ...style }}>
    {children}
  </div>
);

const Title: React.FC<{ g: Extract<Graphic, { type: "title" }> }> = ({ g }) => {
  const { scale, style } = useRender();
  const anim = useInOut(g);
  return (
    <At x={g.at.x} y={g.at.y} style={anim}>
      {g.scrim ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "160%",
            height: "260%",
            translate: "-50% -50%",
            background: "radial-gradient(closest-side, rgba(0,0,0,.55), transparent)",
            zIndex: 0,
          }}
        />
      ) : null}
      <div style={{ position: "relative", fontFamily: familyFor(style, g.title, g.fontFamily), fontWeight: 800, fontSize: g.size * scale, color: g.color, lineHeight: 1.1, textShadow: "0 4px 30px rgba(0,0,0,.5)" }}>
        {g.title}
      </div>
      {g.subtitle ? (
        <div style={{ position: "relative", marginTop: 0.25 * g.size * scale, fontFamily: familyFor(style, g.subtitle, g.fontFamily), fontWeight: 600, fontSize: g.size * 0.38 * scale, color: g.accent, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {g.subtitle}
        </div>
      ) : null}
    </At>
  );
};

const FreeText: React.FC<{ g: Extract<Graphic, { type: "text" }> }> = ({ g }) => {
  const { scale, style } = useRender();
  const anim = useInOut(g);
  return (
    <At x={g.at.x} y={g.at.y} style={anim}>
      <div
        style={{
          fontFamily: familyFor(style, g.text, g.fontFamily),
          fontSize: g.size * scale,
          fontWeight: g.weight,
          color: g.color,
          background: g.background ?? undefined,
          padding: g.background ? `${0.3 * g.size * scale}px ${0.6 * g.size * scale}px` : undefined,
          borderRadius: g.background ? 0.3 * g.size * scale : undefined,
          textShadow: g.background ? undefined : "0 2px 14px rgba(0,0,0,.55)",
          whiteSpace: "pre-line",
        }}
      >
        {g.text}
      </div>
    </At>
  );
};

const LowerThird: React.FC<{ g: Extract<Graphic, { type: "lowerThird" }> }> = ({ g }) => {
  const { t, scale, style, width: W, height: H } = useRender();
  const anim = useInOut(g);
  const bar = seg(t, g.start, g.transition * 1.2, ease.out3);
  const left = g.side === "left";
  return (
    <div style={{ position: "absolute", [left ? "left" : "right"]: W * 0.06, bottom: H * 0.14, textAlign: left ? "left" : "right", ...anim }}>
      <div style={{ height: 6 * scale, width: `${bar * 100}%`, background: g.accent, borderRadius: 3 * scale, marginBottom: 12 * scale, [left ? "marginRight" : "marginLeft"]: "auto" }} />
      <div style={{ fontFamily: familyFor(style, g.title, g.fontFamily), fontWeight: 800, fontSize: 54 * scale, color: g.color, textShadow: "0 2px 16px rgba(0,0,0,.6)" }}>{g.title}</div>
      {g.subtitle ? (
        <div style={{ fontFamily: familyFor(style, g.subtitle, g.fontFamily), fontWeight: 500, fontSize: 32 * scale, color: g.color, opacity: 0.85, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{g.subtitle}</div>
      ) : null}
    </div>
  );
};

const Image: React.FC<{ g: Extract<Graphic, { type: "image" }> }> = ({ g }) => {
  const { width: W } = useRender();
  const anim = useInOut(g);
  return (
    <At x={g.at.x} y={g.at.y} style={{ ...anim, opacity: (anim.opacity as number) * g.opacity }}>
      <Img src={staticFile(g.src)} style={{ width: g.width * W, display: "block" }} />
    </At>
  );
};

const LottieGraphic: React.FC<{ g: Extract<Graphic, { type: "lottie" }> }> = ({ g }) => {
  const { width: W } = useRender();
  const anim = useInOut(g);
  const [data, setData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender(`Loading Lottie ${g.src}`));
  useEffect(() => {
    fetch(staticFile(g.src))
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [g.src, handle]);
  if (!data) return null;
  return (
    <At x={g.at.x} y={g.at.y} style={anim}>
      <div style={{ width: g.width * W }}>
        <Lottie animationData={data} loop={g.loop} />
      </div>
    </At>
  );
};

const Credits: React.FC<{ g: Extract<Graphic, { type: "credits" }> }> = ({ g }) => {
  const { scale, style } = useRender();
  const anim = useInOut(g);
  return (
    <At x={0.5} y={0.5} style={anim}>
      {g.lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontFamily: familyFor(style, l, g.fontFamily),
            fontSize: (i === 0 ? g.size * 1.3 : g.size) * scale,
            fontWeight: i === 0 ? 800 : 500,
            color: g.color,
            lineHeight: 1.5,
            textShadow: "0 2px 16px rgba(0,0,0,.6)",
          }}
        >
          {l}
        </div>
      ))}
    </At>
  );
};

export const GraphicsLayer: React.FC<{ graphics: Graphic[] }> = ({ graphics }) => {
  const { fps } = useRender();
  return (
    <>
      {graphics.map((g, i) => {
        const from = Math.max(0, Math.floor(g.start * fps));
        const dur = Math.max(1, Math.ceil((g.end - g.start) * fps) + 1);
        const el =
          g.type === "title" ? <Title g={g} /> :
          g.type === "text" ? <FreeText g={g} /> :
          g.type === "lowerThird" ? <LowerThird g={g} /> :
          g.type === "image" ? <Image g={g} /> :
          g.type === "lottie" ? <LottieGraphic g={g} /> :
          <Credits g={g} />;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none" name={`${g.type} ${i + 1}`}>
            {el}
          </Sequence>
        );
      })}
    </>
  );
};

/** Section names from [Chorus]-style markers, shown briefly as a small label. */
export function sectionGraphics(sections: { name: string; start: number }[]): Graphic[] {
  return sections.map((s) => ({
    type: "text" as const,
    text: s.name.toUpperCase(),
    at: { x: 0.5, y: 0.08 },
    size: 30,
    weight: 700,
    color: "rgba(255,255,255,0.85)",
    fontFamily: null,
    background: "rgba(0,0,0,0.35)",
    start: Math.max(0, s.start - 0.6),
    end: s.start + 2.4,
    enter: "rise" as const,
    exit: "fade" as const,
    transition: 0.4,
  }));
}
