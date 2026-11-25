/**
 * scroll layout: the whole lyric sheet moves past, keeping the line being sung
 * in the middle of the frame, bright and in focus.
 */
import React, { useMemo } from "react";
import type { Line } from "../schema/song";
import { textStyleFor } from "../style/resolve";
import { ease, lerp, seg } from "./anim";
import { useRender } from "./context";
import { fontStack } from "./fonts";
import { measureLine } from "./layout";
import { LineView } from "./Line";

type Row = { lines: Line[]; start: number; end: number; height: number; top: number };

export const ScrollView: React.FC = () => {
  const { t, style, song, tracks, scale, width: W, height: H } = useRender();
  const L = style.layout;
  const maxWidthPx = W * Math.min(L.maxWidth, 1 - 2 * L.marginX);
  const gap = L.lineGap * style.text.primary.fontSize * scale * 4;

  const rows = useMemo(() => {
    const out: Row[] = [];
    let top = 0;
    for (const g of song.groups) {
      for (const l of g.lines.filter((x) => x.sung)) {
        const lines = [l, ...g.lines.filter((c) => !c.sung && c.pairOf === l.id)];
        let h = 0;
        lines.forEach((line, i) => {
          const track = tracks.get(line.track)!;
          const ts = textStyleFor(style, track);
          const fs = ts.fontSize * scale;
          const rowsN = Math.max(1, Math.ceil(measureLine(line, track, style, fs) / maxWidthPx));
          h += rowsN * fs * ts.lineHeight + (i ? fs * 0.15 : 0);
        });
        out.push({ lines, start: l.words[0]?.start ?? l.start, end: l.words[l.words.length - 1]?.end ?? l.end, height: h, top });
        top += h + gap;
      }
    }
    return out;
  }, [song, tracks, style, scale, maxWidthPx, gap]);

  if (!rows.length) return null;
  const act = rows.map((r) => r.start - 0.35);
  let idx = 0;
  for (let i = 0; i < rows.length; i++) if (t >= act[i]) idx = i;
  const centre = (i: number) => rows[i].top + rows[i].height / 2;
  const move = idx > 0 ? seg(t, act[idx], 0.6, ease.inOut3) : 1;
  const offset = idx > 0 ? lerp(centre(idx - 1), centre(idx), move) : centre(0);
  const anchorY = L.position === "center" ? H / 2 : L.position === "top" ? H * 0.32 : H * 0.62;

  const first = rows[0].start;
  const last = rows[rows.length - 1].end;
  const fadeIn = seg(t, Math.max(0, first - style.timing.lead - 0.4), 0.6, ease.out2);
  const fadeOut = style.timing.holdLast && song.duration - last <= 8 ? 0 : seg(t, last + style.timing.tail, 0.6, ease.in2);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: fadeIn * (1 - fadeOut), overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: W * L.marginX,
          width: maxWidthPx,
          ...(L.align === "end" ? { left: undefined, right: W * L.marginX } : {}),
          ...(L.align === "center" ? { left: (W - maxWidthPx) / 2 } : {}),
          top: 0,
          translate: `0 ${anchorY - offset}px`,
        }}
      >
        {rows.map((row, i) => {
          if (Math.abs(i - idx) > L.scrollVisibleLines) return null;
          const up = seg(t, act[i], 0.35, ease.out2);
          const down = i + 1 < rows.length ? seg(t, act[i + 1], 0.35, ease.inOut2) : 0;
          const a = up * (1 - down);
          const distance = Math.abs(i - idx);
          const far = Math.max(0, 1 - Math.max(0, distance - 2) / Math.max(1, L.scrollVisibleLines / 2));
          const o = lerp(L.inactiveOpacity * far, 1, a);
          return (
            <div
              key={row.lines[0].id}
              style={{
                position: "absolute",
                top: row.top,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: L.align === "center" ? "center" : L.align === "start" ? "flex-start" : "flex-end",
                gap: style.text.primary.fontSize * scale * 0.15,
                scale: String(lerp(0.97, 1, a)),
                transformOrigin: L.align === "start" ? "0% 50%" : L.align === "end" ? "100% 50%" : "50% 50%",
              }}
            >
              {row.lines.map((line) => {
                const track = tracks.get(line.track)!;
                const ts = textStyleFor(style, track);
                return (
                  <LineView
                    key={line.id}
                    line={line}
                    track={track}
                    ts={ts}
                    fontStack={fontStack(style, ts, track.script)}
                    style={style}
                    t={t}
                    scale={scale}
                    enterStart={-10}
                    enterDur={0.01}
                    wordStagger={0}
                    kinetic={false}
                    pageStart={act[i]}
                    opacity={o}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
