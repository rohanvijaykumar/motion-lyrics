import { deepMerge } from "../core/merge";
import type { Track } from "../schema/song";
import { StyleSchema, type Style, type TextStyle } from "../schema/style";
import { PRESETS, PRESET_NAMES } from "./presets";

/** project.json "style" block -> a complete, validated style. */
export function resolveStyle(
  input: Record<string, unknown> | undefined,
): Style {
  const { preset: presetName = "golden-sparkle", ...overrides } = (input ??
    {}) as { preset?: string };
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown style preset "${presetName}". Available: ${PRESET_NAMES.join(", ")}`,
    );
  }
  const presetStyle: Record<string, unknown> = { ...preset };
  delete presetStyle.description;
  delete presetStyle.tags;
  const merged = deepMerge(
    deepMerge({} as Record<string, unknown>, presetStyle),
    overrides,
  );
  const parsed = StyleSchema.safeParse({ ...merged, name: presetName });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  style.${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`project.json has an invalid style:\n${issues}`);
  }
  return parsed.data;
}

/** Typography for one track: its tier's style plus any per-track override. */
export function textStyleFor(
  style: Style,
  track: Pick<Track, "id" | "tier">,
): TextStyle {
  const base = style.text[track.tier];
  const over = style.tracks[track.id] ?? {};
  const out: TextStyle = { ...base };
  for (const [k, v] of Object.entries(over))
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
