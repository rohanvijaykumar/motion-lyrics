/**
 * Debug overlay for checking sync (draft renders and Studio with debug on).
 * A strip across the top shows 6 seconds around the playhead: the vocal
 * loudness curve and a box for every word. Each word should start where the
 * curve rises. Lines to check are red, lines to glance at are orange.
 */
import React from "react";
import { useRender } from "./context";

const WINDOW = 6;

export const TimingOverlay: React.FC = () => {
  const { t, song, analysis, width: W, scale } = useRender();
  const h = 150 * scale;
  const x = (time: number) => ((time - (t - WINDOW / 2)) / WINDOW) * W;
  const env = analysis?.envelope;
  let path = "";
  if (env) {
    const lo = Math.min(...env.db.filter(Number.isFinite));
    const hi = Math.max(...env.db.filter(Number.isFinite));
    const i0 = Math.max(0, Math.floor((t - WINDOW / 2) / env.hop));
    const i1 = Math.min(
      env.db.length - 1,
      Math.ceil((t + WINDOW / 2) / env.hop),
    );
    for (let i = i0; i <= i1; i++) {
      const y = h * 0.55 - ((env.db[i] - lo) / Math.max(1, hi - lo)) * h * 0.45;
      path += `${i === i0 ? "M" : "L"}${x(i * env.hop).toFixed(1)},${y.toFixed(1)}`;
    }
  }
  const words = song.groups.flatMap((g) =>
    g.lines
      .filter((l) => l.sung)
      .flatMap((l) => l.words.map((w) => ({ w, line: l }))),
  );
  const visible = words.filter(
    ({ w }) => w.end >= t - WINDOW / 2 && w.start <= t + WINDOW / 2,
  );
  const current = words.find(({ w }) => t >= w.start && t < w.end);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: h,
        background: "rgba(0,0,0,.72)",
        fontFamily: "monospace",
        color: "#fff",
        zIndex: 100,
      }}
    >
      <svg width={W} height={h} style={{ position: "absolute", inset: 0 }}>
        {path ? (
          <path d={path} stroke="#5ad1ff" strokeWidth={2 * scale} fill="none" />
        ) : null}
        {visible.map(({ w, line }) => {
          const color =
            line.review === "check"
              ? "#ff5a5a"
              : line.review === "glance" || (w.flags?.length ?? 0) > 0
                ? "#ffa53a"
                : "#7dff8a";
          return (
            <g key={w.id}>
              <rect
                x={x(w.start)}
                y={h * 0.62}
                width={Math.max(2, x(w.end) - x(w.start))}
                height={h * 0.3}
                fill="none"
                stroke={color}
                strokeWidth={2 * scale}
              />
              <line
                x1={x(w.start)}
                x2={x(w.start)}
                y1={0}
                y2={h}
                stroke={color}
                strokeOpacity={0.35}
              />
              <text
                x={x(w.start) + 4 * scale}
                y={h * 0.83}
                fill="#fff"
                fontSize={18 * scale}
              >
                {w.text}
              </text>
            </g>
          );
        })}
        <line
          x1={W / 2}
          x2={W / 2}
          y1={0}
          y2={h}
          stroke="#fff"
          strokeWidth={2 * scale}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 12 * scale,
          top: 8 * scale,
          fontSize: 20 * scale,
        }}
      >
        {t.toFixed(2)}s{" "}
        {current
          ? `· ${current.line.id} · ${current.w.text} (${current.w.start.toFixed(2)}–${current.w.end.toFixed(2)})`
          : ""}
      </div>
    </div>
  );
};
