/**
 * Shared QC constants. In a QC mask frame each line on screen is drawn in one
 * of these flat colours on black, so the CLI can measure exactly where every
 * line landed (see scripts/lib/qc.ts).
 */
export const MASK_COLORS: [number, number, number][] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
];

export const maskCss = (i: number) => {
  const [r, g, b] = MASK_COLORS[i % MASK_COLORS.length];
  return `rgb(${r},${g},${b})`;
};

/** Title-safe inset (fraction of each side) that essential text must stay inside. */
export const SAFE_INSET = 0.05;
