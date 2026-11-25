/** Deep-merge plain objects. Arrays and primitives in `over` replace those in `base`. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isPlain(base) || !isPlain(over)) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
